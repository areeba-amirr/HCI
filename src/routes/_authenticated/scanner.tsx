import { ScanLine as ScanLineIcon } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { readPackaging, scanMedicine } from "@/lib/ai.functions";
import { compareNames } from "@/lib/medicines";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Clock, History, Loader2, NotebookText, Pill, RefreshCcw, Salad, Save, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { EnglishOriginal, Med, MedicalDataNotice } from "@/components/MedicalText";
import {
  ConfirmDialog,
  FlowSteps,
  MedicalField,
  PageEnter,
  PageHeader,
  ProcessingCard,
  StatusBanner,
} from "@/components/app/primitives";
import { ImageDropzone } from "@/components/app/ImageDropzone";
import { ReadAloud } from "@/components/ReadAloud";
import { Button, buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/scanner")({
  head: () => ({
    meta: [
      { title: "Scan Medicine — MediSnap" },
      { name: "description", content: "Upload or photograph a medicine label and get dosage, frequency, warnings and food interactions in Urdu." },
      { property: "og:title", content: "Scan Medicine — MediSnap" },
      { property: "og:description", content: "Upload or photograph a medicine label and get dosage, frequency, warnings and food interactions in Urdu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScannerPage,
});

interface MedResult {
  medicine_name?: string; medicine_name_urdu?: string;
  dosage?: string; dosage_urdu?: string;
  frequency?: string; frequency_urdu?: string;
  instructions?: string; instructions_urdu?: string;
  warnings?: string; warnings_urdu?: string;
  food_interactions?: string; food_interactions_urdu?: string;
  is_dangerous?: boolean;
}

type Unable = "not_packaging" | "unreadable" | "mismatch";

function ScannerPage() {
  const scanFn = useServerFn(scanMedicine);
  const readPkg = useServerFn(readPackaging);
  // Set when the medicine can't be identified reliably: nothing is shown or saved as a result.
  const [unable, setUnable] = useState<Unable | null>(null);
  const { t, tError, language } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<MedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function scan() {
    if (!preview) return;
    setLoading(true); setResult(null); setSaved(false); setError(null); setUnable(null);
    try {
      // The strict packaging reader (prints only what it can read) runs alongside the medicine
      // analysis. The result is shown only when the printed name is readable and agrees with
      // the analysis, and then the printed name is used. Otherwise: "Unable to identify".
      const [pkg, data] = await Promise.all([
        readPkg({ data: { imageBase64: preview } }),
        scanFn({ data: { imageBase64: preview } }),
      ]);
      const name = pkg.fields.name;
      const printed = name.status === "clear" || name.status === "uncertain" ? name.value : null;
      if (!pkg.isPackaging) return setUnable("not_packaging");
      if (!printed) return setUnable("unreadable");
      const match = compareNames(printed, (data as MedResult).medicine_name ?? null);
      if (match === "different" || match === "unknown") return setUnable("mismatch");
      setResult({ ...(data as MedResult), medicine_name: printed });
    } catch (e: any) {
      setError(e.message ? tError(e.message) : t("scanner.failed"));
    } finally { setLoading(false); }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { error } = await supabase.from("scans").insert({
      user_id: u.user.id,
      scan_type: "medicine",
      medicine_name: result.medicine_name,
      medicine_name_urdu: result.medicine_name_urdu,
      dosage: result.dosage,
      dosage_urdu: result.dosage_urdu,
      frequency: result.frequency,
      frequency_urdu: result.frequency_urdu,
      warnings: result.warnings,
      warnings_urdu: result.warnings_urdu,
      food_interactions: result.instructions || result.food_interactions,
      food_interactions_urdu: result.instructions_urdu || result.food_interactions_urdu,
      is_dangerous: !!result.is_dangerous,
    });
    setSaving(false);
    if (error) toast.error(tError(error.message));
    else { setSaved(true); toast.success(t("scanner.saved")); }
  }

  function reset() {
    setPreview(null); setResult(null); setSaved(false); setError(null); setUnable(null);
  }

  const step = saved ? 3 : result ? 2 : preview ? 1 : 0;

  return (
    <PageEnter className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        guide="scanner"
        icon={ScanLineIcon} title={t("scanner.title")} description={t("scanner.subtitle")} />
      <div data-tour="scan-steps">
        <FlowSteps steps={[t("scan.stepPhoto"), t("scan.stepRead"), t("scan.stepSave")]} current={step} />
      </div>

      {!result && !loading && (
        <div className="space-y-4" data-tour="medicine-scan-page">
          <ImageDropzone
            preview={preview}
            onImage={(url) => { setPreview(url); setResult(null); setSaved(false); setError(null); setUnable(null); }}
            onClear={reset}
            prompt={t("scanner.uploadPrompt")}
            hint={t("scanner.dragDrop")}
            previewAlt={t("scanner.previewAlt")}
            tour="scan"
            cameraTitle={t("camera.titleMedicine")}
            cameraInstructions={t("camera.hintMedicine")}
          />
          {!preview && <p className="text-[0.9375rem] text-muted-foreground">{t("scanner.photoTip")}</p>}
          {preview && !unable && (
            <Button size="lg" className="w-full sm:w-auto" onClick={scan}>
              <ScanLine aria-hidden="true" /> {t("scanner.scan")}
            </Button>
          )}
          {unable && (
            <div data-scan-unable={unable}>
              <StatusBanner
                tone="warning"
                title={t("scanner.unableTitle")}
                action={
                  <Button variant="outline" size="sm" onClick={reset}>
                    <RefreshCcw aria-hidden="true" /> {t("scanner.unableRetry")}
                  </Button>
                }
              >
                <p>
                  {unable === "not_packaging"
                    ? t("scanner.unableNotPackaging")
                    : unable === "unreadable"
                      ? t("scanner.unableUnreadable")
                      : t("scanner.unableMismatch")}
                </p>
                <p className="mt-2">{t("scanner.unableNothingSaved")}</p>
              </StatusBanner>
            </div>
          )}
          {error && (
            <StatusBanner
              tone="danger"
              title={t("scanner.failed")}
              action={
                <Button variant="outline" size="sm" onClick={scan}>
                  <RefreshCcw aria-hidden="true" /> {t("root.tryAgain")}
                </Button>
              }
            >
              {error}
            </StatusBanner>
          )}
        </div>
      )}

      {loading && <ProcessingCard title={t("scanner.reading")} detail={t("scanner.readingLong")} />}

      {result && (
        <div className="space-y-4">
          {result.is_dangerous && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-destructive bg-destructive/6 p-5">
              <AlertTriangle className="h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 text-destructive">
                <p className="text-lg font-bold">{t("scanner.highRisk")}</p>
                <EnglishOriginal k="scanner.highRisk" className="text-sm font-bold" />
                <p className="font-semibold">{t("scanner.consultDoctor")}</p>
                <EnglishOriginal k="scanner.consultDoctor" className="text-sm font-semibold" />
                <p className="urdu mt-1 font-semibold">خطرناک دوائی - ڈاکٹر سے ملیں</p>
              </div>
            </div>
          )}

          <section className="panel">
            <p className="text-sm font-semibold text-muted-foreground">{t("scanner.medicine")}</p>
            <h2 className="display mt-1 text-3xl text-primary md:text-4xl">
              {result.medicine_name ? <Med>{result.medicine_name}</Med> : t("scanner.unknown")}
            </h2>
            {result.medicine_name_urdu && <p className="urdu mt-2 text-2xl font-semibold">{result.medicine_name_urdu}</p>}
            <ReadAloud
              className="mt-4"
              text={() => {
                // In Urdu the AI's Urdu wording is read; the medicine name always as printed.
                const pick = (en?: string, ur?: string) => {
                  const ok = (v?: string) => v && v.trim() && !/^(n\/?a|دستیاب نہیں)$/i.test(v.trim());
                  return language === "ur" && ok(ur) ? ur! : ok(en) ? en! : "";
                };
                const line = (label: string, en?: string, ur?: string) => {
                  const v = pick(en, ur);
                  return v ? `${label}: ${v}.` : "";
                };
                return [
                  `${t("scanner.medicine")}: ${result.medicine_name ?? t("scanner.unknown")}.`,
                  line(t("scan.dosage"), result.dosage, result.dosage_urdu),
                  line(t("scan.frequency"), result.frequency, result.frequency_urdu),
                  line(t("scan.instructions"), result.instructions, result.instructions_urdu),
                  line(t("scan.warnings"), result.warnings, result.warnings_urdu),
                  t("scan.verifyNotice"),
                ].filter(Boolean).join(" ");
              }}
            />
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <MedicalField icon={Pill} label={t("scan.dosage")} en={result.dosage} ur={result.dosage_urdu} />
            <MedicalField icon={Clock} label={t("scan.frequency")} en={result.frequency} ur={result.frequency_urdu} />
            <MedicalField icon={NotebookText} label={t("scan.instructions")} en={result.instructions} ur={result.instructions_urdu} />
            <MedicalField icon={Salad} label={t("scanner.foodInteractions")} en={result.food_interactions} ur={result.food_interactions_urdu} />
            <div className="sm:col-span-2">
              <MedicalField icon={AlertTriangle} label={t("scan.warnings")} en={result.warnings} ur={result.warnings_urdu} emphasis />
            </div>
          </div>

          <StatusBanner tone="info">{t("scan.verifyNotice")}</StatusBanner>
          <p className="text-[0.9375rem] text-muted-foreground">{t("scanner.notProof")}</p>
          <MedicalDataNotice />

          {saved ? (
            <StatusBanner
              tone="success"
              title={t("scanner.saved")}
              action={
                <>
                  <Link to="/history" className={buttonVariants({ size: "sm" })}>
                    <History aria-hidden="true" /> {t("dashboard.viewHistory")}
                  </Link>
                  <Button variant="outline" size="sm" onClick={reset}>
                    <RefreshCcw aria-hidden="true" /> {t("scan.again")}
                  </Button>
                </>
              }
            />
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button size="lg" disabled={saving} onClick={save}>
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                {t("scanner.save")}
              </Button>
              <Button size="lg" variant="outline" onClick={() => setConfirmReset(true)}>
                <RefreshCcw aria-hidden="true" /> {t("scan.again")}
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("scan.discardTitle")}
        body={t("scan.discardBody")}
        confirmLabel={t("scan.discardConfirm")}
        cancelLabel={t("scan.discardCancel")}
        onConfirm={reset}
      />
    </PageEnter>
  );
}
