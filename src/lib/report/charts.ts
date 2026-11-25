// Charts for MediSnap's PDFs, drawn as vector graphics from saved records only. Every point
// or bar carries its value, so they read in black and white; lines never join across days
// with no entry. Time runs left to right in both languages; only the titles are translated.
import type { jsPDF as JsPDF } from "jspdf";
import { format } from "date-fns";
import type { Pen, ReportLang } from "./pen";
import { segments, type Observation, type Period, type WeekBucket } from "./data";
import { FAINT, INK, MUTED, RULE, VIOLET, one } from "./layout";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** X position on a true time scale across the reporting period. */
function timeX(p: Period, plot: { x: number; w: number }) {
  const t0 = p.start.getTime();
  const span = Math.max(1, p.end.getTime() - t0);
  return (d: Date) => plot.x + ((d.getTime() - t0) / span) * plot.w;
}

function dateTicks(p: Period, lang: ReportLang): { at: Date; label: string }[] {
  if (p.days === 1) {
    return [0, 6, 12, 18, 24].map((h) => {
      const at = new Date(p.start.getTime() + h * 3600_000);
      return { at, label: h === 24 ? "24:00" : `${String(h).padStart(2, "0")}:00` };
    });
  }
  const count = Math.min(p.days, 8);
  const step = (p.days - 1) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(p.start.getTime() + Math.round(i * step) * 86400_000 + 12 * 3600_000);
    // Urdu reports use day/month digits: the chart's tick labels are drawn in Helvetica.
    return { at, label: format(at, lang === "en" ? "d MMM" : "d/M") };
  });
}

function valueAxis(doc: JsPDF, pen: Pen, box: Box, plot: Box, ticks: number[], max: number, axis: string) {
  const yOf = (v: number) => plot.y + plot.h - (v / max) * plot.h;
  pen.set(7.5, MUTED);
  pen.text(axis, box.x, box.y + 2, { mirror: false });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  for (const t of ticks) {
    doc.setDrawColor(...(t === 0 ? MUTED : RULE));
    doc.setLineWidth(t === 0 ? 0.3 : 0.15);
    doc.line(plot.x, yOf(t), plot.x + plot.w, yOf(t));
    doc.text(String(t), plot.x - 2, yOf(t) + 1, { align: "right" });
  }
  return yOf;
}

function timeAxis(doc: JsPDF, pen: Pen, plot: Box, p: Period) {
  const x = timeX(p, plot);
  for (const tk of dateTicks(p, pen.lang)) {
    const xx = Math.min(plot.x + plot.w, Math.max(plot.x, x(tk.at)));
    doc.setDrawColor(...MUTED);
    doc.line(xx, plot.y + plot.h, xx, plot.y + plot.h + 1.2);
    doc.text(tk.label, xx, plot.y + plot.h + 4.5, { align: "center" });
  }
  return x;
}

const valueLabel = (doc: JsPDF, text: string, x: number, y: number) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...INK);
  doc.text(text, x, y, { align: "center" });
};

/** Each reading as a labelled point on a time scale; lines join consecutive days only. */
export function lineChart(
  doc: JsPDF,
  pen: Pen,
  box: Box,
  series: Observation[],
  p: Period,
  opt: { max: number; ticks: number[]; axis: string },
) {
  const plot = { x: box.x + 9, y: box.y + 5, w: box.w - 12, h: box.h - 12 };
  const yOf = valueAxis(doc, pen, box, plot, opt.ticks, opt.max, opt.axis);
  const x = timeAxis(doc, pen, plot, p);
  doc.setDrawColor(...VIOLET);
  doc.setLineWidth(0.6);
  for (const seg of segments(series))
    for (let i = 1; i < seg.length; i++) doc.line(x(seg[i - 1].at), yOf(seg[i - 1].value), x(seg[i].at), yOf(seg[i].value));
  for (const s of series) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...VIOLET);
    doc.setLineWidth(0.5);
    doc.circle(x(s.at), yOf(s.value), 1.1, "FD");
    if (series.length <= 40) valueLabel(doc, String(s.value), x(s.at), yOf(s.value) - 2);
  }
  return box.y + box.h + 3;
}

/** Each night's sleep as a labelled bar on a time scale. */
export function barChart(
  doc: JsPDF,
  pen: Pen,
  box: Box,
  series: Observation[],
  p: Period,
  opt: { max: number; axis: string },
) {
  const plot = { x: box.x + 9, y: box.y + 5, w: box.w - 12, h: box.h - 12 };
  const yOf = valueAxis(doc, pen, box, plot, [0, Math.round(opt.max / 2), opt.max], opt.max, opt.axis);
  const x = timeAxis(doc, pen, plot, p);
  const bw = Math.max(1.2, Math.min(5, plot.w / (p.days * 1.8)));
  for (const s of series) {
    const cx = x(s.at);
    doc.setFillColor(...FAINT);
    doc.setDrawColor(...VIOLET);
    doc.setLineWidth(0.3);
    doc.rect(cx - bw / 2, yOf(s.value), bw, plot.y + plot.h - yOf(s.value), "FD");
    if (series.length <= 40) valueLabel(doc, one(s.value), cx, yOf(s.value) - 1.3);
  }
  return box.y + box.h + 3;
}

/**
 * Average pain per week, one bar per week. Weeks with no pain reading show "-" and no bar,
 * so an empty week never looks like a pain-free one. Each bar is labelled with its average
 * and how many readings it comes from.
 */
export function weeklyChart(
  doc: JsPDF,
  pen: Pen,
  box: Box,
  weeks: WeekBucket[],
  opt: { axis: string; readings: (n: number) => string },
) {
  const plot = { x: box.x + 9, y: box.y + 5, w: box.w - 12, h: box.h - 16 };
  const max = 10;
  const yOf = valueAxis(doc, pen, box, plot, [0, 5, 10], max, opt.axis);
  const slot = plot.w / weeks.length;
  const bw = Math.min(14, slot * 0.6);
  doc.setFont("helvetica", "normal");
  weeks.forEach((w, i) => {
    const cx = plot.x + slot * (i + 0.5);
    if (w.painAvg !== null) {
      doc.setFillColor(...FAINT);
      doc.setDrawColor(...VIOLET);
      doc.setLineWidth(0.3);
      doc.rect(cx - bw / 2, yOf(w.painAvg), bw, plot.y + plot.h - yOf(w.painAvg), "FD");
      valueLabel(doc, one(Math.round(w.painAvg * 10) / 10), cx, yOf(w.painAvg) - 1.3);
    } else {
      valueLabel(doc, "-", cx, plot.y + plot.h - 1.5);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(format(w.start, pen.lang === "en" ? "d MMM" : "d/M"), cx, plot.y + plot.h + 4, { align: "center" });
    if (w.painN) {
      pen.set(6, MUTED);
      pen.text(opt.readings(w.painN), cx, plot.y + plot.h + 7.5, { align: "center", mirror: false });
    }
  });
  return box.y + box.h + 3;
}
