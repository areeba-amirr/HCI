import {
  ArrowLeftRight,
  CalendarDays,
  FileBarChart,
  FileText,
  History,
  Home,
  Mic,
  NotebookPen,
  Pill,
  ScanLine,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/i18n/messages";

/**
 * The guided tour, as chapters: one per feature, each a short lesson on that page's real
 * controls. The full tour plays the chapters in order (with a pause between them); a page's
 * "How to use this page" button plays only the chapters for that page.
 *
 * Each step points at an exact [data-tour] anchor. A step can list more than one target: the
 * first one on screen is used, so a page that looks different with no data (or with today's
 * diary already saved) gets wording that matches what is actually there. Steps marked
 * `optional` are skipped quietly when none of their targets exist (no medicines yet, for
 * example), instead of pointing at something unrelated.
 *
 * The tour never fills in, uploads, scans or saves anything. Where a step needs a result
 * screen that only appears after real use, it shows a small labelled example in the card
 * instead (see ./examples.tsx). `reveal` opens a menu or a "More details" section on the
 * card being explained, and it closes again when the step ends.
 */
export type ChapterId =
  | "dashboard"
  | "scanner"
  | "prescription"
  | "medicines"
  | "interactions"
  | "diary"
  | "voice"
  | "calendar"
  | "history"
  | "report"
  | "settings";

export type ExampleId =
  | "camera"
  | "scanResult"
  | "rxReview"
  | "statuses"
  | "packaging"
  | "interaction"
  | "reportPdf";

/** What the tour may open while a step is shown (and closes afterwards). */
export type RevealId = "med-more" | "med-details";

export type TourRoute =
  | "/dashboard"
  | "/scanner"
  | "/prescription"
  | "/medicines"
  | "/diary"
  | "/calendar"
  | "/history"
  | "/interactions"
  | "/report"
  | "/settings";

export interface TourTarget {
  anchor: string;
  body: MessageKey;
  /**
   * Where to look: the page content (default), the app's navigation around it ("shell"),
   * or the whole document ("doc", for menus that open in a layer of their own).
   */
  scope?: "main" | "shell" | "doc";
  example?: ExampleId;
}

export interface TourStep {
  id: string;
  title: MessageKey;
  targets: TourTarget[];
  optional?: boolean;
  reveal?: RevealId;
}

export interface TourChapter {
  id: ChapterId;
  route: TourRoute;
  icon: LucideIcon;
  title: MessageKey;
  /** One line shown before the chapter starts. */
  intro: MessageKey;
  steps: TourStep[];
}

const T = (chapter: string, step: string) => ({
  title: `guide.${chapter}.${step}.title` as MessageKey,
  body: `guide.${chapter}.${step}.body` as MessageKey,
});

/** A step with one target. */
const s = (
  chapter: string,
  id: string,
  anchor: string,
  more: Partial<TourStep> & { scope?: TourTarget["scope"]; example?: ExampleId } = {},
): TourStep => {
  const { scope, example, ...rest } = more;
  const k = T(chapter, id);
  return { id, title: k.title, targets: [{ anchor, body: k.body, scope, example }], ...rest };
};

/** A step with a fallback target (and its own wording) when the first isn't on screen. */
const alt = (chapter: string, id: string, altId: string, anchor: string, example?: ExampleId) => ({
  anchor,
  body: `guide.${chapter}.${id}.${altId}` as MessageKey,
  example,
});

export const CHAPTERS: TourChapter[] = [
  {
    id: "dashboard",
    route: "/dashboard",
    icon: Home,
    title: "guide.dashboard.chapter",
    intro: "guide.dashboard.intro",
    steps: [
      s("dashboard", "start", "dash-start"),
      s("dashboard", "today", "dash-today"),
      s("dashboard", "recent", "dash-recent"),
      {
        ...s("dashboard", "nav", "nav-side", { scope: "shell" }),
        targets: [
          { anchor: "nav-side", body: "guide.dashboard.nav.body", scope: "shell" },
          { anchor: "nav-bottom", body: "guide.dashboard.nav.bodyPhone", scope: "shell" },
        ],
      },
      s("dashboard", "guide", "page-guide"),
    ],
  },
  {
    id: "scanner",
    route: "/scanner",
    icon: ScanLine,
    title: "guide.scanner.chapter",
    intro: "guide.scanner.intro",
    steps: [
      s("scanner", "choose", "scan-choose"),
      s("scanner", "camera", "scan-camera", { example: "camera" }),
      s("scanner", "scan", "scan-drop"),
      s("scanner", "result", "scan-steps", { example: "scanResult" }),
    ],
  },
  {
    id: "prescription",
    route: "/prescription",
    icon: FileText,
    title: "guide.prescription.chapter",
    intro: "guide.prescription.intro",
    steps: [
      s("prescription", "steps", "rx-steps"),
      s("prescription", "upload", "rx-choose"),
      s("prescription", "camera", "rx-camera", { example: "camera" }),
      s("prescription", "review", "rx-drop", { example: "rxReview" }),
      s("prescription", "save", "rx-steps"),
      s("prescription", "saved", "rx-saved"),
    ],
  },
  {
    id: "medicines",
    route: "/medicines",
    icon: Pill,
    title: "guide.medicines.chapter",
    intro: "guide.medicines.intro",
    steps: [
      s("medicines", "empty", "medicines-page-empty", { optional: true }),
      s("medicines", "sections", "meds-needs", { optional: true }),
      s("medicines", "card", "med-card", { optional: true }),
      s("medicines", "status", "med-status", { optional: true, example: "statuses" }),
      {
        // The card's main button depends on the medicine: Confirm (the AI read the name
        // clearly), Scan packaging, or Type the name. Each has its own wording.
        ...s("medicines", "action", "med-action-confirm", { optional: true }),
        targets: [
          alt("medicines", "action", "bodyConfirm", "med-action-confirm"),
          alt("medicines", "action", "bodyScan", "med-action-scan"),
          alt("medicines", "action", "bodyType", "med-action-type"),
          alt("medicines", "action", "bodyDone", "med-status"),
        ],
      },
      {
        ...s("medicines", "packaging", "med-action-scan", { optional: true }),
        targets: [
          { anchor: "med-action-scan", body: "guide.medicines.packaging.body", example: "packaging" },
          alt("medicines", "packaging", "bodyMenu", "med-more", "packaging"),
        ],
      },
      s("medicines", "intake", "med-intake", { optional: true }),
      {
        ...s("medicines", "more", "med-more-menu", { optional: true, reveal: "med-more" }),
        targets: [
          { anchor: "med-more-menu", body: "guide.medicines.more.body", scope: "doc" },
          { anchor: "med-more", body: "guide.medicines.more.body" },
        ],
      },
      s("medicines", "details", "med-details", { optional: true, reveal: "med-details" }),
      s("medicines", "original", "med-original", { optional: true }),
      s("medicines", "listen", "med-listen", { optional: true }),
    ],
  },
  {
    id: "interactions",
    route: "/interactions",
    icon: ArrowLeftRight,
    title: "guide.interactions.chapter",
    intro: "guide.interactions.intro",
    steps: [
      {
        ...s("interactions", "rule", "ix-rule"),
        targets: [
          { anchor: "ix-rule", body: "guide.interactions.rule.body" },
          alt("interactions", "rule", "bodyEmpty", "interaction-check-empty"),
        ],
      },
      s("interactions", "pick", "ix-pick", { optional: true }),
      s("interactions", "check", "ix-check", { optional: true }),
      s("interactions", "pending", "ix-pending", { optional: true }),
      {
        ...s("interactions", "result", "ix-check"),
        targets: [
          { anchor: "ix-check", body: "guide.interactions.result.body", example: "interaction" },
          alt("interactions", "result", "body", "interaction-check-empty", "interaction"),
        ],
      },
    ],
  },
  {
    id: "diary",
    route: "/diary",
    icon: NotebookPen,
    title: "guide.diary.chapter",
    intro: "guide.diary.intro",
    steps: [
      s("diary", "saved", "symptom-diary-saved", { optional: true }),
      s("diary", "pain", "diary-pain", { optional: true }),
      s("diary", "sleep", "diary-sleep", { optional: true }),
      s("diary", "mood", "diary-mood", { optional: true }),
      s("diary", "notes", "diary-notes", { optional: true }),
      s("diary", "save", "diary-save", { optional: true }),
      s("diary", "recent", "diary-recent"),
    ],
  },
  {
    id: "voice",
    route: "/diary",
    icon: Mic,
    title: "guide.voice.chapter",
    intro: "guide.voice.intro",
    steps: [
      s("voice", "update", "voice-diary-update", { optional: true }),
      s("voice", "mic", "voice-mic", { optional: true }),
      s("voice", "lang", "voice-lang", { optional: true }),
      s("voice", "transcript", "voice-transcript", { optional: true }),
      s("voice", "timeline", "voice-timeline", { optional: true }),
      s("voice", "save", "diary-save", { optional: true }),
    ],
  },
  {
    id: "calendar",
    route: "/calendar",
    icon: CalendarDays,
    title: "guide.calendar.chapter",
    intro: "guide.calendar.intro",
    steps: [
      s("calendar", "month", "calendar-page"),
      s("calendar", "legend", "cal-legend"),
      s("calendar", "day", "cal-day"),
    ],
  },
  {
    id: "history",
    route: "/history",
    icon: History,
    title: "guide.history.chapter",
    intro: "guide.history.intro",
    steps: [
      {
        ...s("history", "tools", "hist-tools"),
        targets: [
          { anchor: "hist-tools", body: "guide.history.tools.body" },
          alt("history", "tools", "bodyEmpty", "history-page-empty"),
        ],
      },
      s("history", "item", "hist-item", { optional: true }),
    ],
  },
  {
    id: "report",
    route: "/report",
    icon: FileBarChart,
    title: "guide.report.chapter",
    intro: "guide.report.intro",
    steps: [
      s("report", "kinds", "rpt-kinds"),
      s("report", "period", "rpt-period", { optional: true }),
      s("report", "visit", "rpt-visit", { optional: true }),
      s("report", "overview", "rpt-overview", { optional: true }),
      s("report", "meds", "rpt-meds", { optional: true }),
      s("report", "lang", "rpt-lang"),
      s("report", "generate", "rpt-generate", { example: "reportPdf" }),
    ],
  },
  {
    id: "settings",
    route: "/settings",
    icon: Settings,
    title: "guide.settings.chapter",
    intro: "guide.settings.intro",
    steps: [
      s("settings", "name", "set-name"),
      s("settings", "language", "set-language"),
      s("settings", "motion", "set-motion"),
      s("settings", "tour", "set-tour"),
    ],
  },
];

export const chapterById = (id: ChapterId) => CHAPTERS.find((c) => c.id === id)!;

/** One entry in a tour run: a step, or the pause between two chapters (full tour only). */
export type Stop =
  | {
      kind: "step";
      chapter: TourChapter;
      step: TourStep;
      /** 1-based position within its chapter, and the chapter's length. */
      n: number;
      count: number;
    }
  | { kind: "break"; done: TourChapter; next: TourChapter };

export const stopId = (s: Stop) =>
  s.kind === "step" ? `${s.chapter.id}.${s.step.id}` : `break.${s.done.id}`;

/** The stops for some chapters, in order; `breaks` adds the pause between chapters. */
export function buildStops(chapters: TourChapter[], breaks: boolean): Stop[] {
  const out: Stop[] = [];
  chapters.forEach((chapter, ci) => {
    chapter.steps.forEach((step, i) =>
      out.push({ kind: "step", chapter, step, n: i + 1, count: chapter.steps.length }),
    );
    const next = chapters[ci + 1];
    if (breaks && next) out.push({ kind: "break", done: chapter, next });
  });
  return out;
}

export const FULL_TOUR = buildStops(CHAPTERS, true);

/** The chapters a page's "How to use this page" button plays (the diary has two). */
export const pageChapters = (id: ChapterId) => {
  const route = chapterById(id).route;
  return CHAPTERS.filter((c) => c.route === route);
};

/** Kept for older callers: the number of steps in the full tour. */
export const TOUR_STEPS = CHAPTERS.flatMap((c) => c.steps);
