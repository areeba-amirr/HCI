// The guided tour: a welcome for first-time users, then short chapters that teach each
// feature on its real controls, with a pause between chapters ("Continue" or "Stop here").
// Each page's "How to use this page" button plays just that page's chapters.
//
// The page behind the tour is made inert, so nothing in it (scans, uploads, recordings,
// saves) can be triggered while the tour is open. Result screens that only exist after real
// use are shown as small labelled examples inside the card, never as records.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  FileBarChart,
  FileText,
  Loader2,
  NotebookPen,
  PartyPopper,
  Pill,
  ScanLine,
  ShieldCheck,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { gsap } from "@/lib/motion";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Button } from "@/components/ui/button";
import { ReadAloud } from "@/components/ReadAloud";
import { dismissTip as saveDismissedTip, readTips, readTour, saveTour, type TourRecord } from "@/lib/onboarding";
import {
  CHAPTERS,
  FULL_TOUR,
  buildStops,
  pageChapters,
  stopId,
  type ChapterId,
  type Stop,
} from "./steps";
import { setTourReveal } from "./reveal";
import { TourExample } from "./examples";

type Mode = "idle" | "welcome" | "tour" | "done";
type Phase = "finding" | "shown" | "missing" | "center";

interface Run {
  stops: Stop[];
  /** "full": every chapter, with pauses between them. "page": one page's chapters. */
  kind: "full" | "page";
  index: number;
}

interface TourApi {
  record: TourRecord | null;
  /** A tour or the welcome is on screen. */
  active: boolean;
  /** Starts the full tour, at a step id ("chapter.step") or a chapter. */
  startFull: (from?: string) => void;
  /** Plays one page's chapters ("How to use this page"). */
  startPage: (chapter: ChapterId) => void;
  tips: string[];
  dismissTip: (id: string) => void;
}

const TourContext = createContext<TourApi>({
  record: null,
  active: false,
  startFull: () => {},
  startPage: () => {},
  tips: [],
  dismissTip: () => {},
});
export const useTour = () => useContext(TourContext);

const PAD = 8; // space between the element and the spotlight edge
const GAP = 30; // space between the spotlight and the card: room for the pointer arrow
const EDGE = 16; // minimum distance from the viewport edge
const FIND_TIMEOUT = 7000;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Index in the full tour where a step id (or a chapter's first step) is. */
function fullIndexOf(from: string | undefined) {
  if (!from) return 0;
  const exact = FULL_TOUR.findIndex((s) => stopId(s) === from);
  if (exact >= 0) return exact;
  const chapter = FULL_TOUR.findIndex((s) => s.kind === "step" && s.chapter.id === from);
  return Math.max(0, chapter);
}

export function TourProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const navigate = useNavigate();
  const { t, choosingLanguage } = useI18n();
  const [record, setRecord] = useState<TourRecord | null>(() => readTour(user));
  const [tips, setTips] = useState<string[]>(() => readTips(user));
  const [mode, setMode] = useState<Mode>("idle");
  const [run, setRun] = useState<Run | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const recordRef = useRef(record);
  recordRef.current = record;

  // The welcome appears once per user: only when no tour record exists at all, and only
  // after the first-launch language choice, so it opens in the language they picked.
  useEffect(() => {
    const existing = readTour(user);
    setRecord(existing);
    setTips(readTips(user));
    if (existing || choosingLanguage) return;
    const timer = window.setTimeout(() => setMode((m) => (m === "idle" ? "welcome" : m)), 700);
    return () => window.clearTimeout(timer);
  }, [user.id, choosingLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(
    (next: Partial<Omit<TourRecord, "version" | "updatedAt">>) => {
      const base = recordRef.current;
      const merged = {
        status: next.status ?? base?.status ?? "paused",
        step: next.step ?? base?.step ?? 0,
        stepId: next.stepId ?? base?.stepId,
        chapters: next.chapters ?? base?.chapters ?? [],
      };
      const optimistic: TourRecord = { ...merged, version: 2, updatedAt: new Date().toISOString() };
      recordRef.current = optimistic;
      setRecord(optimistic);
      void saveTour(user.id, merged).then((saved) => {
        if (recordRef.current?.updatedAt === optimistic.updatedAt) setRecord(saved);
      });
    },
    [user.id],
  );

  const finishChapters = useCallback(
    (ids: ChapterId[], status?: TourRecord["status"]) => {
      const done = new Set(recordRef.current?.chapters ?? []);
      ids.forEach((id) => done.add(id));
      persist({ chapters: [...done], ...(status ? { status } : {}) });
    },
    [persist],
  );

  const begin = useCallback((next: Run) => {
    returnFocus.current = (document.activeElement as HTMLElement) ?? null;
    setRun(next);
    setMode("tour");
  }, []);

  const startFull = useCallback(
    (from?: string) => {
      const index = fullIndexOf(from);
      begin({ stops: FULL_TOUR, kind: "full", index });
      // Recorded straight away, so a closed tab never brings the welcome back.
      persist({ status: "paused", step: index, stepId: stopId(FULL_TOUR[index]) });
    },
    [begin, persist],
  );

  const startPage = useCallback(
    (chapter: ChapterId) => begin({ stops: buildStops(pageChapters(chapter), false), kind: "page", index: 0 }),
    [begin],
  );

  const restoreFocus = () =>
    requestAnimationFrame(() => {
      const back = returnFocus.current;
      if (back && back.isConnected) back.focus();
      else document.querySelector<HTMLElement>("main h1")?.focus?.();
    });

  /** Closes the tour. In the full tour, where it stopped is saved for "Resume". */
  const close = useCallback(
    (status: "paused" | "skipped", index: number) => {
      setTourReveal(null);
      if (run?.kind === "full") {
        const at = Math.min(index, FULL_TOUR.length - 1);
        persist({ status, step: at, stepId: stopId(FULL_TOUR[at]) });
      }
      setMode("idle");
      setRun(null);
      restoreFocus();
    },
    [persist, run?.kind],
  );

  const dismissTip = useCallback(
    (id: string) => {
      setTips((list) => [...new Set([...list, id])]);
      void saveDismissedTip(user, id).then(setTips);
    },
    [user],
  );

  const api = useMemo(
    () => ({ record, active: mode !== "idle", startFull, startPage, tips, dismissTip }),
    [record, mode, startFull, startPage, tips, dismissTip],
  );

  // While anything of the tour is open, the app behind it can't be clicked or tabbed into.
  useEffect(() => {
    const shell = document.getElementById("app-shell");
    if (!shell) return;
    if (mode === "idle") shell.removeAttribute("inert");
    else shell.setAttribute("inert", "");
    return () => shell.removeAttribute("inert");
  }, [mode]);

  return (
    <TourContext.Provider value={api}>
      {children}
      {mode === "welcome" &&
        createPortal(
          <CenterCard
            kind="welcome"
            onPrimary={() => startFull()}
            onExplore={() => {
              persist({ status: "skipped", step: 0 });
              setMode("idle");
              toast(t("guide.exploreToast"));
            }}
            onSecondary={() => {
              persist({ status: "skipped", step: 0 });
              setMode("idle");
            }}
          />,
          document.body,
        )}
      {mode === "tour" &&
        run &&
        createPortal(
          <TourOverlay
            key={`${run.kind}-${run.stops.length}`}
            stops={run.stops}
            kind={run.kind}
            index={run.index}
            onIndex={(i) => setRun((r) => (r ? { ...r, index: i } : r))}
            navigate={(to) => navigate({ to })}
            onExit={(i) => close("paused", i)}
            onSkip={(i) => close("skipped", i)}
            onChapterDone={(id) => finishChapters([id])}
            onFinish={() => {
              setTourReveal(null);
              if (run.kind === "full") {
                finishChapters(
                  CHAPTERS.map((c) => c.id),
                  "completed",
                );
                setRun(null);
                setMode("done");
              } else {
                finishChapters(run.stops.flatMap((s) => (s.kind === "step" ? [s.chapter.id] : [])));
                setRun(null);
                setMode("idle");
                toast.success(t("guide.pageDone"));
                restoreFocus();
              }
            }}
          />,
          document.body,
        )}
      {mode === "done" &&
        createPortal(
          <CenterCard
            kind="done"
            onPrimary={() => {
              setMode("idle");
              navigate({ to: "/dashboard" });
            }}
          />,
          document.body,
        )}
    </TourContext.Provider>
  );
}

/** Keeps Tab inside a dialog while it is open. */
function trapTab(e: React.KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== "Tab" || !root) return;
  const items = [...root.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// ---------------------------------------------------------------------------------------
/** What MediSnap helps with, shown on the welcome screen. */
const WELCOME_ITEMS: [LucideIcon, MessageKey][] = [
  [FileText, "guide.welcome.item.rx"],
  [Pill, "guide.welcome.item.understand"],
  [CheckCircle2, "guide.welcome.item.track"],
  [NotebookPen, "guide.welcome.item.symptoms"],
  [ArrowLeftRight, "guide.welcome.item.interactions"],
  [ShieldCheck, "guide.welcome.item.records"],
  [FileBarChart, "guide.welcome.item.report"],
];

function CenterCard({
  kind,
  onPrimary,
  onSecondary,
  onExplore,
}: {
  kind: "welcome" | "done";
  onPrimary: () => void;
  onSecondary?: () => void;
  onExplore?: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    primary.current?.focus();
    const card = ref.current;
    if (!card) return;
    const ctx = gsap.context(() => {
      // The closing screen follows the tour, which already dims the page: no second fade.
      if (kind === "welcome")
        gsap.from("[data-backdrop]", { opacity: 0, duration: 0.2, ease: "power1.out" });
      if (reducedMotion()) gsap.from(card, { opacity: 0, duration: 0.15 });
      else {
        gsap.from(card, { opacity: 0, y: 14, scale: 0.97, duration: 0.32, ease: "power3.out" });
        gsap.from("[data-card-item]", {
          opacity: 0,
          y: 8,
          duration: 0.3,
          stagger: 0.04,
          delay: 0.08,
          ease: "power2.out",
        });
      }
    }, card.parentElement ?? card);
    return () => ctx.revert();
  }, [kind]);

  const welcome = kind === "welcome";
  return (
    // Centred, but scrollable from the very top when taller than the screen (long Urdu text,
    // short laptop screens): a centred grid would cut off its top instead.
    <div className="fixed inset-0 z-[90] overflow-y-auto">
      <div data-backdrop className="fixed inset-0 bg-[rgb(24_13_44/0.55)]" aria-hidden="true" />
      <div className="relative flex min-h-full items-center justify-center p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-card-title"
        aria-describedby="tour-card-body"
        data-tour-center={kind}
        onKeyDown={(e) => {
          trapTab(e, ref.current);
          if (e.key === "Escape") (onSecondary ?? onPrimary)();
        }}
        className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-border bg-card text-center shadow-[0_30px_80px_-30px_rgb(54_33_95/0.6)]"
      >
        <div className="bg-[linear-gradient(160deg,#F1EBFC_0%,#FBFAFE_70%)] px-6 pb-4 pt-6 sm:px-8">
          <span
            data-card-item
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[linear-gradient(145deg,#5A3A96,#4B2E83)] text-primary-foreground shadow-[0_14px_30px_-14px_rgb(75_46_131/0.9)]"
          >
            {welcome ? (
              <Compass className="h-8 w-8" aria-hidden="true" />
            ) : (
              <PartyPopper className="h-8 w-8" aria-hidden="true" />
            )}
          </span>
          <h2 id="tour-card-title" data-card-item className="display mt-3 text-3xl">
            {welcome ? t("guide.welcome.title") : t("tour.doneTitle")}
          </h2>
          <p
            id="tour-card-body"
            data-card-item
            className="mx-auto mt-2 max-w-sm text-[1.0625rem] text-muted-foreground"
          >
            {welcome ? t("guide.welcome.body") : t("guide.doneBody")}
          </p>
          {welcome && (
            <ul data-card-item className="mx-auto mt-3 grid max-w-sm gap-1.5 text-start">
              {WELCOME_ITEMS.map(([Icon, key]) => (
                <li key={key} className="flex items-center gap-3 text-[0.9375rem]">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div data-card-item className="flex flex-col gap-2 px-6 pb-5 pt-4 sm:px-8">
          {welcome && (
            <p className="text-sm text-muted-foreground">
              {t("guide.welcome.meta", { n: CHAPTERS.length })}
            </p>
          )}
          <Button ref={primary} size="lg" className="w-full" onClick={onPrimary}>
            {welcome ? (
              <>
                <Compass aria-hidden="true" /> {t("guide.welcome.start")}
              </>
            ) : (
              <>
                <Check aria-hidden="true" /> {t("tour.explore")}
              </>
            )}
          </Button>
          {onExplore && (
            <Button size="lg" variant="outline" className="w-full" onClick={onExplore}>
              {t("guide.welcome.explore")}
            </Button>
          )}
          {onSecondary && (
            <Button size="lg" variant="ghost" className="w-full" onClick={onSecondary}>
              {t("tour.skip")}
            </Button>
          )}
          {welcome && <p className="text-sm text-muted-foreground">{t("guide.welcome.replay")}</p>}
        </div>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// The step overlay.
//
// One card and one spotlight for the whole run. On Next or Back the card's text fades, then
// the spotlight and the card glide together to the next control (across pages when needed),
// and the new text fades in once both have arrived. Most steps of a chapter are on the same
// page, so moving between them needs no page load.
//
// Placement follows one rule, in this order, so the card keeps the same relation to every
// control:
//   1. Phones (under 640px): a bottom sheet, with the control scrolled to sit above it. A
//      control fixed at the bottom of the screen (the phone menu) gets the sheet at the top.
//   2. Below the control, scrolled just enough for both to fit.
//   3. Beside it (end side only) on wide screens, when it is too tall for the card below.
//   4. Above it, if neither fits.
//   5. Docked to whichever screen edge covers less of it.
// While a step is open the side it chose is kept as long as it still fits, so scrolling or a
// resize never makes the card hop. A pointer arrow in the gap joins the card to the control.
//
// Geometry is read once per frame and written straight to the elements, so following a
// moving control never re-renders React.

const CARD_W = 384; // card width on tablet and desktop, px
const SHEET_MAX = 640; // below this width the card is a bottom sheet
const SIDE_MIN = 1024; // side placement only on screens at least this wide
const MOVE = 0.5; // glide between steps, seconds

// Space kept clear at the top: the phone header is sticky (below 768px); from 768px up
// the sidebar replaces it, so only a small margin is needed.
const topSafe = () => (window.innerWidth < 768 ? 84 : 24);
const isSheet = () => typeof window !== "undefined" && window.innerWidth < SHEET_MAX;
const viewport = () => ({ vw: document.documentElement.clientWidth, vh: window.innerHeight });
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(lo, v), Math.max(lo, hi));

type Box = { x: number; y: number; w: number; h: number };
type Side = "bottom" | "top" | "end" | "start" | "dock" | "center" | "sheet" | "sheetTop";
/** `clip`: the spotlight ends here (a control too tall for the screen, card underneath). */
type Plan = { side: Side; x: number; y: number; arrow: number; clip?: number };

/** The part of the control the spotlight shows for a plan. */
const shownHole = (h: Box | null, p: Plan): Box | null =>
  h && p.clip != null ? { ...h, h: Math.max(0, p.clip - h.y) } : h;

/** The spotlight: the element's own box, padded, kept inside the viewport. */
function holeOf(r: DOMRect, vw: number, vh: number): Box {
  const x = Math.max(4, r.left - PAD);
  const y = Math.max(4, r.top - PAD);
  const right = Math.min(vw - 4, r.right + PAD);
  const bottom = Math.min(vh - 4, r.bottom + PAD);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

/** Where the card goes for a spotlight box. `prefer` keeps the current side while it fits. */
function planCard(
  hole: Box | null,
  cw: number,
  ch: number,
  rtl: boolean,
  sheet: boolean,
  prefer: Side | null,
  pin = false,
): Plan {
  const { vw, vh } = viewport();
  if (sheet) {
    const sheetTop = vh - ch;
    // A control fixed at the bottom of the screen (the phone menu) can't scroll above the
    // sheet, so the sheet moves to the top instead.
    if (pin && hole && hole.y + hole.h > sheetTop - 8 && hole.y > vh / 2)
      return { side: "sheetTop", x: 0, y: 0, arrow: 0 };
    // Taller than the space above the sheet: the spotlight shows the part above it.
    if (hole && hole.y + hole.h > sheetTop - 6 && hole.y < sheetTop - 96)
      return { side: "sheet", x: 0, y: 0, arrow: 0, clip: sheetTop - 10 };
    return { side: "sheet", x: 0, y: 0, arrow: 0 };
  }
  const clampX = (x: number) => clamp(x, EDGE, vw - cw - EDGE);
  const clampY = (y: number) => clamp(y, EDGE, vh - ch - EDGE);
  if (!hole) return { side: "center", x: (vw - cw) / 2, y: clampY((vh - ch) / 2), arrow: 0 };

  const wide = hole.w >= cw;
  const x = clampX(wide ? (rtl ? hole.x + hole.w - cw : hole.x) : hole.x + hole.w / 2 - cw / 2);
  // Under a wide control the pointer sits near the card's leading corner; under a narrow
  // one it points at the control's centre.
  const arrowX = wide ? (rtl ? cw - 40 : 40) : clamp(hole.x + hole.w / 2 - x, 28, cw - 28);

  const options: Plan[] = [];
  const below = hole.y + hole.h + GAP;
  if (below + ch <= vh - EDGE + 1) options.push({ side: "bottom", x, y: below, arrow: arrowX });
  if (vw >= SIDE_MIN) {
    const y = clampY(hole.y);
    const arrow = clamp(hole.y + Math.min(hole.h / 2, 44) - y, 28, ch - 28);
    const right = hole.x + hole.w + GAP;
    const left = hole.x - GAP - cw;
    const rightOk = right + cw <= vw - EDGE;
    const leftOk = left >= EDGE;
    if (rtl ? leftOk : rightOk) options.push({ side: "end", x: rtl ? left : right, y, arrow });
  }
  const above = hole.y - GAP - ch;
  if (above >= EDGE - 1) options.push({ side: "top", x, y: above, arrow: arrowX });
  // Last resort before covering the control: the start side (over the navigation). Only
  // when nothing else fits, so steps don't flip from side to side.
  if (vw >= 768) {
    const y = clampY(hole.y + hole.h / 2 - ch / 2);
    const arrow = clamp(hole.y + hole.h / 2 - y, 28, ch - 28);
    const left = hole.x - GAP - cw;
    const right = hole.x + hole.w + GAP;
    if (rtl ? right + cw <= vw - EDGE : left >= EDGE)
      options.push({ side: "start", x: rtl ? right : left, y, arrow });
  }

  const pick = options.find((o) => o.side === prefer) ?? options[0];
  if (pick) return pick;
  // Too tall for the screen with the card anywhere around it: the card keeps its place
  // under the control at the bottom edge, and the spotlight shows the part above it, so
  // the card never covers what is highlighted.
  const low = vh - EDGE - ch;
  if (low - GAP - hole.y >= 96) return { side: "bottom", x, y: low, arrow: arrowX, clip: low - GAP };
  const coverAtBottom = Math.max(0, hole.y + hole.h - (vh - EDGE - ch));
  const coverAtTop = Math.max(0, EDGE + ch - hole.y);
  return { side: "dock", x, y: coverAtBottom <= coverAtTop ? vh - EDGE - ch : EDGE, arrow: 0 };
}

/**
 * The pointer arrow: a short line with a head, in the gap between the card and the control,
 * pointing at the control. Hidden when the card is docked or centred (nothing to point at).
 */
function placePointer(el: SVGSVGElement | null, hole: Box | null, p: Plan, c: HTMLElement | null) {
  if (!el) return;
  const hide = () => {
    el.dataset.dir = "none";
  };
  if (!hole || !c) return hide();
  const { vh } = viewport();
  const ch = c.offsetHeight;
  const cw = c.offsetWidth;
  let dir: "up" | "down" | "left" | "right";
  let x: number;
  let y: number;
  let len: number;
  if (p.side === "bottom" && p.clip == null) {
    dir = "up";
    x = p.x + p.arrow;
    y = hole.y + hole.h + 3; // tip
    len = p.y - 3 - y;
  } else if (p.side === "top") {
    dir = "down";
    x = p.x + p.arrow;
    y = hole.y - 3;
    len = y - (p.y + ch + 3);
  } else if (p.side === "end" || p.side === "start") {
    const rtl = p.x < hole.x; // card on the left of the control
    dir = rtl ? "right" : "left";
    y = p.y + p.arrow;
    x = rtl ? hole.x - 3 : hole.x + hole.w + 3;
    len = rtl ? x - (p.x + cw + 3) : p.x - 3 - x;
  } else if (p.side === "sheet") {
    dir = "up";
    x = clamp(hole.x + hole.w / 2, 24, document.documentElement.clientWidth - 24);
    y = hole.y + hole.h + 4;
    len = Math.min(44, vh - ch - 6 - y);
  } else if (p.side === "sheetTop") {
    dir = "down";
    x = clamp(hole.x + hole.w / 2, 24, document.documentElement.clientWidth - 24);
    y = hole.y - 4;
    len = Math.min(44, y - (ch + 8 + 6));
  } else return hide();
  if (len < 14) return hide();
  const W = 24;
  const vertical = dir === "up" || dir === "down";
  el.setAttribute("width", String(vertical ? W : len));
  el.setAttribute("height", String(vertical ? len : W));
  el.setAttribute("viewBox", `0 0 ${vertical ? W : len} ${vertical ? len : W}`);
  const m = W / 2;
  const d =
    dir === "up"
      ? `M${m} ${len - 1}V3M${m - 6} 9L${m} 2L${m + 6} 9`
      : dir === "down"
        ? `M${m} 1V${len - 3}M${m - 6} ${len - 9}L${m} ${len - 2}L${m + 6} ${len - 9}`
        : dir === "left"
          ? `M${len - 1} ${m}H3M9 ${m - 6}L2 ${m}L9 ${m + 6}`
          : `M1 ${m}H${len - 3}M${len - 9} ${m - 6}L${len - 2} ${m}L${len - 9} ${m + 6}`;
  el.querySelector("path")?.setAttribute("d", d);
  const left = vertical ? x - m : dir === "left" ? x : x - len;
  const top = vertical ? (dir === "up" ? y : y - len) : y - m;
  el.style.transform = `translate(${left}px, ${top}px)`;
  el.dataset.dir = dir;
}

/** Replays the pointer's short entrance (draw, then two small nudges toward the control). */
function animatePointer(el: SVGSVGElement | null) {
  if (!el || reducedMotion()) return;
  el.removeAttribute("data-anim");
  void el.getBoundingClientRect(); // restart the CSS animation
  el.setAttribute("data-anim", "");
}

/** True when the element can't be scrolled into place (the sidebar, the phone menu). */
function pinned(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const pos = getComputedStyle(n).position;
    if (pos === "fixed" || pos === "sticky") return true;
  }
  return false;
}

function TourOverlay({
  stops,
  kind,
  index,
  onIndex,
  navigate,
  onExit,
  onSkip,
  onFinish,
  onChapterDone,
}: {
  stops: Stop[];
  kind: "full" | "page";
  index: number;
  onIndex: (i: number) => void;
  navigate: (to: string) => void;
  onExit: (index: number) => void;
  onSkip: (index: number) => void;
  onFinish: () => void;
  onChapterDone: (id: ChapterId) => void;
}) {
  const { t, dir } = useI18n();
  const rtl = dir === "rtl";
  const stop = stops[index];
  const total = stops.length;
  const [phase, setPhase] = useState<Phase>("finding");
  // The step the current phase belongs to. On the render where the step number changes,
  // the phase still describes the previous step; nothing may act on it until this matches.
  const [readyFor, setReadyFor] = useState(-1);
  const [slow, setSlow] = useState(false);
  const [variant, setVariant] = useState(0);
  const [retry, setRetry] = useState(0);
  const [sheet, setSheet] = useState(isSheet);
  const [started, setStarted] = useState(false); // the card has appeared at least once
  const [announce, setAnnounce] = useState("");

  const target = useRef<HTMLElement | null>(null);
  const radius = useRef(20);
  const spot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const pulse = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pointer = useRef<SVGSVGElement>(null);
  const rail = useRef<HTMLSpanElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const plan = useRef<Plan | null>(null);
  const hole = useRef<Box | null>(null);
  const pinnedRef = useRef(false); // the control is fixed/sticky (can't be scrolled into place)
  const moving = useRef(false); // a glide is running; the follow loop waits for it
  const busy = useRef(false); // leaving a step or closing; ignore further presses
  const arrivedFor = useRef(-1); // the step whose card is on screen
  const direction = useRef<1 | -1>(1); // which way the last move went (for skipped steps)
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const live = useRef({ rtl, sheet });
  live.current = { rtl, sheet };

  const progress = stop.kind === "step" ? stop.n / stop.count : 1;
  const items = () => content.current?.querySelectorAll<HTMLElement>("[data-tour-item]") ?? [];
  const spotTo = (h: Box | null) => {
    if (h) return { x: h.x, y: h.y, width: h.w, height: h.h, borderRadius: radius.current };
    // No control: the hole closes to a point in the middle, so the whole page stays dimmed.
    const { vw, vh } = viewport();
    return { x: vw / 2, y: vh / 2, width: 0, height: 0, borderRadius: 20 };
  };
  const cardTo = (p: Plan) => {
    if (p.side === "sheet") return { x: 0, y: 0 };
    if (p.side === "sheetTop") {
      const ch = card.current?.offsetHeight ?? 0;
      return { x: 0, y: -(viewport().vh - ch - 8) };
    }
    return { x: p.x, y: p.y };
  };

  // Mount: dim the page with the hole closed, keep the card hidden until its first control
  // is ready, and give the page room below so any control can scroll above the card.
  useLayoutEffect(() => {
    const { vw, vh } = viewport();
    gsap.set(card.current, { autoAlpha: 0 });
    gsap.set(items(), { autoAlpha: 0 });
    gsap.set(spot.current, { x: vw / 2, y: vh / 2, width: 0, height: 0, opacity: 0 });
    gsap.set([ring.current, pulse.current], { opacity: 0 });
    gsap.set(rail.current, { scaleX: progress });
    gsap.to(spot.current, { opacity: 1, duration: reducedMotion() ? 0.15 : 0.25, ease: "power1.out" });
    document.documentElement.classList.add("tour-sheet-space");
    // Focus stays in the tour. Anything else taking it (a menu the tour opened to show it,
    // for example) hands it straight back, so screen readers never announce the page behind.
    const keepFocus = (e: FocusEvent) => {
      const c = card.current;
      if (!c || c.contains(e.target as Node)) return;
      (nextBtn.current ?? c).focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keepFocus);
    const els = [spot.current, ring.current, pulse.current, card.current, rail.current, ...items()];
    return () => {
      document.removeEventListener("focusin", keepFocus);
      document.documentElement.classList.remove("tour-sheet-space");
      timeline.current?.kill();
      gsap.killTweensOf(els.filter(Boolean));
      setTourReveal(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress through the chapter fills as the step changes (transform only).
  useLayoutEffect(() => {
    gsap.to(rail.current, {
      scaleX: progress,
      duration: reducedMotion() ? 0 : 0.45,
      ease: "power2.inOut",
      overwrite: true,
    });
  }, [progress]);

  /**
   * How far to scroll so the control sits below the header with the card under it (or the
   * sheet below it on phones). Just enough, and never past the control's top.
   */
  const scrollNeeded = (r: DOMRect, el: HTMLElement) => {
    if (pinned(el)) return 0;
    const { vh } = viewport();
    const ch = card.current?.offsetHeight ?? 240;
    const top = r.top - PAD;
    const bottom = r.bottom + PAD;
    const fit = (room: number, safe: number) => {
      if (top < safe) return top - safe;
      const over = bottom - room + 2; // a little past the boundary: positions are fractional
      return over <= 0 ? 0 : Math.min(over, top - safe);
    };
    if (isSheet()) return fit(vh - ch - 12 - 40, topSafe()); // 40: room for the pointer
    const needed = bottom - top + GAP + ch + EDGE;
    if (needed <= vh - topSafe()) return fit(vh - EDGE - GAP - ch, topSafe());
    const tight = window.innerWidth < 768 ? topSafe() : 8;
    if (needed <= vh - tight) return fit(vh - EDGE - GAP - ch, tight);
    // Still too tall. With room beside it, show the whole control (the card goes beside);
    // otherwise bring its top up, so the card sits under the part that fits.
    const { vw } = viewport();
    const cw = card.current?.offsetWidth ?? CARD_W;
    const besideOk =
      vw >= SIDE_MIN &&
      (live.current.rtl ? r.left - PAD - GAP - cw >= EDGE : r.right + PAD + GAP + cw <= vw - EDGE);
    return besideOk ? fit(vh - EDGE, topSafe()) : top - topSafe();
  };

  /** Moves on from a step that doesn't apply (its controls aren't on this page). */
  const skipStep = () => {
    const to = index + direction.current;
    if (to >= total) return finish();
    if (to < 0) {
      direction.current = 1;
      return onIndex(index + 1);
    }
    onIndex(to);
  };

  // 1. Go to the step's page, open what it reveals, wait for its exact control to be
  //    rendered and settled, and scroll only if the control and the card can't both be seen.
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    const began = performance.now();
    let stableFor = 0;
    let last = "";
    let attempts = 0;
    let settledAt: number | null = null;
    setPhase("finding");
    setSlow(false);
    target.current = null;

    if (stop.kind === "break") {
      // Between chapters: no control, the card sits in the middle.
      setTourReveal(null);
      onChapterDone(stop.done.id);
      setVariant(0);
      setPhase("center");
      setReadyFor(index);
      return;
    }

    const { chapter, step } = stop;
    const navigated = window.location.pathname !== chapter.route;
    if (navigated) navigate(chapter.route);
    setTourReveal(step.reveal ?? null);
    // After a page change (or opening a menu) give late content a moment before deciding a
    // control isn't there; on the same page, a quick check is enough.
    const settleMs = navigated || step.reveal ? 700 : 160;
    const slowTimer = window.setTimeout(() => setSlow(true), 450);

    const find = () => {
      for (const [i, c] of step.targets.entries()) {
        const root =
          c.scope === "doc"
            ? document
            : c.scope === "shell"
              ? document.getElementById("app-shell")
              : document.querySelector("main");
        if (!root) continue;
        const all = root.querySelectorAll<HTMLElement>(`[data-tour="${c.anchor}"]`);
        // An anchor must be unique: two matches mean the page is wrong, so nothing is
        // highlighted rather than guessing which one was meant.
        if (all.length > 1) {
          if (import.meta.env.DEV) console.warn(`Tour anchor "${c.anchor}" appears ${all.length} times`);
          continue;
        }
        const el = all[0];
        if (el && el.isConnected && el.getClientRects().length && el.offsetWidth > 0) return { el, i };
      }
      return null;
    };

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();
      const onPage = window.location.pathname === chapter.route;
      // A page still loading marks itself busy; wait for it.
      const loading = !onPage || Boolean(document.querySelector("main [data-tour-busy]"));
      if (loading) settledAt = null;
      else settledAt ??= now;
      let hit = loading ? null : find();
      // A fallback target is only used once the first choice has had time to appear.
      if (hit && hit.i > 0 && settledAt !== null && now - settledAt < settleMs) hit = null;
      if (hit) {
        const r = hit.el.getBoundingClientRect();
        // Settled: the same box for 8 frames running (page entrance, data and any scroll
        // have finished).
        const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        stableFor = key === last ? stableFor + 1 : 0;
        last = key;
        if (stableFor >= 8) {
          const delta = scrollNeeded(r, hit.el);
          if (Math.abs(delta) > 4 && attempts < 3) {
            attempts++;
            stableFor = 0;
            window.scrollBy({ top: delta, behavior: reducedMotion() ? "auto" : "smooth" });
            raf = requestAnimationFrame(tick);
            return;
          }
          target.current = hit.el;
          const rr = parseFloat(getComputedStyle(hit.el).borderTopLeftRadius) || 0;
          radius.current = Math.min(32, Math.max(14, rr + PAD));
          setVariant(hit.i);
          setPhase("shown");
          setReadyFor(index);
          return;
        }
      } else if (step.optional && settledAt !== null && now - settledAt >= settleMs) {
        // Nothing for this step here (no medicines yet, diary already saved): skip it.
        cancelled = true;
        skipStep();
        return;
      }
      if (now - began > FIND_TIMEOUT) {
        setPhase("missing");
        setReadyFor(index);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(slowTimer);
    };
  }, [index, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Arrive: once per step, after React has rendered the step's text (still hidden), so
  //    the card is measured with its real content before it moves. Spotlight and card glide
  //    together; the text fades in as they land, then the pointer draws in.
  useLayoutEffect(() => {
    if (readyFor !== index || phase === "finding" || arrivedFor.current === index) return;
    const c = card.current;
    const s = spot.current;
    if (!c || !s) return;
    arrivedFor.current = index;
    const el = phase === "shown" ? target.current : null;
    pinnedRef.current = el ? pinned(el) : false;
    // The scroll was worked out while the previous step's card was showing. Now this step's
    // text (and any example) is rendered, check again with the card's real height, so a
    // taller card never lands on top of the control.
    if (el) {
      const delta = scrollNeeded(el.getBoundingClientRect(), el);
      if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: "instant" });
    }
    const { vw, vh } = viewport();
    const h = el ? holeOf(el.getBoundingClientRect(), vw, vh) : null;
    const p = planCard(h, c.offsetWidth, c.offsetHeight, rtl, sheet, null, pinnedRef.current);
    plan.current = p;
    hole.current = h;
    c.dataset.tourSide = p.side;
    c.dataset.tourClip = p.clip != null ? "true" : "false";

    const reduce = reducedMotion();
    const first = !started;
    const words = items();
    const done = () => {
      setAnnounce(
        stop.kind === "step"
          ? `${t(stop.chapter.title)}, ${t("tour.progress", { n: stop.n, total: stop.count })}: ${t(stop.step.title)}`
          : t("guide.break.title", { chapter: t(stop.done.title) }),
      );
      if (!c.contains(document.activeElement)) nextBtn.current?.focus({ preventScroll: true });
    };
    timeline.current?.kill();
    moving.current = true;
    const tl = gsap.timeline({ onComplete: done });
    timeline.current = tl;
    const showPointer = () => {
      placePointer(pointer.current, shownHole(h, p), p, c);
      animatePointer(pointer.current);
    };
    gsap.set(pointer.current, { opacity: 0 });

    if (reduce) {
      // No travel: everything is placed, then fades in.
      tl.set(s, spotTo(shownHole(h, p)))
        .set(c, cardTo(p))
        .set(words, { autoAlpha: 1, y: 0 })
        .to(ring.current, { opacity: h ? 1 : 0, duration: 0.15 }, 0)
        .to(c, { autoAlpha: 1, duration: 0.15, ease: "none" }, 0)
        .call(showPointer, [], 0)
        .to(pointer.current, { opacity: 1, duration: 0.15 }, 0);
    } else if (first) {
      // Entrance: the hole opens onto the control, then the card rises beside it.
      const lift = p.side === "top" || p.side === "sheetTop" ? -10 : p.side === "sheet" ? 24 : 10;
      const at = cardTo(p);
      tl.set(c, { x: at.x, y: at.y + lift })
        .to(s, { ...spotTo(shownHole(h, p)), duration: 0.6, ease: "power3.out" }, 0)
        .to(ring.current, { opacity: h ? 1 : 0, duration: 0.3, ease: "power1.out" }, 0.25)
        .to(c, { autoAlpha: 1, y: at.y, duration: 0.4, ease: "power3.out" }, 0.3)
        .fromTo(
          words,
          { autoAlpha: 0, y: 6 },
          { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.05, ease: "power2.out" },
          0.42,
        )
        .call(showPointer, [], 0.7)
        .to(pointer.current, { opacity: 1, duration: 0.15 }, 0.7);
    } else {
      // Step to step: one glide for spotlight and card, then the new text and the pointer.
      tl.to(s, { ...spotTo(shownHole(h, p)), duration: MOVE, ease: "power3.inOut" }, 0)
        .to(ring.current, { opacity: h ? 1 : 0, duration: 0.2 }, 0)
        .to(c, { ...cardTo(p), autoAlpha: 1, duration: MOVE, ease: "power3.inOut" }, 0)
        .fromTo(
          words,
          { autoAlpha: 0, y: 6 },
          { autoAlpha: 1, y: 0, duration: 0.26, stagger: 0.04, ease: "power2.out" },
          MOVE - 0.12,
        )
        .call(showPointer, [], MOVE)
        .to(pointer.current, { opacity: 1, duration: 0.15 }, MOVE);
    }
    // A single soft ring settles onto the control as it is reached.
    if (h && !reduce) {
      tl.fromTo(
        pulse.current,
        { opacity: 0.75, scale: 1 },
        { opacity: 0, scale: 1.045, duration: 0.7, ease: "power2.out" },
        first ? 0.45 : MOVE - 0.05,
      );
    }
    // The follow loop takes over the moment the spotlight and card land.
    tl.call(() => void (moving.current = false), [], reduce ? 0 : first ? 0.7 : MOVE);
    if (first) setStarted(true);
  }, [readyFor, phase, index, variant]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Follow the control while the step is open. Content can move it without any scroll
  //    or resize (a list finishing loading above it), so its box is compared once per frame:
  //    one read, and writes only when something changed. If the page swaps the element out,
  //    look for it again rather than point at nothing.
  useEffect(() => {
    if (phase === "finding" || readyFor !== index) return;
    let raf = 0;
    let last = "";
    const follow = () => {
      const el = target.current;
      if (phase === "shown" && (!el || !el.isConnected)) {
        setRetry((n) => n + 1);
        return;
      }
      const { vw, vh } = viewport();
      const sh = vw < SHEET_MAX;
      if (sh !== live.current.sheet) setSheet(sh);
      const c = card.current;
      const r = phase === "shown" && el ? el.getBoundingClientRect() : null;
      const key = `${vw},${vh},${c?.offsetHeight},${sh},${live.current.rtl},${
        r ? `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}` : ""
      }`;
      if (c && key !== last && !moving.current) {
        last = key;
        const h = r ? holeOf(r, vw, vh) : null;
        const p = planCard(h, c.offsetWidth, c.offsetHeight, live.current.rtl, sh, plan.current?.side ?? null, pinnedRef.current);
        gsap.set(spot.current, spotTo(shownHole(h, p)));
        gsap.set(c, cardTo(p));
        placePointer(pointer.current, shownHole(h, p), p, c);
        c.dataset.tourSide = p.side;
        c.dataset.tourClip = p.clip != null ? "true" : "false";
        plan.current = p;
        hole.current = h;
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [phase, readyFor, index]);

  /** Fades the tour away, then hands over (exit, skip or the closing screen). */
  const outro = (then: () => void, keepDim = false) => {
    if (busy.current) return;
    busy.current = true;
    timeline.current?.kill();
    setTourReveal(null);
    const reduce = reducedMotion();
    const tl = gsap.timeline({ onComplete: then });
    timeline.current = tl;
    tl.to(card.current, { autoAlpha: 0, y: `+=${reduce ? 0 : 6}`, duration: reduce ? 0.1 : 0.18, ease: "power2.in" }, 0)
      .to([ring.current, pointer.current], { opacity: 0, duration: 0.16 }, 0);
    // Finishing the full tour keeps the page dimmed: the closing screen's backdrop takes over.
    if (keepDim) tl.to(spot.current, { ...spotTo(null), duration: reduce ? 0 : 0.3, ease: "power2.in" }, 0);
    else tl.to(spot.current, { opacity: 0, duration: reduce ? 0.12 : 0.24, ease: "power1.in" }, 0);
  };
  const finish = () => outro(onFinish, kind === "full");

  const last = index === total - 1;
  const waiting = phase === "finding" || readyFor !== index;
  const go = (to: number) => {
    if (to < 0 || busy.current) return;
    if (to > index && waiting) return; // Next waits until the control is ready
    if (to >= total) return finish();
    direction.current = to > index ? 1 : -1;
    if (to === 0) nextBtn.current?.focus({ preventScroll: true });
    if (arrivedFor.current !== index) return onIndex(to); // nothing on screen to leave
    busy.current = true;
    timeline.current?.kill();
    moving.current = false;
    const reduce = reducedMotion();
    const leave = () => {
      busy.current = false;
      onIndex(to);
    };
    gsap.to(pointer.current, { opacity: 0, duration: 0.1, overwrite: true });
    if (reduce) gsap.to(items(), { autoAlpha: 0, duration: 0.1, overwrite: true, onComplete: leave });
    else gsap.to(items(), { autoAlpha: 0, y: -4, duration: 0.14, ease: "power2.in", overwrite: true, onComplete: leave });
  };
  const exit = () => outro(() => onExit(index));
  const skip = () => outro(() => onSkip(index));
  // "Stop here" between chapters: the next chapter is where "Resume" picks up.
  const stopHere = () => outro(() => onExit(index + 1));

  const onKey = (e: React.KeyboardEvent) => {
    trapTab(e, card.current);
    if (e.key === "Escape") exit();
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward) go(index + 1);
    if (e.key === backward && index > 0) go(index - 1);
  };

  const opening = waiting && slow;
  const isBreak = stop.kind === "break";
  const Icon = isBreak ? CheckCircle2 : stop.chapter.icon;
  const target_ = isBreak ? null : stop.step.targets[Math.min(variant, stop.step.targets.length - 1)];
  const title = isBreak ? t("guide.break.title", { chapter: t(stop.done.title) }) : t(stop.step.title);
  const body = isBreak
    ? `${t("guide.break.next", { chapter: t(stop.next.title) })} ${t(stop.next.intro)}`
    : t(target_!.body);
  const chapterNo = isBreak ? 0 : CHAPTERS.indexOf(stop.chapter) + 1;
  const pageLabel = isBreak ? "" : t(stop.chapter.title);

  return (
    <div className="fixed inset-0 z-[80]" onKeyDown={onKey}>
      {/* Blocks the page: nothing behind the tour can be clicked during it. */}
      <div className="absolute inset-0" aria-hidden="true" onClick={(e) => e.stopPropagation()} />

      {/* The dim layer with the spotlight cut out of it: one element, moved by transform. */}
      <div ref={spot} data-tour-spot aria-hidden="true" className="tour-spot">
        <div ref={ring} className="tour-spot-ring" />
        <div ref={pulse} className="tour-spot-pulse" />
      </div>

      {/* The pointer arrow between the card and the control. */}
      <svg
        ref={pointer}
        data-tour-pointer
        data-dir="none"
        aria-hidden="true"
        className="tour-pointer"
        width="24"
        height="24"
      >
        <path d="" />
      </svg>

      {opening && !started && (
        <p role="status" className="tour-pill">
          <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          {t("tour.opening", { page: pageLabel })}
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        data-tour-step={stopId(stop)}
        data-tour-kind={kind}
        data-tour-phase={waiting ? "finding" : phase}
        data-tour-target={phase === "shown" && target_ ? target_.anchor : undefined}
        data-sheet={sheet ? "" : undefined}
        className={`tour-card fixed left-0 top-0 z-[81] text-start ${
          sheet
            ? "!top-auto bottom-0 w-full px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
            : "w-[min(384px,calc(100vw-2rem))] p-5"
        }`}
        style={sheet ? undefined : { maxWidth: CARD_W }}
      >
        {/* Where you are: chapter and step, and the chapter's progress. */}
        <div className="flex min-h-6 items-center gap-3 pe-11">
          <p className="min-w-0 truncate text-[0.8125rem] font-semibold text-primary" data-tour-progress>
            {isBreak
              ? t("guide.break.progress", { n: CHAPTERS.indexOf(stop.done) + 1, total: CHAPTERS.length })
              : kind === "full"
                ? t("guide.progressFull", {
                    chapter: pageLabel,
                    c: chapterNo,
                    cs: CHAPTERS.length,
                    n: stop.n,
                    total: stop.count,
                  })
                : `${pageLabel} · ${t("tour.progress", { n: stop.n, total: stop.count })}`}
          </p>
          <span className="tour-track" aria-hidden="true">
            <span ref={rail} className="tour-track-fill" />
          </span>
        </div>
        <button
          type="button"
          onClick={exit}
          aria-label={t("tour.exit")}
          className="press absolute end-2 top-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
        </button>

        <div ref={content} className="relative mt-3">
          <div data-tour-item className="flex items-center gap-3">
            <span className="tour-icon">
              <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
            </span>
            <h2 id="tour-step-title" className="display min-w-0 text-[1.25rem] leading-tight">
              {title}
            </h2>
          </div>
          <div data-tour-item className={`mt-2.5 overflow-y-auto ${sheet ? "max-h-[26vh]" : "max-h-[46vh]"}`}>
            <p id="tour-step-body" className="text-[1rem] leading-relaxed text-foreground/85">
              {body}
            </p>
            {phase === "missing" && <p className="mt-1 text-sm text-muted-foreground">{t("tour.missing")}</p>}
            {target_?.example && phase !== "finding" && <TourExample id={target_.example} />}
          </div>
          <div data-tour-item className="mt-3">
            <ReadAloud
              key={stopId(stop)}
              compact
              label={t("guide.play")}
              text={() => `${title}. ${body}`}
            />
          </div>
          {opening && started && (
            <p
              role="status"
              className="absolute inset-0 flex items-center justify-center gap-2 bg-card text-sm font-semibold text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              {t("tour.opening", { page: pageLabel })}
            </p>
          )}
        </div>

        {isBreak ? (
          <div className="mt-4 grid gap-2 border-t border-[#f0ebf9] pt-3">
            <Button ref={nextBtn} className="w-full" onClick={() => go(index + 1)} data-tour-continue>
              {t("guide.break.continue")}
              <ArrowRight className="rtl:rotate-180" aria-hidden="true" />
            </Button>
            <Button variant="outline" className="w-full" onClick={stopHere} data-tour-stop-here>
              <Square className="h-3.5 w-3.5" aria-hidden="true" /> {t("guide.break.stop")}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 border-t border-[#f0ebf9] pt-3">
            <Button variant="ghost" size="sm" className="-ms-3 text-muted-foreground" onClick={skip}>
              {kind === "full" ? t("tour.skip") : t("guide.close")}
            </Button>
            <div className="ms-auto flex gap-2">
              {index > 0 && (
                <Button variant="outline" size="sm" className="px-3.5" onClick={() => go(index - 1)}>
                  <ArrowLeft className="rtl:rotate-180" aria-hidden="true" /> {t("tour.back")}
                </Button>
              )}
              <Button
                ref={nextBtn}
                size="sm"
                className={`px-4 ${waiting ? "opacity-60" : ""}`}
                aria-disabled={waiting || undefined}
                onClick={() => go(index + 1)}
              >
                {last ? (kind === "full" ? t("guide.finishTour") : t("tour.finish")) : t("tour.next")}
                {!last && <ArrowRight className="rtl:rotate-180" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
