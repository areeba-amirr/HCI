import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, CircleDashed, FileText, Pill, RefreshCcw, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nProvider";
import {
  EmptyState,
  PageEnter,
  PageHeader,
  ProcessingCard,
  StatusBanner,
} from "@/components/app/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { MedicineCard } from "@/components/medicines/MedicineCard";
import { WrittenNotes } from "@/components/prescription/ReviewPanel";
import { ReviewTrail } from "@/components/prescription/ReviewTrail";
import {
  loadMyMedicines,
  type MyMedicine,
  type MyMedicinesData,
  type StatusEvent,
} from "@/lib/medicines";
import { reviewKey, type MedicineField, type ReviewAction } from "@/lib/prescription/model";
import { reviewSaved } from "@/lib/prescription/store";
import { FirstTimeTip } from "@/components/tour/PageGuide";

export const Route = createFileRoute("/_authenticated/medicines")({
  head: () => ({
    meta: [
      { title: "My Medicines — MediSnap" },
      {
        name: "description",
        content:
          "Identify the medicines from your prescriptions and labels, and keep your own record of what you've taken.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyMedicinesPage,
});

const DATE = { day: "numeric", month: "short", year: "numeric" } as const;

function MyMedicinesPage() {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<MyMedicinesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  // Arriving from a prescription ("#rx-<id>") shows just that prescription's medicines.
  const [onlyRx, setOnlyRx] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await loadMyMedicines());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
    const h = window.location.hash;
    if (h.startsWith("#rx-")) setOnlyRx(h.slice(4));
  }, [load]);

  const onRecorded = (e: StatusEvent) =>
    setData((d) =>
      d
        ? {
            ...d,
            medicines: d.medicines.map((m) =>
              m.scanId === e.scan_id
                ? { ...m, history: [e, ...m.history], status: e.status, statusAt: e.recorded_at }
                : m,
            ),
          }
        : d,
    );

  async function onFieldReview(
    m: MyMedicine,
    field: MedicineField,
    action: ReviewAction,
    value?: string,
  ) {
    const rx = m.prescriptionId ? data?.prescriptions.get(m.prescriptionId) : undefined;
    if (!rx || m.index === null) return;
    setReviewBusy(reviewKey(m.index, field));
    try {
      await reviewSaved(rx, m.index, field, action, value);
      await load();
      toast.success(t("rx.reviewSaved"));
    } catch {
      toast.error(t("rx.reviewFailed"));
    } finally {
      setReviewBusy(null);
    }
  }

  const view = useMemo(() => {
    if (!data) return null;
    const list = onlyRx ? data.medicines.filter((m) => m.groupId === onlyRx) : data.medicines;
    // Needs identification first (unidentified before "pending verification"), newest first.
    const rank = (m: MyMedicine) => (m.identity === "needs_identification" ? 0 : 1);
    const needs = list
      .filter((m) => m.identity !== "confirmed")
      .sort((a, b) => rank(a) - rank(b) || b.savedAt.localeCompare(a.savedAt));
    const confirmed = list
      .filter((m) => m.identity === "confirmed")
      .sort((a, b) => (a.confirmedName ?? "").localeCompare(b.confirmedName ?? ""));
    const prescriptions = [...data.prescriptions.values()]
      .filter((p) => (onlyRx ? p.id === onlyRx : list.some((m) => m.prescriptionId === p.id)))
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
    return { list, needs, confirmed, prescriptions };
  }, [data, onlyRx]);

  if (failed)
    return (
      <StatusBanner
        tone="danger"
        title={t("common.loadFailedTitle")}
        action={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCcw aria-hidden="true" /> {t("root.tryAgain")}
          </Button>
        }
      >
        {t("common.loadFailedBody")}
      </StatusBanner>
    );

  const total = data?.medicines.length ?? 0;
  const filteredRx = onlyRx ? data?.prescriptions.get(onlyRx) : undefined;
  // The guided tour explains one real card: the first that still needs identifying (it has
  // the most to show), otherwise the first identified one.
  const tourCard = view ? ((view.needs[0] ?? view.confirmed[0])?.scanId ?? null) : null;
  const cardProps = data
    ? { data, onChanged: load, onRecorded, onFieldReview, reviewBusyKey: reviewBusy }
    : null;

  return (
    <PageEnter className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        guide="medicines" icon={Pill} title={t("meds.title")} description={t("meds.subtitle")} />

      {!data ? (
        <ProcessingCard title={t("common.loading")} />
      ) : total === 0 ? (
        <EmptyState
          data-tour="medicines-page-empty"
          icon={Pill}
          title={t("meds.empty")}
          body={t("meds.emptyBody")}
          action={
            <>
              <Link to="/prescription" className={buttonVariants()}>
                <FileText aria-hidden="true" /> {t("nav.prescription")}
              </Link>
              <Link to="/scanner" className={buttonVariants({ variant: "outline" })}>
                <ScanLine aria-hidden="true" /> {t("nav.scanner")}
              </Link>
            </>
          }
        />
      ) : (
        <>
          <p className="rounded-2xl border border-warning/40 bg-warning/8 px-4 py-3 text-[0.9375rem]">
            {t("meds.aiNoteShort")}
          </p>
          {!data.trackingReady && (
            <StatusBanner tone="info" title={t("meds.notSetUp")}>
              {t("meds.notSetUpBody")}
            </StatusBanner>
          )}

          {onlyRx && (
            <div
              id={`rx-${onlyRx}`}
              tabIndex={-1}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 outline-none"
              data-filter-rx={onlyRx}
            >
              <p className="font-semibold">
                {filteredRx
                  ? t("meds.filterRx", { date: formatDate(new Date(filteredRx.uploaded_at), DATE) })
                  : t("meds.filterRxGeneric")}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOnlyRx(null);
                  navigate({ to: "/medicines", hash: "", replace: true });
                }}
              >
                <X aria-hidden="true" /> {t("meds.showAll")}
              </Button>
            </div>
          )}

          {view!.needs.length > 0 && (
            <FirstTimeTip id="meds-identify">{t("guide.tip.medsIdentify")}</FirstTimeTip>
          )}
          <div data-tour="medicines-page" className="space-y-8">
            <Section
              id="needs-identification"
              icon={CircleDashed}
              title={t("meds.sec.needs", { count: view!.needs.length })}
              help={t("meds.sec.needsHelp")}
              empty={t("meds.sec.needsEmpty")}
              items={view!.needs}
              cardProps={cardProps!}
              tourCard={tourCard}
            />
            <Section
              id="confirmed-medicines"
              icon={BadgeCheck}
              title={t("meds.sec.confirmed", { count: view!.confirmed.length })}
              help={t("meds.sec.confirmedHelp")}
              empty={t("meds.sec.confirmedEmpty")}
              items={view!.confirmed}
              cardProps={cardProps!}
              tourCard={tourCard}
            />
          </div>

          {view!.prescriptions.length > 0 && (
            <details className="rounded-2xl border border-border px-4 py-3" data-rx-extras>
              <summary className="min-h-11 cursor-pointer font-semibold">
                {t("meds.rxExtras")}
              </summary>
              <div className="mt-4 space-y-6">
                {view!.prescriptions.map((rx) => (
                  <section key={rx.id} aria-labelledby={`rx-x-${rx.id}`} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id={`rx-x-${rx.id}`} className="font-semibold">
                        {t("meds.fromRx", { date: formatDate(new Date(rx.uploaded_at), DATE) })}
                        {rx.doctor_name && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {t("meds.doctor", { name: rx.doctor_name })}
                          </span>
                        )}
                      </h3>
                      <Link
                        to="/prescriptions/$id"
                        params={{ id: rx.id }}
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                      >
                        <FileText aria-hidden="true" /> {t("meds.viewOriginal")}
                      </Link>
                    </div>
                    <WrittenNotes extraction={rx.extraction} />
                    <ReviewTrail prescriptionId={rx.id} model={rx.model} version={rx.updated_at} />
                  </section>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </PageEnter>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  help,
  empty,
  items,
  cardProps,
  tourCard,
}: {
  id: string;
  icon: typeof Pill;
  title: string;
  help: string;
  empty: string;
  items: MyMedicine[];
  cardProps: Omit<React.ComponentProps<typeof MedicineCard>, "medicine">;
  /** The one card the guided tour points at (the first that still needs identifying). */
  tourCard: string | null;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3" data-section={id}>
      <div
        className="flex items-start gap-3 border-b border-border pb-3"
        data-tour={id === "needs-identification" ? "meds-needs" : "meds-confirmed"}
      >
        <Icon className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id={id} className="display text-2xl">
            {title}
          </h2>
          <p className="text-[0.9375rem] text-muted-foreground">{help}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-secondary p-4 text-[0.9375rem]">{empty}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((m) => (
            <MedicineCard
              key={m.scanId}
              medicine={m}
              {...cardProps}
              tourAnchors={m.scanId === tourCard}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
