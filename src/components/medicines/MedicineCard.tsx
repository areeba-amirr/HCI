// One medicine in My Medicines. Shows only what matters at a glance (name, strength, where it
// came from, whether it's identified, the person's own record) and one clear next step.
// Everything else (other options, the AI's full reading, field-by-field checks) is one tap
// away, so nothing is lost but nothing crowds the card.
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  FileText,
  Hourglass,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Pill,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Med, MedicalValue } from "@/components/MedicalText";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MedicineReview } from "@/components/prescription/ReviewPanel";
import { useTourReveal } from "@/components/tour/reveal";
import { FIELD_LABEL } from "@/components/prescription/badges";
import { IntakeTracker, INTAKE_UI } from "./IntakeTracker";
import { ReadAloud } from "@/components/ReadAloud";
import { ConfidenceBadge, IdentityBadge } from "./MedicineBadges";
import { PackagingScanDialog } from "./PackagingScanDialog";
import {
  IdentificationNotSetUp,
  confirmMedicine,
  markUnableToIdentify,
  reopenIdentification,
  setMedicineName,
  type MedicineDetail,
  type MyMedicine,
  type MyMedicinesData,
  type StatusEvent,
} from "@/lib/medicines";
import type { MedicineField, ReviewAction } from "@/lib/prescription/model";

const DATE = { day: "numeric", month: "short", year: "numeric" } as const;
const STATUS_WORD: Record<string, MessageKey> = {
  uncertain: "meds.detail.uncertain",
  unreadable: "meds.detail.unreadable",
};

type Action = "confirm" | "scan" | "type" | "unable" | "reopen";

export function MedicineCard({
  medicine: m,
  data,
  onChanged,
  onRecorded,
  onFieldReview,
  reviewBusyKey,
  tourAnchors = false,
}: {
  medicine: MyMedicine;
  data: MyMedicinesData;
  /** Reload after a name change (it can move the card between sections). */
  onChanged: () => Promise<void>;
  onRecorded: (event: StatusEvent) => void;
  /** Field-by-field review of a saved prescription (in "More details"). */
  onFieldReview: (
    m: MyMedicine,
    field: MedicineField,
    action: ReviewAction,
    value?: string,
  ) => Promise<void>;
  reviewBusyKey: string | null;
  /** This is the card the guided tour points at (anchors on its parts). */
  tourAnchors?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const inputId = useId();
  const [busy, setBusy] = useState<Action | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  // The guided tour can open "More options" or "More details" on this card to show what's
  // inside, then puts them back as they were. Nothing in them runs while it does.
  const reveal = useTourReveal();
  const showingMenu = tourAnchors && reveal === "med-more";
  const showingDetails = tourAnchors && reveal === "med-details";
  // Set while the tour has the menu open, so closing it doesn't move focus out of the tour.
  const shownByTour = useRef(false);
  if (showingMenu) shownByTour.current = true;
  useEffect(() => {
    const el = detailsRef.current;
    if (!showingDetails || !el) return;
    const before = el.open;
    el.open = true;
    return () => {
      el.open = before;
    };
  }, [showingDetails]);
  const rx = m.prescriptionId ? data.prescriptions.get(m.prescriptionId) : undefined;
  const ready = data.confirmReady || m.source === "prescription";

  const canConfirm = Boolean(m.aiName) && (m.source === "label" || m.confidence === "high");
  const primary: Action | null =
    m.identity === "confirmed"
      ? null
      : m.identity === "needs_identification" && canConfirm
        ? "confirm"
        : m.canScanPackaging
          ? "scan"
          : "type";

  async function run(action: Action, work: () => Promise<void>, success: MessageKey) {
    setBusy(action);
    try {
      await work();
      await onChanged();
      toast.success(t(success));
      return true;
    } catch (e) {
      toast.error(
        e instanceof IdentificationNotSetUp ? t("meds.notSetUpAction") : t("meds.actionFailed"),
      );
      return false;
    } finally {
      setBusy(null);
    }
  }

  const doConfirm = () => run("confirm", () => confirmMedicine(m, data), "meds.done.confirmed");
  const doUnable = () => run("unable", () => markUnableToIdentify(m, data), "meds.done.unable");
  const doReopen = () => run("reopen", () => reopenIdentification(m, data), "meds.done.reopened");
  async function doType() {
    if (!typed.trim()) return;
    if (await run("type", () => setMedicineName(m, data, typed), "meds.done.named"))
      setTyping(false);
  }
  const startTyping = () => {
    setTyped(m.confirmedName ?? m.aiName ?? "");
    setTyping(true);
  };
  const startAction = (a: Action) =>
    a === "confirm"
      ? doConfirm()
      : a === "scan"
        ? setScanOpen(true)
        : a === "type"
          ? startTyping()
          : a === "unable"
            ? doUnable()
            : doReopen();

  const ACTION_UI: Record<Action, { label: MessageKey; icon: typeof Pill }> = {
    confirm: { label: "meds.act.confirm", icon: BadgeCheck },
    scan: { label: "meds.act.scan", icon: ScanLine },
    type: {
      label: m.identity === "confirmed" ? "meds.act.rename" : "meds.act.type",
      icon: PencilLine,
    },
    unable: { label: "meds.act.unable", icon: Hourglass },
    reopen: { label: "meds.act.reopen", icon: RotateCcw },
  };
  const more: Action[] = (
    [
      canConfirm && m.identity !== "confirmed" ? "confirm" : null,
      m.canScanPackaging ? "scan" : null,
      "type",
      m.identity === "needs_identification" ? "unable" : null,
      m.identity === "pending_verification" && m.source === "prescription" ? "reopen" : null,
    ] as (Action | null)[]
  ).filter((a): a is Action => a !== null && a !== primary);

  const source =
    m.source === "prescription" && rx
      ? t("meds.src.rx", { date: formatDate(new Date(rx.uploaded_at), DATE) })
      : m.source === "label"
        ? t("meds.src.label", { date: formatDate(new Date(m.savedAt), DATE) })
        : t("meds.src.legacy", { date: formatDate(new Date(m.savedAt), DATE) });
  const title = m.displayName;
  const PrimaryIcon = primary ? ACTION_UI[primary].icon : Pill;

  return (
    <li
      className="panel space-y-4 p-4 sm:p-5"
      data-medicine-card={m.scanId}
      data-identity={m.identity}
      data-tour={tourAnchors ? "med-card" : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"
          aria-hidden="true"
        >
          <Pill className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="display text-[1.375rem] leading-tight">
            {title ? <Med>{title}</Med> : <span>{t("meds.unidentified")}</span>}
          </h3>
          <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">
            {m.strength && (
              <>
                <Med>{m.strength}</Med>
                {" · "}
              </>
            )}
            {source}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-tour={tourAnchors ? "med-status" : undefined}>
        <IdentityBadge medicine={m} />
        {m.identity !== "confirmed" && m.aiName && <ConfidenceBadge confidence={m.confidence} />}
      </div>
      <ReadAloud
        tour={tourAnchors ? "med-listen" : undefined}
        text={() =>
          [
            `${title ?? t("meds.unidentified")}.`,
            m.strength ? `${t("meds.strengthDose")}: ${m.strength}.` : "",
            source + ".",
            t(
              m.identity === "confirmed"
                ? m.confirmedVia === "packaging"
                  ? "meds.id.confirmedPackaging"
                  : "meds.id.confirmed"
                : m.identity === "pending_verification"
                  ? "meds.id.pending"
                  : "meds.id.needs",
            ) + ".",
            `${t("meds.track.short")} ${m.status ? t(INTAKE_UI[m.status].label) : t("meds.track.none")}.`,
          ]
            .filter(Boolean)
            .join(" ")
        }
      />

      {m.identity !== "confirmed" && (m.aiName ? !title : true) && (
        <p className="rounded-xl bg-secondary px-3 py-2 text-[0.9375rem]" data-ai-reading>
          {m.aiName ? (
            <>
              {t("meds.aiGuess")} <Med>“{m.aiName}”</Med>
            </>
          ) : (
            t("meds.aiNoName")
          )}
        </p>
      )}
      {m.identity === "pending_verification" && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.9375rem]">
          {t("meds.pendingHelp")}{" "}
          <Link
            to="/prescription"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t("meds.uploadClearer")}
          </Link>
        </p>
      )}

      <div data-tour={tourAnchors ? "med-intake" : undefined}>
        <IntakeTracker medicine={m} ready={data.trackingReady} onRecorded={onRecorded} compact />
      </div>

      {typing ? (
        <form
          className="space-y-2 rounded-2xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void doType();
          }}
        >
          <label htmlFor={inputId} className="field-label">
            {t("meds.typeLabel")}
          </label>
          <Input
            id={inputId}
            value={typed}
            dir="auto"
            maxLength={200}
            autoFocus
            onChange={(e) => setTyped(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">{t("meds.typeHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!typed.trim() || busy !== null}>
              {busy === "type" && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t("meds.saveName")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setTyping(false)}>
              {t("meds.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {primary && (
            <Button
              disabled={busy !== null || !ready}
              onClick={() => startAction(primary)}
              data-primary-action={primary}
              data-tour={tourAnchors ? `med-action-${primary}` : undefined}
            >
              {busy === primary ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <PrimaryIcon aria-hidden="true" />
              )}
              {t(ACTION_UI[primary].label)}
            </Button>
          )}
          <DropdownMenu
            open={showingMenu || menuOpen}
            onOpenChange={(o) => !showingMenu && setMenuOpen(o)}
            modal={!showingMenu}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={busy !== null}
                aria-label={`${t("meds.more")}: ${title ?? t("meds.unidentified")}`}
                data-tour={tourAnchors ? "med-more" : undefined}
              >
                <MoreHorizontal aria-hidden="true" /> {t("meds.more")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-60"
              data-tour={showingMenu ? "med-more-menu" : undefined}
              // Opened by the tour (not modal): the tour card takes focus back as the step
              // arrives, and closing it doesn't send focus into the inert page.
              onCloseAutoFocus={(e) => {
                if (!shownByTour.current) return;
                shownByTour.current = false;
                e.preventDefault();
              }}
            >
              {more.map((a) => {
                const Icon = ACTION_UI[a].icon;
                return (
                  <DropdownMenuItem
                    key={a}
                    disabled={!ready && a !== "scan"}
                    onSelect={() => startAction(a)}
                    className="min-h-11 gap-2 text-[0.9375rem]"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {t(ACTION_UI[a].label)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          {rx && (
            <Link
              to="/prescriptions/$id"
              params={{ id: rx.id }}
              className={`${buttonVariants({ variant: "ghost" })} text-primary`}
              data-tour={tourAnchors ? "med-original" : undefined}
            >
              <FileText aria-hidden="true" /> {t("meds.act.original")}
            </Link>
          )}
        </div>
      )}

      <details
        ref={detailsRef}
        className="group rounded-2xl border border-border"
        data-tour={tourAnchors ? "med-details" : undefined}
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 font-semibold">
          {t("meds.moreDetails")}
          <ChevronDown
            className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-4 border-t border-border px-4 py-4">
          <Details medicine={m} />
          {rx && m.index !== null && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">
                {t("meds.fieldCheckTitle")}
              </p>
              <MedicineReview
                extraction={rx.extraction}
                review={rx.review}
                only={m.index}
                busyKey={reviewBusyKey}
                onReview={(_i, field, action, value) => onFieldReview(m, field, action, value)}
              />
            </div>
          )}
        </div>
      </details>

      {m.canScanPackaging && (
        <PackagingScanDialog
          medicine={m}
          open={scanOpen}
          onOpenChange={setScanOpen}
          onConfirm={async (name) => {
            await run(
              "scan",
              () => setMedicineName(m, data, name, "packaging_scan"),
              "meds.done.packaging",
            );
          }}
        />
      )}
    </li>
  );
}

/** The AI's reading of everything else, clearly labelled as a reading, not a fact. */
function Details({ medicine: m }: { medicine: MyMedicine }) {
  const { t } = useI18n();
  const label = (d: MedicineDetail) =>
    d.field === "frequency_text"
      ? t("meds.howOften")
      : d.field === "dosage_text"
        ? t("meds.strengthDose")
        : t(FIELD_LABEL[d.field as MedicineField]);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-muted-foreground">{t("meds.asRead")}</p>
      {m.details.length === 0 && m.alternatives.length === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">{t("meds.noOtherDetails")}</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-1.5 text-[0.9375rem] sm:grid-cols-2">
          {m.details.map((d) => (
            <div key={d.field}>
              <dt className="inline text-muted-foreground">{label(d)}: </dt>
              <dd className="inline font-medium">
                {d.value ? (
                  d.urdu ? (
                    <MedicalValue original={d.value} urdu={d.urdu} />
                  ) : (
                    <Med>{d.value}</Med>
                  )
                ) : (
                  t("meds.notRead")
                )}
                {d.status && STATUS_WORD[d.status] && (
                  <span className="ms-1 text-sm text-warning">({t(STATUS_WORD[d.status])})</span>
                )}
              </dd>
            </div>
          ))}
          {m.alternatives.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="inline text-muted-foreground">{t("meds.alternatives")}: </dt>
              <dd className="inline font-medium">
                <Med>{m.alternatives.join(", ")}</Med>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
