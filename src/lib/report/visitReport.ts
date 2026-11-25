// The Doctor Visit Report: a short summary for one appointment, meant to be read in the
// first minute of the visit. The patient's own reason and questions, their current symptoms
// and severity from the last few days of saved diary entries, how long they have been
// recorded, the latest entries, their patient-reported medicines, and space for the
// doctor's notes. Original prescriptions can follow (added by ./build.ts).
//
// Nothing is inferred: symptoms are the patient's own words from saved timelines, severity
// is the pain score they recorded, and "how long" only reaches back as far as the days the
// patient chose to include.
import type { jsPDF as JsPDF } from "jspdf";
import { differenceInCalendarDays } from "date-fns";
import type { ReportMedicine } from "@/lib/medicines";
import { entrySymptoms, visitSnapshot, type Period, type SymptomRow } from "./data";
import { firstStrong, type Pen } from "./pen";
import { INK, Layout, M, MUTED, RULE, TEAL, TEAL_TINT } from "./layout";

export interface VisitReportData {
  patientName: string | null;
  reference: string;
  generatedAt: Date;
  visitDate: Date;
  /** The patient's own words; empty when not given. */
  reason: string;
  questions: string[];
  /** The recent days the summary draws on (see visitWindow). */
  window: Period;
  rows: SymptomRow[];
  /** Confirmed names with the patient's latest record, or null when not included. */
  medicines: ReportMedicine[] | null;
  /** Number of original prescriptions attached after the summary. */
  attachments: number;
}

export function drawVisitReport(doc: JsPDF, data: VisitReportData, pen: Pen) {
  const name = data.patientName;
  const L = new Layout(doc, pen, (l) => {
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, l.W, 2, "F");
    l.set(8, MUTED);
    pen.text(`${l.T.visitTitle}  |  ${pen.printable(name ?? l.T.nameMissing)}  |  ${l.when(data.visitDate, "date")}`, M, 10);
    return 20;
  });
  const T = L.T;
  const ur = pen.lang === "ur";
  const snap = visitSnapshot(data.rows, data.window);
  const body = 10.5; // larger type: quick to read across a desk

  /** A section: a teal marker and heading, no rules (a light, quick-to-scan page). */
  const heading = (title: string, needs = 24) => {
    L.ensure(needs);
    L.y += 5;
    doc.setFillColor(...TEAL);
    doc.rect(pen.boxX(M, 2.2), L.y - 4.2, 2.2, 5.4, "F");
    L.set(12.5, TEAL, "bold");
    pen.text(title, M + 5, L.y);
    L.y += 6.5;
  };

  // ---------- Header ----------------------------------------------------------------------
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, L.W, 4, "F");
  L.set(9, TEAL, "bold");
  pen.text(T.brand, M, 13);
  L.set(8, MUTED);
  pen.text(T.visitSubtitle, L.W - M, 13, { align: "right" });
  L.set(22, INK, "bold");
  pen.text(T.visitTitle, M, 25);
  L.y = 31;
  // Who and when, in one tinted strip.
  const facts: [string, string][] = [
    [T.patient, pen.printable(name ?? T.nameMissing)],
    [T.visitDate, L.when(data.visitDate, "date")],
    [T.preparedOn, L.when(data.generatedAt, "date")],
    [T.reference, data.reference],
  ];
  const fw = L.CW / 4;
  doc.setFillColor(...TEAL_TINT);
  doc.roundedRect(M, L.y, L.CW, 15, 2, 2, "F");
  facts.forEach(([k, v], i) => {
    const x = M + 4 + i * fw;
    L.set(7, MUTED, "bold");
    pen.text(k.toUpperCase(), x, L.y + 5.5);
    L.set(9.5, INK, i < 2 ? "bold" : "normal");
    pen.text(L.lines(v, fw - 6)[0], x, L.y + 11);
  });
  L.y += 19;

  // ---------- Reason for this visit ---------------------------------------------------------
  heading(T.reasonTitle);
  if (data.reason.trim()) L.para(pen.printable(data.reason.trim()), 11.5, INK);
  else L.para(T.reasonNone, body, MUTED);

  // ---------- Current symptoms ----------------------------------------------------------------
  heading(T.currentTitle, 40);
  L.para(T.windowNote(data.window.days), 8.5, MUTED);
  L.y += 1;
  if (snap.latestPain?.pain_level != null) {
    const p = snap.latestPain;
    L.bullet(T.latestPain(p.pain_level!, L.severity(p.pain_level!), L.when(new Date(p.created_at), "dateTime")), INK, body);
    const m = snap.maxPain!;
    if (m.id !== p.id)
      L.bullet(T.highestPain(m.pain_level!, L.severity(m.pain_level!), L.when(new Date(m.created_at), "dateTime")), INK, body);
  } else L.bullet(T.noPainWindow, MUTED, body);
  if (snap.recentSymptoms.length)
    L.bullet(`${T.symptomsNamed} ${snap.recentSymptoms.map((s) => pen.printable(s)).join(L.listSep)}`, INK, body);
  else L.bullet(T.noSymptomsNamed, MUTED, body);

  L.ensure(14);
  L.y += 1.5;
  L.set(10, INK, "bold");
  pen.text(T.durationTitle, M, L.y);
  L.y += 5;
  if (!snap.entries) L.para(T.noEntriesWindow, body, MUTED);
  else {
    if (snap.firstSymptom) {
      const first = new Date(snap.firstSymptom.created_at);
      L.para(T.firstRecorded(L.when(first, "date"), Math.max(0, differenceInCalendarDays(data.visitDate, first))), body);
    }
    L.para(T.entriesOnDays(snap.entries, snap.daysWithEntries, data.window.days), body, MUTED);
  }

  // ---------- Recent diary entries --------------------------------------------------------------
  if (snap.recent.length) {
    heading(T.recentTitle, 30);
    L.table(
      [
        { label: T.colWhen, w: 32 },
        { label: T.colPain, w: 28 },
        { label: T.colSymptoms, w: 56 },
        { label: T.colNotes, w: L.CW - 116 },
      ],
      snap.recent.map((r) => ({
        cells: [
          L.when(new Date(r.created_at), "dateTime"),
          r.pain_level === null ? "-" : `${r.pain_level}/10 ${L.severity(r.pain_level)}`,
          pen.printable(entrySymptoms(r), "-"),
          pen.printable(r.notes, "-"),
        ],
        bold: r.pain_level !== null && r.pain_level >= 7 ? [1] : [],
      })),
      9,
    );
  }

  // ---------- Medicines (patient-reported) --------------------------------------------------------
  heading(T.medicines, 26);
  if (!data.medicines) L.para(T.medsNotIncluded, body, MUTED);
  else if (!data.medicines.length) L.para(T.noMedicines, body, MUTED);
  else {
    L.para(T.medsIntroVisit, 8.5, MUTED);
    const STATUS = { taken: T.taken, not_taken: T.notTaken, not_sure: T.notSure } as const;
    for (const m of data.medicines) {
      const status = m.status ? `${STATUS[m.status]}${m.statusAt ? `${L.listSep}${L.when(m.statusAt, "date")}` : ""}` : T.notRecorded;
      L.bullet(`${pen.printable(m.name, T.nameNotPrintable)}: ${status}`, INK, body);
    }
  }

  // ---------- Questions for the doctor --------------------------------------------------------------
  const questions = data.questions.map((q) => q.trim()).filter(Boolean);
  heading(T.questionsTitle, 30);
  if (questions.length)
    // A question written in English keeps an English full stop after its number, so the
    // whole line reads left to right even in an Urdu report.
    questions.forEach((q, i) =>
      L.para(`${i + 1}${ur && firstStrong(q) !== "L" ? "۔" : "."}  ${pen.printable(q)}`, 11, INK),
    );
  else {
    L.para(T.questionsNone, body, MUTED);
    // Three lines to write on.
    for (let i = 0; i < 3; i++) {
      L.ensure(9);
      L.y += 8;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.3);
      L.hline(M + 4, L.y, L.W - M);
    }
    L.y += 3;
  }

  // ---------- Doctor's notes: the rest of the page, lined -----------------------------------------
  // On this page when there's reasonable room; otherwise a fresh page with a big box.
  const room = L.bottom - 22 - (L.y + 12);
  if (room < 30) L.newPage();
  heading(T.notesTitle, 40);
  L.set(8, MUTED);
  pen.text(T.notesHint, M + 5, L.y - 1.5);
  const top = L.y + 1;
  const height = Math.min(110, Math.max(30, L.bottom - 22 - top));
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, top, L.CW, height, 2, 2, "S");
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  for (let yy = top + 9; yy < top + height - 3; yy += 8) L.hline(M + 4, yy, L.W - M - 4);
  L.y = top + height + 5;

  // ---------- Attachments and the note -----------------------------------------------------------
  if (data.attachments) L.para(T.visitAttached(data.attachments), 9, INK);
  L.y += 1;
  L.para(`${T.noteLabel}: ${T.visitDisclaimer}`, 7.5, MUTED);
}
