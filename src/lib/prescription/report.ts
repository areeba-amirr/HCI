// The original prescription as a PDF document: the uploaded pages exactly as they are, with
// the upload date, patient and doctor. Used when a prescription is attached to a doctor
// report. Nothing the AI read, and no readability or confidence rating, is ever printed:
// the original is the source document. Built on demand in the browser and never stored.
import type { jsPDF as JsPDF } from "jspdf";
import { renderPdfPages, type ProcessedPage } from "./files";
import type { Pen } from "@/lib/report/pen";
import { REPORT_TEXT, reportDate } from "@/lib/report/reportText";

export interface OriginalDocument {
  pages: ProcessedPage[];
  uploadedAt: Date;
  patientName: string | null;
  doctorName: string | null;
  mime: string;
  size: number;
  sha256: string;
}

const INK: [number, number, number] = [33, 24, 54];
const MUTED: [number, number, number] = [96, 88, 112];
const VIOLET: [number, number, number] = [75, 46, 131];
const RULE: [number, number, number] = [200, 195, 210];

/** Renders the stored original at print resolution, keeping its proportions. */
export async function renderOriginalForReport(file: Blob, mime: string): Promise<ProcessedPage[]> {
  if (mime === "application/pdf") return renderPdfPages(file, 10);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return [
    { dataUrl: canvas.toDataURL("image/jpeg", 0.9), width: canvas.width, height: canvas.height },
  ];
}

/** Footer text and "Page x of y" on pages from..to (y counts the whole PDF). */
export function stampFooters(
  doc: JsPDF,
  pen: Pen,
  from: number,
  to: number,
  label: (page: number) => string,
) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let p = from; p <= to; p++) {
    doc.setPage(p);
    pen.set(8, MUTED);
    pen.text(label(p), 14, H - 8);
    pen.text(REPORT_TEXT[pen.lang].page(p, total), W - 14, H - 8, { align: "right" });
  }
}

/**
 * Draws the original prescription into an existing PDF: a short details block on the first
 * page, then every page of the original, scaled to fit and otherwise untouched. Starts on a
 * new page when the PDF already has content. Footers are added by the caller.
 */
export function drawOriginalDocument(
  doc: JsPDF,
  pen: Pen,
  input: OriginalDocument,
  opts: { newPage: boolean; title: string },
) {
  const T = REPORT_TEXT[pen.lang];
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const bottom = H - 16;

  input.pages.forEach((p, idx) => {
    if (opts.newPage || idx > 0) doc.addPage();
    let top = 14;
    doc.setFillColor(...VIOLET);
    doc.rect(0, 0, W, 2.5, "F");
    if (idx === 0) {
      pen.set(16, INK, "bold");
      pen.text(opts.title, M, 16);
      const rows: [string, string][] = [
        [T.uploaded, reportDate(input.uploadedAt, "dateTimeLong", pen.lang)],
        [T.patient, pen.printable(input.patientName, T.notProvided)],
        [T.doctor, pen.printable(input.doctorName, T.notProvided)],
        [T.file, T.fileKind(input.mime === "application/pdf", input.pages.length)],
      ];
      let y = 24;
      const step = Math.max(5, pen.lineH(9.5) + 1);
      for (const [k, v] of rows) {
        pen.set(9.5, MUTED, "bold");
        pen.text(k, M, y);
        pen.set(9.5, INK);
        pen.text(v, M + 24, y);
        y += step;
      }
      pen.set(8.5, MUTED);
      const note = pen.split(T.originalNote, W - 2 * M);
      note.forEach((l, i) => pen.text(l, M, y + 1 + i * (pen.lineH(8.5) + 0.6)));
      top = y + 4 + note.length * (pen.lineH(8.5) + 0.6);
    } else {
      pen.set(10, VIOLET, "bold");
      pen.text(T.pageOf(opts.title, idx + 1, input.pages.length), M, 11);
      top = 15;
    }
    const boxW = W - 2 * M;
    const boxH = bottom - top;
    const scale = Math.min(boxW / p.width, boxH / p.height);
    const w = p.width * scale;
    const h = p.height * scale;
    doc.addImage(p.dataUrl, "JPEG", M + (boxW - w) / 2, top, w, h, undefined, "FAST");
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.rect(M + (boxW - w) / 2, top, w, h, "S");
  });
}

/** Saves a blob via a temporary link; no new dependency needed. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
