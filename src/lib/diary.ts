// The voice diary's draft model, shared by the AI function, the diary page and the screens
// that show saved entries (Calendar, recent entries).
import type { MessageKey } from "@/i18n/messages";

export const DIARY_EMOJIS = [
  "🤕",
  "🤒",
  "🤢",
  "🤧",
  "😣",
  "😮‍💨",
  "😴",
  "💊",
  "🍽️",
  "🚶",
  "😊",
  "😟",
] as const;

/** Spoken names, so the picker never relies on the picture alone. */
export const EMOJI_LABEL: Record<(typeof DIARY_EMOJIS)[number], MessageKey> = {
  "🤕": "diary.emoji.headache",
  "🤒": "diary.emoji.fever",
  "🤢": "diary.emoji.nausea",
  "🤧": "diary.emoji.cold",
  "😣": "diary.emoji.pain",
  "😮‍💨": "diary.emoji.breathless",
  "😴": "diary.emoji.tired",
  "💊": "diary.emoji.medicine",
  "🍽️": "diary.emoji.meal",
  "🚶": "diary.emoji.activity",
  "😊": "diary.emoji.better",
  "😟": "diary.emoji.worried",
};

export interface TimelineEntry {
  id: string;
  text: string;
  /** "HH:MM", or empty when no time was given. Never filled in automatically. */
  time: string;
  /** The person's own choice. Empty until they pick one. */
  emoji: string;
  /** What the AI suggested, shown as an offer only. */
  suggestedEmoji: string;
  origin: "ai" | "user";
}

/** The shape stored in symptoms.timeline: the person's final order, as a list. */
export interface SavedTimelineEntry {
  position: number;
  text: string;
  time: string | null;
  emoji: string;
  origin: "ai" | "user";
}

export function newEntryId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function toSaved(entries: TimelineEntry[]): SavedTimelineEntry[] {
  return entries.map((e, position) => ({
    position,
    text: e.text.trim(),
    time: e.time || null,
    emoji: e.emoji,
    origin: e.origin,
  }));
}

export function fromSaved(value: unknown): TimelineEntry[] {
  if (!Array.isArray(value)) return [];
  return [...value]
    .filter((e) => e && typeof e.text === "string")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((e) => ({
      id: newEntryId(),
      text: e.text,
      time: typeof e.time === "string" ? e.time : "",
      emoji: typeof e.emoji === "string" ? e.emoji : "",
      suggestedEmoji: "",
      origin: e.origin === "ai" ? "ai" : "user",
    }));
}

/** Moves one item, returning a new array; used by the buttons and by drag and drop. */
export function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
