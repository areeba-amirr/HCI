import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useI18n } from "@/i18n/I18nProvider";

/** Shared sign-in and sign-up frame, tying account pages to the landing page's ring motif. */
export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_6fr]">
      <aside className="on-dark relative isolate hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="absolute -bottom-40 -end-40 -z-10 h-[34rem] w-[34rem] rounded-full border-[3.5rem] border-[#5D3F97]"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-32 end-20 -z-10 h-14 w-14 rounded-full bg-coral"
        />
        <Link to="/" className="w-fit rounded-lg">
          <Logo onDark />
        </Link>
        <div>
          <p className="display max-w-md text-[2.75rem]">{t("auth.panelTitle")}</p>
          <ul className="mt-6 space-y-3 text-lg">
            {(["auth.panelPoint1", "auth.panelPoint2", "auth.panelPoint3"] as const).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <Check className="mt-1 h-5 w-5 shrink-0 text-coral" aria-hidden="true" /> {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-md text-[#E7E0FA]">{t("landing.footer")}</p>
      </aside>

      <main id="main" className="flex flex-col px-4 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="rounded-lg lg:invisible">
            <Logo />
          </Link>
          <LanguageSelector />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <h1 className="display text-4xl">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <p className="mt-6 text-center text-muted-foreground">{footer}</p>
        </div>
      </main>
    </div>
  );
}
