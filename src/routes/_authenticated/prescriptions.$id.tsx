import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  PencilLine,
  Pill,
  RefreshCcw,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import {
  EmptyState,
  PageEnter,
  PageHeader,
  ProcessingCard,
  StatusBanner,
} from "@/components/app/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OriginalViewer } from "@/components/prescription/OriginalViewer";
import { extensionFor, type ProcessedPage } from "@/lib/prescription/files";
import {
  downloadOriginal,
  isNotSetUp,
  loadPrescription,
  originalUrl,
  updateDoctorName,
  type SavedPrescription,
} from "@/lib/prescription/store";
import { renderOriginalForReport, saveBlob } from "@/lib/prescription/report";
import { patientName } from "@/lib/report/data";

export const Route = createFileRoute("/_authenticated/prescriptions/$id")({
  head: () => ({
    meta: [{ title: "Saved Prescription — MediSnap" }, { name: "robots", content: "noindex" }],
  }),
  component: SavedPrescriptionPage,
});

const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Prescription Management: the original document and its details. What the AI read from it
// lives in My Medicines, so this page never shows or prints AI text.
function SavedPrescriptionPage() {
  const { id } = Route.useParams();
  const { t, formatDateTime } = useI18n();
  const [rx, setRx] = useState<SavedPrescription | null>(null);
  const [patient, setPatient] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [pages, setPages] = useState<ProcessedPage[] | null>(null);
  const [originalFailed, setOriginalFailed] = useState(false);

  const loadOriginal = useCallback(async (record: SavedPrescription) => {
    setOriginalFailed(false);
    setPages(null);
    try {
      const blob = await downloadOriginal(record);
      setPages(await renderOriginalForReport(blob, record.original_mime));
    } catch {
      setOriginalFailed(true);
    }
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [record, user] = await Promise.all([loadPrescription(id), supabase.auth.getUser()]);
      setPatient(patientName(user.data.user));
      if (!record) return setState("missing");
      setRx(record);
      setState("ready");
      loadOriginal(record);
    } catch {
      setState("failed");
    }
  }, [id, loadOriginal]);

  useEffect(() => {
    load();
  }, [load]);

  // The window opens straight away, in the click, so pop-up blockers allow it.
  async function openOriginal() {
    if (!rx) return;
    const win = window.open("", "_blank");
    try {
      const url = await originalUrl(rx);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      win?.close();
      toast.error(t("rx.original.failed"));
    }
  }

  async function saveOriginal() {
    if (!rx) return;
    try {
      saveBlob(
        await downloadOriginal(rx),
        `prescription-original-${rx.uploaded_at.slice(0, 10)}.${extensionFor(rx.original_mime)}`,
      );
    } catch {
      toast.error(t("rx.original.failed"));
    }
  }

  const back = (
    <Link to="/prescription" className={buttonVariants({ variant: "outline" })}>
      <ArrowLeft className="rtl:rotate-180" aria-hidden="true" /> {t("rx.backToPrescriptions")}
    </Link>
  );

  if (state === "loading") return <ProcessingCard title={t("common.loading")} />;
  if (state === "missing")
    return (
      <EmptyState
        icon={SearchX}
        title={t("rx.missingRecord.title")}
        body={t("rx.missingRecord.body")}
        action={back}
      />
    );
  if (state === "failed" || !rx)
    return (
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
    );

  return (
    <PageEnter className="@container mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        icon={FileText}
        title={t("rx.savedTitle")}
        description={t("rx.savedOn", { date: formatDateTime(new Date(rx.uploaded_at)) })}
        actions={back}
      />

      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-3">
          {pages ? (
            <OriginalViewer pages={pages} onOpenOriginal={openOriginal} />
          ) : originalFailed ? (
            <StatusBanner
              tone="danger"
              title={t("rx.original.failedTitle")}
              action={
                <Button variant="outline" size="sm" onClick={() => loadOriginal(rx)}>
                  <RefreshCcw aria-hidden="true" /> {t("root.tryAgain")}
                </Button>
              }
            >
              {t("rx.original.failed")}
            </StatusBanner>
          ) : (
            <ProcessingCard title={t("rx.original.loading")} />
          )}
          <p className="text-sm text-muted-foreground">{t("rx.original.preserved")}</p>
        </div>

        <div className="space-y-5 @4xl:sticky @4xl:top-6">
          <section aria-labelledby="rx-details" className="panel space-y-4">
            <h2 id="rx-details" className="text-lg font-semibold">
              {t("rx.details")}
            </h2>
            <dl className="space-y-3 text-[0.9375rem]">
              <Detail label={t("rx.detail.uploaded")}>
                {formatDateTime(new Date(rx.uploaded_at))}
              </Detail>
              <Detail label={t("rx.detail.patient")}>
                {patient ?? (
                  <span className="font-normal text-muted-foreground">
                    {t("rx.detail.patientMissing")}
                  </span>
                )}
              </Detail>
              <DoctorName rx={rx} onSaved={(doctor_name) => setRx({ ...rx, doctor_name })} />
              <Detail label={t("rx.detail.file")}>
                {t("rx.detail.fileValue", {
                  type: rx.original_mime === "application/pdf" ? "PDF" : t("rx.list.image"),
                  pages: rx.page_count,
                  size: sizeText(rx.original_size),
                })}
              </Detail>
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button onClick={openOriginal}>
                <ExternalLink aria-hidden="true" /> {t("rx.original.openFile")}
              </Button>
              <Button variant="outline" onClick={saveOriginal}>
                <FileDown aria-hidden="true" /> {t("rx.original.download")}
              </Button>
            </div>
          </section>

          <section aria-labelledby="rx-meds-link" className="panel-tint space-y-3">
            <h2 id="rx-meds-link" className="flex items-center gap-2 font-semibold">
              <Pill className="h-5 w-5 text-primary" aria-hidden="true" /> {t("rx.medsLinkTitle")}
            </h2>
            <p className="text-[0.9375rem] text-muted-foreground">{t("rx.medsLinkBody")}</p>
            <Link
              to="/medicines"
              hash={`rx-${rx.id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pill aria-hidden="true" /> {t("rx.checkMedicines")}
            </Link>
          </section>
        </div>
      </div>
    </PageEnter>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}

/** The doctor's name: typed by the patient, editable, never read by AI. */
function DoctorName({
  rx,
  onSaved,
}: {
  rx: SavedPrescription;
  onSaved: (name: string | null) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const name = rx.doctor_name ?? null;

  async function save() {
    setBusy(true);
    try {
      onSaved(await updateDoctorName(rx.id, value));
      setEditing(false);
      toast.success(t("rx.detail.doctorSaved"));
    } catch (e) {
      toast.error(
        isNotSetUp(e as { code?: string }) || (e as { code?: string })?.code === "42703"
          ? t("rx.detail.doctorNotSetUp")
          : t("rx.detail.doctorFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  if (editing)
    return (
      <div>
        <dt>
          <label htmlFor={inputId} className="text-sm font-semibold text-muted-foreground">
            {t("rx.doctorName")}
          </label>
        </dt>
        <dd className="mt-1 space-y-2">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Input
              id={inputId}
              value={value}
              maxLength={120}
              dir="auto"
              autoFocus
              autoComplete="off"
              aria-describedby={`${inputId}-hint`}
              onChange={(e) => setValue(e.target.value)}
            />
            <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
              {t("rx.doctorNameHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {t("rx.detail.saveDoctor")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                {t("meds.cancel")}
              </Button>
            </div>
          </form>
        </dd>
      </div>
    );

  return (
    <div>
      <dt className="text-sm font-semibold text-muted-foreground">{t("rx.detail.doctor")}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={name ? "font-semibold" : "text-muted-foreground"} data-doctor-name>
          {name ?? t("rx.detail.doctorMissing")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="-ms-2"
          onClick={() => {
            setValue(name ?? "");
            setEditing(true);
          }}
        >
          <PencilLine aria-hidden="true" />
          {name ? t("rx.detail.editDoctor") : t("rx.detail.addDoctor")}
        </Button>
      </dd>
    </div>
  );
}
