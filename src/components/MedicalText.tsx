import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { en, type MessageKey } from "@/i18n/messages";

/**
 * Renders medical data exactly as stored: never sent for translation, protected from
 * browser auto-translate, and direction-isolated so doses like "500mg" stay intact on
 * RTL pages.
 */
export function Med({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <bdi dir="auto" translate="no" className={className}>
      {children}
    </bdi>
  );
}

/** Explains that the medical details on this page are original, not translated. */
export function MedicalDataNotice() {
  const { language, t } = useI18n();
  if (language === "en") return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-border bg-secondary p-3 text-sm text-muted-foreground">
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
      <p>{t("medical.notice")}</p>
    </div>
  );
}

/** MediSnap's existing Urdu subtitle under English text; redundant in any other language. */
export function UrduHint({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { language } = useI18n();
  if (language !== "en") return null;
  return <p className={`urdu w-fit max-w-full ${className}`}>{children}</p>;
}

/** Keeps the English beside a machine-translated safety message so its meaning can be checked. */
export function EnglishOriginal({ k, className = "" }: { k: MessageKey; className?: string }) {
  const { language } = useI18n();
  if (language === "en") return null;
  return (
    <p dir="ltr" lang="en" translate="no" className={`text-start ${className}`}>
      {en[k]}
    </p>
  );
}

const blank = (v?: string | null) => {
  const t = (v ?? "").trim();
  return !t || t.toLowerCase() === "n/a" || t === "دستیاب نہیں";
};

/**
 * A medical value the AI read, with its Urdu explanation when there is one. In Urdu the
 * Urdu comes first and the original wording stays underneath, labelled, so it can always be
 * checked; in other languages the original comes first. Medicine names are never changed.
 */
export function MedicalValue({
  original,
  urdu,
  size = "base",
}: {
  original?: string | null;
  urdu?: string | null;
  size?: "base" | "lg";
}) {
  const { language, t } = useI18n();
  const hasOriginal = !blank(original);
  const hasUrdu = !blank(urdu);
  if (!hasOriginal && !hasUrdu) return null;
  if (language === "ur" && hasUrdu)
    return (
      <div data-medical-value="ur-first">
        <p className={`urdu ${size === "lg" ? "text-xl" : "text-lg"}`}>{urdu}</p>
        {hasOriginal && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("medical.original")} <Med>{original}</Med>
          </p>
        )}
      </div>
    );
  return (
    <div data-medical-value="original-first">
      {hasOriginal && (
        <p className={size === "lg" ? "text-lg" : "text-base"}>
          <Med>{original}</Med>
        </p>
      )}
      {hasUrdu && <p className="urdu mt-1">{urdu}</p>}
    </div>
  );
}
