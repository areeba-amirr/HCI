// What the guided tour has opened for the step on screen ("More options" or "More details"
// on the medicine card it is explaining). The card opens the part while this names it and
// puts it back exactly as it was when the step ends. Opening never runs an action: menu
// items stay unclickable behind the tour, and nothing is saved.
import { useSyncExternalStore } from "react";
import type { RevealId } from "./steps";

let current: RevealId | null = null;
const listeners = new Set<() => void>();

export function setTourReveal(id: RevealId | null) {
  if (current === id) return;
  current = id;
  listeners.forEach((l) => l());
}

export function useTourReveal(): RevealId | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
