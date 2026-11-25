// The patient's own Taken / Not taken / Not sure record for one medicine. Starts at
// "Not recorded"; only a tap by the person adds an entry, and every entry is kept with the
// date the database recorded it. No schedule, no reminders, no dose advice.
import { useId, useState } from "react";
import { Check, CircleHelp, History as HistoryIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import {
  recordStatus,
  type IntakeStatus,
  type MyMedicine,
  type StatusEvent,
} from "@/lib/medicines";

export const INTAKE_UI: Record<
  IntakeStatus,
  { label: MessageKey; icon: typeof Check; on: string }
> = {
  taken: {
    label: "meds.track.taken",
    icon: Check,
    on: "border-success bg-success/10 text-success",
  },
  not_taken: {
    label: "meds.track.notTaken",
    icon: X,
    on: "border-destructive bg-destructive/8 text-destructive",
  },
  not_sure: {
    label: "meds.track.notSure",
    icon: CircleHelp,
    on: "border-warning bg-warning/10 text-warning",
  },
};
const ORDER: IntakeStatus[] = ["taken", "not_taken", "not_sure"];

export function IntakeTracker({
  medicine,
  ready,
  onRecorded,
  compact = false,
}: {
  medicine: MyMedicine;
  /** False until the database update that stores the record is applied. */
  ready: boolean;
  onRecorded: (event: StatusEvent) => void;
  /** Card layout: shorter wording, the explanation moves into the history disclosure. */
  compact?: boolean;
}) {
  const { t, formatDateTime } = useI18n();
  const labelId = useId();
  const [saving, setSaving] = useState<IntakeStatus | null>(null);
  const [announce, setAnnounce] = useState("");
  const current = medicine.status;
  const name = medicine.displayName ?? t("meds.unidentified");

  async function choose(status: IntakeStatus) {
    if (!ready || saving || status === current) return;
    setSaving(status);
    try {
      const event = await recordStatus(medicine.scanId, status);
      onRecorded(event);
      setAnnounce(t("meds.track.saved", { status: t(INTAKE_UI[status].label) }));
    } catch {
      toast.error(t("meds.track.failed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border p-3" data-intake={current ?? "none"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p id={labelId} className="font-semibold">
          {compact ? t("meds.track.short") : t("meds.track.question")}
        </p>
        <p className="text-sm text-muted-foreground">
          {current && medicine.statusAt
            ? t("meds.track.current", {
                status: t(INTAKE_UI[current].label),
                date: formatDateTime(new Date(medicine.statusAt)),
              })
            : t("meds.track.none")}
        </p>
      </div>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-note`}
        className="mt-2 grid grid-cols-3 gap-2"
      >
        {ORDER.map((s) => {
          const ui = INTAKE_UI[s];
          const on = current === s;
          const Icon = ui.icon;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              aria-label={`${t(ui.label)}: ${name}`}
              disabled={!ready || saving !== null}
              onClick={() => choose(s)}
              data-intake-choice={s}
              className={`press intake-chip flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed ${
                on ? ui.on : "border-border bg-card text-foreground hover:bg-secondary"
              } ${!ready ? "opacity-60" : ""}`}
            >
              {saving === s ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Icon className={`h-4 w-4 ${on ? "intake-pop" : ""}`} aria-hidden="true" />
              )}
              {t(ui.label)}
            </button>
          );
        })}
      </div>
      <p
        id={`${labelId}-note`}
        className={compact ? "sr-only" : "mt-2 text-sm text-muted-foreground"}
      >
        {t("meds.track.note")}
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {medicine.history.length > 0 && (
        <details className="mt-2 rounded-xl bg-secondary px-3 py-2 text-[0.9375rem]">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
            <HistoryIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("meds.track.history", { count: medicine.history.length })}
          </summary>
          <ol className="mt-1 space-y-1 pb-1">
            {medicine.history.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-x-3">
                <span className="font-medium">{t(INTAKE_UI[e.status].label)}</span>
                <span className="text-muted-foreground">
                  {formatDateTime(new Date(e.recorded_at))}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
