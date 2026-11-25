import { ArrowLeftRight as ArrowLeftRightIcon } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkInteraction } from "@/lib/ai.functions";
import { interactionChoices, loadMyMedicines, type MyMedicine } from "@/lib/medicines";
import { IdentityBadge } from "@/components/medicines/MedicineBadges";
import { ReadAloud } from "@/components/ReadAloud";
import {
  AlertTriangle,
  ArrowLeftRight,
  Info,
  Loader2,
  OctagonAlert,
  Pill,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { Med, MedicalDataNotice, MedicalValue } from "@/components/MedicalText";
import {
  EmptyState,
  PageEnter,
  PageHeader,
  ProcessingCard,
  StatusBanner,
} from "@/components/app/primitives";
import { Button, buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/interactions")({
  head: () => ({
    meta: [
      { title: "Interaction Check — MediSnap" },
      {
        name: "description",
        content:
          "Check whether two medicines you've confirmed may interact, explained in English and Urdu.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InteractionsPage,
});

const SEVERITY = {
  safe: {
    label: "history.severitySafe",
    icon: ShieldCheck,
    tone: "border-success/50 bg-success/8",
    ink: "text-success",
  },
  mild: {
    label: "history.severityMild",
    icon: Info,
    tone: "border-border bg-secondary",
    ink: "text-primary",
  },
  moderate: {
    label: "history.severityModerate",
    icon: AlertTriangle,
    tone: "border-warning/50 bg-warning/8",
    ink: "text-warning",
  },
  severe: {
    label: "history.severitySevere",
    icon: OctagonAlert,
    tone: "border-destructive/60 bg-destructive/6",
    ink: "text-destructive",
  },
} as const;

function InteractionsPage() {
  const interactionFn = useServerFn(checkInteraction);
  const { t, tError, language } = useI18n();
  const resultRef = useRef<HTMLDivElement>(null);
  // Only names a person has confirmed can be chosen; AI readings nobody checked can't.
  const [names, setNames] = useState<string[]>([]);
  const [pending, setPending] = useState<MyMedicine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [m1, setM1] = useState("");
  const [m2, setM2] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [checked, setChecked] = useState<[string, string] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { medicines } = await loadMyMedicines();
      const choices = interactionChoices(medicines);
      setNames(choices.confirmed);
      setPending(choices.pending);
      setTotal(medicines.length);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const sameMedicine = Boolean(m1) && m1 === m2;
  const ready = Boolean(m1 && m2) && !sameMedicine;

  async function run() {
    if (!ready) return;
    setChecking(true);
    setResult(null);
    setError(null);
    try {
      const r = await interactionFn({ data: { medicine1: m1, medicine2: m2 } });
      setResult(r);
      setChecked([m1, m2]);
    } catch (e: any) {
      setError(tError(e.message));
    } finally {
      setChecking(false);
    }
  }

  // Move focus to the result so keyboard and screen-reader users land on the answer.
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const severity = useMemo(() => SEVERITY[result?.severity as keyof typeof SEVERITY], [result]);
  const Icon = result?.is_safe ? ShieldCheck : (severity?.icon ?? AlertTriangle);
  const tone = result?.is_safe ? SEVERITY.safe.tone : (severity?.tone ?? SEVERITY.moderate.tone);
  const ink = result?.is_safe ? SEVERITY.safe.ink : (severity?.ink ?? SEVERITY.moderate.ink);
  const severityLabel = severity ? t(severity.label) : result?.severity;

  return (
    <PageEnter className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        guide="interactions"
        icon={ArrowLeftRightIcon}
        title={t("history.interactionTitle")}
        description={t("history.interactionSubtitle")}
      />

      {loadFailed && (
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

      {loading ? (
        <ProcessingCard title={t("common.loading")} />
      ) : names.length < 2 && !loadFailed ? (
        total < 2 ? (
          <EmptyState
            data-tour="interaction-check-empty"
            icon={Pill}
            title={t("interactions.noMedsTitle")}
            body={t("interactions.noMedsBody")}
            action={
              <Link to="/scanner" className={buttonVariants()}>
                {t("nav.scanner")}
              </Link>
            }
          />
        ) : (
          <EmptyState
            data-tour="interaction-check-empty"
            icon={Pill}
            title={t("interactions.needTwoTitle")}
            body={t("interactions.needTwoBody")}
            action={
              <Link to="/medicines" className={buttonVariants()}>
                <Pill aria-hidden="true" /> {t("interactions.openMedicines")}
              </Link>
            }
          />
        )
      ) : (
        !loadFailed && (
          <section
            aria-label={t("interactions.formLabel")}
            className="panel space-y-4"
            data-tour="interaction-check-page"
          >
            <p className="text-[0.9375rem] text-muted-foreground" data-tour="ix-rule">
              {t("interactions.fromSaved")}
            </p>
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]" data-tour="ix-pick">
              <div>
                <label htmlFor="med-1" className="field-label">
                  {t("interactions.first")}
                </label>
                <select
                  id="med-1"
                  translate="no"
                  value={m1}
                  onChange={(e) => setM1(e.target.value)}
                  className="native-select"
                >
                  <option value="">{t("history.medicine1")}</option>
                  {names.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <ArrowLeftRight
                className="mx-auto mb-3 hidden h-5 w-5 text-muted-foreground sm:block"
                aria-hidden="true"
              />
              <div>
                <label htmlFor="med-2" className="field-label">
                  {t("interactions.second")}
                </label>
                <select
                  id="med-2"
                  translate="no"
                  value={m2}
                  onChange={(e) => setM2(e.target.value)}
                  className="native-select"
                >
                  <option value="">{t("history.medicine2")}</option>
                  {names.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {sameMedicine && (
              <StatusBanner tone="warning">{t("interactions.sameMedicine")}</StatusBanner>
            )}
            <Button size="lg" disabled={!ready || checking} onClick={run} data-tour="ix-check">
              {checking ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowLeftRight aria-hidden="true" />
              )}
              {t("history.check")}
            </Button>
          </section>
        )
      )}

      {!loading && !loadFailed && pending.length > 0 && (
        <section
          aria-labelledby="ix-pending"
          className="panel-tint space-y-3"
          data-ix-pending
          data-tour="ix-pending"
        >
          <h2 id="ix-pending" className="font-semibold">
            {t("interactions.pendingTitle", { count: pending.length })}
          </h2>
          <p className="text-[0.9375rem] text-muted-foreground">{t("interactions.pendingBody")}</p>
          <ul className="space-y-2">
            {pending.map((m) => (
              <li
                key={m.scanId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card p-3"
              >
                <span className="font-semibold">
                  {m.displayName ? <Med>{m.displayName}</Med> : t("meds.unidentified")}
                </span>
                <IdentityBadge medicine={m} />
              </li>
            ))}
          </ul>
          <Link to="/medicines" className={buttonVariants({ variant: "outline" })}>
            <Pill aria-hidden="true" /> {t("interactions.openMedicines")}
          </Link>
        </section>
      )}

      {checking && <ProcessingCard title={t("interactions.checking")} />}

      {error && (
        <StatusBanner
          tone="danger"
          title={t("interactions.failed")}
          action={
            <Button variant="outline" size="sm" onClick={run}>
              <RefreshCcw aria-hidden="true" /> {t("root.tryAgain")}
            </Button>
          }
        >
          {error}
        </StatusBanner>
      )}

      {result && (
        <div ref={resultRef} tabIndex={-1} className={`rounded-3xl border p-5 md:p-7 ${tone}`}>
          {checked && (
            <p className="text-[0.9375rem] text-muted-foreground">
              <Med>{checked[0]}</Med> + <Med>{checked[1]}</Med>
            </p>
          )}
          <h2 className={`display mt-1 flex items-center gap-2 text-2xl ${ink}`}>
            <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
            {result.is_safe
              ? t("history.safe")
              : t("history.cautionSeverity", { severity: severityLabel })}
          </h2>
          <div className="mt-3">
            <MedicalValue original={result.explanation} urdu={result.explanation_urdu} />
          </div>
          <p className="mt-4 text-[0.9375rem] font-medium">{t("interactions.limits")}</p>
          <ReadAloud
            className="mt-4"
            text={() =>
              [
                checked ? `${checked[0]}, ${checked[1]}.` : "",
                (result.is_safe
                  ? t("history.safe")
                  : t("history.cautionSeverity", { severity: severityLabel })) + ".",
                language === "ur" && result.explanation_urdu
                  ? result.explanation_urdu
                  : result.explanation,
                t("interactions.limits"),
              ]
                .filter(Boolean)
                .join(" ")
            }
          />
        </div>
      )}

      {result && <MedicalDataNotice />}
    </PageEnter>
  );
}
