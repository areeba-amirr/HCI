// The Complete Doctor Report: the patient's overall health history over the chosen period,
// as a multi-section document with trend charts, a week-by-week (or day-by-day) pattern,
// how often symptoms were recorded, the full dated record and the patient's own medicine
// intake record. Original prescriptions follow as appendices (added by ./build.ts).
//
// Everything comes from saved records. A chart is drawn only when there are enough readings
// for one; otherwise the readings are listed, and missing data is said to be missing.
import type { jsPDF as JsPDF } from "jspdf";
import { en } from "@/i18n/messages";
import { ur } from "@/i18n/ur";
import { EMOJI_LABEL, type DIARY_EMOJIS } from "@/lib/diary";
import {
  MIN_TREND_POINTS,
  buckets,
  diaryTimelines,
  entrySymptoms,
  healthOverview,
  symptomFrequency,
  symptomsInPeriod,
  type IntakeSummaryRow,
  type Observation,
  type Period,
  type SymptomRow,
} from "./data";
import type { Pen } from "./pen";
import { barChart, lineChart, weeklyChart } from "./charts";
import { INK, Layout, M, MUTED, RULE, VIOLET, one, periodText } from "./layout";

export interface HistoryReportData {
  patientName: string | null;
  reference: string;
  generatedAt: Date;
  period: Period;
  /** The patient's saved diary rows (filtered to the period here). */
  rows: SymptomRow[];
  /** Patient-reported intake for confirmed names, or null when not included. */
  intake: IntakeSummaryRow[] | null;
  /** Original prescriptions attached as appendices, for the cross-reference. */
  appendices: { letter: string; uploadedAt: Date }[];
}

export function drawHistoryReport(doc: JsPDF, data: HistoryReportData, pen: Pen) {
  const name = data.patientName ?? null;
  const T0 = pen.lang;
  const tags: Record<string, string> = T0 === "ur" ? { ...en, ...ur } : en;
  const period = periodText(data.period, T0);
  const L = new Layout(doc, pen, (l) => {
    l.set(8, MUTED);
    pen.text(`${l.T.historyTitle}  |  ${pen.printable(name ?? l.T.nameMissing)}  |  ${period}`, M, 11);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    l.hline(M, 13.5, l.W - M);
    return 22;
  });
  const T = L.T;
  const rows = symptomsInPeriod(data.rows, data.period);
  const o = healthOverview(data.rows, data.period);
  const diary = diaryTimelines(data.rows, data.period);
  const freq = symptomFrequency(data.rows, data.period);
  const multiDay = data.period.days > 1;
  const stretch = data.period.days <= 14 ? 1 : 7;
  const pattern = multiDay ? buckets(data.rows, data.period, stretch) : [];
  const weekly = data.period.days >= 14 ? buckets(data.rows, data.period, 7) : [];
  const weeklyChartOk = weekly.filter((w) => w.painN > 0).length >= 2;

  // Numbered sections, listed up front so the doctor can find their way.
  const titles = [
    T.secSummary,
    T.secTrends,
    ...(multiDay ? [stretch === 1 ? T.secPatternDay : T.secPatternWeek] : []),
    T.secFrequency,
    T.secRecord,
    T.secIntake,
    ...(data.appendices.length ? [T.attached] : []),
  ];
  let sectionNo = 0;
  const section = (title: string, needs = 30) => {
    L.ensure(needs);
    sectionNo++;
    L.y += 6;
    // A numbered marker, then the title and a full-width rule.
    doc.setFillColor(...VIOLET);
    doc.circle(pen.x(M + 3.2), L.y - 1.4, 3.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(String(sectionNo), pen.x(M + 3.2), L.y - 0.1, { align: "center" });
    L.set(13, VIOLET, "bold");
    pen.text(title, M + 9, L.y);
    L.y += 2.6;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    L.hline(M, L.y, L.W - M);
    L.y += 6;
  };
  const sub = (title: string) => {
    L.ensure(10);
    L.set(10, INK, "bold");
    pen.text(title, M, L.y);
    L.y += 5.5;
  };

  // ---------- Cover band ---------------------------------------------------------------
  doc.setFillColor(...VIOLET);
  doc.rect(0, 0, L.W, 36, "F");
  L.set(9, [233, 225, 251], "bold");
  pen.text(T.brand, M, 11);
  L.set(22, [255, 255, 255], "bold");
  pen.text(T.historyTitle, M, 23);
  L.set(9.5, [233, 225, 251]);
  pen.text(T.historySubtitle, M, 30.5);
  L.y = 44;
  L.infoPanel([
    [T.patient, pen.printable(name ?? T.nameMissing)],
    [T.period, period],
    [T.generated, L.when(data.generatedAt, "dateTime")],
    [T.reference, data.reference],
  ]);
  L.para(T.intro, 8.5, MUTED);
  L.y += 2;
  L.set(8.5, MUTED, "bold");
  L.ensure(8);
  pen.text(`${T.contents}:`, M, L.y);
  L.y += 4.5;
  L.para(titles.map((t, i) => `${i + 1}. ${t}`).join("   "), 8.5, INK);

  // ---------- 1. Health summary ---------------------------------------------------------
  section(T.secSummary);
  L.tiles([
    { label: T.entries, value: String(o.entries), sub: T.entriesSub(o.daysWithEntries, data.period.days) },
    {
      label: T.pain,
      value: o.pain.n === 0 ? T.notRecorded : o.pain.average !== null ? T.avg(one(o.pain.average)) : `${o.pain.single}`,
      sub: o.pain.n === 0 ? T.noPainScores : o.pain.n === 1 ? T.singleReading : T.painRange(o.pain.min!, o.pain.max!, o.pain.n),
      muted: o.pain.n === 0,
    },
    {
      label: T.sleep,
      value: o.sleep.n === 0 ? T.notRecorded : o.sleep.average !== null ? T.avg(one(o.sleep.average)) : one(o.sleep.single!),
      sub: o.sleep.n === 0 ? T.noSleep : o.sleep.n === 1 ? T.singleNight : T.sleepRange(one(o.sleep.min!), one(o.sleep.max!), o.sleep.n),
      muted: o.sleep.n === 0,
    },
    { label: T.highPain, value: o.pain.n ? String(o.highPainDays) : "-", sub: o.pain.n ? T.highPainSub : T.noPain, muted: !o.pain.n },
  ]);
  sub(T.keyObs);
  if (!o.entries) L.bullet(T.noEntries);
  else {
    if (o.mostSevere && o.mostSevere.pain_level !== null) {
      const note = pen.printable(o.mostSevere.notes);
      const short = `${note.slice(0, 160)}${note.length > 160 ? "..." : ""}`;
      L.bullet(
        `${T.highest(o.mostSevere.pain_level, L.severity(o.mostSevere.pain_level), L.when(new Date(o.mostSevere.created_at), "dateTime"))}${note ? T.patientNote(short) : T0 === "ur" ? "۔" : "."}`,
      );
    }
    if (o.change) {
      const d = o.change.secondHalf - o.change.firstHalf;
      L.bullet(
        T.change(
          one(o.change.firstHalf),
          o.change.firstN,
          one(o.change.secondHalf),
          o.change.secondN,
          Math.abs(d) < 0.5 ? T.same : d > 0 ? T.higher(one(Math.abs(d))) : T.lower(one(Math.abs(d))),
        ),
      );
    } else if (multiDay) L.bullet(T.noChange, MUTED);
    const moodText = Object.entries(o.moods)
      .map(([m, n]) => `${pen.printable(m, "-")} ${n}`)
      .join(L.listSep);
    if (moodText) L.bullet(T.moods(moodText));
    const missingDays = data.period.days - o.daysWithEntries;
    if (missingDays > 0 && multiDay) L.bullet(T.missingDays(missingDays, data.period.days), MUTED);
  }

  // ---------- 2. Trends -----------------------------------------------------------------
  section(T.secTrends, 75);
  sub(T.painOverTime);
  if (o.painSeries.length >= MIN_TREND_POINTS) {
    L.y = lineChart(doc, pen, { x: M, y: L.y, w: L.CW, h: 52 }, o.painSeries, data.period, {
      max: 10,
      ticks: [0, 2, 4, 6, 8, 10],
      axis: T.painAxis,
    });
    L.para(T.painChartNote(o.painSeries.length), 8.5, MUTED);
  } else readings(o.painSeries, (v) => `${v}/10 (${L.severity(v)})`, T.painWord);
  if (weeklyChartOk) {
    L.ensure(60);
    L.y += 3;
    sub(T.weeklyTitle);
    L.y = weeklyChart(doc, pen, { x: M, y: L.y, w: L.CW, h: 46 }, weekly, { axis: T.weeklyAxis, readings: T.readingsShort });
    L.para(T.weeklyNote, 8.5, MUTED);
  }
  L.ensure(55);
  L.y += 3;
  sub(T.sleepTitle);
  if (o.sleepSeries.length >= MIN_TREND_POINTS) {
    const max = Math.max(12, Math.ceil(Math.max(...o.sleepSeries.map((s) => s.value))));
    L.y = barChart(doc, pen, { x: M, y: L.y, w: L.CW, h: 40 }, o.sleepSeries, data.period, { max, axis: T.sleepAxis });
    L.para(T.sleepChartNote(o.sleepSeries.length), 8.5, MUTED);
  } else readings(o.sleepSeries, (v) => T.hours(one(v)), T.sleepWord);

  function readings(series: Observation[], show: (v: number) => string, what: string) {
    if (!series.length) return L.para(T.noneRecorded(what), 9.5, MUTED);
    L.para(T.fewReadings(series.length, what, MIN_TREND_POINTS), 9, MUTED);
    L.y += 1;
    const cw = Math.min(55, (L.CW - 6) / 3);
    L.ensure(16);
    series.forEach((s, i) => {
      const x = M + i * (cw + 3);
      doc.setDrawColor(...RULE);
      doc.roundedRect(pen.boxX(x, cw), L.y, cw, 13, 1.5, 1.5, "S");
      L.set(7.5, MUTED);
      pen.text(L.when(s.at, "dateTime"), x + 3, L.y + 4.8);
      L.set(11, INK, "bold");
      pen.text(show(s.value), x + 3, L.y + 10.2);
    });
    L.y += 18;
  }

  // ---------- 3. Week by week / day by day -----------------------------------------------
  if (multiDay) {
    section(stretch === 1 ? T.secPatternDay : T.secPatternWeek, 40);
    L.para(T.patternNote, 8.5, MUTED);
    L.y += 1;
    L.table(
      [
        { label: stretch === 1 ? T.colDay : T.colWeek, w: 38 },
        { label: T.colEntries, w: 22 },
        { label: T.colAvgPain, w: 26 },
        { label: T.colMaxPain, w: 24 },
        { label: T.colAvgSleep, w: 28 },
        { label: T.colHighDays, w: L.CW - 138 },
      ],
      pattern.map((b) => ({
        cells: [
          L.when(b.start, stretch === 1 ? "day" : "date"),
          b.entries ? String(b.entries) : T.noEntriesCell,
          b.painAvg === null ? "-" : `${one(Math.round(b.painAvg * 10) / 10)}/10`,
          b.painMax === null ? "-" : `${b.painMax}/10`,
          b.sleepAvg === null ? "-" : T.hoursShort(one(Math.round(b.sleepAvg * 10) / 10)),
          b.painN ? String(b.highPainDays) : "-",
        ],
        bold: b.painMax !== null && b.painMax >= 7 ? [3] : [],
      })),
    );
  }

  // ---------- 4. How often symptoms were recorded ----------------------------------------
  section(T.secFrequency, 35);
  if (!freq.tags.length) L.para(T.freqNone, 9.5, MUTED);
  else {
    L.para(T.freqIntro, 8.5, MUTED);
    L.y += 1;
    L.table(
      [
        { label: T.colRecordedAs, w: 90 },
        { label: T.colTimes, w: 40 },
        { label: T.colDays, w: L.CW - 130 },
      ],
      freq.tags.map((f) => {
        const key = EMOJI_LABEL[f.emoji as (typeof DIARY_EMOJIS)[number]];
        return { cells: [key ? tags[key] : "-", String(f.entries), String(f.days)] };
      }),
    );
    if (freq.untagged) L.para(T.freqUntagged(freq.untagged), 8.5, MUTED);
  }

  // ---------- 5. Daily record -----------------------------------------------------------
  section(T.secRecord, 40);
  if (!rows.length) L.para(T.noDiary, 9.5, MUTED);
  else {
    const urdu = T0 === "ur";
    L.table(
      urdu
        ? [
            { label: T.colWhen, w: 27 },
            { label: T.colSymptoms, w: 36 },
            { label: T.colPain, w: 21 },
            { label: T.colSleep, w: 19 },
            { label: T.colMood, w: 13 },
            { label: T.colNotes, w: L.CW - 116 },
          ]
        : [
            { label: T.colWhen, w: 27 },
            { label: T.colSymptoms, w: 38 },
            { label: T.colPain, w: 23 },
            { label: T.colSleep, w: 13 },
            { label: T.colMood, w: 14 },
            { label: T.colNotes, w: L.CW - 115 },
          ],
      rows.map((s) => ({
        cells: [
          L.when(new Date(s.created_at), "dateTime"),
          pen.printable(entrySymptoms(s), T.notRecorded),
          s.pain_level === null ? T.notRecorded : `${s.pain_level}/10 ${L.severity(s.pain_level)}`,
          s.sleep_hours === null ? "-" : T.hoursShort(one(Number(s.sleep_hours))),
          pen.printable(s.mood, "-"),
          pen.printable(s.notes, "-"),
        ],
        bold: s.pain_level !== null && s.pain_level >= 7 ? [2] : [],
      })),
    );
    if (diary.length) {
      L.y += 2;
      sub(T.voiceDiary);
      L.para(T.timelinesNote, 8.5, MUTED);
      L.y += 1;
      for (const day of diary) {
        L.ensure(12);
        L.set(9.5, INK, "bold");
        pen.text(L.when(day.at, "day"), M, L.y);
        L.y += 5;
        day.entries.forEach((e, i) => {
          const key = EMOJI_LABEL[e.emoji as (typeof DIARY_EMOJIS)[number]];
          const label = key ? tags[key] : "";
          L.para(`${i + 1}${urdu ? "۔" : "."}  ${e.time ? `${e.time}  ` : ""}${label ? `[${label}]  ` : ""}${pen.printable(e.text)}`, 9, INK, 3);
        });
        L.y += 2;
      }
    }
  }

  // ---------- 6. Medicines: patient-reported intake ---------------------------------------
  section(T.secIntake, 35);
  if (data.intake === null) L.para(T.gapMeds, 9.5, MUTED);
  else if (!data.intake.length) L.para(T.intakeNone, 9.5, MUTED);
  else {
    L.para(T.intakeIntro, 8.5, MUTED);
    L.y += 1;
    const STATUS = { taken: T.taken, not_taken: T.notTaken, not_sure: T.notSure } as const;
    L.table(
      [
        { label: T.colMedicineShort, w: 58 },
        { label: T.taken, w: 22 },
        { label: T.notTaken, w: 24 },
        { label: T.notSure, w: 22 },
        { label: T.colLatest, w: L.CW - 126 },
      ],
      data.intake.map((m) => ({
        cells: [
          pen.printable(m.name, T.nameNotPrintable),
          String(m.taken),
          String(m.notTaken),
          String(m.notSure),
          m.latest ? `${STATUS[m.latest]}, ${L.when(m.latestAt!, "date")}` : T.notRecorded,
        ],
        bold: [0],
      })),
    );
  }

  // ---------- 7. Attached documents, gaps, disclaimer -------------------------------------
  if (data.appendices.length) {
    section(T.attached, 20);
    const list = data.appendices.map((a) => T.appendixRef(a.letter, L.when(a.uploadedAt, "date"))).join(L.listSep);
    L.para(T.attachedText(list, data.appendices.length > 1), 9);
  }
  L.ensure(30);
  L.y += 5;
  sub(T.gaps);
  const gaps: string[] = [];
  if (!data.patientName) gaps.push(T.gapName);
  gaps.push(T.gapAge);
  if (!o.entries) gaps.push(T.gapEntries);
  else if (o.painSeries.length < MIN_TREND_POINTS) gaps.push(T.gapPain(o.painSeries.length));
  if (o.entries && !o.sleepSeries.length) gaps.push(T.gapSleep);
  if (!data.intake) gaps.push(T.gapMeds);
  gaps.forEach((g) => L.bullet(g));
  L.y += 3;
  L.noticeBox(T.important, T.disclaimer);
}
