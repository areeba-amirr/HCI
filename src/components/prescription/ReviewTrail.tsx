// The append-only history of review actions on one saved prescription. Loads when opened.
import { useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Med } from "@/components/MedicalText";
import { loadReviewTrail } from "@/lib/prescription/store";
import type { MedicineField, ReviewAction, VerificationStatus } from "@/lib/prescription/model";
import { FIELD_LABEL, StatusBadge } from "./badges";

const ACTION_KEY: Record<ReviewAction, MessageKey> = {
  confirm: "rx.trail.confirm",
  correct: "rx.trail.correct",
  mark_unclear: "rx.trail.unclear",
  reset: "rx.trail.reset",
};

type TrailRow = Awaited<ReturnType<typeof loadReviewTrail>>[number];

export function ReviewTrail({
  prescriptionId,
  model,
  version,
}: {
  prescriptionId: string;
  model: string;
  /** Changes whenever a review action is saved, so an open trail refreshes. */
  version: string;
}) {
  const { t, formatDateTime } = useI18n();
  const [rows, setRows] = useState<TrailRow[] | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    try {
      setRows(await loadReviewTrail(prescriptionId));
      setLoadedFor(version);
    } catch {
      setFailed(true);
    }
  }

  return (
    <details
      className="rounded-2xl border border-border px-4 py-3"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && loadedFor !== version) void load();
      }}
    >
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
        <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" /> {t("rx.trail.title")}
      </summary>
      <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t("rx.trail.body", { model })}</p>
      {failed ? (
        <p className="mt-3 text-[0.9375rem] text-destructive">{t("common.loadFailedBody")}</p>
      ) : rows === null ? (
        <p className="mt-3 flex items-center gap-2 text-[0.9375rem]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("common.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-[0.9375rem]">{t("rx.trail.empty")}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {[...rows].reverse().map((r) => {
            const field = r.field as MedicineField;
            return (
              <li key={r.id} className="rounded-2xl bg-secondary p-3 text-[0.9375rem]">
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(new Date(r.created_at))}
                </p>
                <p className="mt-1 font-semibold">
                  {t("rx.trail.line", {
                    n: r.medicine_index + 1,
                    field: FIELD_LABEL[field] ? t(FIELD_LABEL[field]) : r.field,
                    action: t(ACTION_KEY[r.action as ReviewAction] ?? "rx.trail.reset"),
                  })}
                </p>
                {(r.previous_value || r.new_value) && r.previous_value !== r.new_value && (
                  <p className="mt-1">
                    {r.previous_value ? <Med>{r.previous_value}</Med> : t("rx.noValue")} →{" "}
                    {r.new_value ? <Med>{r.new_value}</Med> : t("rx.noValue")}
                  </p>
                )}
                <div className="mt-2">
                  <StatusBadge status={r.new_status as VerificationStatus} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}
