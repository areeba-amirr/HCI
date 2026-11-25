// Shared building blocks for MediSnap's PDF documents: text that flows across pages, section
// headings, tables whose header repeats and whose rows never split, and tiles. Works in
// English and in right-to-left Urdu (see ./pen.ts). Each document (./historyReport.ts,
// ./visitReport.ts) decides its own structure, data and look; this file has no content.
import type { jsPDF as JsPDF } from "jspdf";
import { firstStrong, type Pen, type ReportLang } from "./pen";
import { REPORT_TEXT, reportDate, type ReportText } from "./reportText";
import { painLabel, type Period } from "./data";

export type RGB = [number, number, number];
export const INK: RGB = [33, 24, 54];
export const MUTED: RGB = [96, 88, 112];
export const FAINT: RGB = [206, 200, 216];
export const RULE: RGB = [226, 221, 233];
export const TINT: RGB = [246, 243, 250];
export const VIOLET: RGB = [75, 46, 131];
export const ALERT: RGB = [169, 55, 24];
export const TEAL: RGB = [16, 98, 104];
export const TEAL_TINT: RGB = [236, 246, 246];

export const M = 16; // page margin, mm

/** A number with at most one decimal. */
export const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function periodText(p: Period, lang: ReportLang = "en") {
  if (p.kind === "daily") return reportDate(p.start, "dayLong", lang);
  return REPORT_TEXT[lang].periodRange(reportDate(p.start, "date", lang), reportDate(p.end, "date", lang), p.days);
}

export class Layout {
  readonly W: number;
  readonly H: number;
  readonly CW: number;
  readonly bottom: number;
  readonly T: ReportText;
  y = 0;

  constructor(
    readonly doc: JsPDF,
    readonly pen: Pen,
    /** Draws the top of every page after the first, and returns where content starts. */
    private readonly pageHeader: (l: Layout) => number,
    bottomMargin = 20,
  ) {
    this.W = doc.internal.pageSize.getWidth();
    this.H = doc.internal.pageSize.getHeight();
    this.CW = this.W - 2 * M;
    this.bottom = this.H - bottomMargin;
    this.T = REPORT_TEXT[pen.lang];
  }

  get lang() {
    return this.pen.lang;
  }
  get listSep() {
    return this.lang === "ur" ? "، " : ", ";
  }
  when(d: Date, style: Parameters<typeof reportDate>[1]) {
    return reportDate(d, style, this.lang);
  }
  severity(v: number) {
    const k = painLabel(v);
    return k === "mild" ? this.T.mild : k === "moderate" ? this.T.moderate : this.T.severe;
  }

  set(size: number, color: RGB = INK, style: "normal" | "bold" = "normal") {
    this.pen.set(size, color, style);
  }
  lines(s: string, w: number) {
    return this.pen.split(s, w);
  }
  lineH(size: number) {
    return this.pen.lineH(size);
  }
  /** A horizontal line between two left-to-right x positions (mirrored in Urdu). */
  hline(x1: number, y: number, x2: number) {
    this.doc.line(this.pen.x(x1), y, this.pen.x(x2), y);
  }
  newPage() {
    this.doc.addPage();
    this.y = this.pageHeader(this);
  }
  ensure(h: number) {
    if (this.y + h > this.bottom) this.newPage();
  }

  para(s: string, size = 9.5, color: RGB = INK, indent = 0) {
    this.set(size, color);
    const base = firstStrong(s);
    for (const l of this.lines(s, this.CW - indent)) {
      this.ensure(this.lineH(size) + 0.8);
      this.set(size, color);
      this.pen.text(l, M + indent, this.y, { base });
      this.y += this.lineH(size) + 0.8;
    }
  }

  bullet(s: string, color: RGB = INK, size = 9.5) {
    this.set(size, color);
    const ls = this.lines(s, this.CW - 5);
    const step = this.lineH(size) + 0.8;
    this.ensure(ls.length * step);
    this.set(size, color);
    this.pen.text("-", M + 1, this.y);
    const base = firstStrong(s);
    ls.forEach((l, i) => this.pen.text(l, M + 5, this.y + i * step, { base }));
    this.y += ls.length * step + 0.6;
  }

  /** A table whose header repeats on every page and whose rows never split. */
  table(
    cols: { label: string; w: number }[],
    rows: { cells: string[]; bold?: number[]; color?: RGB }[],
    size = 8.5,
  ) {
    const { doc, pen } = this;
    const pad = 2;
    const rowStep = this.lineH(size) + 0.6;
    const head = () => {
      this.ensure(9);
      doc.setFillColor(...TINT);
      doc.rect(M, this.y - 4.3, this.CW, 7, "F");
      this.set(8, MUTED, "bold");
      let x = M + pad;
      for (const c of cols) {
        pen.text(c.label.toUpperCase(), x, this.y);
        x += c.w;
      }
      this.y += 7;
    };
    head();
    for (const row of rows) {
      this.set(size);
      const wrapped = row.cells.map((c, i) => this.lines(c, cols[i].w - pad * 2));
      const h = Math.max(...wrapped.map((l) => l.length)) * rowStep + 2.6;
      if (this.y + h > this.bottom) {
        this.newPage();
        head();
      }
      let x = M + pad;
      wrapped.forEach((l, i) => {
        this.set(size, row.color && i === row.cells.length - 1 ? row.color : INK, row.bold?.includes(i) ? "bold" : "normal");
        const base = firstStrong(row.cells[i]);
        l.forEach((line, j) => pen.text(line, x, this.y + j * rowStep, { base }));
        x += cols[i].w;
      });
      this.y += h;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(M, this.y - 3.6, this.W - M, this.y - 3.6);
    }
    this.y += 2;
  }

  /** A row of equal tiles: label, a large value, and a small line under it. */
  tiles(items: { label: string; value: string; sub: string; muted?: boolean }[], height = 21) {
    const { doc, pen } = this;
    const gap = 3;
    const tw = (this.CW - gap * (items.length - 1)) / items.length;
    this.ensure(height + 3);
    items.forEach((it, i) => {
      const x = M + i * (tw + gap);
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.3);
      doc.roundedRect(pen.boxX(x, tw), this.y, tw, height, 1.5, 1.5, "S");
      this.set(7.5, MUTED, "bold");
      pen.text(this.lines(it.label.toUpperCase(), tw - 6)[0], x + 3, this.y + 5.5);
      this.set(it.muted ? 11 : 15, it.muted ? MUTED : INK, "bold");
      pen.text(this.lines(it.value, tw - 6)[0], x + 3, this.y + 12.5);
      this.set(7.5, MUTED);
      pen.text(this.lines(it.sub, tw - 6)[0], x + 3, this.y + 17.5);
    });
    this.y += height + 6;
  }

  /** A shaded box with key/value pairs in two columns. */
  infoPanel(info: [string, string][], boldFirst = true) {
    const { doc, pen } = this;
    const rows = Math.ceil(info.length / 2);
    const h = rows * 10 + 5;
    doc.setFillColor(...TINT);
    doc.setDrawColor(...RULE);
    doc.roundedRect(M, this.y, this.CW, h, 2, 2, "FD");
    info.forEach(([k, v], i) => {
      const x = M + 5 + (i % 2) * (this.CW / 2);
      const yy = this.y + 8 + Math.floor(i / 2) * 10;
      this.set(7.5, MUTED, "bold");
      pen.text(k.toUpperCase(), x, yy - 3.2);
      this.set(10.5, INK, boldFirst && i === 0 ? "bold" : "normal");
      pen.text(this.lines(v, this.CW / 2 - 8)[0], x, yy + 1.6);
    });
    this.y += h + 6;
  }

  /** The closing note in a tinted, outlined box. */
  noticeBox(title: string, body: string, color: RGB = ALERT, fill: RGB = [253, 243, 239]) {
    const { doc, pen } = this;
    this.set(9);
    const dl = this.lines(body, this.CW - 10);
    const step = this.lineH(9) + 0.8;
    const h = dl.length * step + 11;
    this.ensure(h);
    doc.setFillColor(...fill);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, this.y, this.CW, h, 1.5, 1.5, "FD");
    this.set(9.5, color, "bold");
    pen.text(title, M + 5, this.y + 6.5);
    this.set(9, INK);
    const base = firstStrong(body);
    dl.forEach((l, i) => pen.text(l, M + 5, this.y + 11.5 + i * step, { base }));
    this.y += h;
  }
}
