// A Listen button for important information, in the app's language. Never plays by itself;
// Pause and Stop appear while it speaks. If the device has no voice for the language, it
// says so plainly rather than reading Urdu with an English voice.
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import {
  loadVoices,
  onSpeechChange,
  speak,
  speechOwner,
  speechSupported,
  stopSpeaking,
  voiceFor,
} from "@/lib/speech";

export function ReadAloud({
  text,
  label,
  className = "",
  tour,
  compact = false,
}: {
  /** Guided-tour anchor for this control. */
  tour?: string;
  /** Smaller buttons, for tight spaces such as the tour card. */
  compact?: boolean;
  /** What to read: built when the button is pressed, so it is always current. */
  text: string | (() => string);
  /** Button label; defaults to "Listen". */
  label?: string;
  className?: string;
}) {
  const { t, language } = useI18n();
  const me = useRef(Symbol("reader"));
  const [state, setState] = useState<"idle" | "speaking" | "paused">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  // Another reader starting (or speech ending) resets this one.
  useEffect(
    () =>
      onSpeechChange(() => {
        if (speechOwner() === me.current) setState((s) => (s === "idle" ? "speaking" : s));
        else setState("idle");
      }),
    [],
  );
  // Leaving the page, or switching language, stops reading.
  useEffect(() => () => stopSpeaking(me.current), []);
  useEffect(() => {
    stopSpeaking(me.current);
    setProblem(null);
  }, [language]);

  async function start() {
    setProblem(null);
    if (!speechSupported()) return setProblem(t("voice.unsupported"));
    const voice = voiceFor(await loadVoices(), language);
    if (!voice) return setProblem(language === "ur" ? t("voice.noUrduVoice") : t("voice.noVoice"));
    const words = typeof text === "function" ? text() : text;
    if (!words.trim()) return;
    setState("speaking");
    await speak(me.current, words, voice, language);
  }

  function pauseResume() {
    if (state === "speaking") {
      window.speechSynthesis.pause();
      setState("paused");
    } else {
      window.speechSynthesis.resume();
      setState("speaking");
    }
  }

  return (
    <div className={`space-y-2 ${className}`} data-read-aloud={state} data-tour={tour}>
      <div className="flex flex-wrap items-center gap-2">
        {state === "idle" ? (
          <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={start}>
            <Volume2 aria-hidden="true" /> {label ?? t("voice.listen")}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={pauseResume} aria-pressed={state === "paused"}>
              {state === "paused" ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {state === "paused" ? t("voice.resume") : t("voice.pause")}
            </Button>
            <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => stopSpeaking(me.current)}>
              <Square aria-hidden="true" /> {t("voice.stop")}
            </Button>
          </>
        )}
      </div>
      {problem && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2 text-[0.9375rem]">
          <VolumeX className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {problem}
        </p>
      )}
    </div>
  );
}
