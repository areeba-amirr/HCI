import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FileText, Loader2, Pill, RefreshCcw, Save, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { scanPrescription } from "@/lib/ai.functions";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { UrduHint } from "@/components/MedicalText";
import {
  ConfirmDialog,
  FlowSteps,
  PageEnter,
  PageHeader,
  ProcessingCard,
  StatusBanner,
} from "@/components/app/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PrescriptionUpload } from "@/components/prescription/PrescriptionUpload";
import { OriginalViewer } from "@/components/prescription/OriginalViewer";
import { AI_ISSUE_KEY } from "@/components/prescription/ReviewPanel";
import { SavedPrescriptionList } from "@/components/prescription/SavedPrescriptionList";
import { ReadAloud } from "@/components/ReadAloud";
import type { PreparedPrescription, QualityIssue } from "@/lib/prescription/files";
import type { PrescriptionExtraction } from "@/lib/prescription/model";
import {
  SaveError,
  discardPartialSave,
  isPartiallySaved,
  newSaveProgress,
  savePrescription,
  type SaveFailure,
  type SaveProgress,
  type SaveStage,
} from "@/lib/prescription/store";

export const Route = createFileRoute("/_authenticated/prescription")({
  head: () => ({
    meta: [
      { title: "Prescription Reader — MediSnap" },
      {
        name: "description",
        content:
          "Upload a doctor's prescription and keep the original exactly as uploaded, ready to view, download or attach to a doctor report.",
      },
      { property: "og:title", content: "Prescription Reader — MediSnap" },
      {
        property: "og:description",
        content:
          "Upload a doctor's prescription and keep the original exactly as uploaded, ready to view, download or attach to a doctor report.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrescriptionPage,
});

const QUALITY_KEY: Record<QualityIssue, MessageKey> = {
  low_resolution: "rx.quality.low_resolution",
  blurry: "rx.quality.blurry",
  too_dark: "rx.quality.too_dark",
  too_bright: "rx.quality.too_bright",
  low_contrast: "rx.quality.low_contrast",
};

// Which step failed (title) and why (body), so the message says what actually happened.
const SAVE_STAGE_KEY: Record<SaveError["stage"], MessageKey> = {
  auth: "rx.save.failed.auth",
  upload: "rx.save.failed.upload",
  record: "rx.save.failed.record",
  medicines: "rx.save.failed.medicines",
  review: "rx.save.failed.review",
};
const SAVE_REASON_KEY: Record<SaveFailure, MessageKey> = {
  not_set_up: "rx.save.reason.notSetUp",
  permission: "rx.save.reason.permission",
  session: "rx.save.reason.session",
  network: "rx.save.reason.network",
  too_large: "rx.save.reason.tooLarge",
  file_type: "rx.save.reason.fileType",
  unknown: "rx.save.reason.unknown",
};
const STAGE_PROGRESS_KEY: Record<SaveStage, MessageKey> = {
  upload: "rx.save.stage.upload",
  record: "rx.save.stage.record",
  medicines: "rx.save.stage.medicines",
  review: "rx.save.stage.review",
};

type SaveState = "idle" | "uploading" | "saving" | "saved" | "failed";

interface ReadResult {
  extraction: PrescriptionExtraction;
  model: string;
}

function PrescriptionPage() {
  const read = useServerFn(scanPrescription);
  const { t, tError } = useI18n();
  const [prepared, setPrepared] = useState<PreparedPrescription | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveStage, setSaveStage] = useState<SaveStage | null>(null);
  const [saveError, setSaveError] = useState<{
    stage: SaveError["stage"];
    reason: SaveFailure;
  } | null>(null);
  // What this result has already written, so a retry continues instead of duplicating.
  const progress = useRef<SaveProgress | null>(null);
  const inFlight = useRef(false);
  const saving = saveState === "uploading" || saveState === "saving";
  const [savedId, setSavedId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const issues =
    prepared?.quality.flatMap((q) => q.issues.map((issue) => ({ page: q.page, issue }))) ?? [];
  const canRead = Boolean(prepared) && (issues.length === 0 || acknowledged);

  async function runRead() {
    if (!prepared || !canRead) return;
    await abandonPartialSave();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await read({ data: { pages: prepared.pages.map((p) => p.dataUrl) } });
      setResult(data as ReadResult);
    } catch (e) {
      setError(e instanceof Error && e.message ? tError(e.message) : t("prescription.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!prepared || !result || inFlight.current) return; // one save at a time, never twice
    inFlight.current = true;
    progress.current ??= newSaveProgress();
    setSaveError(null);
    setSaveState(progress.current.uploaded ? "saving" : "uploading");
    try {
      const { id } = await savePrescription(
        // The AI reading is stored apart from the original and starts unchecked: the person
        // checks it in My Medicines, never here.
        {
          prepared,
          extraction: result.extraction,
          model: result.model,
          review: {},
          log: [],
          doctorName,
        },
        progress.current,
        (stage) => {
          setSaveStage(stage);
          setSaveState(stage === "upload" ? "uploading" : "saving");
        },
      );
      setSavedId(id);
      setSaveState("saved");
      toast.success(t("rx.save.done"));
    } catch (e) {
      const err = e instanceof SaveError ? e : new SaveError("record", "unknown");
      if (!(e instanceof SaveError)) console.error("[prescription save] unexpected", e);
      setSaveError({ stage: err.stage, reason: err.reason });
      setSaveState("failed");
    } finally {
      inFlight.current = false;
      setSaveStage(null);
    }
  }

  /** Removes anything a failed save left behind, when the result is discarded. */
  async function abandonPartialSave() {
    const p = progress.current;
    progress.current = null;
    if (p && isPartiallySaved(p)) await discardPartialSave(p).catch(() => {});
  }

  function reset() {
    if (!savedId) void abandonPartialSave();
    else progress.current = null;
    setSaveState("idle");
    setPrepared(null);
    setAcknowledged(false);
    setResult(null);
    setDoctorName("");
    setError(null);
    setSaveError(null);
    setSavedId(null);
  }

  const partial = progress.current && isPartiallySaved(progress.current);

  const step = savedId ? 3 : result ? 2 : prepared ? 1 : 0;
  const wide =
    Boolean(prepared) &&
    !loading &&
    !(
      result &&
      (!result.extraction.image_quality.usable || result.extraction.medicines.length === 0)
    );
  const usable = result?.extraction.image_quality.usable ?? false;
  const medicines = result?.extraction.medicines ?? [];

  return (
    <PageEnter
      className={`@container mx-auto w-full space-y-6 ${
        // One centred column while there is a single thing to do (upload, or retake an
        // unreadable photo); the wide two-column layout only when the original sits beside
        // the reading.
        wide ? "max-w-6xl" : "max-w-3xl"
      }`}
    >
      <PageHeader
        guide="prescription"
        icon={FileText}
        title={t("prescription.title")}
        description={t("rx.subtitle")}
        urdu={
          <UrduHint className="mt-1 text-lg text-muted-foreground">
            ڈاکٹر کا نسخہ اسکین کریں
          </UrduHint>
        }
      />
      <div data-tour="rx-steps">
        <FlowSteps steps={[t("rx.stepAdd"), t("scan.stepRead"), t("scan.stepSave")]} current={step} />
      </div>

      {!prepared && (
        <>
          <div data-tour="prescription-page">
            <PrescriptionUpload
              onPrepared={(p) => {
                setPrepared(p);
                setAcknowledged(false);
              }}
            />
          </div>
          <SavedPrescriptionList />
        </>
      )}

      {prepared && !result && !loading && (
        <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <OriginalViewer pages={prepared.pages} />
          <div className="space-y-4">
            {issues.length > 0 ? (
              <StatusBanner tone="warning" title={t("rx.quality.title")}>
                <ul className="list-disc space-y-1 ps-5">
                  {issues.map(({ page, issue }) => (
                    <li key={`${page}-${issue}`}>
                      {prepared.pages.length > 1 && `${t("rx.original.pageN", { n: page })}: `}
                      {t(QUALITY_KEY[issue])}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">{t("rx.quality.advice")}</p>
                <label className="mt-3 flex items-start gap-3 font-medium">
                  <Checkbox
                    checked={acknowledged}
                    onCheckedChange={(v) => setAcknowledged(v === true)}
                    className="mt-0.5"
                    aria-describedby="rx-quality-ack"
                  />
                  <span id="rx-quality-ack">{t("rx.quality.acknowledge")}</span>
                </label>
              </StatusBanner>
            ) : (
              <StatusBanner tone="success" title={t("rx.quality.okTitle")}>
                {t("rx.quality.okBody")}
              </StatusBanner>
            )}
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={runRead} disabled={!canRead}>
                <ScanSearch aria-hidden="true" /> {t("prescription.read")}
              </Button>
              <Button size="lg" variant="outline" onClick={reset}>
                <RefreshCcw aria-hidden="true" /> {t("rx.chooseAnother")}
              </Button>
            </div>
            {error && (
              <StatusBanner
                tone="danger"
                title={t("prescription.failed")}
                action={
                  <Button variant="outline" size="sm" onClick={runRead}>
                    <RefreshCcw aria-hidden="true" /> {t("root.tryAgain")}
                  </Button>
                }
              >
                {error}
              </StatusBanner>
            )}
          </div>
        </div>
      )}

      {loading && (
        <ProcessingCard title={t("prescription.reading")} detail={t("rx.readingDetail")} />
      )}

      {result && prepared && !usable && (
        <div className="space-y-4">
          <StatusBanner
            tone="danger"
            title={t("rx.unusable.title")}
            action={
              <Button onClick={reset}>
                <RefreshCcw aria-hidden="true" /> {t("rx.unusable.retake")}
              </Button>
            }
          >
            <p>{t("rx.unusable.body")}</p>
            {result.extraction.image_quality.issues.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 ps-5">
                {result.extraction.image_quality.issues.map((i) => (
                  <li key={i}>{AI_ISSUE_KEY[i] ? t(AI_ISSUE_KEY[i]) : i}</li>
                ))}
              </ul>
            )}
          </StatusBanner>
          <OriginalViewer pages={prepared.pages} />
        </div>
      )}

      {result && prepared && usable && (
        <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <OriginalViewer pages={prepared.pages} className="@4xl:sticky @4xl:top-6" />
          <div className="space-y-5">
            {medicines.length === 0 ? (
              <StatusBanner tone="info" title={t("prescription.noneTitle")}>
                {t("rx.readNoneBody")}
              </StatusBanner>
            ) : (
              <StatusBanner
                tone="info"
                title={t("rx.readSummaryTitle", { count: medicines.length })}
              >
                {t("rx.readSummaryBody")}
              </StatusBanner>
            )}
            {medicines.length > 0 && (
              <ReadAloud
                text={() =>
                  [
                    t("rx.readSummaryTitle", { count: medicines.length }) + ".",
                    ...medicines.map((m, i) => {
                      const n = m.fields.name;
                      const name = n.value && n.status !== "unreadable" ? n.value : t("rx.nameUnreadable");
                      const unsure = n.status === "uncertain" ? ` (${t("rx.read.uncertain")})` : "";
                      return `${i + 1}. ${name}${unsure}.`;
                    }),
                    t("rx.readSummaryBody"),
                  ].join(" ")
                }
              />
            )}

            {savedId ? (
              <StatusBanner
                tone="success"
                title={t("rx.save.done")}
                action={
                  <>
                    <Link
                      to="/prescriptions/$id"
                      params={{ id: savedId }}
                      className={buttonVariants({ size: "sm" })}
                    >
                      <FileText aria-hidden="true" /> {t("rx.openPrescription")}
                    </Link>
                    {medicines.length > 0 && (
                      <Link
                        to="/medicines"
                        hash={`rx-${savedId}`}
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                      >
                        <Pill aria-hidden="true" /> {t("rx.checkMedicines")}
                      </Link>
                    )}
                    <Button variant="outline" size="sm" onClick={reset}>
                      <RefreshCcw aria-hidden="true" /> {t("scan.again")}
                    </Button>
                  </>
                }
              >
                <ul className="space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    {t("rx.save.doneOriginal")}
                  </li>
                  {medicines.length > 0 && (
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      {t("rx.save.doneMedicines", { count: medicines.length })}
                    </li>
                  )}
                </ul>
                {medicines.length > 0 && <p className="mt-2">{t("rx.save.doneBody")}</p>}
              </StatusBanner>
            ) : (
              <div className="panel space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="rx-doctor" className="field-label">
                    {t("rx.doctorName")}
                  </label>
                  <Input
                    id="rx-doctor"
                    value={doctorName}
                    maxLength={120}
                    dir="auto"
                    autoComplete="off"
                    disabled={saving}
                    aria-describedby="rx-doctor-hint"
                    onChange={(e) => setDoctorName(e.target.value)}
                  />
                  <p id="rx-doctor-hint" className="text-sm text-muted-foreground">
                    {t("rx.doctorNameHint")}
                  </p>
                </div>
                <p className="text-[0.9375rem] text-muted-foreground">{t("rx.save.explain")}</p>
                <div className="flex flex-wrap gap-3">
                  <Button size="lg" disabled={saving} aria-busy={saving} onClick={save}>
                    {saving ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Save aria-hidden="true" />
                    )}
                    {saveState === "failed" ? t("rx.save.retry") : t("rx.save.button")}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={saving}
                    onClick={() => setConfirmReset(true)}
                  >
                    <RefreshCcw aria-hidden="true" /> {t("scan.again")}
                  </Button>
                </div>
                <p
                  role="status"
                  className="min-h-6 text-[0.9375rem] font-medium"
                  data-save-state={saveState}
                >
                  {saving && saveStage ? t(STAGE_PROGRESS_KEY[saveStage]) : ""}
                </p>
                {saveError && !saving && (
                  <StatusBanner
                    tone="danger"
                    title={t(SAVE_STAGE_KEY[saveError.stage])}
                    action={
                      <Button variant="outline" size="sm" onClick={save}>
                        <RefreshCcw aria-hidden="true" /> {t("root.tryAgain")}
                      </Button>
                    }
                  >
                    <p>{t(SAVE_REASON_KEY[saveError.reason])}</p>
                    <p className="mt-2 font-medium">
                      {partial ? t("rx.save.partialKept") : t("rx.save.nothingSaved")}
                    </p>
                  </StatusBanner>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("scan.discardTitle")}
        body={partial ? t("rx.discardPartialBody") : t("rx.discardBody")}
        confirmLabel={t("scan.discardConfirm")}
        cancelLabel={t("scan.discardCancel")}
        onConfirm={reset}
      />
    </PageEnter>
  );
}
