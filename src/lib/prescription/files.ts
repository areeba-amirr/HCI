// Browser-side handling of an uploaded prescription. The original File is never modified:
// everything sent to the AI or drawn in the report is a separate, processed copy.

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // matches the storage bucket limit
export const MAX_PDF_PAGES = 5;
const AI_MAX_EDGE = 2000; // longest side of the copy sent to the AI
const PDF_RENDER_WIDTH = 1600;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ACCEPTED_TYPES = [...IMAGE_TYPES, "application/pdf"].join(",");

export type FileErrorCode =
  | "unsupported_type"
  | "too_large"
  | "too_many_pages"
  | "pdf_unreadable"
  | "pdf_protected"
  | "image_unreadable"
  | "insecure_context";

export class PrescriptionFileError extends Error {
  constructor(public code: FileErrorCode) {
    super(code);
  }
}

export interface ProcessedPage {
  /** JPEG data URL of the processed copy. */
  dataUrl: string;
  width: number;
  height: number;
}

export type QualityIssue = "low_resolution" | "blurry" | "too_dark" | "too_bright" | "low_contrast";

export interface PageQuality {
  page: number;
  issues: QualityIssue[];
  /** Raw measurements, kept so the checks can be explained and tuned. */
  metrics: { shortEdge: number; brightness: number; contrast: number; sharpness: number };
}

export interface PreparedPrescription {
  original: File;
  mime: string;
  sha256: string;
  pages: ProcessedPage[];
  quality: PageQuality[];
}

export function validateFile(file: File) {
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (![...IMAGE_TYPES, "application/pdf"].includes(mime))
    throw new PrescriptionFileError("unsupported_type");
  if (file.size > MAX_FILE_BYTES) throw new PrescriptionFileError("too_large");
  return mime;
}

/** Fingerprint of the untouched original, stored so it can later be shown to be unchanged. */
export async function sha256Hex(file: Blob) {
  if (!globalThis.crypto?.subtle) throw new PrescriptionFileError("insecure_context");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function canvasToPage(canvas: HTMLCanvasElement): ProcessedPage {
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.88),
    width: canvas.width,
    height: canvas.height,
  };
}

async function processImage(file: File): Promise<{ page: ProcessedPage; source: ImageBitmap }> {
  let bitmap: ImageBitmap;
  try {
    // Applies the photo's EXIF rotation, so a sideways phone photo comes out upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PrescriptionFileError("image_unreadable");
  }
  const scale = Math.min(1, AI_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { page: canvasToPage(canvas), source: bitmap };
}

/** PDF.js is loaded only here, the first time someone actually chooses a PDF. */
async function loadPdfJs() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Renders each PDF page to an image. The original PDF bytes are only read, never changed. */
export async function renderPdfPages(
  file: Blob,
  maxPages = MAX_PDF_PAGES,
): Promise<ProcessedPage[]> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    const name = (e as { name?: string })?.name;
    throw new PrescriptionFileError(
      name === "PasswordException" ? "pdf_protected" : "pdf_unreadable",
    );
  }
  try {
    if (doc.numPages > maxPages) throw new PrescriptionFileError("too_many_pages");
    const pages: ProcessedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_RENDER_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; // PDFs are often transparent; JPEG needs a background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport }).promise;
      pages.push(canvasToPage(canvas));
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/**
 * Simple, explainable image checks on a downscaled greyscale copy: brightness, contrast,
 * and sharpness (variance of a Laplacian filter). They are heuristics that can be wrong,
 * so the app treats them as advice, and the AI's own judgement decides what is shown.
 */
async function assessQuality(
  page: ProcessedPage,
  sourceShortEdge: number,
  index: number,
): Promise<PageQuality> {
  const img = new Image();
  img.src = page.dataUrl;
  await img.decode();
  const size = 512;
  const scale = Math.min(1, size / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const grey = new Float32Array(w * h);
  let sum = 0;
  let white = 0;
  for (let i = 0; i < w * h; i++) {
    const v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    grey[i] = v;
    sum += v;
    if (v >= 250) white++;
  }
  const mean = sum / grey.length;
  let sq = 0;
  for (const v of grey) sq += (v - mean) ** 2;
  const contrast = Math.sqrt(sq / grey.length);
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - 1] + grey[i + 1] + grey[i - w] + grey[i + w] - 4 * grey[i];
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const sharpness = n ? lapSq / n - (lapSum / n) ** 2 : 0;
  const issues: QualityIssue[] = [];
  if (sourceShortEdge < 700) issues.push("low_resolution");
  // A prescription is mostly paper, so a high average brightness is normal. "Too bright"
  // means washed out: nearly everything is blown to white and the writing has faded.
  const tooBright = white / grey.length > 0.9 && contrast < 20;
  const tooDark = mean < 70;
  if (sharpness < 40) issues.push("blurry");
  if (tooDark) issues.push("too_dark");
  if (tooBright) issues.push("too_bright");
  if (contrast < 18 && !tooBright && !tooDark) issues.push("low_contrast");
  return {
    page: index + 1,
    issues,
    metrics: {
      shortEdge: Math.round(sourceShortEdge),
      brightness: Math.round(mean),
      contrast: Math.round(contrast),
      sharpness: Math.round(sharpness),
    },
  };
}

export async function preparePrescription(file: File): Promise<PreparedPrescription> {
  const mime = validateFile(file);
  const sha256 = await sha256Hex(file);
  let pages: ProcessedPage[];
  let shortEdges: number[];
  if (mime === "application/pdf") {
    pages = await renderPdfPages(file);
    shortEdges = pages.map((p) => Math.min(p.width, p.height));
  } else {
    const { page, source } = await processImage(file);
    pages = [page];
    shortEdges = [Math.min(source.width, source.height)];
    source.close();
  }
  const quality = await Promise.all(pages.map((p, i) => assessQuality(p, shortEdges[i], i)));
  return { original: file, mime, sha256, pages, quality };
}

export function extensionFor(mime: string) {
  return (
    (
      {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
        "application/pdf": "pdf",
      } as Record<string, string>
    )[mime] ?? "bin"
  );
}
