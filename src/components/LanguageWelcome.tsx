// First launch on a device: choose English or Urdu before anything else. Both languages are
// shown at once (the person hasn't chosen yet), using the shared catalogs, never hardcoded.
import { useEffect, useRef } from "react";
import { Languages } from "lucide-react";
import { en } from "@/i18n/messages";
import { ur } from "@/i18n/ur";
import { LANGUAGES, type LanguageCode } from "@/i18n/languages";

const both = (key: keyof typeof en) => ({ en: en[key], ur: ur[key] ?? en[key] });

export function LanguageWelcome({ onChoose }: { onChoose: (code: LanguageCode) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const title = both("language.chooseTitle");
  const body = both("language.chooseBody");

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-[rgb(24_13_44/0.6)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lang-choose-en"
        className="w-full max-w-md rounded-[1.75rem] border border-border bg-card p-6 text-center shadow-[0_30px_80px_-30px_rgb(54_33_95/0.6)] sm:p-8"
        data-language-welcome
      >
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent text-primary">
          <Languages className="h-8 w-8" aria-hidden="true" />
        </span>
        <h2 id="lang-choose-en" lang="en" dir="ltr" className="display mt-5 text-3xl">
          {title.en}
        </h2>
        <p lang="ur" dir="rtl" className="urdu mt-2 text-2xl font-semibold">
          {title.ur}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {LANGUAGES.map((l, i) => {
            const code = l.code;
            return (
              <button
                key={code}
                ref={i === 0 ? first : undefined}
                type="button"
                lang={code}
                dir={l.dir}
                onClick={() => onChoose(code)}
                className={`press grid min-h-24 place-items-center rounded-2xl border-2 border-primary bg-card px-3 text-2xl font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 ${
                  code === "ur" ? "urdu" : ""
                }`}
                data-choose-language={code}
              >
                {l.nativeName}
              </button>
            );
          })}
        </div>
        <p lang="en" dir="ltr" className="mt-5 text-[0.9375rem] text-muted-foreground">
          {body.en}
        </p>
        <p lang="ur" dir="rtl" className="urdu text-[0.9375rem] text-muted-foreground">
          {body.ur}
        </p>
      </div>
    </div>
  );
}
