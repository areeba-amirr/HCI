// MediSnap's Urdu catalog: hand-written, everyday Urdu for every interface string.
//
// Status: written for MediSnap, NOT clinically reviewed. Before patients rely on it, a native
// Urdu speaker with clinical experience must review at least the keys matching
// NEEDS_CLINICAL_REVIEW below (anything that explains medicines, doses, readings, safety or
// reports). Medicine names, brand and generic names, numbers, units and {placeholders} are
// deliberately kept as they are.
import type { Messages } from "../messages";
import { ur1 } from "./part1";
import { ur2 } from "./part2";
import { ur3 } from "./part3";
import { ur4 } from "./part4";
import { ur5 } from "./part5";
import { ur6 } from "./part6";

export const ur: Partial<Messages> = { ...ur1, ...ur2, ...ur3, ...ur4, ...ur5, ...ur6 };

/** Key prefixes whose Urdu wording needs native, clinical review. */
export const NEEDS_CLINICAL_REVIEW = [
  "medical.",
  "scan.",
  "scanner.",
  "prescription.",
  "rx.",
  "meds.",
  "interactions.",
  "history.safe",
  "history.severity",
  "history.cautionSeverity",
  "rpt.",
  "report.",
  "diary.pain",
  "diary.emoji.",
  "landing.abbr",
  "landing.faq",
  "guide.medicines",
  "guide.interactions",
  "guide.ex.",
  "camera.hint",
] as const;
