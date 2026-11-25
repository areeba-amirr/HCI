// English and Urdu, the two interface languages, always one tap away as a pair of buttons.
// Names stay in their own script so anyone can find their way back.
import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { LANGUAGES } from "@/i18n/languages";

export function LanguageSelector({ className = "" }: { className?: string }) {
  const { language: current, setLanguage, t } = useI18n();
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className}`}
      data-language-selector
    >
      <Languages className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div
        role="group"
        aria-label={t("language.select")}
        className="inline-flex rounded-full border border-input bg-card p-0.5"
      >
        {LANGUAGES.map((l) => {
          const code = l.code;
          const on = current === code;
          return (
            <button
              key={code}
              type="button"
              lang={code}
              dir={l.dir}
              aria-pressed={on}
              onClick={() => !on && setLanguage(code)}
              className={`min-h-11 min-w-16 rounded-full px-3 text-sm font-semibold transition-colors ${
                on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
              } ${code === "ur" ? "urdu leading-none" : ""}`}
            >
              {l.nativeName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
