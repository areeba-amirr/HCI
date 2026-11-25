import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
} from "date-fns";
import { CalendarCheck, ChevronLeft, ChevronRight, Mic, Pill } from "lucide-react";
import { gsap, EASE_OUT, MOTION_OK, MOTION_REDUCED, REDUCED_FADE, useGSAP } from "@/lib/motion";
import { useI18n } from "@/i18n/I18nProvider";
import { Med } from "@/components/MedicalText";
import { ScanReviewMarker } from "@/components/prescription/badges";
import { SavedTimeline } from "@/components/diary/SavedTimeline";
import { Button, buttonVariants } from "@/components/ui/button";

// Fill colours always sit beside the pain number, so meaning never rests on colour alone.
export const PAIN_FILL = {
  none: "bg-muted text-muted-foreground",
  good: "bg-[#CFE9DA] text-ink",
  okay: "bg-[#F6E2B3] text-ink",
  bad: "bg-[#F4C4BC] text-ink",
} as const;

function painBand(p: number | null) {
  if (p == null) return PAIN_FILL.none;
  if (p <= 3) return PAIN_FILL.good;
  if (p <= 6) return PAIN_FILL.okay;
  return PAIN_FILL.bad;
}

const MOOD_LABELS = {
  happy: "diary.moodHappy",
  okay: "diary.moodOkay",
  sad: "diary.moodSad",
} as const;
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * The health calendar: symptom diary entries and saved medicines, day by day.
 * Interactive mode adds date selection, keyboard movement and a details panel.
 */
export function HealthCalendar({
  symptoms,
  scans,
  interactive = true,
  sample = false,
}: {
  symptoms: any[];
  scans: any[];
  interactive?: boolean;
  /** Landing-page preview with made-up data: no links into the app. */
  sample?: boolean;
}) {
  const { t, formatDate, dir } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(() => new Date());
  const direction = useRef(0);
  const focusAfterMove = useRef(false);

  const byDay = useMemo(() => {
    const map = new Map<string, { entries: any[]; scans: any[] }>();
    const slot = (k: string) => map.get(k) ?? (map.set(k, { entries: [], scans: [] }), map.get(k)!);
    for (const s of symptoms) slot(dayKey(new Date(s.created_at))).entries.push(s);
    for (const s of scans) slot(dayKey(new Date(s.created_at))).scans.push(s);
    return map;
  }, [symptoms, scans]);

  const days = useMemo(
    () =>
      eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }).map((date) => {
        const info = byDay.get(dayKey(date));
        const entries = info?.entries ?? [];
        const pain = entries.length
          ? entries.reduce((a, b) => a + (b.pain_level || 0), 0) / entries.length
          : null;
        return { date, pain, entries, scans: info?.scans ?? [] };
      }),
    [month, byDay],
  );

  function changeMonth(step: number) {
    direction.current = step;
    setMonth((m) => (step > 0 ? addMonths(m, 1) : subMonths(m, 1)));
  }

  function select(date: Date, moveFocus = false) {
    if (!isSameMonth(date, month)) {
      direction.current = date > month ? 1 : -1;
      setMonth(startOfMonth(date));
    }
    focusAfterMove.current = moveFocus;
    setSelected(date);
  }

  // Arrow keys follow reading direction, so "next day" is leftwards in Urdu and Arabic.
  function onKeyDown(e: React.KeyboardEvent) {
    const forward = dir === "rtl" ? -1 : 1;
    const moves: Record<string, () => Date> = {
      ArrowRight: () => addDays(selected, forward),
      ArrowLeft: () => addDays(selected, -forward),
      ArrowDown: () => addDays(selected, 7),
      ArrowUp: () => addDays(selected, -7),
      Home: () => startOfMonth(selected),
      End: () => endOfMonth(selected),
      PageDown: () => addMonths(selected, 1),
      PageUp: () => addMonths(selected, -1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    select(move(), true);
  }

  useEffect(() => {
    if (!focusAfterMove.current) return;
    focusAfterMove.current = false;
    cellRefs.current.get(dayKey(selected))?.focus();
  }, [selected, month]);

  // Month change: the grid slides in from the side the person moved towards.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const sign = direction.current * (dir === "rtl" ? -1 : 1);
        gsap.from(".cal-days", {
          x: 28 * sign,
          opacity: 0,
          duration: 0.35,
          ease: EASE_OUT,
          clearProps: "all",
        });
        gsap.from(".cal-cell", {
          scale: 0.94,
          opacity: 0,
          duration: 0.3,
          stagger: { each: 0.006 },
          ease: EASE_OUT,
          clearProps: "all",
        });
      });
      mm.add(MOTION_REDUCED, () => {
        gsap.from(".cal-days", { opacity: 0, ...REDUCED_FADE, clearProps: "all" });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [dayKey(month)], revertOnUpdate: true },
  );

  // Selection: the chosen day settles into place and its details rise in.
  useGSAP(
    () => {
      if (!interactive) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          ".cal-cell[aria-pressed=true]",
          { scale: 0.9 },
          { scale: 1, duration: 0.35, ease: "back.out(2)", clearProps: "transform" },
        );
        gsap.from(".cal-detail", {
          y: 10,
          opacity: 0,
          duration: 0.3,
          ease: EASE_OUT,
          clearProps: "all",
        });
      });
      mm.add(MOTION_REDUCED, () => {
        gsap.from(".cal-detail", { opacity: 0, ...REDUCED_FADE, clearProps: "all" });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [dayKey(selected)], revertOnUpdate: true },
  );

  const selectedInfo = byDay.get(dayKey(selected));
  const moodLabel = (m: string) =>
    MOOD_LABELS[m as keyof typeof MOOD_LABELS] ? t(MOOD_LABELS[m as keyof typeof MOOD_LABELS]) : m;
  const statusText = (d: (typeof days)[number]) => {
    const parts = [
      d.pain != null ? t("report.painTitle", { value: d.pain.toFixed(1) }) : t("report.noEntry"),
    ];
    if (d.scans.length)
      parts.push(
        t(d.scans.length === 1 ? "calendar.medsOne" : "calendar.medsMany", {
          count: d.scans.length,
        }),
      );
    return parts.join(", ");
  };

  return (
    <div
      ref={root}
      className={interactive ? "grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}
    >
      <div>
        {/* The tour highlights the month and its days only, not the legend below them. */}
        <div data-tour={interactive ? "calendar-page" : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" aria-live="polite" className="display text-2xl md:text-3xl">
              {formatDate(month, { month: "long", year: "numeric" })}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => changeMonth(-1)}
                aria-label={t("report.previousMonth")}
              >
                <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
              </Button>
              {interactive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => select(new Date(), true)}
                  disabled={isSameMonth(month, new Date()) && isToday(selected)}
                >
                  {t("calendar.today")}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => changeMonth(1)}
                aria-label={t("report.nextMonth")}
              >
                <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-sm font-medium text-muted-foreground sm:gap-2">
            {/* 1 Jan 2023 was a Sunday */}
            {Array.from({ length: 7 }, (_, i) =>
              formatDate(new Date(2023, 0, 1 + i), { weekday: "short" }),
            ).map((d) => (
              <div key={d} className="truncate pb-1">
                {d}
              </div>
            ))}
          </div>
          <div
            className="cal-days grid grid-cols-7 gap-1 sm:gap-2"
            onKeyDown={interactive ? onKeyDown : undefined}
            role={interactive ? "group" : undefined}
            aria-label={interactive ? t("calendar.gridLabel") : undefined}
          >
            {Array.from({ length: startOfMonth(month).getDay() }).map((_, i) => (
              <div key={`pad-${i}`} aria-hidden="true" />
            ))}
            {days.map((d) => {
              const key = dayKey(d.date);
              const isSelected = interactive && isSameDay(d.date, selected);
              const today = isToday(d.date);
              const label = `${formatDate(d.date, { weekday: "long", month: "long", day: "numeric" })}: ${statusText(d)}`;
              const inner = (
                <>
                  <span
                    className={today ? "font-bold underline decoration-2 underline-offset-4" : ""}
                  >
                    {format(d.date, "d")}
                  </span>
                  {d.pain != null && (
                    <span className="hidden text-[0.6875rem] font-bold sm:block">
                      <bdi dir="ltr">{d.pain.toFixed(0)}/10</bdi>
                    </span>
                  )}
                  {/* Spoken after the visible day and score, so the accessible name contains
                    what is on screen (WCAG 2.5.3) and voice control can target it. */}
                  {interactive && <span className="sr-only">{`, ${label}`}</span>}
                  {d.scans.length > 0 && (
                    <span
                      aria-hidden="true"
                      className="cal-dot absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-coral-ink"
                    />
                  )}
                </>
              );
              const base = `cal-cell relative flex min-h-11 flex-col items-center justify-center rounded-xl text-sm sm:h-16 ${painBand(d.pain)}`;
              return interactive ? (
                <button
                  key={key}
                  ref={(el) => {
                    if (el) cellRefs.current.set(key, el);
                    else cellRefs.current.delete(key);
                  }}
                  type="button"
                  aria-pressed={isSelected}
                  data-label={label}
                  tabIndex={
                    isSelected || (!isSameMonth(selected, month) && d.date.getDate() === 1) ? 0 : -1
                  }
                  onClick={() => select(d.date)}
                  className={`${base} press transition-shadow ${
                    isSelected
                      ? "z-10 shadow-[0_0_0_3px_var(--primary),0_10px_24px_-12px_rgb(75_46_131/0.7)]"
                      : "hover:shadow-[0_0_0_2px_var(--lavender)]"
                  }`}
                >
                  {inner}
                </button>
              ) : (
                <div key={key} role="img" aria-label={label} title={statusText(d)} className={base}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>

        <ul
          className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground"
          data-tour={interactive ? "cal-legend" : undefined}
        >
          <li className="flex items-center gap-2">
            <span className={`h-3.5 w-3.5 rounded ${PAIN_FILL.good}`} aria-hidden="true" />{" "}
            {t("report.good")}
          </li>
          <li className="flex items-center gap-2">
            <span className={`h-3.5 w-3.5 rounded ${PAIN_FILL.okay}`} aria-hidden="true" />{" "}
            {t("report.okay")}
          </li>
          <li className="flex items-center gap-2">
            <span className={`h-3.5 w-3.5 rounded ${PAIN_FILL.bad}`} aria-hidden="true" />{" "}
            {t("report.bad")}
          </li>
          <li className="flex items-center gap-2">
            <span className={`h-3.5 w-3.5 rounded ${PAIN_FILL.none}`} aria-hidden="true" />{" "}
            {t("report.noEntry")}
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-coral-ink" aria-hidden="true" />{" "}
            {t("calendar.legendMeds")}
          </li>
        </ul>
        {interactive && (
          <p className="mt-2 hidden text-sm text-muted-foreground md:block">
            {t("calendar.keyboardHint")}
          </p>
        )}
      </div>

      {interactive && (
        <section
          aria-live="polite"
          aria-labelledby="cal-detail-title"
          className="cal-detail panel-tint self-start"
          data-tour="cal-day"
        >
          <h3 id="cal-detail-title" className="display text-2xl">
            {formatDate(selected, { weekday: "long", month: "long", day: "numeric" })}
          </h3>

          {!selectedInfo ? (
            <p className="mt-3 text-muted-foreground">{t("calendar.nothingThisDay")}</p>
          ) : (
            <div className="@container mt-4 space-y-5">
              {selectedInfo.entries.length > 0 && (
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <Mic className="h-4 w-4 text-primary" aria-hidden="true" />{" "}
                    {t("calendar.dayEntries")}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {selectedInfo.entries.map((e, i) => (
                      <li key={e.id ?? i} className="rounded-2xl bg-card p-3">
                        <dl className="grid grid-cols-1 gap-2 text-center @[22rem]:grid-cols-3">
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("report.pain")}</dt>
                            <dd className="font-semibold">
                              <bdi dir="ltr">{e.pain_level}/10</bdi>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {t("dashboard.sleep")}
                            </dt>
                            <dd className="font-semibold">
                              <bdi dir="ltr">{e.sleep_hours}h</bdi>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {t("landing.sampleMood")}
                            </dt>
                            <dd className="font-semibold">{moodLabel(e.mood)}</dd>
                          </div>
                        </dl>
                        {e.notes && (
                          <p className="mt-2 text-[0.9375rem]">
                            <Med>{e.notes}</Med>
                          </p>
                        )}
                        {e.notes_urdu && <p className="urdu mt-1">{e.notes_urdu}</p>}
                        <SavedTimeline value={e.timeline} className="mt-3" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedInfo.scans.length > 0 && (
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <Pill className="h-4 w-4 text-coral-ink" aria-hidden="true" />{" "}
                    {t("calendar.dayMedicines")}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {selectedInfo.scans.map((s, i) => (
                      <li key={s.id ?? i} className="rounded-xl bg-card px-3 py-2">
                        <span className="font-semibold">
                          {s.medicine_name ? <Med>{s.medicine_name}</Med> : t("history.unnamed")}
                        </span>
                        {s.dosage && (
                          <span className="text-muted-foreground">
                            {" "}
                            <Med>{s.dosage}</Med>
                          </span>
                        )}
                        <ScanReviewMarker scan={s} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!sample && isToday(selected) && (
            <Link to="/diary" className={`mt-5 ${buttonVariants({ size: "sm" })}`}>
              <CalendarCheck aria-hidden="true" />
              {selectedInfo?.entries.length ? t("calendar.editToday") : t("calendar.logToday")}
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
