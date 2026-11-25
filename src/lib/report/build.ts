// Assembles the three downloads. Each has its own document and its own data:
//   complete       the Complete Doctor Report: the overall health history for a period
//                  (./historyReport.ts), with original prescriptions as appendices
//   visit          the Doctor Visit Report: a short summary for one appointment
//                  (./visitReport.ts), optionally followed by original prescriptions
//   prescriptions  just the original prescriptions, as uploaded
// Prescriptions are always attached as the original pages only: nothing the AI read from
// them is added.
import { format } from "date-fns";
import { drawHistoryReport, type HistoryReportData } from "./historyReport";
import { drawVisitReport, type VisitReportData } from "./visitReport";
import { addUrduFont, createPen, hasArabicScript, type ReportLang } from "./pen";
import { REPORT_TEXT, reportDate } from "./reportText";
import {
  drawOriginalDocument,
  renderOriginalForReport,
  stampFooters,
  type OriginalDocument,
} from "@/lib/prescription/report";
import { downloadOriginal, loadPrescription } from "@/lib/prescription/store";

export type ReportKind = "visit" | "prescriptions" | "complete";

export type ReportInput =
  | { kind: "complete"; history: Omit<HistoryReportData, "appendices">; prescriptions: OriginalDocument[] }
  | { kind: "visit"; visit: Omit<VisitReportData, "attachments">; prescriptions: OriginalDocument[] }
  | { kind: "prescriptions"; prescriptions: OriginalDocument[] };

/** Loads a saved prescription's stored original, ready for the PDF. */
export async function loadPrescriptionDocument(
  id: string,
  patientName: string | null,
): Promise<OriginalDocument> {
  const rx = await loadPrescription(id);
  if (!rx) throw new Error("prescription_missing");
  const pages = await renderOriginalForReport(await downloadOriginal(rx), rx.original_mime);
  return {
    pages,
    uploadedAt: new Date(rx.uploaded_at),
    patientName,
    doctorName: rx.doctor_name ?? null,
    mime: rx.original_mime,
    size: rx.original_size,
    sha256: rx.original_sha256,
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Builds the PDF in English or Urdu. Noto Naskh Arabic is fetched only when it is needed: for
 * an Urdu report, or for an English report that contains Urdu the patient typed. If the font
 * can't be loaded an Urdu report fails (the caller shows an error) rather than printing
 * unreadable text; an English report falls back to a placeholder for the Urdu parts.
 */
export async function buildReport(input: ReportInput, lang: ReportLang = "en"): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const T = REPORT_TEXT[lang];
  const { prescriptions } = input;
  const payload =
    input.kind === "complete" ? input.history : input.kind === "visit" ? input.visit : {};
  const needsFont =
    lang === "ur" ||
    hasArabicScript(
      JSON.stringify(payload) +
        prescriptions.map((p) => `${p.patientName ?? ""}${p.doctorName ?? ""}`).join(""),
    );
  let urduFont = false;
  if (needsFont) {
    try {
      await addUrduFont(doc);
      urduFont = true;
    } catch (e) {
      if (lang === "ur") throw e;
    }
  }
  const pen = createPen(doc, lang, { urduFont, unprintable: T.unprintable });
  const ranges: { from: number; to: number; label: string }[] = [];
  let hasContent = false;

  if (input.kind === "complete") {
    const appendices = prescriptions.map((p, i) => ({ letter: LETTERS[i], uploadedAt: p.uploadedAt }));
    drawHistoryReport(doc, { ...input.history, appendices }, pen);
    ranges.push({ from: 1, to: doc.getNumberOfPages(), label: T.footer(input.history.reference) });
    hasContent = true;
  } else if (input.kind === "visit") {
    drawVisitReport(doc, { ...input.visit, attachments: prescriptions.length }, pen);
    ranges.push({ from: 1, to: doc.getNumberOfPages(), label: T.visitFooter(input.visit.reference) });
    hasContent = true;
  }

  prescriptions.forEach((p, i) => {
    const from = hasContent ? doc.getNumberOfPages() + 1 : 1;
    const appendix = input.kind === "complete";
    const title = appendix ? T.appendixTitle(LETTERS[i]) : T.originalTitle;
    drawOriginalDocument(doc, pen, p, { newPage: hasContent, title });
    hasContent = true;
    ranges.push({
      from,
      to: doc.getNumberOfPages(),
      label: `${appendix ? T.appendixFooter(LETTERS[i], reportDate(p.uploadedAt, "date", lang)) : ""}${T.originalFooter}`,
    });
  });

  for (const r of ranges) stampFooters(doc, pen, r.from, r.to, () => r.label);
  return doc.output("blob");
}

export function reportFileName(kind: ReportKind, start: Date, end: Date, lang: ReportLang = "en") {
  const range = `${format(start, "yyyy-MM-dd")}${+start === +end ? "" : `_to_${format(end, "yyyy-MM-dd")}`}`;
  const what =
    kind === "visit"
      ? "doctor-visit-summary"
      : kind === "prescriptions"
        ? "original-prescriptions"
        : "complete-doctor-report";
  return `medisnap-${what}-${range}${lang === "ur" ? "-urdu" : ""}.pdf`;
}
