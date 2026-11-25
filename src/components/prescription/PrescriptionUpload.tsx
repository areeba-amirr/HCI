import { useRef, useState } from "react";
import { Camera, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { ProcessingCard, StatusBanner } from "@/components/app/primitives";
import { CameraScanner } from "@/components/app/CameraScanner";
import {
  ACCEPTED_TYPES,
  MAX_FILE_BYTES,
  MAX_PDF_PAGES,
  PrescriptionFileError,
  preparePrescription,
  type FileErrorCode,
  type PreparedPrescription,
} from "@/lib/prescription/files";

export const FILE_ERROR_KEY: Record<FileErrorCode, MessageKey> = {
  unsupported_type: "rx.file.unsupported",
  too_large: "rx.file.tooLarge",
  too_many_pages: "rx.file.tooManyPages",
  pdf_unreadable: "rx.file.pdfUnreadable",
  pdf_protected: "rx.file.pdfProtected",
  image_unreadable: "rx.file.imageUnreadable",
  insecure_context: "rx.file.insecure",
};

/** Accepts a photo or a PDF (up to five pages) and prepares it without changing the original. */
export function PrescriptionUpload({
  onPrepared,
}: {
  onPrepared: (p: PreparedPrescription) => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file?: File | null) {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      onPrepared(await preparePrescription(file));
    } catch (e) {
      const code = e instanceof PrescriptionFileError ? e.code : "pdf_unreadable";
      setError(t(FILE_ERROR_KEY[code], { max: MAX_PDF_PAGES }));
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (preparing)
    return <ProcessingCard title={t("rx.preparing")} detail={t("rx.preparingDetail")} />;

  // The captured photo becomes the original prescription file and goes through exactly the
  // same checks and pipeline as an uploaded one. Nothing is stored until the person saves.
  if (cameraOpen)
    return (
      <CameraScanner
        title={t("camera.titleRx")}
        instructions={t("camera.hintRx")}
        uploadAccept={ACCEPTED_TYPES}
        maxBytes={MAX_FILE_BYTES}
        tooLargeMessage={t("rx.file.tooLarge")}
        onCancel={() => setCameraOpen(false)}
        onUse={(img) => {
          setCameraOpen(false);
          void handle(img.file);
        }}
      />
    );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handle(e.dataTransfer.files?.[0]);
        }}
        data-tour="rx-drop"
        className={`rounded-3xl border-2 border-dashed p-6 text-center transition-colors md:p-10 ${
          dragOver ? "border-primary bg-accent" : "border-input bg-card"
        }`}
      >
        <FileUp className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <p className="mt-3 text-lg font-semibold">{t("prescription.uploadPrompt")}</p>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground">
          {t("rx.uploadHint", { max: MAX_PDF_PAGES })}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => fileRef.current?.click()} data-tour="rx-choose">
            <FileUp aria-hidden="true" /> {t("rx.chooseFile")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setCameraOpen(true)}
            data-tour="rx-camera"
          >
            <Camera aria-hidden="true" /> {t("camera.open")}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="rx-file"
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("rx.photoTip")}</p>
      {error && (
        <StatusBanner tone="danger" title={t("rx.file.errorTitle")}>
          {error}
        </StatusBanner>
      )}
    </div>
  );
}
