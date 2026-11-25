import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Download,
  FileBarChart as FileBarChartIcon,
  FileStack,
  FileText,
  Loader2,
  Mic,
  NotebookPen,
  Settings,
  Stethoscope,
  Sun,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { getLanguage } from "@/i18n/languages";
import type { MessageKey } from "@/i18n/messages";
import { Med } from "@/components/MedicalText";
import {
  EmptyState,
  PageEnter,
  PageHeader,
  ProcessingCard,
  StatusBanner,
} from "@/components/app/primitives";
import { SavedTimeline } from "@/components/diary/SavedTimeline";
import { INTAKE_UI } from "@/components/medicines/IntakeTracker";
import { ReadAloud } from "@/components/ReadAloud";
import { ObservationChart } from "@/components/report/ReportCharts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  checkPeriod,
  diaryTimelines,
  healthOverview,
  inPeriod,
  intakeSummary,
  makePeriod,
  visitWindow,
  VISIT_WINDOWS,
  entrySymptoms,
  painLabel,
  patientName,
  reportReference,
  symptomsInPeriod,
  type PeriodKind,
  type PeriodProblem,
  type SymptomRow,
} from "@/lib/report/data";
import { periodText } from "@/lib/report/layout";
import {
  buildReport,
  loadPrescriptionDocument,
  reportFileName,
  type ReportKind,
} from "@/lib/report/build";
import { saveBlob } from "@/lib/prescription/report";
import type { ReportLang } from "@/lib/report/pen";
import {
  loadMyMedicines,
  reportMedicines,
  unconfirmedCount,
  type MyMedicine,
} from "@/lib/medicines";
import { isNotSetUp, listPrescriptions, type PrescriptionSummary } from "@/lib/prescription/store";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({
    meta: [
      { title: "Doctor Report — MediSnap" },
      {
        name: "description",
        content:
          "Choose a day, week or date range, preview it, and download a clear health report for your doctor, with your original prescriptions if you choose.",
      },
      { property: "og:title", content: "Doctor Report — MediSnap" },
      {
        property: "og:description",
        content:
          "Choose a day, week or date range, preview it, and download a clear health report for your doctor, with your original prescriptions if you choose.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportPage,
});

type User = { id: string; email?: string; user_metadata?: Record<string, unknown> };
type RxRecord = PrescriptionSummary;

const toInput = (d: Date) => format(d, "yyyy-MM-dd");
const fromInput = (s: string) => (s ? new Date(`${s}T12:00:00`) : null);

const PERIOD_OPTIONS: {
  kind: PeriodKind;
  icon: typeof Sun;
  label: MessageKey;
  hint: MessageKey;
}[] = [
  { kind: "daily", icon: Sun, label: "rpt.daily", hint: "rpt.dailyHint" },
  { kind: "weekly", icon: CalendarDays, label: "rpt.weekly", hint: "rpt.weeklyHint" },
  { kind: "custom", icon: CalendarRange, label: "rpt.custom", hint: "rpt.customHint" },
];

const KIND_OPTIONS: {
  kind: ReportKind;
  icon: typeof FileText;
  label: MessageKey;
  hint: MessageKey;
}[] = [
  { kind: "complete", icon: FileStack, label: "rpt.kindComplete", hint: "rpt.kindCompleteHint" },
  { kind: "visit", icon: Stethoscope, label: "rpt.kindVisit", hint: "rpt.kindVisitHint" },
  { kind: "prescriptions", icon: FileText, label: "rpt.kindRx", hint: "rpt.kindRxHint" },
];

const PROBLEM_KEY: Record<PeriodProblem, MessageKey> = {
  missing: "rpt.problemMissing",
  reversed: "rpt.problemReversed",
  future: "rpt.problemFuture",
  too_long: "rpt.problemTooLong",
};

const MOOD_KEY: Record<string, MessageKey> = {
  happy: "diary.moodHappy",
  okay: "diary.moodOkay",
  sad: "diary.moodSad",
};

function ReportPage() {
  const { t, language } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [symptoms, setSymptoms] = useState<SymptomRow[]>([]);
  const [myMeds, setMyMeds] = useState<MyMedicine[] | null>(null);
  const [records, setRecords] = useState<RxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const today = toInput(new Date());
  const [kind, setKind] = useState<PeriodKind>("weekly");
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState(toInput(new Date(Date.now() - 29 * 86400_000)));
  const [to, setTo] = useState(today);
  // Off unless the person turns it on. Only confirmed names, with their own record.
  const [includeMeds, setIncludeMeds] = useState(false);
  const [chosenRx, setChosenRx] = useState<Set<string> | null>(null);
  const [output, setOutput] = useState<ReportKind>("complete");
  // The Doctor Visit Report's own details. Kept on this page only; they go into the PDF and
  // are not saved to the account.
  const [visitDate, setVisitDate] = useState(today);
  const [reason, setReason] = useState("");
  const [questions, setQuestions] = useState("");
  const [visitDays, setVisitDays] = useState<number>(7);
  // The PDF's language is chosen separately: a patient may read the app in Urdu but take an
  // English report to their doctor. It starts as the app language.
  const [pdfLang, setPdfLang] = useState<ReportLang>(language === "ur" ? "ur" : "en");
  const viewLang: ReportLang = language === "ur" ? "ur" : "en";
  const [stage, setStage] = useState<"idle" | "preparing" | "building" | "done" | "error">("idle");
  const [progress, setProgress] = useState("");
  const [lastFile, setLastFile] = useState("");

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setUser(u.user as User | null);
    const [s, rx, meds] = await Promise.all([
      supabase.from("symptoms").select("*").order("created_at", { ascending: true }),
      listPrescriptions().catch((e) => {
        // Before the prescription update is applied the table doesn't exist: no documents yet.
        if (!isNotSetUp(e)) console.error("[doctor report] prescriptions", e?.code ?? e);
        return [] as RxRecord[];
      }),
      loadMyMedicines().then(
        (d) => d.medicines,
        () => null,
      ),
    ]);
    setFailed(Boolean(s.error));
    setSymptoms((s.data as SymptomRow[]) || []);
    setRecords(rx);
    setMyMeds(meds);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // ---- the selected period -------------------------------------------------------
  const a = kind === "custom" ? fromInput(from) : fromInput(day);
  const b = kind === "custom" ? fromInput(to) : null;
  const visitDay = fromInput(visitDate);
  const isVisit = output === "visit";
  const problem = isVisit ? (visitDay ? null : "missing") : checkPeriod(kind, a, b);
  const period = useMemo(
    () =>
      problem
        ? null
        : isVisit
          ? visitWindow(visitDay!, visitDays)
          : a
            ? makePeriod(kind, a, b ?? undefined)
            : null,
    [problem, isVisit, visitDay?.getTime(), visitDays, kind, a?.getTime(), b?.getTime()],
  );

  const overview = useMemo(
    () => (period ? healthOverview(symptoms, period) : null),
    [symptoms, period],
  );
  const rows = useMemo(
    () => (period ? symptomsInPeriod(symptoms, period) : []),
    [symptoms, period],
  );
  const diary = useMemo(() => (period ? diaryTimelines(symptoms, period) : []), [symptoms, period]);
  const confirmedMeds = useMemo(() => (myMeds ? reportMedicines(myMeds) : []), [myMeds]);
  const unconfirmed = myMeds ? unconfirmedCount(myMeds) : 0;
  // Medicines saved by the end of the period (labels and prescriptions), as before.
  const savedByEnd = useMemo(
    () => (period && myMeds ? myMeds.filter((m) => new Date(m.savedAt) <= period.end).length : 0),
    [myMeds, period],
  );
  const name = patientName(user);
  const moodText = (m: string) => (MOOD_KEY[m] ? t(MOOD_KEY[m]) : m);

  // Prescription documents: by default, the ones uploaded within the period.
  const rxInPeriod = useMemo(
    () =>
      new Set(
        period ? records.filter((r) => inPeriod(r.uploaded_at, period)).map((r) => r.id) : [],
      ),
    [records, period],
  );
  const selectedRx = chosenRx ?? (isVisit ? new Set<string>() : rxInPeriod);
  function toggleRx(id: string, on: boolean) {
    const next = new Set(selectedRx);
    if (on) next.add(id);
    else next.delete(id);
    setChosenRx(next);
  }

  const blocked = !period || (output === "prescriptions" && selectedRx.size === 0);

  async function generate() {
    if (blocked || !period || !overview) return;
    setStage("preparing");
    setLastFile("");
    try {
      const ids = records.filter((r) => selectedRx.has(r.id)).map((r) => r.id);
      const docs = [];
      for (const [i, id] of ids.entries()) {
        setProgress(t("rpt.preparingRx", { n: i + 1, total: ids.length }));
        docs.push(await loadPrescriptionDocument(id, name));
      }
      setStage("building");
      setProgress(t("rpt.building"));
      const common = { patientName: name, reference: reportReference(), generatedAt: new Date() };
      const blob = await buildReport(
        output === "complete"
          ? {
              kind: "complete",
              history: {
                ...common,
                period,
                rows: symptoms,
                intake: includeMeds && myMeds ? intakeSummary(myMeds, period) : null,
              },
              prescriptions: docs,
            }
          : output === "visit"
            ? {
                kind: "visit",
                visit: {
                  ...common,
                  visitDate: visitDay!,
                  reason,
                  questions: questions.split("\n"),
                  window: period,
                  rows: symptoms,
                  medicines: includeMeds ? confirmedMeds : null,
                },
                prescriptions: docs,
              }
            : { kind: "prescriptions", prescriptions: docs },
        pdfLang,
      );
      const file = isVisit
        ? reportFileName(output, visitDay!, visitDay!, pdfLang)
        : reportFileName(output, period.start, period.end, pdfLang);
      saveBlob(blob, file);
      setLastFile(file);
      setStage("done");
    } catch (e) {
      console.error("[doctor report] generation failed", e instanceof Error ? e.message : e);
      setStage("error");
    }
  }

  if (loading) {
    return (
      <div className="pt-6">
        <ProcessingCard title={t("common.loading")} />
      </div>
    );
  }

  const busy = stage === "preparing" || stage === "building";

  return (
    <PageEnter className="@container mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        guide="report"
        tour="doctor-report-page"
        icon={FileBarChartIcon}
        title={t("report.title")}
        description={t("rpt.subtitle")}
      />

      {failed && (
        <StatusBanner
          tone="danger"
          title={t("common.loadFailedTitle")}
          action={
            <Button variant="outline" size="sm" onClick={load}>
              {t("root.tryAgain")}
            </Button>
          }
        >
          {t("common.loadFailedBody")}
        </StatusBanner>
      )}

      {/* ---------- A. Patient and report information ---------- */}
      <section aria-labelledby="sec-patient" className="panel space-y-4">
        <h2 id="sec-patient" className="flex items-center gap-2 text-lg font-semibold">
          <SectionNumber n="A" /> {t("rpt.secPatient")}
        </h2>
        <dl className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          <Fact label={t("rpt.patient")}>
            {name ?? <span className="text-muted-foreground">{t("rpt.noName")}</span>}
          </Fact>
          <Fact label={t("rpt.generatedOn")}>{format(new Date(), "d MMM yyyy")}</Fact>
          {isVisit ? (
            <Fact label={t("rpt.visitDate")}>{visitDay ? format(visitDay, "d MMM yyyy") : "-"}</Fact>
          ) : (
            <Fact label={t("rpt.period")}>
              <span>{period ? periodText(period, viewLang) : t("rpt.periodInvalid")}</span>
            </Fact>
          )}
        </dl>
        {!name && (
          <StatusBanner
            tone="info"
            title={t("rpt.noNameTitle")}
            action={
              <Link to="/settings" className={buttonVariants({ size: "sm", variant: "outline" })}>
                <Settings aria-hidden="true" /> {t("nav.settings")}
              </Link>
            }
          >
            {t("rpt.noNameBody")}
          </StatusBanner>
        )}
      </section>

      {/* ---------- B. Which report: they answer different questions ---------- */}
      <section aria-labelledby="step-kind" className="panel space-y-4">
        <h2 id="step-kind" className="flex items-center gap-2 text-lg font-semibold">
          <SectionNumber n="B" /> {t("rpt.stepKind")}
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="step-kind"
          className="grid gap-3 @3xl:grid-cols-3"
          data-tour="rpt-kinds"
        >
          {KIND_OPTIONS.map((o) => (
            <button
              key={o.kind}
              type="button"
              role="radio"
              aria-checked={output === o.kind}
              onClick={() => {
                setOutput(o.kind);
                setChosenRx(null);
              }}
              className={`press flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-start ${
                output === o.kind ? "border-primary bg-accent" : "border-border hover:bg-secondary"
              }`}
            >
              <o.icon
                className={`mt-0.5 h-5 w-5 shrink-0 ${output === o.kind ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              <span>
                <span className="block font-semibold">{t(o.label)}</span>
                <span className="block text-sm text-muted-foreground">{t(o.hint)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- C. The visit (Doctor Visit Report) ---------- */}
      {isVisit && (
        <section aria-labelledby="step-visit" className="panel space-y-4" data-tour="rpt-visit">
          <h2 id="step-visit" className="flex items-center gap-2 text-lg font-semibold">
            <SectionNumber n="C" /> {t("rpt.visitTitle")}
          </h2>
          <p className="text-[0.9375rem] text-muted-foreground">{t("rpt.visitNotSaved")}</p>
          <div className="grid gap-4 @3xl:grid-cols-2">
            <div className="max-w-xs">
              <label htmlFor="visit-date" className="text-sm font-semibold">
                {t("rpt.visitDate")}
              </label>
              <Input
                id="visit-date"
                type="date"
                dir="ltr"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                aria-invalid={!visitDay}
              />
              {!visitDay && <p className="mt-1 text-sm text-destructive">{t("rpt.visitDateMissing")}</p>}
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">{t("rpt.visitDays")}</legend>
              <div role="radiogroup" aria-label={t("rpt.visitDays")} className="mt-1 flex flex-wrap gap-2">
                {VISIT_WINDOWS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={visitDays === n}
                    data-visit-days={n}
                    onClick={() => setVisitDays(n)}
                    className={`press min-h-11 rounded-xl border-2 px-4 text-sm font-semibold ${
                      visitDays === n ? "border-primary bg-accent text-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    {t("rpt.visitDaysN", { n })}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("rpt.visitDaysHint")}</p>
            </fieldset>
          </div>
          <div>
            <label htmlFor="visit-reason" className="text-sm font-semibold">
              {t("rpt.visitReason")}
            </label>
            <Textarea
              id="visit-reason"
              dir="auto"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("rpt.visitReasonHint")}
            />
          </div>
          <div>
            <label htmlFor="visit-questions" className="text-sm font-semibold">
              {t("rpt.visitQuestions")}
            </label>
            <Textarea
              id="visit-questions"
              dir="auto"
              rows={4}
              maxLength={1500}
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder={t("rpt.visitQuestionsHint")}
            />
            <p className="mt-1 text-sm text-muted-foreground">{t("rpt.visitQuestionsHelp")}</p>
          </div>
          {period && overview && (
            <p role="status" className="rounded-2xl bg-secondary p-3 text-[0.9375rem]">
              {t("rpt.visitWindow", {
                from: format(period.start, "d MMM"),
                to: format(period.end, "d MMM yyyy"),
                entries: overview.entries,
              })}
            </p>
          )}
        </section>
      )}

      {/* ---------- C. Reporting period (Complete Doctor Report, prescriptions) ---------- */}
      {!isVisit && (
      <section aria-labelledby="step-period" className="panel space-y-4" data-tour="rpt-period">
        <h2 id="step-period" className="flex items-center gap-2 text-lg font-semibold">
          <SectionNumber n="C" /> {t("rpt.stepPeriod")}
        </h2>
        <div className="grid gap-5 @4xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @4xl:items-start">
          <div className="space-y-2">
            <div role="radiogroup" aria-labelledby="step-period" className="grid grid-cols-3 gap-2">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === o.kind}
                  onClick={() => setKind(o.kind)}
                  className={`press flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-sm font-semibold ${
                    kind === o.kind
                      ? "border-primary bg-accent text-primary"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <o.icon className="h-5 w-5" aria-hidden="true" />
                  {t(o.label)}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(PERIOD_OPTIONS.find((o) => o.kind === kind)!.hint)}
            </p>
          </div>

          <div className="space-y-3">
            {kind === "custom" ? (
              <div className="grid gap-3 @md:grid-cols-2">
                <div>
                  <label htmlFor="rpt-from" className="text-sm font-semibold">
                    {t("rpt.from")}
                  </label>
                  <Input
                    id="rpt-from"
                    type="date"
                    dir="ltr"
                    max={today}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    aria-invalid={problem === "reversed" || problem === "too_long"}
                  />
                </div>
                <div>
                  <label htmlFor="rpt-to" className="text-sm font-semibold">
                    {t("rpt.to")}
                  </label>
                  <Input
                    id="rpt-to"
                    type="date"
                    dir="ltr"
                    max={today}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    aria-invalid={problem !== null}
                  />
                </div>
              </div>
            ) : (
              <div className="max-w-xs">
                <label htmlFor="rpt-day" className="text-sm font-semibold">
                  {kind === "daily" ? t("rpt.day") : t("rpt.weekEnding")}
                </label>
                <Input
                  id="rpt-day"
                  type="date"
                  dir="ltr"
                  max={today}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  aria-invalid={problem !== null}
                />
              </div>
            )}
            {problem ? (
              <StatusBanner tone="danger">{t(PROBLEM_KEY[problem])}</StatusBanner>
            ) : (
              period &&
              overview && (
                <div
                  role="status"
                  className="grid gap-2 rounded-2xl bg-secondary p-3 text-[0.9375rem] @2xl:grid-cols-3"
                >
                  <p>
                    <span className="block text-sm text-muted-foreground">
                      {t("rpt.startDate")}
                    </span>
                    <span className="font-semibold" dir="ltr">
                      {format(period.start, "EEE d MMM yyyy")}
                    </span>
                  </p>
                  <p>
                    <span className="block text-sm text-muted-foreground">{t("rpt.endDate")}</span>
                    <span className="font-semibold" dir="ltr">
                      {format(period.end, "EEE d MMM yyyy")}
                    </span>
                  </p>
                  <p>
                    <span className="block text-sm text-muted-foreground">{t("rpt.contains")}</span>
                    <span className="font-semibold">
                      {t("rpt.periodCounts", {
                        entries: overview.entries,
                        days: overview.daysWithEntries,
                        medicines: savedByEnd,
                      })}
                    </span>
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </section>
      )}

      {/* ---------- D to G: what the report will contain (the preview) ---------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h2 id="preview-title" className="display text-2xl">
          {t("rpt.previewTitle")}
        </h2>
        <span className="text-sm text-muted-foreground">{t("rpt.previewNote")}</span>
      </div>

      {overview && period ? (
        <>
          {/* C. Health overview */}
          <section aria-labelledby="sec-overview" className="panel space-y-4" data-tour="rpt-overview">
            <h3 id="sec-overview" className="flex items-center gap-2 text-lg font-semibold">
              <SectionNumber n="D" /> {t("rpt.overview")}
            </h3>
            <ReadAloud
              text={() => {
                const v = (s: { n: number; average: number | null; single: number | null }, unit: string) =>
                  s.n === 0
                    ? t("rpt.notRecorded")
                    : s.average !== null
                      ? `${s.average.toFixed(1)} ${unit}`
                      : `${s.single} ${unit}`;
                return [
                  `${t("rpt.overview")}.`,
                  `${t("rpt.period")}: ${periodText(period, viewLang)}.`,
                  `${t("report.entries")}: ${overview.entries}.`,
                  `${t("report.avgPain")}: ${v(overview.pain, "/ 10")}.`,
                  `${t("report.avgSleep")}: ${v(overview.sleep, t("rpt.hoursUnit"))}.`,
                  `${t("rpt.highPain")}: ${overview.highPainDays}.`,
                  t("report.disclaimer"),
                ].join(" ");
              }}
            />
            <dl className="grid grid-cols-1 gap-3 @[22rem]:grid-cols-2 @4xl:grid-cols-4">
              <Tile
                label={t("report.entries")}
                value={String(overview.entries)}
                sub={t("rpt.onDays", { n: overview.daysWithEntries, total: period.days })}
              />
              <Tile
                label={t("report.avgPain")}
                muted={overview.pain.average === null}
                value={
                  overview.pain.n === 0
                    ? t("rpt.notRecorded")
                    : overview.pain.average !== null
                      ? `${overview.pain.average.toFixed(1)}/10`
                      : t("rpt.insufficient")
                }
                sub={
                  overview.pain.n === 0
                    ? t("rpt.noPainScores")
                    : overview.pain.n === 1
                      ? t("rpt.oneReading", { value: `${overview.pain.single}/10` })
                      : t("rpt.readings", { n: overview.pain.n })
                }
              />
              <Tile
                label={t("report.avgSleep")}
                muted={overview.sleep.average === null}
                value={
                  overview.sleep.n === 0
                    ? t("rpt.notRecorded")
                    : overview.sleep.average !== null
                      ? `${overview.sleep.average.toFixed(1)} h`
                      : t("rpt.insufficient")
                }
                sub={
                  overview.sleep.n === 0
                    ? t("rpt.noSleepScores")
                    : overview.sleep.n === 1
                      ? t("rpt.oneReading", { value: `${overview.sleep.single} h` })
                      : t("rpt.readings", { n: overview.sleep.n })
                }
              />
              <Tile
                label={t("rpt.highPain")}
                muted={overview.pain.n === 0}
                value={overview.pain.n ? String(overview.highPainDays) : t("rpt.notRecorded")}
                sub={t("rpt.highPainSub")}
              />
            </dl>
            {overview.mostSevere?.pain_level != null && (
              <p className="text-[0.9375rem]">
                {t("rpt.mostSevere", {
                  score: overview.mostSevere.pain_level,
                  level: painLabel(overview.mostSevere.pain_level),
                  date: format(new Date(overview.mostSevere.created_at), "d MMM yyyy, HH:mm"),
                })}
              </p>
            )}
          </section>

          {overview.entries === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title={t("rpt.emptyTitle")}
              body={t("rpt.emptyBody")}
              action={
                <Link to="/diary" className={buttonVariants()}>
                  <Mic aria-hidden="true" /> {t("dashboard.diaryTitle")}
                </Link>
              }
            />
          ) : (
            <>
              {/* D. Symptom trends */}
              <section aria-labelledby="sec-trends" className="panel space-y-4">
                <h3 id="sec-trends" className="flex items-center gap-2 text-lg font-semibold">
                  <SectionNumber n="E" /> {t("rpt.trends")}
                </h3>
                <div className="grid gap-6 @5xl:grid-cols-2 [&>*]:min-w-0">
                  <div className="space-y-2">
                    <h4 className="font-semibold">{t("report.painChart")}</h4>
                    <ObservationChart series={overview.painSeries} period={period} kind="pain" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold">{t("report.sleepChart")}</h4>
                    <ObservationChart series={overview.sleepSeries} period={period} kind="sleep" />
                  </div>
                </div>
              </section>

              {/* E. Symptom history */}
              <section aria-labelledby="sec-history" className="panel space-y-3">
                <h3 id="sec-history" className="flex items-center gap-2 text-lg font-semibold">
                  <SectionNumber n="F" /> {t("rpt.history")}
                </h3>
                <div
                  className="overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-labelledby="sec-history"
                >
                  <table className="w-full min-w-[44rem] text-start text-[0.9375rem]">
                    <thead>
                      <tr className="border-b border-border text-sm text-muted-foreground">
                        <th scope="col" className="py-2 pe-3 text-start font-semibold">
                          {t("rpt.colWhen")}
                        </th>
                        <th scope="col" className="py-2 pe-3 text-start font-semibold">
                          {t("rpt.colSymptom")}
                        </th>
                        <th scope="col" className="py-2 pe-3 text-start font-semibold">
                          {t("rpt.colPain")}
                        </th>
                        <th scope="col" className="py-2 pe-3 text-start font-semibold">
                          {t("dashboard.sleep")}
                        </th>
                        <th scope="col" className="py-2 pe-3 text-start font-semibold">
                          {t("landing.sampleMood")}
                        </th>
                        <th scope="col" className="py-2 text-start font-semibold">
                          {t("rpt.colNotes")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const symptomsText = entrySymptoms(r);
                        return (
                          <tr
                            key={r.id}
                            className="border-b border-border align-top"
                            data-row={r.id}
                          >
                            <td className="py-2.5 pe-3 whitespace-nowrap" dir="ltr">
                              {format(new Date(r.created_at), "d MMM, HH:mm")}
                            </td>
                            <td className="max-w-[14rem] py-2.5 pe-3">
                              {symptomsText ? (
                                <Med>{symptomsText}</Med>
                              ) : (
                                <span className="text-muted-foreground">
                                  {t("rpt.notRecorded")}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pe-3 whitespace-nowrap">
                              {r.pain_level === null ? (
                                <span className="text-muted-foreground">
                                  {t("rpt.notRecorded")}
                                </span>
                              ) : (
                                <span className={r.pain_level >= 7 ? "font-bold" : "font-semibold"}>
                                  <bdi dir="ltr">{r.pain_level}/10</bdi>{" "}
                                  <span className="font-normal text-muted-foreground">
                                    {t(PAIN_LEVEL_KEY[painLabel(r.pain_level)])}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pe-3 whitespace-nowrap">
                              {r.sleep_hours === null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <bdi dir="ltr">{r.sleep_hours} h</bdi>
                              )}
                            </td>
                            <td className="py-2.5 pe-3">
                              {r.mood ? (
                                moodText(r.mood)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-2.5">
                              <Notes text={r.notes} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {diary.length > 0 && (
                  <details className="rounded-2xl bg-secondary p-3">
                    <summary className="cursor-pointer font-semibold">{t("rpt.diary")}</summary>
                    <div className="mt-3 space-y-3">
                      {rows
                        .filter((r) => r.timeline)
                        .map((r) => (
                          <div key={r.id}>
                            <p className="text-sm font-semibold text-muted-foreground">
                              {format(new Date(r.created_at), "EEEE d MMM")}
                            </p>
                            <SavedTimeline value={r.timeline} className="mt-1" />
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </section>
            </>
          )}

          {/* F. Medicines: optional, patient-reported, confirmed names only */}
          <section
            aria-labelledby="sec-meds"
            className="panel space-y-4"
            data-report-meds={includeMeds ? "on" : "off"}
            data-tour="rpt-meds"
          >
            <h3 id="sec-meds" className="flex items-center gap-2 text-lg font-semibold">
              <SectionNumber n="G" /> {t("rpt.meds")}
            </h3>
            <p className="text-[0.9375rem] text-muted-foreground">{t("rpt.medsHelp")}</p>
            {myMeds === null ? (
              <p className="text-[0.9375rem] text-muted-foreground">{t("rpt.medsUnavailable")}</p>
            ) : (
              <>
                <CheckRow
                  checked={includeMeds}
                  onChange={setIncludeMeds}
                  className="items-start border border-border p-3 font-semibold"
                >
                  <span>{t("rpt.medsInclude")}</span>
                </CheckRow>
                {includeMeds &&
                  (confirmedMeds.length === 0 ? (
                    <p className="rounded-2xl bg-secondary p-3 text-[0.9375rem]">
                      {t("rpt.medsNone")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-warning">
                        {t("rpt.medsPatientReported")}
                      </p>
                      <ul className="divide-y divide-border rounded-2xl border border-border">
                        {confirmedMeds.map((m, i) => (
                          <li
                            key={`${m.name}-${i}`}
                            className="flex flex-wrap items-center justify-between gap-2 p-3"
                          >
                            <span className="font-semibold">
                              <Med>{m.name}</Med>
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {m.status ? t(INTAKE_UI[m.status].label) : t("rpt.medsStatusNone")}
                              {m.statusAt &&
                                ` · ${t("rpt.recordedOn", { date: format(m.statusAt, "d MMM yyyy") })}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                {unconfirmed > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("rpt.medsExcluded", { count: unconfirmed })}{" "}
                    <Link
                      to="/medicines"
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {t("interactions.openMedicines")}
                    </Link>
                  </p>
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <StatusBanner tone="warning">{t("rpt.fixPeriodFirst")}</StatusBanner>
      )}

      {/* ---------- H. Download ---------- */}
      <section aria-labelledby="step-output" className="panel space-y-4">
        <h2 id="step-output" className="flex items-center gap-2 text-lg font-semibold">
          <SectionNumber n="H" /> {t("rpt.stepOutput")}
        </h2>

        <fieldset className="space-y-2" data-report-language={pdfLang} data-tour="rpt-lang">
          <legend className="text-sm font-semibold">{t("rpt.pdfLanguage")}</legend>
          <div role="radiogroup" aria-label={t("rpt.pdfLanguage")} className="flex flex-wrap gap-2">
            {(["en", "ur"] as const).map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={pdfLang === code}
                data-pdf-lang={code}
                lang={code}
                dir={code === "ur" ? "rtl" : "ltr"}
                onClick={() => setPdfLang(code)}
                className={`press min-h-11 rounded-xl border-2 px-5 text-base font-semibold ${
                  pdfLang === code ? "border-primary bg-accent" : "border-border hover:bg-secondary"
                } ${code === "ur" ? "font-urdu" : ""}`}
              >
                {getLanguage(code).nativeName}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{t("rpt.pdfLanguageHint")}</p>
          {pdfLang === "ur" && (
            <p className="text-sm text-muted-foreground">{t("rpt.pdfUrduReview")}</p>
          )}
        </fieldset>

        {(
          <fieldset className="space-y-2 rounded-2xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold">
              {output === "prescriptions" ? t("rpt.rxPick") : t("rpt.rxPickOptional")}
            </legend>
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("rpt.rxNone")}</p>
            ) : (
              <div className="grid gap-2 @3xl:grid-cols-2">
                {records.map((r) => (
                  <CheckRow
                    key={r.id}
                    checked={selectedRx.has(r.id)}
                    onChange={(v) => toggleRx(r.id, v)}
                    className="items-start p-2 sm:w-full"
                  >
                    <span className="min-w-0 text-[0.9375rem]">
                      <span className="block font-semibold">
                        {t("rpt.rxUploaded", {
                          date: format(new Date(r.uploaded_at), "d MMM yyyy"),
                        })}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {r.doctor_name
                          ? t("rx.list.doctor", { name: r.doctor_name })
                          : t("rx.list.noDoctor")}
                        {" · "}
                        {t("rx.list.pageCount", { count: r.page_count })}
                      </span>
                    </span>
                  </CheckRow>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-tour="rpt-generate">
          <Button size="lg" disabled={blocked || busy} aria-busy={busy} onClick={generate}>
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Download aria-hidden="true" />
            )}
            {t("rpt.generate")}
          </Button>
          <p role="status" className="min-h-5 text-sm" data-report-stage={stage}>
            {busy && progress}
            {stage === "done" && (
              <span className="flex items-start gap-2 text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t("rpt.done", { file: lastFile })}</span>
              </span>
            )}
          </p>
        </div>
        {!period && <p className="text-sm text-muted-foreground">{t("rpt.fixPeriodFirst")}</p>}
        {output === "prescriptions" && selectedRx.size === 0 && records.length > 0 && (
          <p className="text-sm text-muted-foreground">{t("rpt.pickOne")}</p>
        )}
        {stage === "error" && (
          <StatusBanner
            tone="danger"
            title={t("rpt.failedTitle")}
            action={
              <Button variant="outline" size="sm" onClick={generate}>
                {t("root.tryAgain")}
              </Button>
            }
          >
            {t("rpt.failedBody")}
          </StatusBanner>
        )}
        <p className="text-sm text-muted-foreground">
          {t("rpt.localNote")} {t("report.pdfEnglish")}
        </p>
      </section>

      <StatusBanner tone="info">{t("report.disclaimer")}</StatusBanner>

      {/* Calendar is its own feature: a link, never a copy of it. */}
      <section
        aria-labelledby="calendar-link"
        className="panel-tint flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 id="calendar-link" className="font-semibold">
              {t("rpt.calendarTitle")}
            </h2>
            <p className="text-[0.9375rem] text-muted-foreground">{t("rpt.calendarBody")}</p>
          </div>
        </div>
        <Link to="/calendar" className={buttonVariants({ variant: "outline" })}>
          <CalendarDays aria-hidden="true" /> {t("rpt.openCalendar")}
        </Link>
      </section>
    </PageEnter>
  );
}

const PAIN_LEVEL_KEY = {
  mild: "diary.painMild",
  moderate: "diary.painModerate",
  severe: "diary.painSevere",
} as const satisfies Record<string, MessageKey>;

function SectionNumber({ n }: { n: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-primary"
    >
      {n}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold">{children}</dd>
    </div>
  );
}

/** Long notes start collapsed so the table stays scannable. */
function Notes({ text }: { text: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!text) return <span className="text-muted-foreground">—</span>;
  const long = text.length > 90;
  return (
    <div className="max-w-[22rem]">
      <p className={!open && long ? "line-clamp-2" : undefined}>
        <Med>{text}</Med>
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="mt-1 min-h-6 text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          {open ? t("rpt.showLess") : t("rpt.showMore")}
        </button>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-bold ${muted ? "text-lg text-muted-foreground" : "text-2xl"}`}>
        <bdi dir="ltr">{value}</bdi>
      </dd>
      {sub && <dd className="text-sm text-muted-foreground">{sub}</dd>}
    </div>
  );
}

/**
 * A checkbox whose whole row is the target (at least 44px tall), so it is easy to hit on a
 * phone and the label is always part of the control.
 */
function CheckRow({
  checked,
  onChange,
  className = "",
  label,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`press flex min-h-11 w-full gap-3 rounded-xl text-start hover:bg-secondary sm:w-auto ${className}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${
          checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"
        }`}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}
