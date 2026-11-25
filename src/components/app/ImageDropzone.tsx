import { useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { StatusBanner } from "./primitives";
import { CameraScanner } from "./CameraScanner";

// Matches the server's limit in ai.functions.ts: rejecting here saves an upload that would fail.
const MAX_FILE_BYTES = 11 * 1024 * 1024;

export function ImageDropzone({
  preview,
  onImage,
  onClear,
  prompt,
  hint,
  previewAlt,
  disabled,
  cameraTitle,
  cameraInstructions,
  tour,
}: {
  /** Prefix for guided-tour anchors on the drop area and its buttons. */
  tour?: string;
  preview: string | null;
  onImage: (dataUrl: string) => void;
  onClear: () => void;
  prompt: string;
  hint: string;
  previewAlt: string;
  disabled?: boolean;
  /** Heading and positioning tip shown in the camera view. */
  cameraTitle?: string;
  cameraInstructions?: string;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function readFile(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError(t("scan.chooseImage"));
    if (file.size > MAX_FILE_BYTES) return setError(t("error.imageTooLarge"));
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clear() {
    if (fileRef.current) fileRef.current.value = "";
    setError(null);
    onClear();
  }

  // The camera opens in place of the drop area and closes (camera off) when done.
  if (cameraOpen && !preview)
    return (
      <CameraScanner
        title={cameraTitle ?? t("camera.titleMedicine")}
        instructions={cameraInstructions ?? t("camera.hintMedicine")}
        maxBytes={MAX_FILE_BYTES}
        tooLargeMessage={t("error.imageTooLarge")}
        onCancel={() => setCameraOpen(false)}
        onUse={(img) => {
          setCameraOpen(false);
          setError(null);
          onImage(img.dataUrl);
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
          readFile(e.dataTransfer.files?.[0]);
        }}
        data-tour={tour ? `${tour}-drop` : undefined}
        className={`rounded-3xl border-2 border-dashed p-5 text-center transition-colors md:p-8 ${
          dragOver ? "border-primary bg-accent" : "border-input bg-card"
        }`}
      >
        {preview ? (
          <div className="relative mx-auto w-fit">
            <img
              src={preview}
              alt={previewAlt}
              className="max-h-[42vh] w-auto rounded-2xl object-contain"
            />
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={clear}
                aria-label={t("scan.removePhoto")}
                className="absolute end-2 top-2"
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
        ) : (
          <>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent text-primary">
              <ImagePlus className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="mt-4 text-lg font-semibold">{prompt}</p>
            <p className="mt-1 text-muted-foreground">{hint}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                size="lg"
                onClick={() => fileRef.current?.click()}
                data-tour={tour ? `${tour}-choose` : undefined}
              >
                <ImagePlus aria-hidden="true" /> {t("scan.choosePhoto")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={disabled}
                onClick={() => setCameraOpen(true)}
                data-tour={tour ? `${tour}-camera` : undefined}
              >
                <Camera aria-hidden="true" /> {t("camera.open")}
              </Button>
            </div>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          aria-label={t("scan.choosePhoto")}
          onChange={(e) => readFile(e.target.files?.[0])}
        />
      </div>
      {error && <StatusBanner tone="danger">{error}</StatusBanner>}
    </div>
  );
}
