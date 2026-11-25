// Text drawing for MediSnap's PDFs in English (left to right) and Urdu (right to left).
//
// jsPDF's built-in fonts only cover Latin-1, so Urdu (and any Urdu the patient typed into an
// English report) is drawn with Noto Naskh Arabic (SIL Open Font License), fetched from
// /fonts only when a PDF actually needs it. jsPDF shapes the Arabic letters; these options
// make it order mixed Urdu/English/number runs correctly. In an Urdu report every x position
// is mirrored, so layouts written left to right come out right to left. Charts are not
// mirrored: time still runs left to right on their axes.
import type { jsPDF as JsPDF } from "jspdf";

export type ReportLang = "en" | "ur";
type Style = "normal" | "bold";
type Align = "left" | "right" | "center";

const URDU_FONT = "NotoNaskh";
const FONT_FILES: Record<Style, string> = {
  normal: "/fonts/NotoNaskhArabic-Regular.ttf",
  bold: "/fonts/NotoNaskhArabic-Bold.ttf",
};
const BIDI = { isInputVisual: false, isOutputVisual: true, isInputRtl: true, isOutputRtl: false };

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/;
export const hasArabicScript = (s: string) => ARABIC.test(s);

/** True when every character can be drawn: Latin-1 with Helvetica, plus Arabic script with Noto Naskh. */
export function canDraw(text: string, urduFont: boolean) {
  // eslint-disable-next-line no-control-regex
  const ok = urduFont ? /^[\u0000-ÿ–—‘’“”•؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿‌-‏]*$/ : /^[\u0000-ÿ–—‘’“”]*$/;
  return ok.test(text);
}

let fontData: Promise<Record<Style, string>> | null = null;

async function fetchBase64(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font_${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Loads Noto Naskh Arabic into this PDF. The files are fetched once per page visit. */
export async function addUrduFont(doc: JsPDF) {
  fontData ??= Promise.all([fetchBase64(FONT_FILES.normal), fetchBase64(FONT_FILES.bold)])
    .then(([normal, bold]) => ({ normal, bold }))
    .catch((e) => {
      fontData = null; // let a later attempt retry
      throw e;
    });
  const data = await fontData;
  for (const style of ["normal", "bold"] as const) {
    doc.addFileToVFS(`NotoNaskhArabic-${style}.ttf`, data[style]);
    doc.addFont(`NotoNaskhArabic-${style}.ttf`, URDU_FONT, style);
  }
}

const PAIRS: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[" };

/**
 * jsPDF doesn't mirror brackets when it reorders right-to-left text, so "(شدید)" would print
 * as ")شدید(". Brackets inside a Latin run, as in "Paracetamol (500 mg)", are left alone.
 */
export function mirrorBrackets(s: string) {
  const strong = (i: number, step: 1 | -1) => {
    for (let j = i + step; j >= 0 && j < s.length; j += step) {
      if (LATIN_LETTER.test(s[j])) return "L";
      if (ARABIC.test(s[j])) return "R";
    }
    return null;
  };
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!PAIRS[c]) {
      out += c;
      continue;
    }
    const before = strong(i, -1);
    const after = strong(i, 1);
    const latinRun = (before === "L" || before === null) && (after === "L" || after === null);
    out += latinRun ? c : PAIRS[c];
  }
  return out;
}

/** "L" if the first letter is Latin, "R" if it is Arabic script, null if there is none. */
export function firstStrong(s: string): "L" | "R" | null {
  for (const c of s) {
    if (LATIN_LETTER.test(c)) return "L";
    if (ARABIC.test(c)) return "R";
  }
  return null;
}

interface Run {
  text: string;
  urdu: boolean;
}

/**
 * Splits a left-to-right line into Latin and Urdu runs. An Urdu run starts and ends with an
 * Urdu letter and keeps the spaces, digits and punctuation between them.
 */
export function splitRuns(s: string): Run[] {
  const runs: Run[] = [];
  const re = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿](?:[^A-Za-zÀ-ɏ]*[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿])?/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index), urdu: false });
    runs.push({ text: m[0], urdu: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last), urdu: false });
  return runs;
}

export interface Pen {
  lang: ReportLang;
  rtl: boolean;
  /** Sets size, colour and weight for the next text. */
  set: (size: number, color: [number, number, number], style?: Style) => void;
  /** Draws text at a left-to-right x; mirrored in Urdu reports. */
  text: (
    s: string | string[],
    x: number,
    y: number,
    opts?: {
      align?: Align;
      /** false keeps x as given, e.g. inside a chart */
      mirror?: boolean;
      /** The direction of the whole paragraph, for lines wrapped out of it. */
      base?: "L" | "R" | null;
    },
  ) => void;
  /** Wraps text to a width, measured with the font it will be drawn in. */
  split: (s: string, w: number) => string[];
  /** Left edge of a box drawn at x with width w (mirrored in Urdu reports). */
  boxX: (x: number, w: number) => number;
  /** A point's x (mirrored in Urdu reports). */
  x: (x: number) => number;
  /** Line height in mm for a font size: Naskh needs more room than Helvetica. */
  lineH: (size: number) => number;
  /** Replaces text this PDF can't draw (for example Hindi or Chinese) with a note. */
  printable: (s: string | null | undefined, fallback?: string) => string;
}

export function createPen(
  doc: JsPDF,
  lang: ReportLang,
  opts: { urduFont: boolean; unprintable: string },
): Pen {
  const W = doc.internal.pageSize.getWidth();
  const rtl = lang === "ur";
  let style: Style = "normal";
  const useNaskh = (s: string) => opts.urduFont && (rtl || hasArabicScript(s));
  const fontFor = (s: string) => doc.setFont(useNaskh(s) ? URDU_FONT : "helvetica", style);
  const flip = (a: Align): Align => (a === "left" ? "right" : a === "right" ? "left" : a);

  return {
    lang,
    rtl,
    set(size, color, s = "normal") {
      style = s;
      doc.setFont(rtl && opts.urduFont ? URDU_FONT : "helvetica", s);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    },
    text(s, x, y, o = {}) {
      const list = Array.isArray(s) ? s : [s];
      if (!list.length) return;
      const sample = list.join(" ");
      fontFor(sample);
      const align = o.align ?? "left";
      if (rtl && !hasArabicScript(sample)) {
        // Only Latin, digits and punctuation (a medicine name, a reference, a date): drawn left
        // to right as it is, just placed and aligned for the right-to-left page. Reordering
        // it would move its brackets, as in ")Panadol Extra (Paracetamol 500 mg".
        doc.text(list, o.mirror === false ? x : W - x, y, {
          align: o.mirror === false ? align : flip(align),
        });
      } else if (rtl && o.mirror !== false) {
        doc.text(list.map(mirrorBrackets), W - x, y, { align: flip(align), ...BIDI });
      } else if (rtl) {
        doc.text(list.map(mirrorBrackets), x, y, { align, ...BIDI });
      } else if (useNaskh(sample)) {
        // Patient-typed Urdu inside an English report. A line takes its direction from its
        // first letter (as Unicode's bidi rules do): an Urdu-first line is ordered right to
        // left as a whole; an English-first line runs left to right with each Urdu run shaped
        // in place, so "1. 20:30 [Headache] سر میں درد" keeps its English order.
        const lineH = (doc.getFontSize() / doc.internal.scaleFactor) * 1.15;
        list.forEach((line, i) => {
          const yy = y + i * lineH;
          if ((o.base !== undefined ? o.base : firstStrong(line)) === "R") {
            fontFor(line);
            doc.text(mirrorBrackets(line), x, yy, { align, ...BIDI });
            return;
          }
          const runs = splitRuns(line);
          const width = (r: Run) => {
            doc.setFont(r.urdu ? URDU_FONT : "helvetica", style);
            return doc.getTextWidth(r.text);
          };
          const total = runs.reduce((n, r) => n + width(r), 0);
          let cx = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
          for (const r of runs) {
            const w = width(r);
            if (r.urdu) doc.text(mirrorBrackets(r.text), cx, yy, BIDI);
            else doc.text(r.text, cx, yy);
            cx += w;
          }
        });
      } else {
        doc.text(list, x, y, { align });
      }
    },
    split(s, w) {
      fontFor(s);
      return doc.splitTextToSize(s, w) as string[];
    },
    boxX: (x, w) => (rtl ? W - x - w : x),
    x: (x) => (rtl ? W - x : x),
    lineH: (size) => size * (rtl ? 0.5 : 0.42),
    printable(s, fallback = "") {
      if (!s) return fallback;
      return canDraw(s, opts.urduFont) ? s : opts.unprintable;
    },
  };
}
