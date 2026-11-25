// "How to use this page": each page's own short guide (just that page's chapters of the
// guided tour), and one-time tips for features people meet for the first time.
import { CircleHelp, Lightbulb, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import { useTour } from "./Tour";
import type { ChapterId } from "./steps";

export function PageGuideButton({
  chapter,
  onDark = false,
  className = "",
}: {
  chapter: ChapterId;
  onDark?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const { startPage } = useTour();
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => startPage(chapter)}
      data-tour="page-guide"
      data-guide-chapter={chapter}
      className={`${onDark ? "border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white" : ""} ${className}`}
    >
      <CircleHelp aria-hidden="true" /> {t("guide.pageButton")}
    </Button>
  );
}

/**
 * A small hint shown in place the first time someone reaches an unfamiliar feature. "Got it"
 * hides it for good (saved to the profile, so other devices don't show it either). Hidden
 * while the guided tour is running, which explains the same things.
 */
export function FirstTimeTip({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const { tips, dismissTip, active } = useTour();
  if (active || tips.includes(id)) return null;
  return (
    <div
      role="note"
      data-tip={id}
      className={`flex items-start gap-3 rounded-2xl border border-[#d9ccf5] bg-[#F6F1FD] p-3 text-[0.9375rem] ${className}`}
    >
      <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">{children}</p>
      <Button type="button" size="sm" variant="ghost" onClick={() => dismissTip(id)} className="shrink-0">
        <X aria-hidden="true" /> {t("guide.tipGotIt")}
      </Button>
    </div>
  );
}
