import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowLeftRight, CalendarDays, ClipboardList, FileBarChart, FileText, History, Mic, Pill, ScanLine, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/I18nProvider";
import { Med, UrduHint } from "@/components/MedicalText";
import { EmptyState, PageEnter, StatusBanner } from "@/components/app/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { patientName } from "@/lib/report/data";
import { FirstTimeTip, PageGuideButton } from "@/components/tour/PageGuide";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MediSnap" },
      { name: "description", content: "Your MediSnap dashboard: today's health reminder, recent scans and quick access to every tool." },
      { property: "og:title", content: "Dashboard — MediSnap" },
      { property: "og:description", content: "Your MediSnap dashboard: today's health reminder, recent scans and quick access to every tool." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function useFullName() {
  const [name, setName] = useState<string>("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setName(patientName(u) ?? "");
    });
  }, []);
  return name;
}

const PRIMARY = [
  { to: "/scanner", title: "dashboard.scanTitle", desc: "dashboard.scanDesc", urdu: "دوا اسکین کریں", icon: ScanLine },
  { to: "/prescription", title: "dashboard.prescriptionTitle", desc: "dashboard.prescriptionDesc", urdu: "نسخہ پڑھیں", icon: FileText },
] as const;
const SECONDARY = [
  { to: "/interactions", title: "nav.interactions", icon: ArrowLeftRight },
  { to: "/calendar", title: "nav.calendar", icon: CalendarDays },
  { to: "/report", title: "dashboard.reportTitle", icon: FileBarChart },
] as const;

type ScanRow = Database["public"]["Tables"]["scans"]["Row"];
type SymptomRow = Database["public"]["Tables"]["symptoms"]["Row"];

function useOverview() {
  const [recent, setRecent] = useState<ScanRow[]>([]);
  const [today, setToday] = useState<SymptomRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [scans, symptoms] = await Promise.all([
      supabase.from("scans").select("*").order("created_at", { ascending: false }).limit(12),
      supabase
        .from("symptoms")
        .select("*")
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    setFailed(Boolean(scans.error || symptoms.error));
    setRecent(scans.data || []);
    setToday(symptoms.data?.[0] ?? null);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  return { recent, today, loading, failed, reload: load };
}

function Dashboard() {
  const name = useFullName();
  const { t, formatDate, formatDateTime } = useI18n();
  const { recent, today, loading, failed, reload } = useOverview();
  const date = formatDate(new Date(), { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  // Split around the name so it can be highlighted wherever the translation places it.
  const [welcomeBefore, welcomeAfter = ""] = t("dashboard.welcome", { name: "\u0000" }).split("\u0000");

  // A prescription is saved as one row per medicine; show it as one activity.
  const activity = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; kind: "medicine" | "prescription"; name: string | null; count: number; created_at: string }[] = [];
    for (const s of recent) {
      if (s.scan_type === "prescription" && s.scan_group_id) {
        if (seen.has(s.scan_group_id)) continue;
        seen.add(s.scan_group_id);
        const count = recent.filter((r) => r.scan_group_id === s.scan_group_id).length;
        out.push({ key: s.scan_group_id, kind: "prescription", name: null, count, created_at: s.created_at });
      } else {
        out.push({ key: s.id, kind: "medicine", name: s.medicine_name, count: 1, created_at: s.created_at });
      }
    }
    return out.slice(0, 4);
  }, [recent]);

  return (
    <PageEnter className="@container mx-auto w-full max-w-6xl space-y-8">
      <header data-tour="dashboard-page" className="dash-banner on-dark relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#36215F_0%,#4B2E83_45%,#5A3A96_100%)] p-6 text-primary-foreground shadow-[0_24px_48px_-32px_rgb(54_33_95/0.8)] @2xl:p-9">
        <picture aria-hidden="true">
          <source type="image/webp" srcSet="/images/stethoscope-wide-480.webp 480w, /images/stethoscope-wide-960.webp 960w" sizes="(min-width: 1024px) 40vw, 100vw" />
          <img src="/images/stethoscope-wide-960.jpg" alt="" width={960} height={480} decoding="async" className="absolute inset-y-0 end-0 -z-20 h-full w-full object-cover opacity-30 @2xl:w-[58%] @2xl:opacity-90 rtl:-scale-x-100" />
        </picture>
        <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#3A2366_0%,#4B2E83_42%,rgb(75_46_131/0.25)_75%,transparent_100%)] rtl:bg-[linear-gradient(270deg,#3A2366_0%,#4B2E83_42%,rgb(75_46_131/0.25)_75%,transparent_100%)]" />
        <p className="text-[#E7E0FA]">{date}</p>
        <h1 className="display mt-1 max-w-xl text-[2rem] leading-[1.1] @md:text-4xl @2xl:text-[3.25rem]">
          {welcomeBefore}
          <bdi className="text-coral">{name || t("dashboard.there")}</bdi>
          {welcomeAfter}
        </h1>
        <p className="mt-2 max-w-xl text-lg text-[#F1ECFA]">{t("dashboard.takeCare")}</p>
        <UrduHint className="mt-1 text-lg text-[#F1ECFA]">آج اپنی صحت کا خیال رکھیں</UrduHint>
        <PageGuideButton chapter="dashboard" onDark className="mt-4" />
      </header>

      <FirstTimeTip id="page-guide">{t("guide.tip.pageGuide")}</FirstTimeTip>

      <section aria-labelledby="start" data-tour="dash-start">
        <h2 id="start" className="display text-2xl">
          {t("dashboard.whatToDo")}
        </h2>
        <div className="mt-4 grid gap-4 @2xl:grid-cols-2">
          {PRIMARY.map(({ to, title, desc, urdu, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="lift group isolate flex min-w-0 items-start gap-4 rounded-3xl bg-[linear-gradient(150deg,#5A3A96,#4B2E83_55%,#3C2470)] p-5 text-primary-foreground @md:p-6"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-primary @md:h-14 @md:w-14">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="display block text-[1.375rem] leading-tight @md:text-2xl">{t(title)}</span>
                <span className="mt-1 block text-[#E7E0FA]">{t(desc)}</span>
                <UrduHint className="mt-1 text-[#E7E0FA]">{urdu}</UrduHint>
              </span>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden="true" />
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SECONDARY.map(({ to, title, icon: Icon }) => (
            <Link key={to} to={to} className={buttonVariants({ variant: "outline" })}>
              <Icon aria-hidden="true" /> {t(title)}
            </Link>
          ))}
        </div>
      </section>

      {failed && (
        <StatusBanner
          tone="danger"
          title={t("common.loadFailedTitle")}
          action={
            <Button variant="outline" size="sm" onClick={reload}>
              {t("root.tryAgain")}
            </Button>
          }
        >
          {t("common.loadFailedBody")}
        </StatusBanner>
      )}

      <div className="grid gap-4 @4xl:grid-cols-[2fr_3fr]">
        <section aria-labelledby="today" className="panel" data-tour="dash-today">
          <h2 id="today" className="display text-2xl">
            {t("dashboard.todayTitle")}
          </h2>
          {loading ? (
            <div role="status" className="mt-4 space-y-3">
              <span className="sr-only">{t("common.loading")}</span>
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </div>
          ) : today ? (
            <div className="mt-3">
              <p className="flex items-center gap-2 font-semibold text-success">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> {t("dashboard.todayLogged")}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-secondary p-3">
                  <dt className="text-sm text-muted-foreground">{t("report.pain")}</dt>
                  <dd className="text-xl font-semibold">
                    <bdi dir="ltr">{today.pain_level}/10</bdi>
                  </dd>
                </div>
                <div className="rounded-2xl bg-secondary p-3">
                  <dt className="text-sm text-muted-foreground">{t("dashboard.sleep")}</dt>
                  <dd className="text-xl font-semibold">
                    <bdi dir="ltr">{today.sleep_hours}h</bdi>
                  </dd>
                </div>
              </dl>
              <Link to="/diary" className={`mt-4 ${buttonVariants({ variant: "outline" })}`}>
                {t("dashboard.viewDiary")}
              </Link>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-muted-foreground">{t("dashboard.todayEmpty")}</p>
              <Link to="/diary" className={`mt-4 ${buttonVariants()}`}>
                <Mic aria-hidden="true" /> {t("dashboard.diaryTitle")}
              </Link>
            </div>
          )}
        </section>

        <section aria-labelledby="recent" className="panel" data-tour="dash-recent">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="recent" className="display text-2xl">
              {t("dashboard.recentTitle")}
            </h2>
            {activity.length > 0 && (
              <Link to="/history" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <History aria-hidden="true" /> {t("dashboard.viewHistory")}
              </Link>
            )}
          </div>
          {loading ? (
            <div role="status" className="mt-4 space-y-4">
              <span className="sr-only">{t("common.loading")}</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={ClipboardList}
                title={t("history.empty")}
                body={t("dashboard.recentEmpty")}
              />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {activity.map((a) => (
                <li key={a.key} className="flex items-center gap-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
                    {a.kind === "prescription" ? (
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Pill className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {a.kind === "prescription" ? (
                        t(a.count === 1 ? "history.medicineOne" : "history.medicineMany", { count: a.count })
                      ) : a.name ? (
                        <Med>{a.name}</Med>
                      ) : (
                        t("history.unnamed")
                      )}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {a.kind === "prescription" ? t("history.prescriptionScan") : t("history.labelScan")}
                      {" · "}
                      {formatDateTime(new Date(a.created_at))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-sm text-muted-foreground">{t("dashboard.disclaimer")}</p>
    </PageEnter>
  );
}
