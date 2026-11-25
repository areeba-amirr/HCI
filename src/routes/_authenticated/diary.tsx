import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GripVertical,
  Loader2,
  Mic,
  Mic as MicIcon,
  NotebookPen,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { extractSymptoms } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/I18nProvider";
import { getLanguage } from "@/i18n/languages";
import { Med, UrduHint } from "@/components/MedicalText";
import {
  ConfirmDialog,
  EmptyState,
  PageEnter,
  PageHeader,
  StatusBanner,
} from "@/components/app/primitives";
import { SavedTimeline } from "@/components/diary/SavedTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DIARY_EMOJIS,
  EMOJI_LABEL,
  fromSaved,
  move,
  newEntryId,
  toSaved,
  type TimelineEntry,
} from "@/lib/diary";
import { FirstTimeTip } from "@/components/tour/PageGuide";

export const Route = createFileRoute("/_authenticated/diary")({
  head: () => ({
    meta: [
      { title: "Symptom Diary — MediSnap" },
      {
        name: "description",
        content:
          "Record your daily symptoms by voice in Urdu or English, check the draft, arrange your timeline and save it yourself.",
      },
      { property: "og:title", content: "Symptom Diary — MediSnap" },
      {
        property: "og:description",
        content:
          "Record your daily symptoms by voice in Urdu or English, check the draft, arrange your timeline and save it yourself.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiaryPage,
});

type Mood = "happy" | "okay" | "sad" | "";
type Symptom = {
  id: string;
  created_at: string;
  pain_level: number | null;
  sleep_hours: number | null;
  mood: string | null;
  notes: string | null;
  notes_urdu: string | null;
  timeline?: Json | null;
  voice_transcript?: string | null;
};

const MOOD_LABELS = {
  happy: "diary.moodHappy",
  okay: "diary.moodOkay",
  sad: "diary.moodSad",
} as const;
const DRAFT_KEY = "medisnap.diary.draft.v1";

/** Fields the AI filled in from the recording, so the form can ask the person to check them. */
type AiFilled = { pain: boolean; sleep: boolean; mood: boolean; notes: boolean };
const NONE_FILLED: AiFilled = { pain: false, sleep: false, mood: false, notes: false };

interface Draft {
  userId: string;
  /** The saved entry this draft edits, or null for a new one. */
  baseId: string | null;
  transcript: string;
  pain: number | null;
  sleep: number | null;
  mood: Mood;
  notes: string;
  notesUrdu: string;
  entries: TimelineEntry[];
  aiFilled: AiFilled;
}

// Drafts live in sessionStorage: they survive navigating around the app and a reload, and
// are gone when the tab closes, so health notes aren't left behind on a shared phone.
function readDraft(userId: string): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    return d && d.userId === userId ? d : null;
  } catch {
    return null;
  }
}
function writeDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* the draft simply won't survive a reload */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}

function painLevel(p: number) {
  if (p <= 3)
    return { key: "diary.painMild", text: "text-success", accent: "accent-success" } as const;
  if (p <= 6)
    return { key: "diary.painModerate", text: "text-warning", accent: "accent-warning" } as const;
  return {
    key: "diary.painSevere",
    text: "text-destructive",
    accent: "accent-destructive",
  } as const;
}

/** A missing column means the timeline database update hasn't been applied yet. */
function isMissingTimelineColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error && (error.code === "PGRST204" || /timeline|voice_transcript/.test(error.message ?? "")),
  );
}

function DiaryPage() {
  const fn = useServerFn(extractSymptoms);
  const { t, tError, formatDate, language } = useI18n();
  const recRef = useRef<{ stop: () => void } | null>(null);
  // Speech is recognised in Urdu or English; it starts in the app language and can be switched.
  const [speechLang, setSpeechLang] = useState<"ur" | "en">(language === "en" ? "en" : "ur");
  useEffect(() => setSpeechLang(language === "en" ? "en" : "ur"), [language]);
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // The draft. Nothing here is saved until the person presses Save.
  const [baseId, setBaseId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [pain, setPain] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [mood, setMood] = useState<Mood>("");
  const [notes, setNotes] = useState("");
  const [notesUrdu, setNotesUrdu] = useState("");
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [aiFilled, setAiFilled] = useState<AiFilled>(NONE_FILLED);
  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(false);
  // False until we know whether today is already logged (the page can switch views then).
  const [checkedToday, setCheckedToday] = useState(false);

  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [todayEntry, setTodayEntry] = useState<Symptom | null>(null);
  const [editing, setEditing] = useState(false);
  const [recent, setRecent] = useState<Symptom[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [announce, setAnnounce] = useState("");

  const touch = () => setDirty(true);

  async function loadRecent() {
    const { data } = await supabase
      .from("symptoms")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(7);
    setRecent((data as Symptom[]) || []);
  }

  const loadDraftInto = useCallback((d: Draft) => {
    setBaseId(d.baseId);
    setTranscript(d.transcript);
    setPain(d.pain);
    setSleep(d.sleep);
    setMood(d.mood);
    setNotes(d.notes);
    setNotesUrdu(d.notesUrdu);
    setEntries(d.entries);
    setAiFilled(d.aiFilled);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        setUserId(u.user.id);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const { data } = await supabase
          .from("symptoms")
          .select("*")
          .eq("user_id", u.user.id)
          .gte("created_at", start.toISOString())
          .order("created_at", { ascending: false })
          .limit(1);
        const today = (data?.[0] as Symptom | undefined) ?? null;
        if (today) setTodayEntry(today);
        const draft = readDraft(u.user.id);
        if (draft) {
          loadDraftInto(draft);
          setDirty(true);
          setRestored(true);
          setEditing(true);
        }
      } finally {
        setCheckedToday(true);
      }
    })();
    loadRecent();
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, [loadDraftInto]);

  // Keep the draft safe while it's unsaved.
  useEffect(() => {
    if (!userId || !dirty) return;
    writeDraft({
      userId,
      baseId,
      transcript,
      pain,
      sleep,
      mood,
      notes,
      notesUrdu,
      entries,
      aiFilled,
    });
  }, [userId, dirty, baseId, transcript, pain, sleep, mood, notes, notesUrdu, entries, aiFilled]);

  // Warn before the tab is closed or reloaded with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function startListening() {
    setVoiceError(null);
    type Recognition = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onstart: () => void;
      onend: () => void;
      onerror: (e: { error: string }) => void;
      onresult: (e: { results: { 0: { transcript: string } }[] }) => void;
      start: () => void;
      stop: () => void;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const SR =
      typeof window !== "undefined" ? w.SpeechRecognition || w.webkitSpeechRecognition : undefined;
    if (!SR) return setVoiceError(t("diary.voiceUnsupported"));
    const r = new SR();
    r.lang = speechLang === "ur" ? "ur-PK" : "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      setVoiceError(t("diary.voiceError", { error: e.error }));
    };
    r.onresult = async (e) => {
      const heard = e.results[0][0].transcript;
      // A second recording adds to the transcript instead of replacing it.
      const full = transcript.trim() ? `${transcript.trim()} ${heard}` : heard;
      setTranscript(full);
      touch();
      await organise(heard);
    };
    r.start();
    recRef.current = r;
  }

  /**
   * Turns speech into suggestions. It only fills fields that are still empty and only adds
   * timeline entries, so nothing the person already wrote or chose is overwritten.
   */
  async function organise(text: string) {
    if (!text.trim()) return;
    setExtracting(true);
    setVoiceError(null);
    try {
      const data = await fn({ data: { transcript: text } });
      const filled = { ...aiFilled };
      if (pain === null && data.pain_level !== null) {
        setPain(data.pain_level);
        filled.pain = true;
      }
      if (sleep === null && data.sleep_hours !== null) {
        setSleep(data.sleep_hours);
        filled.sleep = true;
      }
      if (!mood && data.mood) {
        setMood(data.mood);
        filled.mood = true;
      }
      if (!notes.trim() && data.notes) {
        setNotes(data.notes);
        setNotesUrdu((u) => u || data.notes_urdu);
        filled.notes = true;
      }
      setAiFilled(filled);
      if (data.timeline.length) {
        setEntries((list) => [
          ...list,
          ...data.timeline.map((e) => ({
            id: newEntryId(),
            text: e.text,
            time: e.time,
            emoji: "",
            suggestedEmoji: e.emoji,
            origin: "ai" as const,
          })),
        ]);
      }
      touch();
      toast.success(t("diary.draftReady"));
    } catch (e) {
      setVoiceError(e instanceof Error && e.message ? tError(e.message) : t("diary.extractFailed"));
    } finally {
      setExtracting(false);
    }
  }

  // ---- timeline editing ------------------------------------------------------------
  function updateEntry(id: string, patch: Partial<TimelineEntry>) {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    touch();
  }
  function moveEntry(from: number, to: number) {
    if (to < 0 || to >= entries.length) return;
    setEntries((list) => move(list, from, to));
    setAnnounce(t("diary.movedTo", { n: to + 1, total: entries.length }));
    touch();
  }
  function removeEntry(id: string) {
    setEntries((list) => list.filter((e) => e.id !== id));
    setAnnounce(t("diary.entryRemoved"));
    touch();
  }
  function addEntry() {
    const entry: TimelineEntry = {
      id: newEntryId(),
      text: "",
      time: "",
      emoji: "",
      suggestedEmoji: "",
      origin: "user",
    };
    setEntries((list) => [...list, entry]);
    touch();
    requestAnimationFrame(() => document.getElementById(`entry-text-${entry.id}`)?.focus());
  }

  // ---- saving ----------------------------------------------------------------------
  function validate() {
    const out: string[] = [];
    if (pain === null) out.push(t("diary.needPain"));
    if (sleep === null) out.push(t("diary.needSleep"));
    if (!mood) out.push(t("diary.needMood"));
    entries.forEach((e, i) => {
      if (!e.text.trim()) out.push(t("diary.needEntryText", { n: i + 1 }));
      if (!e.emoji) out.push(t("diary.needEntryEmoji", { n: i + 1 }));
    });
    return out;
  }

  async function save(withTimeline = true) {
    if (inFlight.current) return;
    const found = validate();
    setProblems(found);
    setSaveError(null);
    if (found.length) {
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setSaveError(t("diary.signedOut"));
    inFlight.current = true;
    setSaving(true);
    const base = {
      user_id: u.user.id,
      pain_level: pain,
      sleep_hours: sleep,
      mood: mood || null,
      notes: notes.trim() || null,
      notes_urdu: notesUrdu.trim() || null,
    };
    // Timeline columns are sent only when there is something to store (or to clear), so
    // entries without a timeline keep working even before the database update.
    const hadTimeline = Boolean(todayEntry?.timeline || todayEntry?.voice_transcript);
    const extended: { timeline?: Json; voice_transcript?: string | null } =
      withTimeline && (entries.length || transcript.trim() || (baseId && hadTimeline))
        ? {
            timeline: (entries.length ? toSaved(entries) : null) as Json,
            voice_transcript: transcript.trim() || null,
          }
        : {};
    const payload = { ...base, ...extended };
    const query = baseId
      ? supabase.from("symptoms").update(payload).eq("id", baseId).select().single()
      : supabase.from("symptoms").insert(payload).select().single();
    const { data, error } = await query;
    setSaving(false);
    inFlight.current = false;
    if (error) {
      console.error("[diary save] failed", { code: error.code, message: error.message });
      if (withTimeline && isMissingTimelineColumn(error)) {
        setNeedsUpdate(true);
        setSaveError(t("diary.timelineNotSetUp"));
      } else {
        setSaveError(t("diary.saveFailed"));
      }
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    clearDraft();
    setDirty(false);
    setRestored(false);
    setNeedsUpdate(false);
    setTodayEntry(data as Symptom);
    setEditing(false);
    toast.success(t("diary.saved"));
    loadRecent();
  }

  function resetDraft() {
    clearDraft();
    setDirty(false);
    setRestored(false);
    setBaseId(null);
    setTranscript("");
    setPain(null);
    setSleep(null);
    setMood("");
    setNotes("");
    setNotesUrdu("");
    setEntries([]);
    setAiFilled(NONE_FILLED);
    setProblems([]);
    setSaveError(null);
    setNeedsUpdate(false);
  }

  function startEditing(entry: Symptom) {
    setBaseId(entry.id);
    setTranscript(entry.voice_transcript ?? "");
    setPain(entry.pain_level);
    setSleep(entry.sleep_hours);
    setMood((entry.mood as Mood) || "");
    setNotes(entry.notes || "");
    setNotesUrdu(entry.notes_urdu || "");
    setEntries(fromSaved(entry.timeline));
    setAiFilled(NONE_FILLED);
    setProblems([]);
    setSaveError(null);
    setEditing(true);
  }

  const moodLabel = (m: string | null) =>
    m && MOOD_LABELS[m as keyof typeof MOOD_LABELS]
      ? t(MOOD_LABELS[m as keyof typeof MOOD_LABELS])
      : (m ?? "");

  const recentList = (
    <section aria-labelledby="recent-entries" className="panel" data-tour="diary-recent">
      <h2 id="recent-entries" className="display text-2xl">
        {t("diary.recentTitle")}
      </h2>
      {recent.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={NotebookPen}
            title={t("diary.recentEmptyTitle")}
            body={t("diary.recentEmptyBody")}
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {recent.map((r) => {
            const level = painLevel(r.pain_level ?? 0);
            return (
              <li key={r.id ?? r.created_at} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-semibold">
                    {formatDate(new Date(r.created_at), {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-[0.9375rem]">
                    <span className={`font-semibold ${level.text}`}>
                      {t("report.pain")} <bdi dir="ltr">{r.pain_level}/10</bdi>
                    </span>
                    <span className="text-muted-foreground">
                      {" · "}
                      <bdi dir="ltr">{r.sleep_hours}h</bdi>
                      {" · "}
                      {moodLabel(r.mood)}
                    </span>
                  </p>
                </div>
                {r.notes && (
                  <p className="mt-1 text-[0.9375rem] text-muted-foreground">
                    <Med>{r.notes}</Med>
                  </p>
                )}
                <SavedTimeline value={r.timeline} className="mt-2" />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  // ---- saved view ------------------------------------------------------------------
  if (todayEntry && !editing) {
    return (
      <PageEnter className="mx-auto max-w-3xl space-y-6">
        <PageHeader
        guide="diary" icon={MicIcon} title={t("nav.diary")} />
        <section className="panel" data-diary-state="saved" data-tour="symptom-diary-saved">
          <p className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden="true" />{" "}
            {t("diary.alreadyLogged")}
          </p>
          <p className="mt-3">
            {t("diary.lastEntry", {
              pain: todayEntry.pain_level ?? "",
              sleep: todayEntry.sleep_hours ?? "",
              mood: moodLabel(todayEntry.mood),
            })}
          </p>
          {todayEntry.notes && (
            <p className="mt-3">
              <Med>{todayEntry.notes}</Med>
            </p>
          )}
          {todayEntry.notes_urdu && <p className="urdu mt-1">{todayEntry.notes_urdu}</p>}
          <SavedTimeline value={todayEntry.timeline} className="mt-4" />
          <Button
            variant="outline"
            onClick={() => startEditing(todayEntry)}
            className="mt-5"
            data-tour="voice-diary-update"
          >
            <PencilLine aria-hidden="true" /> {t("diary.update")}
          </Button>
        </section>
        {recentList}
      </PageEnter>
    );
  }

  // ---- draft editor ----------------------------------------------------------------
  const level = pain !== null ? painLevel(pain) : null;
  const stateKey = baseId
    ? dirty
      ? "diary.state.editedAfterSave"
      : "diary.state.saved"
    : "diary.state.draft";
  const busy = saving || extracting;

  return (
    <PageEnter className="mx-auto max-w-3xl space-y-6">
      {!checkedToday && <span data-tour-busy hidden />}
      <PageHeader
        guide="diary"
        icon={MicIcon}
        title={t("diary.title")}
        description={t("diary.speakHint")}
        urdu={<UrduHint className="mt-1 text-lg">آج کی صحت درج کریں</UrduHint>}
      />

      {restored && (
        <StatusBanner
          tone="info"
          title={t("diary.draftRestored")}
          action={
            <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(true)}>
              {t("diary.discardDraft")}
            </Button>
          }
        >
          {t("diary.draftRestoredBody")}
        </StatusBanner>
      )}

      <section
        data-tour="voice-diary-page"
        aria-label={t("diary.voiceSection")}
        className="panel-tint flex flex-col items-center text-center"
      >
        <button
          type="button"
          onClick={listening ? () => recRef.current?.stop() : startListening}
          disabled={busy}
          data-tour="voice-mic"
          aria-pressed={listening}
          aria-label={listening ? t("diary.stopListening") : t("diary.tapToSpeak")}
          className={`press relative grid h-28 w-28 place-items-center rounded-full disabled:opacity-60 ${
            listening ? "mic-pulse bg-coral text-ink" : "bg-primary text-primary-foreground"
          }`}
        >
          <span className="relative">
            {extracting ? (
              <Loader2 className="h-9 w-9 animate-spin" aria-hidden="true" />
            ) : listening ? (
              <Square className="h-8 w-8" fill="currentColor" aria-hidden="true" />
            ) : (
              <Mic className="h-9 w-9" aria-hidden="true" />
            )}
          </span>
        </button>
        <p role="status" className="mt-4 text-lg font-semibold">
          {listening
            ? t("diary.listening")
            : extracting
              ? t("diary.understanding")
              : t("diary.tapToSpeak")}
        </p>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t("diary.voiceDraftNote")}</p>
        <div
          role="group"
          aria-label={t("diary.speakIn")}
          className="mt-3 inline-flex items-center gap-2"
          data-speech-lang={speechLang}
          data-tour="voice-lang"
        >
          <span className="text-sm font-semibold text-muted-foreground">{t("diary.speakIn")}</span>
          <span className="inline-flex rounded-full border border-input bg-card p-0.5">
            {(["ur", "en"] as const).map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                aria-pressed={speechLang === code}
                disabled={listening}
                onClick={() => setSpeechLang(code)}
                className={`min-h-11 min-w-16 rounded-full px-3 text-sm font-semibold ${
                  speechLang === code ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                } ${code === "ur" ? "urdu leading-none" : ""}`}
              >
                {getLanguage(code).nativeName}
              </button>
            ))}
          </span>
        </div>
        {voiceError && (
          <div className="mt-4 w-full text-start">
            <StatusBanner tone="warning" title={voiceError}>
              {t("diary.typeInstead")}
            </StatusBanner>
          </div>
        )}
      </section>

      <div
        className="flex flex-wrap items-center gap-2"
        data-diary-state={baseId ? (dirty ? "edited" : "saved") : "draft"}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/8 px-3 py-1 text-sm font-semibold text-warning">
          <PencilLine className="h-4 w-4" aria-hidden="true" /> {t(stateKey)}
        </span>
        <span className="text-sm text-muted-foreground">{t("diary.notSavedUntil")}</span>
      </div>

      {/* Transcript: what was heard, editable, and can be organised again. */}
      <section aria-labelledby="transcript-label" className="panel space-y-3" data-tour="voice-transcript">
        {transcript.trim() && (
          <FirstTimeTip id="diary-transcript">{t("guide.tip.transcript")}</FirstTimeTip>
        )}
        <label id="transcript-label" htmlFor="transcript" className="field-label">
          {t("diary.transcriptLabel")}
        </label>
        <Textarea
          id="transcript"
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            touch();
          }}
          rows={3}
          dir="auto"
          placeholder={t("diary.transcriptPlaceholder")}
        />
        <Button
          variant="outline"
          disabled={busy || !transcript.trim()}
          onClick={() => organise(transcript)}
        >
          <Sparkles aria-hidden="true" /> {t("diary.organise")}
        </Button>
        <p className="text-sm text-muted-foreground">{t("diary.organiseNote")}</p>
      </section>

      {/* Timeline: the person decides the entries, their order, times and emojis. */}
      <section aria-labelledby="timeline-heading" className="panel space-y-4" data-tour="voice-timeline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="timeline-heading" className="text-lg font-semibold">
            {t("diary.timelineTitle")}
          </h2>
          <Button variant="outline" onClick={addEntry}>
            <Plus aria-hidden="true" /> {t("diary.addEntry")}
          </Button>
        </div>
        <p className="text-[0.9375rem] text-muted-foreground">{t("diary.timelineHelp")}</p>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        {entries.length === 0 ? (
          <p className="rounded-2xl bg-secondary p-4 text-[0.9375rem]">
            {t("diary.timelineEmpty")}
          </p>
        ) : (
          <TimelineEditor
            entries={entries}
            onUpdate={updateEntry}
            onMove={moveEntry}
            onRemove={removeEntry}
          />
        )}
      </section>

      <section
        aria-label={t("diary.formSection")}
        className="panel space-y-6"
        data-tour="symptom-diary-page"
      >
        <div data-tour="diary-pain">
          <label
            htmlFor="pain"
            className="field-label flex flex-wrap items-baseline justify-between gap-2"
          >
            <span>
              {t("diary.painLevel")} {aiFilled.pain && <FromVoice />}
            </span>
            {level ? (
              <span className={`text-lg font-bold ${level.text}`}>
                <bdi dir="ltr">{pain}/10</bdi> {t(level.key)}
              </span>
            ) : (
              <span className="text-[0.9375rem] font-semibold text-muted-foreground">
                {t("diary.notSet")}
              </span>
            )}
          </label>
          <input
            id="pain"
            type="range"
            min={1}
            max={10}
            value={pain ?? 5}
            aria-valuetext={
              pain !== null && level ? `${pain}/10, ${t(level.key)}` : t("diary.notSet")
            }
            onChange={(e) => {
              setPain(+e.target.value);
              setAiFilled((a) => ({ ...a, pain: false }));
              touch();
            }}
            className={`h-11 w-full ${level ? level.accent : "opacity-60"}`}
          />
          {pain === null && <p className="text-sm text-muted-foreground">{t("diary.painHint")}</p>}
        </div>

        <div data-tour="diary-sleep">
          <label htmlFor="sleep" className="field-label">
            {t("diary.sleepHours")} {aiFilled.sleep && <FromVoice />}
          </label>
          <input
            id="sleep"
            type="number"
            dir="ltr"
            min={0}
            max={24}
            step={0.5}
            value={sleep ?? ""}
            placeholder="—"
            onChange={(e) => {
              const v = e.target.value;
              setSleep(v === "" ? null : Math.min(24, Math.max(0, +v)));
              setAiFilled((a) => ({ ...a, sleep: false }));
              touch();
            }}
            className="h-12 w-32 rounded-xl border border-input bg-card px-4 text-base"
          />
        </div>

        <fieldset data-tour="diary-mood">
          <legend className="field-label">
            {t("diary.howFeeling")} {aiFilled.mood && <FromVoice />}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["happy", "😊", MOOD_LABELS.happy],
                ["okay", "😐", MOOD_LABELS.okay],
                ["sad", "😢", MOOD_LABELS.sad],
              ] as const
            ).map(([val, emoji, label]) => (
              <label
                key={val}
                className={`press flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 p-3 transition-colors has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring ${
                  mood === val ? "border-primary bg-accent" : "border-border hover:bg-secondary"
                }`}
              >
                <input
                  type="radio"
                  name="mood"
                  value={val}
                  checked={mood === val}
                  onChange={() => {
                    setMood(val);
                    setAiFilled((a) => ({ ...a, mood: false }));
                    touch();
                  }}
                  className="sr-only"
                />
                <span className="text-3xl" aria-hidden="true">
                  {emoji}
                </span>
                <span className="text-sm font-semibold">{t(label)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div data-tour="diary-notes">
          <label htmlFor="notes" className="field-label">
            {t("diary.notesEnglish")} {aiFilled.notes && <FromVoice />}
          </label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setAiFilled((a) => ({ ...a, notes: false }));
              touch();
            }}
            rows={3}
            dir="auto"
            placeholder={t("diary.notesPlaceholder")}
          />
        </div>

        <div>
          <label htmlFor="notes-urdu" className="urdu field-label">
            نوٹس (اردو)
          </label>
          <Textarea
            id="notes-urdu"
            value={notesUrdu}
            onChange={(e) => {
              setNotesUrdu(e.target.value);
              touch();
            }}
            rows={3}
            placeholder="اردو میں لکھیں..."
            dir="rtl"
            className="urdu"
          />
        </div>

        {(problems.length > 0 || saveError) && (
          <div ref={errorRef} tabIndex={-1} className="outline-none">
            <StatusBanner
              tone="danger"
              title={problems.length ? t("diary.checkBeforeSaving") : t("diary.notSavedTitle")}
              action={
                needsUpdate ? (
                  <Button variant="outline" size="sm" onClick={() => save(false)}>
                    {t("diary.saveWithoutTimeline")}
                  </Button>
                ) : undefined
              }
            >
              {problems.length ? (
                <ul className="list-disc space-y-1 ps-5">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                saveError
              )}
            </StatusBanner>
          </div>
        )}

        <div className="flex flex-wrap gap-3" data-tour="diary-save">
          <Button size="lg" disabled={busy} aria-busy={saving} onClick={() => save(true)}>
            {saving ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {baseId ? t("diary.saveChanges") : t("diary.saveDiary")}
          </Button>
          {(dirty || baseId) && (
            <Button
              size="lg"
              variant="outline"
              disabled={saving}
              onClick={() => setConfirmDiscard(true)}
            >
              <RefreshCcw aria-hidden="true" />{" "}
              {baseId ? t("common.cancel") : t("diary.discardDraft")}
            </Button>
          )}
        </div>
      </section>

      {recentList}

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={baseId ? t("diary.cancelEditTitle") : t("diary.discardTitle")}
        body={baseId ? t("diary.cancelEditBody") : t("diary.discardBody")}
        confirmLabel={baseId ? t("diary.cancelEditConfirm") : t("diary.discardDraft")}
        cancelLabel={t("diary.keepEditing")}
        onConfirm={() => {
          resetDraft();
          setEditing(false);
        }}
      />
    </PageEnter>
  );
}

function FromVoice() {
  const { t } = useI18n();
  return (
    <span className="ms-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 align-middle text-xs font-semibold text-primary">
      <Sparkles className="h-3 w-3" aria-hidden="true" /> {t("diary.fromVoice")}
    </span>
  );
}

function TimelineEditor({
  entries,
  onUpdate,
  onMove,
  onRemove,
}: {
  entries: TimelineEntry[];
  onUpdate: (id: string, patch: Partial<TimelineEntry>) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  return (
    <ol className="space-y-3">
      {entries.map((e, i) => (
        <li
          key={e.id}
          data-entry={i}
          onDragOver={(ev) => {
            if (dragFrom === null) return;
            ev.preventDefault();
            setDragOver(i);
          }}
          onDrop={(ev) => {
            ev.preventDefault();
            if (dragFrom !== null) onMove(dragFrom, i);
            setDragFrom(null);
            setDragOver(null);
          }}
          className={`rounded-2xl border p-4 transition-colors ${
            dragOver === i && dragFrom !== i ? "border-primary bg-accent" : "border-border bg-card"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {/* Drag handle for mouse users; the arrow buttons do the same for everyone. */}
            <span
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.effectAllowed = "move";
                ev.dataTransfer.setData("text/plain", String(i));
                setDragFrom(i);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              className="hidden cursor-grab text-muted-foreground md:inline-flex"
              title={t("diary.dragHint")}
              aria-hidden="true"
            >
              <GripVertical className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold text-primary tabular-nums">{i + 1}.</span>
            {e.origin === "ai" && !e.emoji && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {t("diary.aiSuggestion")}
              </span>
            )}
            <div className="ms-auto flex gap-1">
              <Button
                size="icon"
                variant="outline"
                disabled={i === 0}
                onClick={() => onMove(i, i - 1)}
                aria-label={t("diary.moveUp", { n: i + 1 })}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                disabled={i === entries.length - 1}
                onClick={() => onMove(i, i + 1)}
                aria-label={t("diary.moveDown", { n: i + 1 })}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:bg-destructive/8 hover:text-destructive"
                onClick={() => onRemove(e.id)}
                aria-label={t("diary.removeEntry", { n: i + 1 })}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div>
              <label htmlFor={`entry-text-${e.id}`} className="text-sm font-semibold">
                {t("diary.entryText", { n: i + 1 })}
              </label>
              <Input
                id={`entry-text-${e.id}`}
                value={e.text}
                dir="auto"
                maxLength={300}
                onChange={(ev) => onUpdate(e.id, { text: ev.target.value })}
              />
            </div>
            <div>
              <label htmlFor={`entry-time-${e.id}`} className="text-sm font-semibold">
                {t("diary.entryTime")}
              </label>
              <Input
                id={`entry-time-${e.id}`}
                type="time"
                dir="ltr"
                value={e.time}
                onChange={(ev) => onUpdate(e.id, { time: ev.target.value })}
              />
            </div>
          </div>

          <EmojiPicker entry={e} index={i} onPick={(emoji) => onUpdate(e.id, { emoji })} />
        </li>
      ))}
    </ol>
  );
}

function EmojiPicker({
  entry,
  index,
  onPick,
}: {
  entry: TimelineEntry;
  index: number;
  onPick: (e: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!entry.emoji);
  const label = (e: string) => {
    const key = EMOJI_LABEL[e as (typeof DIARY_EMOJIS)[number]];
    return key ? t(key) : e;
  };
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t("diary.emojiLabel", { n: index + 1 })}</span>
        {entry.emoji ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-sm font-semibold">
              <span aria-hidden="true" className="text-lg leading-none">
                {entry.emoji}
              </span>
              {label(entry.emoji)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
            >
              {t("diary.changeEmoji")}
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{t("diary.emojiNotChosen")}</span>
        )}
        {!entry.emoji && entry.suggestedEmoji && (
          <Button size="sm" variant="outline" onClick={() => onPick(entry.suggestedEmoji)}>
            <span aria-hidden="true">{entry.suggestedEmoji}</span>
            {t("diary.useSuggested", { name: label(entry.suggestedEmoji) })}
          </Button>
        )}
      </div>
      {open && (
        <div
          role="group"
          aria-label={t("diary.emojiLabel", { n: index + 1 })}
          className="mt-2 flex flex-wrap gap-1.5"
        >
          {DIARY_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              aria-pressed={entry.emoji === em}
              aria-label={label(em)}
              title={label(em)}
              onClick={() => {
                onPick(em);
                setOpen(false);
              }}
              className={`press grid h-11 w-11 place-items-center rounded-xl border-2 text-2xl leading-none ${
                entry.emoji === em ? "border-primary bg-accent" : "border-border hover:bg-secondary"
              }`}
            >
              <span aria-hidden="true">{em}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
