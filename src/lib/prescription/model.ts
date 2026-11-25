// The prescription safety model shared by the extraction, review screen, History and the
// PDF. Two separate questions are kept apart throughout:
//   - extraction status: how readable was this on the original? (from the AI, unverified)
//   - verification status: what has a person done about it?

export const EXTRACTION_STATUSES = ["clear", "uncertain", "unreadable", "not_found"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const VERIFICATION_STATUSES = [
  "AI_EXTRACTED_UNVERIFIED",
  "USER_CONFIRMED",
  "USER_CORRECTED",
  // Reserved for a genuine professional review workflow. The database rejects it from any
  // patient session, and nothing in the app can set it.
  "PROFESSIONALLY_VERIFIED",
  "NEEDS_PROFESSIONAL_REVIEW",
  "UNREADABLE",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface ExtractedField {
  value: string | null;
  value_urdu: string | null;
  status: ExtractionStatus;
  reason: string | null;
}

export const MEDICINE_FIELDS = [
  "name",
  "brand_name",
  "generic_name",
  "strength",
  "dosage",
  "frequency",
  "duration",
  "route",
  "instructions",
] as const;
export type MedicineField = (typeof MEDICINE_FIELDS)[number];

/** A wrong value in any of these could change how much, how often or what is taken. */
export const CRITICAL_FIELDS: readonly MedicineField[] = [
  "name",
  "strength",
  "dosage",
  "frequency",
  "duration",
];

export interface ExtractedMedicine {
  fields: Record<MedicineField, ExtractedField>;
  /** Other readings of the name the model found plausible. Never confirmed. */
  name_alternatives: string[];
}

export interface ImageQuality {
  usable: boolean;
  issues: string[];
  note: string | null;
}

export interface PrescriptionExtraction {
  image_quality: ImageQuality;
  medicines: ExtractedMedicine[];
  doctor_notes: ExtractedField;
  /** Interactions only as written on the prescription, never inferred. */
  written_warnings: ExtractedField;
}

/** What a confirmation or correction was based on, when it wasn't the prescription alone. */
export type ReviewEvidence = "packaging_scan";

export interface FieldReview {
  status: VerificationStatus;
  /** Present only when the person typed a correction. */
  corrected_value?: string;
  /** Set when the person confirmed the name after scanning the medicine's box or strip. */
  evidence?: ReviewEvidence;
  updated_at: string;
}

/** review jsonb: "<medicineIndex>.<field>" -> current review state */
export type ReviewState = Record<string, FieldReview>;

export const reviewKey = (medicineIndex: number, field: MedicineField) =>
  `${medicineIndex}.${field}`;

/** Where a field starts before anyone has looked at it. */
export function initialStatus(field: MedicineField, extracted: ExtractedField): VerificationStatus {
  if (extracted.status === "unreadable") return "UNREADABLE";
  if (extracted.status === "uncertain" && CRITICAL_FIELDS.includes(field))
    return "NEEDS_PROFESSIONAL_REVIEW";
  return "AI_EXTRACTED_UNVERIFIED";
}

export function fieldStatus(
  review: ReviewState,
  i: number,
  field: MedicineField,
  extracted: ExtractedField,
) {
  return review[reviewKey(i, field)]?.status ?? initialStatus(field, extracted);
}

/** The value downstream screens should show: the person's correction if any, else the AI's. */
export function currentValue(
  review: ReviewState,
  i: number,
  field: MedicineField,
  extracted: ExtractedField,
) {
  const r = review[reviewKey(i, field)];
  if (r?.status === "USER_CORRECTED" && r.corrected_value != null) return r.corrected_value;
  return extracted.value;
}

/**
 * True when a professional should check this field, whatever the patient has since done.
 * If the AI could not read a critical field clearly, a patient's own confirmation or
 * correction doesn't settle it: only someone qualified, looking at the original, can.
 */
export function needsProfessional(
  review: ReviewState,
  i: number,
  field: MedicineField,
  extracted: ExtractedField,
) {
  const s = fieldStatus(review, i, field, extracted);
  if (s === "NEEDS_PROFESSIONAL_REVIEW" || s === "UNREADABLE") return true;
  return (
    CRITICAL_FIELDS.includes(field) &&
    (extracted.status === "uncertain" || extracted.status === "unreadable")
  );
}

/**
 * Status for one medicine. Anything needing professional review wins; then anything not
 * yet looked at. Nothing a patient does here can produce "professionally verified".
 */
export function medicineStatus(
  medicine: ExtractedMedicine,
  i: number,
  review: ReviewState,
): VerificationStatus {
  let corrected = false;
  let unreviewed = false;
  for (const field of MEDICINE_FIELDS) {
    const f = medicine.fields[field];
    const critical = CRITICAL_FIELDS.includes(field);
    if (critical && needsProfessional(review, i, field, f)) return "NEEDS_PROFESSIONAL_REVIEW";
    const s = fieldStatus(review, i, field, f);
    if (s === "USER_CORRECTED") corrected = true;
    if (critical && f.status !== "not_found" && s === "AI_EXTRACTED_UNVERIFIED") unreviewed = true;
  }
  if (unreviewed) return "AI_EXTRACTED_UNVERIFIED";
  return corrected ? "USER_CORRECTED" : "USER_CONFIRMED";
}

const STATUS_PRIORITY: VerificationStatus[] = [
  "NEEDS_PROFESSIONAL_REVIEW",
  "UNREADABLE",
  "AI_EXTRACTED_UNVERIFIED",
  "USER_CORRECTED",
  "USER_CONFIRMED",
];

/** The whole prescription takes the most cautious of its medicines' statuses. */
export function overallStatus(
  extraction: PrescriptionExtraction,
  review: ReviewState,
): VerificationStatus {
  if (!extraction.image_quality.usable || extraction.medicines.length === 0) return "UNREADABLE";
  const statuses = extraction.medicines.map((m, i) => medicineStatus(m, i, review));
  return STATUS_PRIORITY.find((s) => statuses.includes(s)) ?? "AI_EXTRACTED_UNVERIFIED";
}

/** The review actions a person can take; each one is written to the audit trail. */
export type ReviewAction = "confirm" | "correct" | "mark_unclear" | "reset";

export function applyAction(
  review: ReviewState,
  i: number,
  field: MedicineField,
  action: ReviewAction,
  value?: string,
  evidence?: ReviewEvidence,
): ReviewState {
  const key = reviewKey(i, field);
  const next = { ...review };
  const updated_at = new Date().toISOString();
  const ev = evidence && (action === "confirm" || action === "correct") ? { evidence } : {};
  if (action === "reset") delete next[key];
  else if (action === "confirm") next[key] = { status: "USER_CONFIRMED", ...ev, updated_at };
  else if (action === "mark_unclear")
    next[key] = { status: "NEEDS_PROFESSIONAL_REVIEW", updated_at };
  else
    next[key] = {
      status: "USER_CORRECTED",
      corrected_value: (value ?? "").trim(),
      ...ev,
      updated_at,
    };
  return next;
}

/** Counts used by the review summary and the PDF. */
export function reviewSummary(extraction: PrescriptionExtraction, review: ReviewState) {
  const counts: Record<VerificationStatus, number> = {
    AI_EXTRACTED_UNVERIFIED: 0,
    USER_CONFIRMED: 0,
    USER_CORRECTED: 0,
    PROFESSIONALLY_VERIFIED: 0,
    NEEDS_PROFESSIONAL_REVIEW: 0,
    UNREADABLE: 0,
  };
  const attention: {
    medicine: number;
    field: MedicineField;
    status: VerificationStatus;
    reason: string | null;
  }[] = [];
  for (const [i, m] of extraction.medicines.entries()) {
    for (const field of MEDICINE_FIELDS) {
      const f = m.fields[field];
      if (f.status === "not_found" && !review[reviewKey(i, field)]) continue;
      const s = fieldStatus(review, i, field, f);
      counts[s]++;
      if (needsProfessional(review, i, field, f))
        attention.push({ medicine: i, field, status: s, reason: f.reason });
    }
  }
  return { counts, attention };
}
