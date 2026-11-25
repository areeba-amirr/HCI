import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeftRight,
  CalendarDays,
  Compass,
  Settings,
  FileBarChart,
  FileText,
  History,
  Home,
  Loader2,
  LogOut,
  Menu,
  Mic,
  Pill,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TourProvider, useTour } from "@/components/tour/Tour";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const HOME = { to: "/dashboard", label: "nav.dashboard", icon: Home } as const;
const UNDERSTAND = [
  { to: "/scanner", label: "nav.scanner", icon: ScanLine },
  { to: "/prescription", label: "nav.prescription", icon: FileText },
  { to: "/interactions", label: "nav.interactions", icon: ArrowLeftRight },
] as const;
const TRACK = [
  { to: "/medicines", label: "nav.medicines", icon: Pill },
  { to: "/diary", label: "nav.diary", icon: Mic },
  { to: "/calendar", label: "nav.calendar", icon: CalendarDays },
  { to: "/history", label: "nav.history", icon: History },
  { to: "/report", label: "nav.report", icon: FileBarChart },
] as const;
const SETTINGS = { to: "/settings", label: "nav.settings", icon: Settings } as const;
// Everyday tasks stay one thumb-tap away on phones; the rest sit behind "More".
const BOTTOM_BAR = [
  { ...HOME, short: "nav.shortHome" },
  { ...UNDERSTAND[0], short: "nav.shortScan" },
  { ...UNDERSTAND[1], short: "nav.prescription" },
  { ...TRACK[1], short: "nav.shortDiary" },
] as const;
const IN_MORE = [UNDERSTAND[2], TRACK[0], TRACK[2], TRACK[3], TRACK[4], SETTINGS] as const;

type NavItem = (typeof UNDERSTAND)[number] | (typeof TRACK)[number] | typeof HOME | typeof SETTINGS;

function NavLink({ item, path }: { item: NavItem; path: string }) {
  const { t } = useI18n();
  const active = path === item.to;
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`press flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 font-medium transition-colors duration-150 ${
        active
          ? "btn-primary-sheen bg-primary text-primary-foreground"
          : "text-foreground/85 hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {t(item.label)}
    </Link>
  );
}

function TourButton({ onStart }: { onStart?: () => void }) {
  const { t } = useI18n();
  const { startFull, record } = useTour();
  return (
    <button
      type="button"
      onClick={() => {
        onStart?.();
        startFull(record?.status === "paused" ? record.stepId : undefined);
      }}
      className="press flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-start font-medium text-foreground/85 transition-colors duration-150 hover:bg-accent hover:text-foreground"
    >
      <Compass className="h-5 w-5 shrink-0" aria-hidden="true" />
      {t("tour.takeTour")}
    </button>
  );
}

function Account({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <div className="panel-tint !p-4">
      <p className="text-sm text-muted-foreground">{t("nav.signedInAs")}</p>
      <p dir="ltr" translate="no" className="truncate text-start font-medium" title={user.email}>
        {user.email}
      </p>
      <Button variant="outline" onClick={onLogout} className="mt-3 w-full">
        <LogOut className="rtl:rotate-180" aria-hidden="true" /> {t("nav.signOut")}
      </Button>
    </div>
  );
}

function AuthLayout() {
  const navigate = useNavigate();
  const { t, dir } = useI18n();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (!session) navigate({ to: "/login" });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (!data.session) navigate({ to: "/login" });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    setMoreOpen(false);
  }, [path]);

  async function logout() {
    await supabase.auth.signOut();
    toast.success(t("nav.signedOut"));
    navigate({ to: "/login" });
  }

  if (loading) {
    return (
      <div role="status" className="grid min-h-screen place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }
  if (!user) return null;

  const moreActive = IN_MORE.some((item) => item.to === path);

  return (
    <TourProvider user={user}>
      <div id="app-shell" className="min-h-screen md:flex">
        {/* Desktop navigation: grouped so six destinations read as two short lists. */}
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col gap-5 overflow-y-auto border-e border-border bg-[linear-gradient(180deg,#FFFFFF_0%,#FBF9FE_45%,#F3EEFC_100%)] p-5 md:flex">
          <Link to="/dashboard" className="w-fit rounded-lg">
            <Logo />
          </Link>
          <LanguageSelector className="w-full" />
          <nav aria-label={t("nav.main")} className="flex flex-col gap-4" data-tour="nav-side">
            <NavLink item={HOME} path={path} />
            <div>
              <p className="mb-1 px-3 text-sm font-semibold text-muted-foreground">
                {t("nav.groupUnderstand")}
              </p>
              <div className="flex flex-col gap-1">
                {UNDERSTAND.map((item) => (
                  <NavLink key={item.to} item={item} path={path} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 px-3 text-sm font-semibold text-muted-foreground">
                {t("nav.groupTrack")}
              </p>
              <div className="flex flex-col gap-1">
                {TRACK.map((item) => (
                  <NavLink key={item.to} item={item} path={path} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 px-3 text-sm font-semibold text-muted-foreground">
                {t("nav.groupAccount")}
              </p>
              <NavLink item={SETTINGS} path={path} />
              <TourButton />
            </div>
          </nav>
          <div className="mt-auto">
            <Account user={user} onLogout={logout} />
          </div>
        </aside>

        <div className="app-canvas min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 md:hidden">
            <Link to="/dashboard" className="shrink-0 rounded-lg">
              <Logo />
            </Link>
            <LanguageSelector />
          </header>

          <main
            id="main"
            className="mx-auto w-full max-w-[90rem] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10"
          >
            <Outlet />
          </main>
        </div>

        {/* Mobile navigation at the bottom, where thumbs reach. */}
        <nav
          aria-label={t("nav.main")}
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
          data-tour="nav-bottom"
        >
          {BOTTOM_BAR.map((item) => {
            const Icon = item.icon;
            const active = path === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`press flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-1.5 text-center text-xs font-semibold ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`grid h-7 w-12 place-items-center rounded-full ${active ? "bg-accent" : ""}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="line-clamp-1 max-w-full">{t(item.short)}</span>
              </Link>
            );
          })}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              className={`press flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-1.5 text-xs font-semibold ${
                moreActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full ${moreActive ? "bg-accent" : ""}`}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </span>
              {t("nav.more")}
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "left" : "right"}
              className="flex w-[85vw] max-w-sm flex-col gap-5 bg-card p-5"
            >
              <SheetTitle className="display pt-6 text-2xl font-normal">{t("nav.more")}</SheetTitle>
              <nav aria-label={t("nav.more")} className="flex flex-col gap-1">
                {IN_MORE.map((item) => (
                  <NavLink key={item.to} item={item} path={path} />
                ))}
                <TourButton onStart={() => setMoreOpen(false)} />
              </nav>
              <div className="mt-auto">
                <Account user={user} onLogout={logout} />
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      </div>
    </TourProvider>
  );
}
