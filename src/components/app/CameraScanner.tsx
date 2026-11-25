// One camera for every MediSnap flow (prescription, medicine scan, packaging check). It uses
// the browser's own camera access (getUserMedia): nothing to install. Permission is asked only
// when the person opens it, the camera light goes off as soon as a photo is taken or the view
// closes, and only one camera stream can ever be open at a time.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Check,
  ImagePlus,
  Loader2,
  RefreshCcw,
  SwitchCamera,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Button } from "@/components/ui/button";
import { ReadAloud } from "@/components/ReadAloud";

export interface CapturedImage {
  file: File;
  dataUrl: string;
  source: "camera" | "upload";
}

type CameraError = "insecure" | "unsupported" | "denied" | "not_found" | "in_use" | "failed";
type Phase = "starting" | "live" | "captured" | "error";

const ERROR_UI: Record<CameraError, { title: MessageKey; body: MessageKey }> = {
  insecure: { title: "camera.err.insecureTitle", body: "camera.err.insecureBody" },
  unsupported: { title: "camera.err.unsupportedTitle", body: "camera.err.unsupportedBody" },
  denied: { title: "camera.err.deniedTitle", body: "camera.err.deniedBody" },
  not_found: { title: "camera.err.notFoundTitle", body: "camera.err.notFoundBody" },
  in_use: { title: "camera.err.inUseTitle", body: "camera.err.inUseBody" },
  failed: { title: "camera.err.failedTitle", body: "camera.err.failedBody" },
};

function classify(e: unknown): CameraError {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return "denied";
  if (
    name === "NotFoundError" ||
    name === "OverconstrainedError" ||
    name === "DevicesNotFoundError"
  )
    return "not_found";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError")
    return "in_use";
  return "failed";
}

// Only one stream in the whole app. Starting a camera anywhere stops any other first.
let stopActive: (() => void) | null = null;

export function CameraScanner({
  title,
  instructions,
  onUse,
  onCancel,
  uploadAccept = "image/*",
  maxBytes,
  tooLargeMessage,
}: {
  title: string;
  /** One short line on how to position the item. */
  instructions: string;
  onUse: (image: CapturedImage) => void;
  onCancel: () => void;
  /** File types the "Upload an image instead" fallback accepts. */
  uploadAccept?: string;
  /** Largest allowed image, in bytes, for both the captured photo and an uploaded one. */
  maxBytes: number;
  tooLargeMessage: string;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<CameraError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [shot, setShot] = useState<CapturedImage | null>(null);

  const stop = useCallback(() => {
    const s = streamRef.current;
    streamRef.current = null;
    s?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    if (stopActive === stop) stopActive = null;
  }, []);

  const start = useCallback(
    async (wanted?: string) => {
      const mine = ++generation.current;
      stop();
      stopActive?.();
      setError(null);
      setNotice(null);
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setError("insecure");
        return setPhase("error");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("unsupported");
        return setPhase("error");
      }
      setPhase("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: wanted
            ? { deviceId: { exact: wanted }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
        });
        // Closed, or started again, while the browser was asking: discard this stream.
        if (mine !== generation.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        stopActive = stop;
        const track = stream.getVideoTracks()[0];
        track?.addEventListener("ended", () => {
          if (streamRef.current === stream) {
            setError("in_use");
            setPhase("error");
          }
        });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput",
        );
        if (mine !== generation.current) return;
        setCameras(devices);
        setDeviceId(track?.getSettings().deviceId ?? wanted);
        setPhase("live");
      } catch (e) {
        if (mine !== generation.current) return;
        setError(classify(e));
        setPhase("error");
      }
    },
    [stop],
  );

  // Opened by the person's click, so asking for permission here is in response to it.
  useEffect(() => {
    void start();
    const leave = () => {
      generation.current++;
      stop();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [start, stop]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (blob.size > maxBytes) return setNotice(tooLargeMessage);
        const file = new File(
          [blob],
          `camera-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
          {
            type: "image/jpeg",
          },
        );
        setShot({ file, dataUrl, source: "camera" });
        // The photo is taken: turn the camera off until the person retakes.
        generation.current++;
        stop();
        setPhase("captured");
      },
      "image/jpeg",
      0.92,
    );
  }

  function retake() {
    setShot(null);
    void start(deviceId);
  }

  function switchCamera() {
    if (cameras.length < 2) return;
    const i = cameras.findIndex((c) => c.deviceId === deviceId);
    void start(cameras[(i + 1) % cameras.length].deviceId);
  }

  function uploaded(file?: File | null) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const accepted = uploadAccept
      .split(",")
      .map((a) => a.trim())
      .some((a) => (a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : file.type === a));
    if (!accepted) return setNotice(t("camera.uploadWrongType"));
    if (file.size > maxBytes) return setNotice(tooLargeMessage);
    // Images are previewed before use; other accepted files (a PDF) go straight on.
    if (!file.type.startsWith("image/")) {
      generation.current++;
      stop();
      return onUse({ file, dataUrl: "", source: "upload" });
    }
    const reader = new FileReader();
    reader.onload = () => {
      generation.current++;
      stop();
      setShot({ file, dataUrl: reader.result as string, source: "upload" });
      setPhase("captured");
    };
    reader.readAsDataURL(file);
  }

  function cancel() {
    generation.current++;
    stop();
    onCancel();
  }

  const status =
    phase === "starting"
      ? t("camera.starting")
      : phase === "live"
        ? t("camera.ready")
        : phase === "captured"
          ? t("camera.captured")
          : error
            ? t(ERROR_UI[error].title)
            : "";

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-3xl border-2 border-primary/30 bg-card p-4 md:p-5"
      data-camera={phase}
      data-camera-error={error ?? undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
            <Camera className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> {title}
          </h3>
          <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">{instructions}</p>
          <ReadAloud
            className="mt-2"
            label={t("voice.guidance")}
            text={() => `${title}. ${instructions} ${t("voice.cameraSteps")}`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={cancel}
          aria-label={t("camera.close")}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <div
        className="relative overflow-hidden rounded-2xl bg-[#1d1530]"
        style={{ aspectRatio: "4 / 3" }}
      >
        {/* The live view stays mounted while starting so the stream can attach to it. */}
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label={t("camera.previewLabel")}
          className={`h-full w-full object-contain ${phase === "live" || phase === "starting" ? "" : "hidden"}`}
        />
        {phase === "live" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[8%] rounded-2xl border-2 border-dashed border-white/70"
          />
        )}
        {phase === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-white">
            <span className="flex items-center gap-2 text-[0.9375rem] font-semibold">
              <Loader2
                className="h-5 w-5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              {t("camera.starting")}
            </span>
          </div>
        )}
        {phase === "captured" && shot && (
          <img
            src={shot.dataUrl}
            alt={t("camera.capturedAlt")}
            className="h-full w-full object-contain"
          />
        )}
        {phase === "error" && error && (
          <div className="absolute inset-0 grid place-items-center p-5 text-center text-white">
            <div className="max-w-sm space-y-2">
              <CameraOff className="mx-auto h-8 w-8" aria-hidden="true" />
              <p className="font-semibold">{t(ERROR_UI[error].title)}</p>
              <p className="text-[0.9375rem] text-white/85">{t(ERROR_UI[error].body)}</p>
            </div>
          </div>
        )}
      </div>

      {notice && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/8 px-3 py-2 text-[0.9375rem] text-destructive"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {phase === "live" && (
          <>
            <Button type="button" size="lg" onClick={capture}>
              <Camera aria-hidden="true" /> {t("camera.capture")}
            </Button>
            {cameras.length > 1 && (
              <Button type="button" size="lg" variant="outline" onClick={switchCamera}>
                <SwitchCamera aria-hidden="true" /> {t("camera.switch")}
              </Button>
            )}
          </>
        )}
        {phase === "captured" && shot && (
          <>
            <Button type="button" size="lg" onClick={() => onUse(shot)}>
              <Check aria-hidden="true" /> {t("camera.use")}
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={retake}>
              <RefreshCcw aria-hidden="true" /> {t("camera.retake")}
            </Button>
          </>
        )}
        {phase === "error" && error !== "insecure" && error !== "unsupported" && (
          <Button type="button" size="lg" variant="outline" onClick={() => void start(deviceId)}>
            <RefreshCcw aria-hidden="true" /> {t("root.tryAgain")}
          </Button>
        )}
        {phase !== "captured" && (
          <Button type="button" size="lg" variant="ghost" onClick={() => fileRef.current?.click()}>
            <ImagePlus aria-hidden="true" /> {t("camera.upload")}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={uploadAccept}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-camera-upload
          onChange={(e) => uploaded(e.target.files?.[0])}
        />
      </div>
    </section>
  );
}
