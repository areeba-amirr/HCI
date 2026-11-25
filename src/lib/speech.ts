// Reading text aloud with the browser's own speech (Web Speech API): nothing to install and
// nothing sent anywhere. Only a voice that matches the language is used; if there isn't one
// (common for Urdu on some devices), callers are told so instead of having Urdu read out by
// an English voice.
import { getLanguage, type LanguageCode } from "@/i18n/languages";

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/** Voices load asynchronously in some browsers; wait briefly for them. */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

/** The best voice for a language: exact locale (ur-PK, en-US) first, then the language. */
export function voiceFor(voices: SpeechSynthesisVoice[], code: LanguageCode) {
  const locale = getLanguage(code).locale.toLowerCase();
  const lang = code.toLowerCase();
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace("_", "-");
  return (
    voices.find((v) => norm(v) === locale) ??
    voices.find((v) => norm(v).split("-")[0] === lang) ??
    null
  );
}

/** Splits long text into sentences: some browsers stop long single utterances part-way. */
export function sentences(text: string) {
  return text
    .split(/(?<=[.!?۔؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

let owner: symbol | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Who is speaking now (one reader at a time across the app). */
export const speechOwner = () => owner;
export function onSpeechChange(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function stopSpeaking(who?: symbol) {
  if (!speechSupported()) return;
  if (who && owner !== who) return;
  window.speechSynthesis.cancel();
  owner = null;
  notify();
}

/** Speaks the text in the given voice; resolves when finished or stopped. */
export function speak(who: symbol, text: string, voice: SpeechSynthesisVoice, code: LanguageCode) {
  // Silence whatever was playing, then hand over in one step: notifying "nobody is speaking"
  // in between would reset the reader that is just starting.
  window.speechSynthesis.cancel();
  owner = who;
  notify();
  const parts = sentences(text);
  return new Promise<void>((resolve) => {
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.voice = voice;
      u.lang = voice.lang || getLanguage(code).locale;
      u.rate = 0.92;
      if (i === parts.length - 1) {
        const end = () => {
          if (owner === who) {
            owner = null;
            notify();
          }
          resolve();
        };
        u.onend = end;
        u.onerror = end;
      }
      window.speechSynthesis.speak(u);
    });
  });
}
