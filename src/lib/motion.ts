// Central GSAP setup. Components import from here so plugins are registered exactly once.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
  ScrollTrigger.config({ ignoreMobileResize: true });
}

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
export const MOTION_REDUCED = "(prefers-reduced-motion: reduce)";

export const EASE_OUT = "power3.out";
/** Reduced-motion stand-in for any entrance: a short fade with no displacement. */
export const REDUCED_FADE = { duration: 0.15, ease: "none" } as const;

/**
 * Splitting into letters breaks the joined letters of Urdu, Arabic and Hindi, and Chinese
 * has no spaces to split words on, so letter-level effects are limited to Latin scripts.
 */
export function canSplitLetters(language: string) {
  return language === "en" || language === "es" || language === "fr";
}

/**
 * Phones and laptops with few cores or little memory, or with data saver on. Measured under
 * 4x CPU throttling, split-text and scroll-linked effects together cost far more per frame
 * than the rest of the page, so these devices keep entrances but skip those effects.
 */
export function isLowPowerDevice() {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (
    (n.hardwareConcurrency ?? 8) <= 4 ||
    (n.deviceMemory ?? 8) <= 4 ||
    n.connection?.saveData === true
  );
}

/** Trigger positions go stale when web fonts or images change section heights. */
export function refreshOnAssetsReady() {
  const refresh = () => ScrollTrigger.refresh();
  let active = true;
  document.fonts?.ready.then(() => {
    if (active) refresh();
  });
  window.addEventListener("load", refresh);
  return () => {
    active = false;
    window.removeEventListener("load", refresh);
  };
}

export { gsap, ScrollTrigger, SplitText, useGSAP };
