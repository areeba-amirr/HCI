// Everything the Doctor Visit Report says is computed here, once, from saved records only,
// so the on-screen preview and the PDF can never disagree. Nothing is estimated: a value
// that wasn't recorded is reported as missing, and small samples are labelled as such.
import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  isAfter,
  isBefore,
  startOfDay,
} from "date-fns";
import { fromSaved, type TimelineEntry } from "@/lib/diary";
import type { IntakeStatus, MyMedicine } from "@/lib/medicines";

export type PeriodKind = "daily" | "weekly" | "custom";

export interface Period {
  kind: PeriodKind;
  start: Date; // start of the first day
  end: Date; // end of the last day
  days: number;
}

export const MAX_CUSTOM_DAYS = 366;

/** Daily: one day. Weekly: the 7 days ending on the chosen day. Custom: start..end. */
export function makePeriod(kind: PeriodKind, a: Date, b?: Date): Period {
  if (kind === "daily") return { kind, start: startOfDay(a), end: endOfDay(a), days: 1 };
  if (kind === "weekly")
    return { kind, start: startOfDay(addDays(a, -6)), end: endOfDay(a), days: 7 };
  const start = startOfDay(a);
  const end = endOfDay(b ?? a);
  return { kind, start, end, days: differenceInCalendarDays(end, start) + 1 };
}

export type PeriodProblem = "missing" | "reversed" | "future" | "too_long";

/** Catches the date mistakes that would produce a wrong or empty report. */
export function checkPeriod(
  kind: PeriodKind,
  a: Date | null,
  b: Date | null,
  today = new Date(),
): PeriodProblem | null {
  if (!a || (kind === "custom" && !b)) return "missing";
  const last = kind === "custom" ? b! : a;
  if (isAfter(startOfDay(last), startOfDay(today))) return "future";
  if (kind === "custom") {
    if (isBefore(b!, a)) return "reversed";
    if (differenceInCalendarDays(b!, a) + 1 > MAX_CUSTOM_DAYS) return "too_long";
  }
  return null;
}

export const inPeriod = (iso: string, p: Period) => {
  const d = new Date(iso);
  return !isBefore(d, p.start) && !isAfter(d, p.end);
};

// ---- symptoms ------------------------------------------------------------------------
export interface SymptomRow {
  id: string;
  created_at: string;
  pain_level: number | null;
  sleep_hours: number | null;
  mood: string | null;
  notes: string | null;
  notes_urdu?: string | null;
  timeline?: unknown;
}

export interface Observation {
  at: Date;
  value: number;
}

const num = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export interface ValueSummary {
  n: number;
  average: number | null; // only when n >= 2
  min: number | null;
  max: number | null;
  single: number | null; // the value, when there is exactly one
}

function summarise(values: number[]): ValueSummary {
  if (!values.length) return { n: 0, average: null, min: null, max: null, single: null };
  return {
    n: values.length,
    average: values.length >= 2 ? values.reduce((a, b) => a + b, 0) / values.length : null,
    min: Math.min(...values),
    max: Math.max(...values),
    single: values.length === 1 ? values[0] : null,
  };
}

/** Minimum observations before a line chart is drawn instead of individual readings. */
export const MIN_TREND_POINTS = 3;

export interface HealthOverview {
  entries: number;
  daysWithEntries: number;
  pain: ValueSummary;
  sleep: ValueSummary;
  painSeries: Observation[];
  sleepSeries: Observation[];
  mostSevere: SymptomRow | null;
  highPainDays: number; // days with any entry at 7-10
  moods: Record<string, number>;
  /** Average pain in the earlier vs later half of the period, when each half has 2+ entries. */
  change: { firstHalf: number; secondHalf: number; firstN: number; secondN: number } | null;
}

export function healthOverview(rows: SymptomRow[], p: Period): HealthOverview {
  const inside = rows
    .filter((r) => inPeriod(r.created_at, p))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const painSeries = inside
    .map((r) => ({ at: new Date(r.created_at), value: num(r.pain_level) }))
    .filter((o): o is Observation => o.value !== null);
  const sleepSeries = inside
    .map((r) => ({ at: new Date(r.created_at), value: num(r.sleep_hours) }))
    .filter((o): o is Observation => o.value !== null);
  const dayKey = (d: Date) => startOfDay(d).getTime();
  const days = new Set(inside.map((r) => dayKey(new Date(r.created_at))));
  const highDays = new Set(painSeries.filter((o) => o.value >= 7).map((o) => dayKey(o.at)));
  const moods: Record<string, number> = {};
  for (const r of inside) if (r.mood) moods[r.mood] = (moods[r.mood] ?? 0) + 1;
  const mostSevere =
    inside
      .filter((r) => num(r.pain_level) !== null)
      .sort(
        (a, b) =>
          num(b.pain_level)! - num(a.pain_level)! || b.created_at.localeCompare(a.created_at),
      )[0] ?? null;
  const mid = p.start.getTime() + (p.end.getTime() - p.start.getTime()) / 2;
  const first = painSeries.filter((o) => o.at.getTime() < mid).map((o) => o.value);
  const second = painSeries.filter((o) => o.at.getTime() >= mid).map((o) => o.value);
  const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  return {
    entries: inside.length,
    daysWithEntries: days.size,
    pain: summarise(painSeries.map((o) => o.value)),
    sleep: summarise(sleepSeries.map((o) => o.value)),
    painSeries,
    sleepSeries,
    mostSevere,
    highPainDays: highDays.size,
    moods,
    change:
      p.days > 1 && first.length >= 2 && second.length >= 2
        ? {
            firstHalf: avg(first),
            secondHalf: avg(second),
            firstN: first.length,
            secondN: second.length,
          }
        : null,
  };
}

export function symptomsInPeriod(rows: SymptomRow[], p: Period) {
  return rows
    .filter((r) => inPeriod(r.created_at, p))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Saved diary timelines only: drafts never reach the database, so never reach a report. */
export function diaryTimelines(
  rows: SymptomRow[],
  p: Period,
): { at: Date; entries: TimelineEntry[] }[] {
  return symptomsInPeriod(rows, p)
    .map((r) => ({ at: new Date(r.created_at), entries: fromSaved(r.timeline) }))
    .filter((d) => d.entries.length > 0);
}

/**
 * The symptoms a diary entry names: its saved timeline entries, in the patient's order.
 * Entries saved without a timeline have no separate symptom list, so this returns null
 * instead of guessing one from the notes.
 */
export function entrySymptoms(row: SymptomRow): string | null {
  const items = fromSaved(row.timeline)
    .map((e) => e.text.trim())
    .filter(Boolean);
  return items.length ? items.join("; ") : null;
}

/**
 * Chart segments: points are joined only when they fall on the same or consecutive
 * calendar days. A gap means nothing was recorded, so no line is drawn across it.
 */
export function segments(series: Observation[]): Observation[][] {
  const out: Observation[][] = [];
  for (const o of series) {
    const cur = out[out.length - 1];
    const prev = cur?.[cur.length - 1];
    if (prev && differenceInCalendarDays(o.at, prev.at) <= 1) cur.push(o);
    else out.push([o]);
  }
  return out;
}

export function painLabel(v: number) {
  return v <= 3 ? "mild" : v <= 6 ? "moderate" : "severe";
}

// ---- medicines -----------------------------------------------------------------------
// ---- patient identity ----------------------------------------------------------------
/** The profile's display name. Never the email address, never invented. */
export function patientName(
  user: { user_metadata?: Record<string, unknown> } | null | undefined,
): string | null {
  const v = user?.user_metadata?.full_name;
  if (typeof v !== "string") return null;
  const name = v.trim();
  // A name that is actually an email address is treated as missing.
  return name && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name) ? name : null;
}

export function reportReference(now = new Date()) {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(3)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `MSR-${ymd}-${rand.toUpperCase()}`;
}

// ---- patterns over time (Complete Doctor Report) -------------------------------------

/** One stretch of the period (a week, or a single day for short periods). */
export interface WeekBucket {
  start: Date;
  end: Date;
  entries: number;
  painN: number;
  painAvg: number | null;
  painMax: number | null;
  sleepN: number;
  sleepAvg: number | null;
  highPainDays: number;
}

/**
 * Splits the period into consecutive stretches of `size` days (the last may be shorter) and
 * summarises the saved entries in each. Stretches with no entries are kept, so gaps show.
 */
export function buckets(rows: SymptomRow[], p: Period, size: number): WeekBucket[] {
  const inside = symptomsInPeriod(rows, p);
  const out: WeekBucket[] = [];
  for (let s = p.start; !isAfter(s, p.end); s = addDays(s, size)) {
    const e = endOfDay(addDays(s, size - 1));
    const end = isAfter(e, p.end) ? p.end : e;
    const these = inside.filter((r) => {
      const d = new Date(r.created_at);
      return !isBefore(d, s) && !isAfter(d, end);
    });
    const pain = these.map((r) => num(r.pain_level)).filter((v): v is number => v !== null);
    const sleep = these.map((r) => num(r.sleep_hours)).filter((v): v is number => v !== null);
    const highDays = new Set(
      these
        .filter((r) => (num(r.pain_level) ?? 0) >= 7)
        .map((r) => startOfDay(new Date(r.created_at)).getTime()),
    );
    out.push({
      start: s,
      end,
      entries: these.length,
      painN: pain.length,
      painAvg: pain.length ? pain.reduce((a, b) => a + b, 0) / pain.length : null,
      painMax: pain.length ? Math.max(...pain) : null,
      sleepN: sleep.length,
      sleepAvg: sleep.length ? sleep.reduce((a, b) => a + b, 0) / sleep.length : null,
      highPainDays: highDays.size,
    });
  }
  return out;
}

/**
 * How often each symptom was recorded, from the symptom pictures the patient chose for their
 * saved timeline entries. Text the patient wrote is never sorted into symptoms by guessing;
 * entries without a chosen picture are counted separately.
 */
export function symptomFrequency(rows: SymptomRow[], p: Period) {
  const counts = new Map<string, { entries: number; days: Set<number> }>();
  let untagged = 0;
  let total = 0;
  for (const r of symptomsInPeriod(rows, p)) {
    const day = startOfDay(new Date(r.created_at)).getTime();
    for (const e of fromSaved(r.timeline)) {
      if (!e.text.trim() && !e.emoji) continue;
      total++;
      if (!e.emoji) {
        untagged++;
        continue;
      }
      const c = counts.get(e.emoji) ?? { entries: 0, days: new Set<number>() };
      c.entries++;
      c.days.add(day);
      counts.set(e.emoji, c);
    }
  }
  const tags = [...counts.entries()]
    .map(([emoji, c]) => ({ emoji, entries: c.entries, days: c.days.size }))
    .sort((a, b) => b.entries - a.entries || b.days - a.days);
  return { tags, untagged, total };
}

// ---- patient-reported medicine intake -------------------------------------------------

export interface IntakeSummaryRow {
  name: string;
  source: "prescription" | "label";
  taken: number;
  notTaken: number;
  notSure: number;
  /** The patient's latest record up to the end of the period. */
  latest: IntakeStatus | null;
  latestAt: Date | null;
}

/**
 * For each medicine whose name the patient confirmed: how many times in the period they
 * recorded Taken / Not taken / Not sure, and their latest record. Patient-reported only.
 */
export function intakeSummary(medicines: MyMedicine[], p: Period): IntakeSummaryRow[] {
  return medicines
    .filter((m) => m.identity === "confirmed" && m.confirmedName)
    .map((m) => {
      const upToEnd = m.history.filter((h) => !isAfter(new Date(h.recorded_at), p.end));
      const inside = upToEnd.filter((h) => inPeriod(h.recorded_at, p));
      const latest = [...upToEnd].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
      return {
        name: m.confirmedName!,
        source: m.source === "label" ? ("label" as const) : ("prescription" as const),
        taken: inside.filter((h) => h.status === "taken").length,
        notTaken: inside.filter((h) => h.status === "not_taken").length,
        notSure: inside.filter((h) => h.status === "not_sure").length,
        latest: latest?.status ?? null,
        latestAt: latest ? new Date(latest.recorded_at) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- one appointment (Doctor Visit Report) --------------------------------------------

export const VISIT_WINDOWS = [3, 7, 14, 30] as const;

/**
 * The recent days a visit report draws on: the `days` days up to the visit (or up to today,
 * when the appointment is still ahead, since nothing can be recorded in the future).
 */
export function visitWindow(visitDate: Date, days: number, today = new Date()): Period {
  const last = isAfter(startOfDay(visitDate), startOfDay(today)) ? today : visitDate;
  const end = endOfDay(last);
  const start = startOfDay(addDays(last, -(days - 1)));
  return { kind: "custom", start, end, days };
}

export interface VisitSnapshot {
  entries: number;
  daysWithEntries: number;
  /** The most recent entry with a pain score. */
  latestPain: SymptomRow | null;
  /** The highest pain score in the window (latest if tied). */
  maxPain: SymptomRow | null;
  /** The first entry in the window that recorded pain or a symptom. */
  firstSymptom: SymptomRow | null;
  /** Symptoms named in the most recent saved timelines, in the patient's words. */
  recentSymptoms: string[];
  /** The latest entries, newest first. */
  recent: SymptomRow[];
}

export function visitSnapshot(rows: SymptomRow[], window: Period, recentCount = 5): VisitSnapshot {
  const inside = symptomsInPeriod(rows, window);
  const withPain = inside.filter((r) => num(r.pain_level) !== null);
  const hasSymptom = (r: SymptomRow) =>
    (num(r.pain_level) ?? 0) > 0 || fromSaved(r.timeline).some((e) => e.text.trim());
  const newest = [...inside].reverse();
  const seen = new Set<string>();
  const recentSymptoms: string[] = [];
  for (const r of newest.slice(0, 3))
    for (const e of fromSaved(r.timeline)) {
      const text = e.text.trim();
      if (text && !seen.has(text.toLowerCase()) && recentSymptoms.length < 8) {
        seen.add(text.toLowerCase());
        recentSymptoms.push(text);
      }
    }
  return {
    entries: inside.length,
    daysWithEntries: new Set(inside.map((r) => startOfDay(new Date(r.created_at)).getTime())).size,
    latestPain: withPain[withPain.length - 1] ?? null,
    maxPain:
      [...withPain].sort(
        (a, b) => num(b.pain_level)! - num(a.pain_level)! || b.created_at.localeCompare(a.created_at),
      )[0] ?? null,
    firstSymptom: inside.find(hasSymptom) ?? null,
    recentSymptoms,
    recent: newest.slice(0, recentCount),
  };
}
