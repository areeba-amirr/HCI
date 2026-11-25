// Guided-tour progress, stored per user in the Supabase Auth profile (user_metadata), the
// same place MediSnap already keeps the display name. No table or column is added.
// A copy in localStorage covers the moment between finishing and the save completing, or
// a save that fails while offline, so the welcome never reappears unexpectedly.
//
// Tour state is kept apart from health data: it records only which guide steps were seen.
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** 2: the chapter-based tour (steps are identified by id, chapters can be finished alone). */
export const TOUR_VERSION = 2;

/**
 * completed: reached the end of the full tour.
 * skipped:   chose "Skip tour" or "Explore on my own".
 * paused:    closed the tour part-way; `stepId` is where to resume.
 */
export type TourStatus = "completed" | "skipped" | "paused";

export interface TourRecord {
  version: number;
  status: TourStatus;
  /** Position in the full tour when it was left, 0-based (kept for older records). */
  step: number;
  /** The step to resume at ("chapter.step"); preferred over `step`. */
  stepId?: string;
  /** Chapters finished, in the full tour or as a page guide. */
  chapters?: string[];
  updatedAt: string;
}

const localKey = (userId: string) => `medisnap.tour.${userId}`;
const tipsKey = (userId: string) => `medisnap.tips.${userId}`;

function isRecord(v: unknown): v is TourRecord {
  const r = v as TourRecord | null;
  return Boolean(r && typeof r.status === "string" && typeof r.step === "number");
}

export function readTour(user: Pick<User, "id" | "user_metadata"> | null): TourRecord | null {
  if (!user) return null;
  let local: TourRecord | null = null;
  try {
    const v = JSON.parse(localStorage.getItem(localKey(user.id)) ?? "null");
    local = isRecord(v) ? v : null;
  } catch {
    /* storage unavailable */
  }
  const remote = user.user_metadata?.onboarding_tour;
  const fromProfile = isRecord(remote) ? remote : null;
  // The newer of the two: the profile copy in the session can lag behind a save just made.
  if (fromProfile && local) return local.updatedAt > fromProfile.updatedAt ? local : fromProfile;
  return fromProfile ?? local;
}

export async function saveTour(
  userId: string,
  next: Omit<TourRecord, "version" | "updatedAt">,
): Promise<TourRecord> {
  const record: TourRecord = { ...next, version: TOUR_VERSION, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(record));
  } catch {
    /* the profile copy below is the one that matters */
  }
  // user_metadata is merged, so the display name and other fields are kept.
  const { error } = await supabase.auth.updateUser({ data: { onboarding_tour: record } });
  if (error) console.warn("[tour] progress kept on this device only", error.message);
  return record;
}

// ---- one-time tips --------------------------------------------------------------------
// Small hints shown the first time someone meets an unfamiliar feature. Dismissed tips never
// come back, on this device or (through the profile) on others.

export function readTips(user: Pick<User, "id" | "user_metadata"> | null): string[] {
  if (!user) return [];
  const remote = user.user_metadata?.onboarding_tips;
  const fromProfile = Array.isArray(remote) ? remote.filter((x) => typeof x === "string") : [];
  let local: string[] = [];
  try {
    const v = JSON.parse(localStorage.getItem(tipsKey(user.id)) ?? "[]");
    local = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    /* storage unavailable */
  }
  return [...new Set([...fromProfile, ...local])];
}

export async function dismissTip(user: Pick<User, "id" | "user_metadata">, id: string) {
  const tips = [...new Set([...readTips(user), id])];
  try {
    localStorage.setItem(tipsKey(user.id), JSON.stringify(tips));
  } catch {
    /* the profile copy below still saves it */
  }
  const { error } = await supabase.auth.updateUser({ data: { onboarding_tips: tips } });
  if (error) console.warn("[tips] kept on this device only", error.message);
  return tips;
}
