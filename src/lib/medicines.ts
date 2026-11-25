// My Medicines: the medicines MediSnap's AI read from saved prescriptions and medicine labels,
// whether the person has identified each one, and their own Taken / Not taken / Not sure
// record. Two things are kept apart throughout:
//   - what the AI read: scans rows and prescriptions.extraction, never changed here
//   - what the person says: prescription_reviews (saved prescriptions) or
//     medicine_name_confirmations (labels, older prescription rows) for names, and
//     medicine_status_events for taking. All three are append-only and dated by the database.
// Nothing here ever records "taken", or confirms a name, on the person's behalf.
import { supabase } from "@/integrations/supabase/client";
import {
  currentValue,
  fieldStatus,
  reviewKey,
  type ExtractionStatus,
  type MedicineField,
  type ReviewEvidence,
} from "@/lib/prescription/model";
import {
  isMissingColumn,
  isNotSetUp,
  reviewSaved,
  type SavedPrescription,
} from "@/lib/prescription/store";

export const INTAKE_STATUSES = ["taken", "not_taken", "not_sure"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export interface StatusEvent {
  id: string;
  scan_id: string;
  status: IntakeStatus;
  recorded_at: string;
}

export interface NameConfirmation {
  id: string;
  scan_id: string;
  action: "confirm" | "correct" | "unable_to_identify";
  ai_name: string | null;
  confirmed_name: string | null;
  evidence?: ReviewEvidence | null;
  created_at: string;
}

interface ScanRecord {
  id: string;
  created_at: string;
  scan_type: string;
  scan_group_id: string | null;
  medicine_name: string | null;
  medicine_name_urdu: string | null;
  dosage: string | null;
  frequency: string | null;
  prescription_data: unknown;
}

/**
 * confirmed              the person confirmed or entered the name (or confirmed it after
 *                        scanning the packaging). Only these names reach Interaction Check.
 * needs_identification   nobody has identified it yet
 * pending_verification   the person said they can't identify it; a pharmacist or doctor
 *                        should check the original
 */
export type Identity = "confirmed" | "needs_identification" | "pending_verification";

/** How readable the AI found the name on the original. A self-rating, not a measurement. */
export type Confidence = "high" | "review" | "unclear";

export type MedicineSource = "prescription" | "prescription_legacy" | "label";

export interface MedicineDetail {
  field: MedicineField | "dosage_text" | "frequency_text";
  value: string | null;
  /** The AI's Urdu explanation of the value (not shown once the person corrected it). */
  urdu?: string | null;
  status: ExtractionStatus | null;
}

export interface MyMedicine {
  scanId: string;
  savedAt: string;
  source: MedicineSource;
  /** The saved prescription this came from (source "prescription" only). */
  prescriptionId: string | null;
  /** Groups medicines read from the same prescription, including older ones. */
  groupId: string | null;
  /** Position on the prescription (0-based), when it came from one. */
  index: number | null;
  /** The name exactly as the AI read it (may be a guess). */
  aiName: string | null;
  /** The name the person confirmed or entered. Null until identified. */
  confirmedName: string | null;
  /** What to show as the title: the confirmed name, or a clearly read AI name, or null. */
  displayName: string | null;
  identity: Identity;
  confidence: Confidence;
  /** How the name was confirmed. */
  confirmedVia: "you" | "packaging" | null;
  /** Strength as read or corrected (unconfirmed unless the person checked it). */
  strength: string | null;
  /** Other details the AI read, for the expandable section. */
  details: MedicineDetail[];
  /** Other readings of the name the AI found plausible. Never confirmed. */
  alternatives: string[];
  /** Whether a box/strip scan can help (not for label scans, which already are one). */
  canScanPackaging: boolean;
  /** The person's own record, newest first. Empty means "not recorded". */
  history: StatusEvent[];
  status: IntakeStatus | null;
  statusAt: string | null;
}

export interface MyMedicinesData {
  medicines: MyMedicine[];
  prescriptions: Map<string, SavedPrescription>;
  /** False until the My Medicines database update is applied. */
  trackingReady: boolean;
  confirmReady: boolean;
}

const usable = (name: string | null | undefined) => {
  const v = name?.replace(/\s+/g, " ").trim();
  return v ? v : null;
};

const DETAIL_FIELDS: MedicineField[] = ["dosage", "frequency", "duration", "route", "instructions"];

function fromReview(rx: SavedPrescription, i: number) {
  const m = rx.extraction.medicines[i];
  if (!m) return null;
  const f = m.fields.name;
  const r = rx.review[reviewKey(i, "name")];
  const aiName = usable(f.value);
  const s = fieldStatus(rx.review, i, "name", f);
  let identity: Identity = "needs_identification";
  let confirmedName: string | null = null;
  let confirmedVia: MyMedicine["confirmedVia"] = null;
  if (s === "USER_CORRECTED" && usable(r?.corrected_value)) {
    // The person typed the name (from the box, or as their doctor told them).
    identity = "confirmed";
    confirmedName = usable(r!.corrected_value);
    confirmedVia = r?.evidence === "packaging_scan" ? "packaging" : "you";
  } else if (
    (s === "USER_CONFIRMED" &&
      aiName &&
      (f.status === "clear" || r?.evidence === "packaging_scan")) ||
    (s === "PROFESSIONALLY_VERIFIED" && aiName)
  ) {
    // Confirming the AI's reading counts only when it was read clearly, or the person
    // compared it with the packaging first. A click on an uncertain guess doesn't.
    identity = "confirmed";
    confirmedName = aiName;
    confirmedVia = r?.evidence === "packaging_scan" ? "packaging" : "you";
  } else if (r?.status === "NEEDS_PROFESSIONAL_REVIEW") {
    // Stored by the person's own "Unable to identify" (not the AI's initial rating).
    identity = "pending_verification";
  }
  const confidence: Confidence =
    f.status === "clear" && aiName
      ? m.name_alternatives.length
        ? "review"
        : "high"
      : f.status === "uncertain" && aiName
        ? "review"
        : "unclear";
  return {
    aiName,
    confirmedName,
    confirmedVia,
    identity,
    confidence,
    strength: usable(currentValue(rx.review, i, "strength", m.fields.strength)),
    details: DETAIL_FIELDS.map((field) => ({
      field,
      value: usable(currentValue(rx.review, i, field, m.fields[field])),
      urdu:
        fieldStatus(rx.review, i, field, m.fields[field]) === "USER_CORRECTED"
          ? null
          : usable(m.fields[field].value_urdu),
      status: m.fields[field].status,
    })).filter((d) => d.value || d.status === "unreadable" || d.status === "uncertain"),
    alternatives: m.name_alternatives,
  };
}

export async function loadMyMedicines(): Promise<MyMedicinesData> {
  const [sc, rx, ev, cf] = await Promise.all([
    supabase
      .from("scans")
      .select(
        "id,created_at,scan_type,scan_group_id,medicine_name,medicine_name_urdu,dosage,frequency,prescription_data",
      )
      .order("created_at", { ascending: false }),
    supabase.from("prescriptions").select("*"),
    supabase
      .from("medicine_status_events")
      .select("id,scan_id,status,recorded_at")
      .order("recorded_at", { ascending: false }),
    supabase
      .from("medicine_name_confirmations")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);
  if (sc.error) throw sc.error;
  // A table that doesn't exist yet means that part of the database update isn't applied.
  for (const r of [rx, ev, cf]) if (r.error && !isNotSetUp(r.error)) throw r.error;

  const prescriptions = new Map<string, SavedPrescription>(
    ((rx.data ?? []) as unknown as SavedPrescription[]).map((p) => [p.id, p]),
  );
  const events = new Map<string, StatusEvent[]>();
  for (const e of (ev.data ?? []) as StatusEvent[])
    events.set(e.scan_id, [...(events.get(e.scan_id) ?? []), e]);
  const confirmations = new Map<string, NameConfirmation>();
  for (const c of [...((cf.data ?? []) as NameConfirmation[])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  ))
    if (!confirmations.has(c.scan_id)) confirmations.set(c.scan_id, c); // newest wins

  const scans = (sc.data ?? []) as ScanRecord[];
  // Position on the prescription: the stored index, or the save order within the group.
  const order = new Map<string, number>();
  const byGroup = new Map<string, ScanRecord[]>();
  for (const s of scans)
    if (s.scan_type === "prescription" && s.scan_group_id)
      byGroup.set(s.scan_group_id, [...(byGroup.get(s.scan_group_id) ?? []), s]);
  for (const list of byGroup.values())
    [...list]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((s, k) => order.set(s.id, k));

  const medicines = scans.map((s): MyMedicine => {
    const history = [...(events.get(s.id) ?? [])].sort((a, b) =>
      b.recorded_at.localeCompare(a.recorded_at),
    );
    const stored = (s.prescription_data as { medicine_index?: unknown } | null)?.medicine_index;
    const index =
      s.scan_type === "prescription"
        ? typeof stored === "number"
          ? stored
          : (order.get(s.id) ?? null)
        : null;
    const record =
      s.scan_type === "prescription" && s.scan_group_id
        ? prescriptions.get(s.scan_group_id)
        : undefined;
    const reviewed = record && index !== null ? fromReview(record, index) : null;
    const base = {
      scanId: s.id,
      savedAt: s.created_at,
      groupId: s.scan_group_id ?? null,
      index,
      history,
      status: history[0]?.status ?? null,
      statusAt: history[0]?.recorded_at ?? null,
    };
    if (reviewed) {
      return {
        ...base,
        ...reviewed,
        source: "prescription",
        prescriptionId: s.scan_group_id,
        displayName:
          reviewed.confirmedName ?? (reviewed.confidence === "high" ? reviewed.aiName : null),
        canScanPackaging: true,
      };
    }
    // Label scans and prescription rows saved before originals were kept.
    const label = s.scan_type !== "prescription";
    const c = confirmations.get(s.id) ?? null;
    const aiName = usable(s.medicine_name);
    const identity: Identity = !c
      ? "needs_identification"
      : c.action === "unable_to_identify"
        ? "pending_verification"
        : "confirmed";
    const confirmedName = identity === "confirmed" ? usable(c?.confirmed_name) : null;
    // A label scan was read from printed packaging; an older prescription row has no
    // readability rating at all, so it always needs checking.
    const confidence: Confidence = !aiName ? "unclear" : label ? "high" : "review";
    return {
      ...base,
      source: label ? "label" : "prescription_legacy",
      prescriptionId: null,
      aiName,
      confirmedName,
      confirmedVia: confirmedName ? (c?.evidence === "packaging_scan" ? "packaging" : "you") : null,
      displayName: confirmedName ?? (confidence === "high" ? aiName : null),
      identity,
      confidence,
      strength: usable(s.dosage),
      details: [{ field: "frequency_text", value: usable(s.frequency), status: null }].filter(
        (d) => d.value,
      ) as MedicineDetail[],
      alternatives: [],
      canScanPackaging: !label,
    };
  });

  return {
    medicines,
    prescriptions,
    trackingReady: !ev.error,
    confirmReady: !cf.error,
  };
}

async function userId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("session");
  return data.user.id;
}

/** The identification database update (20261114120000) isn't applied yet. */
export class IdentificationNotSetUp extends Error {
  constructor() {
    super("identification_not_set_up");
  }
}

/** Adds one entry to the person's record. Earlier entries are kept, never changed. */
export async function recordStatus(scanId: string, status: IntakeStatus): Promise<StatusEvent> {
  const { data, error } = await supabase
    .from("medicine_status_events")
    .insert({ user_id: await userId(), scan_id: scanId, status })
    .select("id,scan_id,status,recorded_at")
    .single();
  if (error) throw error;
  return data as StatusEvent;
}

/** Label scans and older prescription rows: append a Confirm / Correct / Unable row. */
async function addConfirmation(
  scanId: string,
  action: NameConfirmation["action"],
  name: string | null,
  evidence?: ReviewEvidence,
): Promise<NameConfirmation> {
  const confirmed_name = name ? name.replace(/\s+/g, " ").trim().slice(0, 200) : null;
  if (action !== "unable_to_identify" && !confirmed_name) throw new Error("empty");
  const row = {
    user_id: await userId(),
    scan_id: scanId,
    action,
    confirmed_name,
    ...(evidence ? { evidence } : {}),
  };
  const insert = (r: typeof row) =>
    supabase.from("medicine_name_confirmations").insert(r).select("*").single();
  let res = await insert(row);
  // Before the identification update: save the confirmation without the evidence note.
  if (res.error && isMissingColumn(res.error) && evidence) {
    const { evidence: _e, ...plain } = row as typeof row & { evidence?: string };
    res = await insert(plain as typeof row);
  }
  // "Unable to identify" needs that update (a check constraint or not-null rejects it).
  if (res.error && action === "unable_to_identify" && ["23514", "23502"].includes(res.error.code))
    throw new IdentificationNotSetUp();
  if (res.error) throw res.error;
  return res.data as NameConfirmation;
}

/** "Confirm medicine": the AI's reading is right. Only offered when it was read clearly. */
export async function confirmMedicine(
  m: MyMedicine,
  data: MyMedicinesData,
  evidence?: ReviewEvidence,
) {
  if (!m.aiName) throw new Error("no_name");
  if (m.source === "prescription") {
    const rx = data.prescriptions.get(m.prescriptionId!);
    if (!rx || m.index === null) throw new Error("missing_prescription");
    await reviewSaved(rx, m.index, "name", "confirm", undefined, evidence);
  } else await addConfirmation(m.scanId, "confirm", m.aiName, evidence);
}

/** The person entered the name (typed, or chose the name printed on the packaging). */
export async function setMedicineName(
  m: MyMedicine,
  data: MyMedicinesData,
  name: string,
  evidence?: ReviewEvidence,
) {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("empty");
  const same = m.aiName !== null && clean === m.aiName;
  if (m.source === "prescription") {
    const rx = data.prescriptions.get(m.prescriptionId!);
    if (!rx || m.index === null) throw new Error("missing_prescription");
    await reviewSaved(
      rx,
      m.index,
      "name",
      same ? "confirm" : "correct",
      same ? undefined : clean,
      evidence,
    );
  } else await addConfirmation(m.scanId, same ? "confirm" : "correct", clean, evidence);
}

/** "Unable to identify": moves the medicine to Pending verification. */
export async function markUnableToIdentify(m: MyMedicine, data: MyMedicinesData) {
  if (m.source === "prescription") {
    const rx = data.prescriptions.get(m.prescriptionId!);
    if (!rx || m.index === null) throw new Error("missing_prescription");
    await reviewSaved(rx, m.index, "name", "mark_unclear");
  } else await addConfirmation(m.scanId, "unable_to_identify", null);
}

/** Back to "Needs identification" after "Unable to identify" (saved prescriptions). */
export async function reopenIdentification(m: MyMedicine, data: MyMedicinesData) {
  if (m.source !== "prescription") return;
  const rx = data.prescriptions.get(m.prescriptionId!);
  if (!rx || m.index === null) throw new Error("missing_prescription");
  await reviewSaved(rx, m.index, "name", "reset");
}

// ---- comparing the packaging with the prescription -------------------------------------

const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)\b/g, " ")
    .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|inj)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length][b.length];
}

/**
 * A hint for the person, never a decision: "same", "similar" or "different" names. Strength
 * words and units are ignored for the name and compared separately.
 */
export function compareNames(prescription: string | null, packaging: string | null) {
  if (!prescription || !packaging) return "unknown" as const;
  const a = normal(prescription);
  const b = normal(packaging);
  if (!a || !b) return "unknown" as const;
  if (a === b) return "same" as const;
  const ratio = 1 - distance(a, b) / Math.max(a.length, b.length);
  return a.includes(b) || b.includes(a) || ratio >= 0.75
    ? ("similar" as const)
    : ("different" as const);
}

export function compareStrengths(prescription: string | null, packaging: string | null) {
  const nums = (s: string | null) => (s?.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const a = nums(prescription);
  const b = nums(packaging);
  if (!a.length || !b.length) return "unknown" as const;
  return a.some((x) => b.includes(x)) ? ("same" as const) : ("different" as const);
}

// ---- other features ----------------------------------------------------------------------

/**
 * Interaction Check may only use names a person has confirmed. Everything else is listed
 * separately so it's clear why it can't be chosen.
 */
export function interactionChoices(medicines: MyMedicine[]) {
  const confirmed = new Map<string, string>();
  for (const m of medicines)
    if (m.identity === "confirmed" && m.confirmedName) {
      const key = m.confirmedName.toLowerCase();
      if (!confirmed.has(key)) confirmed.set(key, m.confirmedName);
    }
  const pending = medicines.filter(
    (m) => m.identity !== "confirmed" && !(m.aiName && confirmed.has(m.aiName.toLowerCase())),
  );
  return {
    confirmed: [...confirmed.values()].sort((a, b) => a.localeCompare(b)),
    pending,
  };
}

/** For the optional, patient-reported section of the doctor report: confirmed names only. */
export interface ReportMedicine {
  name: string;
  source: "prescription" | "label";
  status: IntakeStatus | null;
  statusAt: Date | null;
}

export function reportMedicines(medicines: MyMedicine[]): ReportMedicine[] {
  return medicines
    .filter((m) => m.identity === "confirmed" && m.confirmedName)
    .map((m) => ({
      name: m.confirmedName!,
      source: m.source === "label" ? ("label" as const) : ("prescription" as const),
      status: m.status,
      statusAt: m.statusAt ? new Date(m.statusAt) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function unconfirmedCount(medicines: MyMedicine[]) {
  return medicines.filter((m) => m.identity !== "confirmed").length;
}
