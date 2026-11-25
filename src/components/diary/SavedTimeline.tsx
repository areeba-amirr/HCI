import { useI18n } from "@/i18n/I18nProvider";
import { Med } from "@/components/MedicalText";
import { EMOJI_LABEL, fromSaved, type DIARY_EMOJIS } from "@/lib/diary";

/** A saved diary timeline, in the order the person chose. Nothing renders if there is none. */
export function SavedTimeline({ value, className = "" }: { value: unknown; className?: string }) {
  const { t } = useI18n();
  const entries = fromSaved(value);
  if (!entries.length) return null;
  return (
    <div className={className}>
      <p className="text-sm font-semibold text-muted-foreground">{t("diary.timelineTitle")}</p>
      <ol className="mt-1.5 space-y-1.5">
        {entries.map((e, i) => {
          const label = EMOJI_LABEL[e.emoji as (typeof DIARY_EMOJIS)[number]];
          return (
            <li key={e.id} className="flex items-start gap-2 text-[0.9375rem]">
              <span className="w-5 shrink-0 text-end text-sm font-semibold text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              {e.emoji && (
                <span
                  role="img"
                  aria-label={label ? t(label) : e.emoji}
                  className="text-lg leading-none"
                >
                  {e.emoji}
                </span>
              )}
              <span className="min-w-0">
                {e.time && (
                  <bdi dir="ltr" className="me-1.5 font-semibold tabular-nums">
                    {e.time}
                  </bdi>
                )}
                <Med>{e.text}</Med>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
