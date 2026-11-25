import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSelector } from "@/components/LanguageSelector";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#top", label: "landing.navHome" },
  { href: "#features", label: "landing.navFeatures" },
  { href: "#how", label: "landing.navHow" },
  { href: "#calendar", label: "nav.calendar" },
  { href: "#about", label: "landing.navAbout" },
] as const;

export function LandingNav() {
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[88rem] items-center justify-between gap-4 px-5 py-3 md:px-8">
        <a href="#top" className="shrink-0 rounded-lg">
          <Logo />
        </a>
        <nav aria-label={t("nav.main")} className="hidden items-center gap-1 lg:flex">
          {LINKS.map(({ href, label }) => (
            <a key={href} href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t(label)}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 items-center gap-2">
          <LanguageSelector />
          <Link
            to="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden sm:inline-flex",
            )}
          >
            {t("landing.login")}
          </Link>
          <Link
            to="/signup"
            className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}
          >
            {t("landing.getStarted")}
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label={t("nav.menu")}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "shrink-0 lg:hidden",
              )}
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "left" : "right"}
              className="flex w-[85vw] max-w-sm flex-col gap-2 bg-card p-5"
            >
              <SheetTitle className="display pt-6 text-2xl font-normal">{t("nav.menu")}</SheetTitle>
              <nav aria-label={t("nav.menu")} className="flex flex-col gap-1">
                {LINKS.map(({ href, label }) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="press flex min-h-12 items-center rounded-xl px-3 text-lg font-medium hover:bg-accent"
                  >
                    {t(label)}
                  </a>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2">
                <Link to="/signup" className={buttonVariants({ size: "lg" })}>
                  {t("landing.getStarted")}
                </Link>
                <Link to="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  {t("landing.login")}
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
