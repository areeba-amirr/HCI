// Saving and reviewing prescriptions in Supabase.
//
//   storage  prescriptions/<user>/<id>/original.<ext>   the untouched original file
//   table    prescriptions                              metadata, AI output, review state
//   table    prescription_reviews                       append-only audit trail
//   table    scans (existing)                           one row per medicine, read by History,
//                                                       Calendar and the Doctor Report; always
//                                                       holds the latest corrected value
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { extensionFor, type PageQuality, type PreparedPrescription } from "./files";
import {
  CRITICAL_FIELDS,
  MEDICINE_FIELDS,
  applyAction,
  currentValue,
  fieldStatus,
  medicineStatus,
  overallStatus,
  reviewKey,
  type ExtractedMedicine,
  type MedicineField,
  type PrescriptionExtraction,
  type ReviewAction,
  type ReviewEvidence,
  type ReviewState,
  type VerificationStatus,
} from "./model";

export const BUCKET = "prescriptions";
const SIGNED_URL_SECONDS = 300;

export interface SavedPrescription {
  id: string;
  user_id: string;
  original_path: string;
  original_mime: string;
  original_size: number;
  original_sha256: string;
  page_count: number;
  uploaded_at: string;
  quality: { pages: PageQuality[] } | null;
  extraction: PrescriptionExtraction;
  model: string;
  review: ReviewState;
  status: VerificationStatus;
  /** Typed by the patient; never read by AI. Absent until the My Medicines update is applied. */
  doctor_name?: string | null;
  created_at: string;
  updated_at: string;
}

/** What Prescription Management lists: the original's details only, never the AI reading. */
export type PrescriptionSummary = Pick<
  SavedPrescription,
  "id" | "uploaded_at" | "original_path" | "original_mime" | "original_size" | "page_count"
> & { doctor_name: string | null };

/** A missing table or bucket: that part of the database update hasn't been applied yet. */
export function isNotSetUp(error: { message?: string; code?: string } | null | undefined) {
  return Boolean(error) && classify(error ?? null) === "not_set_up";
}

/** Doctor's names are short, plain text; blank means "not added". */
export function cleanDoctorName(name: string | null | undefined) {
  const v = (name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return v || null;
}

export interface LoggedAction {
  medicine: number;
  field: MedicineField;
  action: ReviewAction;
  previous_value: string | null;
  new_value: string | null;
  new_status: VerificationStatus;
  /** "packaging_scan" when the person checked the medicine's box or strip first. */
  evidence?: ReviewEvidence;
}

export type SaveFailure =
  | "not_set_up"
  | "permission"
  | "network"
  | "too_large"
  | "file_type"
  | "session"
  | "unknown";

/** Which step failed and why, so the UI can say exactly what didn't happen. */
export class SaveError extends Error {
  constructor(
    public stage: "auth" | "upload" | "record" | "medicines" | "review",
    public reason: SaveFailure = "unknown",
  ) {
    super(`${stage}:${reason}`);
  }
}

/** Turns Supabase Storage and PostgREST errors into a reason a person can act on. */
export function classify(
  error: { message?: string; code?: string; statusCode?: string; status?: number } | null,
): SaveFailure {
  const msg = (error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? error?.statusCode ?? error?.status ?? "");
  if (
    /bucket not found|nosuchbucket|could not find the table/.test(msg) ||
    ["PGRST205", "42P01", "404"].includes(code)
  )
    return "not_set_up";
  if (
    /row-level security|unauthori[sz]ed|permission denied/.test(msg) ||
    ["42501", "403"].includes(code)
  )
    return "permission";
  if (/jwt|token|session/.test(msg) || code === "401") return "session";
  if (/too large|payload|exceeded the maximum/.test(msg) || code === "413") return "too_large";
  if (/mime type|invalid_mime/.test(msg) || code === "415") return "file_type";
  if (/failed to fetch|network|load failed|timeout/.test(msg)) return "network";
  return "unknown";
}

async function requireUser() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new SaveError("auth", "session");
  return data.user.id;
}

/** "250 mg" + "1 tablet" -> "250 mg — 1 tablet"; parts that are empty are skipped. */
function joinParts(...parts: (string | null | undefined)[]) {
  const kept = parts.map((p) => p?.trim()).filter(Boolean);
  return kept.length ? kept.join(" — ") : null;
}

/**
 * The scans row for one medicine. Values are the latest: the person's correction where
 * there is one, otherwise the AI reading. Urdu is dropped for corrected fields, because
 * the AI's Urdu would describe the old value.
 */
function scanFields(rx: Pick<SavedPrescription, "extraction" | "review" | "status">, i: number) {
  const m = rx.extraction.medicines[i];
  const val = (f: MedicineField) => currentValue(rx.review, i, f, m.fields[f]);
  const urdu = (f: MedicineField) =>
    fieldStatus(rx.review, i, f, m.fields[f]) === "USER_CORRECTED" ? null : m.fields[f].value_urdu;
  const corrected = MEDICINE_FIELDS.filter(
    (f) => fieldStatus(rx.review, i, f, m.fields[f]) === "USER_CORRECTED",
  );
  const notes = rx.extraction.doctor_notes;
  const written = rx.extraction.written_warnings;
  return {
    medicine_name: val("name"),
    medicine_name_urdu: urdu("name"),
    dosage: joinParts(val("strength"), val("dosage")),
    dosage_urdu:
      corrected.includes("strength") || corrected.includes("dosage")
        ? null
        : joinParts(urdu("strength"), urdu("dosage")),
    frequency: val("frequency"),
    frequency_urdu: urdu("frequency"),
    food_interactions: val("instructions"),
    food_interactions_urdu: urdu("instructions"),
    // Only what the doctor wrote. MediSnap no longer adds its own warnings here.
    warnings: null,
    warnings_urdu: null,
    doctor_notes: notes.value,
    doctor_notes_urdu: notes.value_urdu,
    // The AI is no longer asked to judge danger; that is for a pharmacist or doctor.
    is_dangerous: false,
    prescription_data: {
      medicine_index: i,
      strength: val("strength"),
      dose: val("dosage"),
      duration: val("duration"),
      duration_urdu: urdu("duration"),
      route: val("route"),
      brand_name: val("brand_name"),
      generic_name: val("generic_name"),
      interactions: written.value,
      review_status: medicineStatus(m, i, rx.review),
      prescription_status: rx.status,
      corrected_fields: corrected,
      source: "prescription_safety_v1",
    } as Json,
  };
}

/** Log entries for actions taken before the first save, so the trail starts complete. */
export function describeAction(
  extraction: PrescriptionExtraction,
  before: ReviewState,
  after: ReviewState,
  i: number,
  field: MedicineField,
  action: ReviewAction,
): LoggedAction {
  const f = extraction.medicines[i].fields[field];
  return {
    medicine: i,
    field,
    action,
    previous_value: currentValue(before, i, field, f),
    new_value: currentValue(after, i, field, f),
    new_status: fieldStatus(after, i, field, f),
  };
}

function logRows(userId: string, prescriptionId: string, log: LoggedAction[]) {
  return log.map((l) => ({
    prescription_id: prescriptionId,
    user_id: userId,
    medicine_index: l.medicine,
    field: l.field,
    action: l.action,
    previous_value: l.previous_value,
    new_value: l.new_value,
    new_status: l.new_status,
    ...(l.evidence ? { evidence: l.evidence } : {}),
  }));
}

/** A missing column (PostgREST PGRST204, Postgres 42703): that database update isn't applied. */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error) && (error!.code === "PGRST204" || error!.code === "42703");
}

/**
 * Adds rows to the review trail. Before the identification update adds the evidence column,
 * the rows are saved without it rather than failing: the review itself still records it.
 */
async function insertTrail(rows: ReturnType<typeof logRows>) {
  const res = await supabase.from("prescription_reviews").insert(rows);
  if (res.error && isMissingColumn(res.error) && rows.some((r) => "evidence" in r))
    return supabase
      .from("prescription_reviews")
      .insert(rows.map(({ evidence: _evidence, ...r }) => r));
  return res;
}

export type SaveStage = "upload" | "record" | "medicines" | "review";

/**
 * What has been written so far for one prescription. It lives as long as the result is on
 * screen, so a retry continues where the last attempt stopped: the original is never
 * uploaded twice and the record is never created twice.
 */
export interface SaveProgress {
  id: string;
  userId: string | null;
  path: string | null;
  uploaded: boolean;
  recordSaved: boolean;
  medicinesSaved: boolean;
  reviewSaved: boolean;
}

export function newSaveProgress(): SaveProgress {
  return {
    id: crypto.randomUUID(),
    userId: null,
    path: null,
    uploaded: false,
    recordSaved: false,
    medicinesSaved: false,
    reviewSaved: false,
  };
}

export function isPartiallySaved(p: SaveProgress | null) {
  return Boolean(p && (p.uploaded || p.recordSaved) && !(p.medicinesSaved && p.reviewSaved));
}

type SupabaseLikeError = {
  message?: string;
  code?: string;
  statusCode?: string;
  status?: number;
} | null;

/** Logs the technical reason for developers. Never logs prescription content. */
function logFailure(stage: SaveStage, error: SupabaseLikeError) {
  console.error(`[prescription save] ${stage} failed`, {
    code: error?.code ?? error?.statusCode ?? error?.status ?? null,
    message: error?.message ?? null,
  });
}

export async function savePrescription(
  input: {
    prepared: PreparedPrescription;
    extraction: PrescriptionExtraction;
    model: string;
    review: ReviewState;
    log: LoggedAction[];
    /** Optional, typed by the patient. */
    doctorName?: string | null;
  },
  progress: SaveProgress,
  onStage: (stage: SaveStage) => void = () => {},
) {
  const userId = await requireUser();
  const { prepared, extraction, model, review, log } = input;
  const doctor_name = cleanDoctorName(input.doctorName);
  if (progress.userId && progress.userId !== userId) Object.assign(progress, newSaveProgress());
  progress.userId = userId;
  const id = progress.id;
  const path = (progress.path ??= `${userId}/${id}/original.${extensionFor(prepared.mime)}`);
  const status = overallStatus(extraction, review);

  // 1. The original. Raw bytes with an explicit type are stored byte-for-byte (a Blob
  //    would be wrapped in a multipart form and typed by the browser).
  if (!progress.uploaded) {
    onStage("upload");
    const upload = await supabase.storage
      .from(BUCKET)
      .upload(path, await prepared.original.arrayBuffer(), {
        contentType: prepared.mime,
        upsert: false, // never overwrite an existing original
        cacheControl: "3600",
      });
    // The path is unique to this prescription, so "already exists" means an earlier attempt
    // got the file there before its response was lost.
    const duplicate = /already exists|duplicate/i.test(upload.error?.message ?? "");
    if (upload.error && !duplicate) {
      logFailure("upload", upload.error as SupabaseLikeError);
      throw new SaveError("upload", classify(upload.error as SupabaseLikeError));
    }
    progress.uploaded = true;
  }

  // 2. The record: AI output exactly as returned, plus the review so far.
  onStage("record");
  if (!progress.recordSaved) {
    const record = await supabase.from("prescriptions").insert({
      id,
      user_id: userId,
      original_path: path,
      original_mime: prepared.mime,
      original_size: prepared.original.size,
      original_sha256: prepared.sha256,
      page_count: prepared.pages.length,
      quality: { pages: prepared.quality } as unknown as Json,
      extraction: extraction as unknown as Json,
      model,
      review: review as unknown as Json,
      status,
      // Only sent when there is one, so saving still works before the column exists.
      ...(doctor_name ? { doctor_name } : {}),
    });
    // 23505 (duplicate key): the insert landed on an earlier attempt.
    if (record.error && record.error.code !== "23505") {
      logFailure("record", record.error);
      throw new SaveError("record", classify(record.error));
    }
    progress.recordSaved = true;
  } else {
    // Retrying after a later step failed: bring the saved review up to date instead.
    const updated = await supabase
      .from("prescriptions")
      .update({ review: review as unknown as Json, status })
      .eq("id", id);
    if (updated.error) {
      logFailure("record", updated.error);
      throw new SaveError("record", classify(updated.error));
    }
  }

  // 3. One History row per medicine. Rows from a half-finished attempt are replaced, so a
  //    retry never duplicates medicines.
  if (!progress.medicinesSaved) {
    onStage("medicines");
    const cleared = await supabase.from("scans").delete().eq("scan_group_id", id);
    const rx = { extraction, review, status };
    const rows = extraction.medicines.map((_, i) => ({
      user_id: userId,
      scan_type: "prescription",
      scan_group_id: id,
      ...scanFields(rx, i),
    }));
    const scans = cleared.error ? cleared : await supabase.from("scans").insert(rows);
    if (scans.error) {
      logFailure("medicines", scans.error);
      throw new SaveError("medicines", classify(scans.error));
    }
    progress.medicinesSaved = true;
  }

  // 4. Review actions taken before saving start the audit trail.
  if (!progress.reviewSaved) {
    onStage("review");
    if (log.length) {
      const logged = await supabase.from("prescription_reviews").insert(logRows(userId, id, log));
      if (logged.error) {
        logFailure("review", logged.error);
        throw new SaveError("review", classify(logged.error));
      }
    }
    progress.reviewSaved = true;
  }
  return { id, status };
}

/**
 * Removes whatever a failed save left behind when the person discards the result instead
 * of retrying, so nothing half-saved stays in their account.
 */
export async function discardPartialSave(progress: SaveProgress) {
  if (progress.recordSaved || progress.medicinesSaved) {
    await supabase.from("scans").delete().eq("scan_group_id", progress.id);
    await supabase.from("prescriptions").delete().eq("id", progress.id); // cascades to the trail
  }
  if (progress.uploaded && progress.path)
    await supabase.storage.from(BUCKET).remove([progress.path]);
}

export async function loadPrescription(id: string): Promise<SavedPrescription | null> {
  const { data, error } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as SavedPrescription) ?? null;
}

/** Every saved prescription, newest first: original details and the doctor's name only. */
export async function listPrescriptions(): Promise<PrescriptionSummary[]> {
  const cols = "id,uploaded_at,original_path,original_mime,original_size,page_count";
  let res = await supabase
    .from("prescriptions")
    .select(`${cols},doctor_name`)
    .order("uploaded_at", { ascending: false });
  // Before the My Medicines update the doctor_name column doesn't exist yet (42703).
  if (res.error?.code === "42703")
    res = (await supabase
      .from("prescriptions")
      .select(cols)
      .order("uploaded_at", { ascending: false })) as typeof res;
  if (res.error) throw res.error;
  return (res.data ?? []).map((r) => ({
    ...(r as unknown as PrescriptionSummary),
    doctor_name: (r as { doctor_name?: string | null }).doctor_name ?? null,
  }));
}

/** Saves (or clears) the doctor's name. The original and the AI reading are untouched. */
export async function updateDoctorName(id: string, name: string | null) {
  const doctor_name = cleanDoctorName(name);
  const { error } = await supabase.from("prescriptions").update({ doctor_name }).eq("id", id);
  if (error) throw error;
  return doctor_name;
}

export async function loadPrescriptionSummaries(ids: string[]) {
  if (!ids.length)
    return new Map<
      string,
      Pick<SavedPrescription, "id" | "status" | "original_mime" | "page_count">
    >();
  const { data, error } = await supabase
    .from("prescriptions")
    .select("id,status,original_mime,page_count")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [
      r.id,
      r as Pick<SavedPrescription, "id" | "status" | "original_mime" | "page_count">,
    ]),
  );
}

export async function loadReviewTrail(id: string) {
  const { data, error } = await supabase
    .from("prescription_reviews")
    .select("*")
    .eq("prescription_id", id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** A short-lived private link to the original. Nobody else's session can create one. */
export async function originalUrl(rx: Pick<SavedPrescription, "original_path">, download?: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(rx.original_path, SIGNED_URL_SECONDS, download ? { download } : undefined);
  if (error || !data) throw error ?? new Error("signed url");
  return data.signedUrl;
}

export async function downloadOriginal(rx: Pick<SavedPrescription, "original_path">) {
  const { data, error } = await supabase.storage.from(BUCKET).download(rx.original_path);
  if (error || !data) throw error ?? new Error("download");
  return data;
}

/**
 * Applies one review action to a saved prescription: the review state and status are
 * updated, the action is appended to the audit trail, and the medicine's History row is
 * updated so Calendar and the Doctor Report show the latest value. The AI's original
 * reading in `extraction` is never touched (the database refuses to change it).
 */
export async function reviewSaved(
  rx: SavedPrescription,
  i: number,
  field: MedicineField,
  action: ReviewAction,
  value?: string,
  evidence?: ReviewEvidence,
): Promise<SavedPrescription> {
  const userId = await requireUser();
  const review = applyAction(rx.review, i, field, action, value, evidence);
  const status = overallStatus(rx.extraction, review);
  const entry = {
    ...describeAction(rx.extraction, rx.review, review, i, field, action),
    ...(evidence && (action === "confirm" || action === "correct") ? { evidence } : {}),
  };

  const updated = await supabase
    .from("prescriptions")
    .update({ review: review as unknown as Json, status })
    .eq("id", rx.id)
    .select("updated_at")
    .single();
  if (updated.error) throw updated.error;

  const logged = await insertTrail(logRows(userId, rx.id, [entry]));
  if (logged.error) {
    // Keep the record and its trail consistent: undo the change if it couldn't be logged.
    await supabase
      .from("prescriptions")
      .update({ review: rx.review as unknown as Json, status: rx.status })
      .eq("id", rx.id);
    throw logged.error;
  }

  const next: SavedPrescription = { ...rx, review, status, updated_at: updated.data.updated_at };
  await syncScans(next);
  return next;
}

/** Brings every History row for this prescription up to date with the review. */
async function syncScans(rx: SavedPrescription) {
  const { data, error } = await supabase
    .from("scans")
    .select("id,prescription_data,created_at")
    .eq("scan_group_id", rx.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  await Promise.all(
    (data ?? []).map((row, order) => {
      const stored = (row.prescription_data as { medicine_index?: number } | null)?.medicine_index;
      const i = typeof stored === "number" ? stored : order;
      if (!rx.extraction.medicines[i]) return null;
      return supabase.from("scans").update(scanFields(rx, i)).eq("id", row.id);
    }),
  );
}

/** Removes the original file and the record (and with it the audit trail). */
export async function deletePrescriptionRecord(id: string) {
  const { data } = await supabase
    .from("prescriptions")
    .select("original_path")
    .eq("id", id)
    .maybeSingle();
  if (data?.original_path) await supabase.storage.from(BUCKET).remove([data.original_path]);
  await supabase.from("prescriptions").delete().eq("id", id);
}

/**
 * Records whose History rows are all gone (for example, deleted and then the page was
 * closed before the undo window ended). Only old ones are touched, so a save that is
 * still in progress in another tab is never mistaken for one.
 */
export async function cleanUpOrphans(groupIdsInHistory: Set<string>) {
  await cleanUpOrphanFiles().catch(() => {});
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("prescriptions")
    .select("id")
    .lt("created_at", cutoff);
  if (error || !data) return;
  for (const { id } of data) {
    if (groupIdsInHistory.has(id)) continue;
    // Checked again directly: the History list may be paged, so absence there proves nothing.
    const { count, error: countError } = await supabase
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("scan_group_id", id);
    if (!countError && count === 0) await deletePrescriptionRecord(id);
  }
}

/**
 * Originals whose save never got as far as a record (the tab was closed after the upload
 * and before the record was written). Only files older than a day are removed, so a save
 * in progress elsewhere is never touched.
 */
async function cleanUpOrphanFiles() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const root = u.user.id;
  const { data: folders, error } = await supabase.storage.from(BUCKET).list(root, { limit: 100 });
  if (error || !folders?.length) return;
  const ids = folders.map((f) => f.name);
  const { data: records, error: recordError } = await supabase
    .from("prescriptions")
    .select("id")
    .in("id", ids);
  if (recordError || !records) return;
  const known = new Set(records.map((r) => r.id));
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const folder of ids.filter((id) => !known.has(id))) {
    const { data: files } = await supabase.storage.from(BUCKET).list(`${root}/${folder}`);
    const stale = (files ?? []).filter((f) => f.created_at && +new Date(f.created_at) < dayAgo);
    if (stale.length)
      await supabase.storage.from(BUCKET).remove(stale.map((f) => `${root}/${folder}/${f.name}`));
  }
}

export function criticalFieldsOf(m: ExtractedMedicine) {
  return CRITICAL_FIELDS.filter((f) => m.fields[f].status !== "not_found");
}

export { reviewKey };
