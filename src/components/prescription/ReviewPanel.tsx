import { useId, useState } from "react";
import { Check, Loader2, PencilLine, Stethoscope, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Med, MedicalValue } from "@/components/MedicalText";
import { StatusBanner } from "@/components/app/primitives";
import {
  CRITICAL_FIELDS,
  MEDICINE_FIELDS,
  currentValue,
  fieldStatus,
  medicineStatus,
  needsProfessional,
  overallStatus,
  reviewKey,
  reviewSummary,
  type ExtractedField,
  type MedicineField,
  type PrescriptionExtraction,
  type ReviewAction,
  type ReviewState,
  type VerificationStatus,
} from "@/lib/prescription/model";
import { FIELD_LABEL, ReadabilityTag, StatusBadge, VERIFICATION_UI } from "./badges";

export type OnReview = (
  i: number,
  field: MedicineField,
  action: ReviewAction,
  value?: string,
) => Promise<void> | void;

/** Overall status, what it means, and what to do next. */
export function ReviewSummary({
  extraction,
  review,
}: {
  extraction: PrescriptionExtraction;
  review: ReviewState;
}) {
  const { t } = useI18n();
  const status = overallStatus(extraction, review);
  const { counts, attention } = reviewSummary(extraction, review);
  const unchecked = counts.AI_EXTRACTED_UNVERIFIED;
  return (
    <section aria-labelledby="rx-summary" className="panel space-y-4" data-overall={status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="rx-summary" className="text-lg font-semibold">
          {t("rx.summary.title")}
        </h2>
        <StatusBadge status={status} size="lg" />
      </div>
      <p className="text-[0.9375rem]">{t(VERIFICATION_UI[status].help)}</p>
      <ul className="grid gap-2 text-[0.9375rem] sm:grid-cols-2">
        <li>{t("rx.summary.needReview", { count: attention.length })}</li>
        <li>{t("rx.summary.unchecked", { count: unchecked })}</li>
        <li>{t("rx.summary.confirmed", { count: counts.USER_CONFIRMED })}</li>
        <li>{t("rx.summary.corrected", { count: counts.USER_CORRECTED })}</li>
      </ul>
      {attention.length > 0 && (
        <StatusBanner tone="warning" title={t("rx.professional.title")}>
          {t("rx.professional.body")}
        </StatusBanner>
      )}
    </section>
  );
}

export function MedicineReview({
  extraction,
  review,
  onReview,
  busyKey,
  readOnly = false,
  footer,
  only,
}: {
  extraction: PrescriptionExtraction;
  review: ReviewState;
  onReview: OnReview;
  busyKey: string | null;
  /** After saving on the scan screen, further changes happen on the saved record. */
  readOnly?: boolean;
  /** Extra content at the end of each medicine (My Medicines puts the person's record here). */
  footer?: (i: number) => React.ReactNode;
  /** Show just this medicine's fields, without its heading (My Medicines "More details"). */
  only?: number;
}) {
  const { t } = useI18n();
  return (
    <ol className="space-y-5">
      {extraction.medicines.map((m, i) => {
        if (only !== undefined && i !== only) return null;
        const status = medicineStatus(m, i, review);
        const name = currentValue(review, i, "name", m.fields.name);
        const present = MEDICINE_FIELDS.filter(
          (f) => m.fields[f].status !== "not_found" || review[reviewKey(i, f)],
        );
        const missing = MEDICINE_FIELDS.filter((f) => !present.includes(f));
        return (
          <li
            key={i}
            className={only === undefined ? "panel space-y-4" : "space-y-4"}
            data-medicine={i}
          >
            <div
              className={
                only === undefined ? "flex flex-wrap items-start justify-between gap-3" : "sr-only"
              }
            >
              <h3 className="display min-w-0 text-2xl">
                <span className="text-primary">{i + 1}.</span>{" "}
                {name ? (
                  <Med>{name}</Med>
                ) : (
                  <span className="text-muted-foreground">{t("rx.nameUnreadable")}</span>
                )}
              </h3>
              <StatusBadge status={status} />
            </div>
            {m.name_alternatives.length > 0 && (
              <p className="rounded-2xl bg-coral/10 p-3 text-[0.9375rem]">
                {t("rx.alternatives")}{" "}
                {m.name_alternatives.map((a, k) => (
                  <span key={a}>
                    {k > 0 && ", "}
                    <Med>{a}</Med>
                  </span>
                ))}
              </p>
            )}
            <ul className="space-y-3">
              {present.map((field) => (
                <FieldRow
                  key={field}
                  i={i}
                  field={field}
                  extracted={m.fields[field]}
                  review={review}
                  onReview={onReview}
                  busy={busyKey === reviewKey(i, field)}
                  disabled={busyKey !== null}
                  readOnly={readOnly}
                />
              ))}
            </ul>
            {missing.length > 0 && !readOnly && (
              <MissingFields
                i={i}
                fields={missing}
                onReview={onReview}
                disabled={busyKey !== null}
              />
            )}
            {footer?.(i)}
          </li>
        );
      })}
    </ol>
  );
}

function FieldRow({
  i,
  field,
  extracted,
  review,
  onReview,
  busy,
  disabled,
  readOnly,
}: {
  readOnly: boolean;
  i: number;
  field: MedicineField;
  extracted: ExtractedField;
  review: ReviewState;
  onReview: OnReview;
  busy: boolean;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const status = fieldStatus(review, i, field, extracted);
  const value = currentValue(review, i, field, extracted);
  const corrected = status === "USER_CORRECTED";
  const reviewed = Boolean(review[reviewKey(i, field)]);
  const prof = needsProfessional(review, i, field, extracted);
  const critical = CRITICAL_FIELDS.includes(field);
  const labelId = useId();

  return (
    <li
      aria-labelledby={labelId}
      data-field={field}
      data-status={status}
      className={`rounded-2xl border p-4 ${prof ? "border-coral-ink/50 bg-coral/5" : "border-border bg-card"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={labelId} className="font-semibold">
          {t(FIELD_LABEL[field])}
          {critical && <span className="sr-only"> ({t("rx.critical")})</span>}
        </p>
        <StatusBadge status={status} />
      </div>

      {value ? (
        <div className="mt-2">
          <MedicalValue original={value} urdu={corrected ? null : extracted.value_urdu} size="lg" />
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground">{t("rx.noValue")}</p>
      )}

      {corrected && (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("rx.aiRead")} {extracted.value ? <Med>{extracted.value}</Med> : t("rx.noValue")}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <ReadabilityTag status={extracted.status} />
        {extracted.reason && (
          <span className="text-sm text-muted-foreground">{extracted.reason}</span>
        )}
      </div>

      {prof && (
        <p className="mt-3 flex items-start gap-2 text-[0.9375rem] font-medium text-coral-ink">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {corrected || status === "USER_CONFIRMED"
            ? t("rx.professional.stillNeeded")
            : t("rx.professional.field")}
        </p>
      )}
      {corrected && <p className="mt-2 text-sm text-muted-foreground">{t("rx.correctedNote")}</p>}

      {readOnly ? null : editing ? (
        <CorrectionForm
          initial={value ?? ""}
          label={t(FIELD_LABEL[field])}
          onCancel={() => setEditing(false)}
          onSave={async (v) => {
            await onReview(i, field, "correct", v);
            setEditing(false);
          }}
        />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {value && status !== "USER_CONFIRMED" && (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onReview(i, field, "confirm")}
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {t("rx.action.confirm")}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => setEditing(true)}>
            <PencilLine aria-hidden="true" /> {t("rx.action.correct")}
          </Button>
          {status !== "NEEDS_PROFESSIONAL_REVIEW" && (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onReview(i, field, "mark_unclear")}
            >
              <Stethoscope aria-hidden="true" /> {t("rx.action.unclear")}
            </Button>
          )}
          {reviewed && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onReview(i, field, "reset")}
            >
              <Undo2 aria-hidden="true" /> {t("rx.action.reset")}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function CorrectionForm({
  initial,
  label,
  onSave,
  onCancel,
}: {
  initial: string;
  label: string;
  onSave: (v: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const id = useId();
  const blank = !value.trim();
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (blank) return;
        setSaving(true);
        try {
          await onSave(value.trim());
        } finally {
          setSaving(false);
        }
      }}
    >
      <label htmlFor={id} className="block text-sm font-semibold">
        {t("rx.correct.label", { field: label })}
      </label>
      <Input
        id={id}
        dir="auto"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        maxLength={200}
      />
      <p className="text-sm text-muted-foreground">{t("rx.correct.hint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={blank || saving}>
          {saving ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
          {t("rx.correct.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X aria-hidden="true" /> {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

/** Fields not written on the prescription: listed, not hidden, and never filled in for you. */
function MissingFields({
  i,
  fields,
  onReview,
  disabled,
}: {
  i: number;
  fields: MedicineField[];
  onReview: OnReview;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState<MedicineField | null>(null);
  const criticalMissing = fields.filter((f) => CRITICAL_FIELDS.includes(f));
  return (
    <div className="rounded-2xl bg-secondary p-4">
      <p className="text-sm font-semibold">{t("rx.missing.title")}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {fields.map((f) => (
          <li key={f}>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => setAdding(f)}
              aria-label={t("rx.missing.add", { field: t(FIELD_LABEL[f]) })}
            >
              {t(FIELD_LABEL[f])} <PencilLine aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {criticalMissing.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{t("rx.missing.critical")}</p>
      )}
      {adding && (
        <CorrectionForm
          key={adding}
          initial=""
          label={t(FIELD_LABEL[adding])}
          onCancel={() => setAdding(null)}
          onSave={async (v) => {
            await onReview(i, adding, "correct", v);
            setAdding(null);
          }}
        />
      )}
    </div>
  );
}

/** Explains every label, in words, so nothing depends on remembering what a colour meant. */
export function StatusLegend() {
  const { t } = useI18n();
  const shown: VerificationStatus[] = [
    "AI_EXTRACTED_UNVERIFIED",
    "USER_CONFIRMED",
    "USER_CORRECTED",
    "NEEDS_PROFESSIONAL_REVIEW",
    "UNREADABLE",
    "PROFESSIONALLY_VERIFIED",
  ];
  return (
    <details className="panel">
      <summary className="cursor-pointer font-semibold">{t("rx.legend.title")}</summary>
      <dl className="mt-3 space-y-3">
        {shown.map((s) => (
          <div key={s}>
            <dt>
              <StatusBadge status={s} />
            </dt>
            <dd className="mt-1 text-[0.9375rem] text-muted-foreground">
              {t(VERIFICATION_UI[s].help)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export const AI_ISSUE_KEY: Record<string, MessageKey> = {
  blurry: "rx.aiIssue.blurry",
  low_resolution: "rx.aiIssue.low_resolution",
  poor_lighting: "rx.aiIssue.poor_lighting",
  shadows: "rx.aiIssue.shadows",
  cropped: "rx.aiIssue.cropped",
  rotated: "rx.aiIssue.rotated",
  illegible_handwriting: "rx.aiIssue.illegible_handwriting",
  not_a_prescription: "rx.aiIssue.not_a_prescription",
};

/** Doctor's notes and warnings, only as written on the prescription. */
export function WrittenNotes({ extraction }: { extraction: PrescriptionExtraction }) {
  const { t } = useI18n();
  const items = [
    { key: "notes", label: t("prescription.doctorNotes"), f: extraction.doctor_notes },
    { key: "warnings", label: t("rx.writtenWarnings"), f: extraction.written_warnings },
  ].filter((x) => x.f.status !== "not_found");
  if (!items.length) return null;
  return (
    <section className="panel-tint space-y-3">
      {items.map(({ key, label, f }) => (
        <div key={key}>
          <p className="font-semibold">{label}</p>
          {f.value ? (
            <div className="mt-1">
              <MedicalValue original={f.value} urdu={f.value_urdu} />
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">{t("rx.noValue")}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              f.status === "clear"
                ? "rx.read.clear"
                : f.status === "uncertain"
                  ? "rx.read.uncertain"
                  : "rx.read.unreadable",
            )}
            {f.reason ? `: ${f.reason}` : ""}
          </p>
        </div>
      ))}
    </section>
  );
}
