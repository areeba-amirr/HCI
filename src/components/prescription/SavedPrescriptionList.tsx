// Prescription Management: every saved original, newest first. Shows only the original's
// details (upload date, patient, doctor, file). What the AI read lives in My Medicines.
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileDown, FileText, FolderOpen, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBanner } from "@/components/app/primitives";
import { extensionFor } from "@/lib/prescription/files";
import {
  downloadOriginal,
  isNotSetUp,
  listPrescriptions,
  originalUrl,
  type PrescriptionSummary,
} from "@/lib/prescription/store";
import { saveBlob } from "@/lib/prescription/report";
import { patientName } from "@/lib/report/data";

const DATE = { day: "numeric", month: "long", year: "numeric" } as const;

export function SavedPrescriptionList() {
  const { t } = useI18n();
  const [items, setItems] = useState<PrescriptionSummary[] | null>(null);
  const [patient, setPatient] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "not_set_up">("loading");

  async function load() {
    setState("loading");
    try {
      const [list, user] = await Promise.all([listPrescriptions(), supabase.auth.getUser()]);
      setPatient(patientName(user.data.user));
      setItems(list);
      setState("ready");
    } catch (e) {
      setState(isNotSetUp(e as { code?: string }) ? "not_set_up" : "failed");
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Before the prescription database update is applied there is nothing to list.
  if (state === "not_set_up") return null;

  return (
    <section aria-labelledby="rx-list" className="space-y-4" data-rx-list={state} data-tour="rx-saved">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div>
          <h2 id="rx-list" className="display text-2xl">
            {t("rx.list.title")}
          </h2>
          <p className="text-[0.9375rem] text-muted-foreground">{t("rx.list.body")}</p>
        </div>
      </div>
      {state === "loading" ? (
        <p className="text-[0.9375rem] text-muted-foreground">{t("common.loading")}</p>
      ) : state === "failed" ? (
        <StatusBanner
          tone="danger"
          title={t("rx.list.failed")}
          action={
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCcw aria-hidden="true" /> {t("root.tryAgain")}
            </Button>
          }
        />
      ) : items!.length === 0 ? (
        <p className="rounded-2xl bg-secondary p-4 text-[0.9375rem]">{t("rx.list.empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items!.map((rx) => (
            <PrescriptionCard key={rx.id} rx={rx} patient={patient} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PrescriptionCard({ rx, patient }: { rx: PrescriptionSummary; patient: string | null }) {
  const { t, formatDate } = useI18n();
  const [thumb, setThumb] = useState<string | null>(null);
  const isPdf = rx.original_mime === "application/pdf";
  const uploaded = formatDate(new Date(rx.uploaded_at), DATE);

  // Photos get a small preview of the original; PDFs show a document icon.
  useEffect(() => {
    if (isPdf) return;
    let live = true;
    originalUrl(rx).then(
      (u) => live && setThumb(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [rx, isPdf]);

  async function download() {
    try {
      saveBlob(
        await downloadOriginal(rx),
        `prescription-original-${rx.uploaded_at.slice(0, 10)}.${extensionFor(rx.original_mime)}`,
      );
    } catch {
      toast.error(t("rx.original.failed"));
    }
  }

  return (
    <li className="panel flex gap-4 p-4" data-rx-card={rx.id}>
      <div className="grid h-24 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-secondary">
        {thumb ? (
          <img
            src={thumb}
            alt={t("rx.list.thumbAlt", { date: uploaded })}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <FileText className="h-8 w-8 text-primary" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t("rx.list.uploaded", { date: uploaded })}</p>
        <p className="text-[0.9375rem] text-muted-foreground">
          {rx.doctor_name ? t("rx.list.doctor", { name: rx.doctor_name }) : t("rx.list.noDoctor")}
        </p>
        {patient && (
          <p className="text-[0.9375rem] text-muted-foreground">
            {t("rx.list.patient", { name: patient })}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {isPdf ? "PDF" : t("rx.list.image")} · {t("rx.list.pageCount", { count: rx.page_count })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/prescriptions/$id"
            params={{ id: rx.id }}
            className={buttonVariants({ size: "sm" })}
            aria-label={`${t("rx.list.open")}: ${t("rx.list.uploaded", { date: uploaded })}`}
          >
            <FolderOpen aria-hidden="true" /> {t("rx.list.open")}
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={download}
            aria-label={`${t("rx.original.download")}: ${t("rx.list.uploaded", { date: uploaded })}`}
          >
            <FileDown aria-hidden="true" /> {t("rx.original.download")}
          </Button>
        </div>
      </div>
    </li>
  );
}
