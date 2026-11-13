-- MediSnap: user-controlled voice diary timeline
-- Additive only: two nullable columns on public.symptoms. Existing rows, policies and
-- relationships are untouched; rows without a timeline keep working exactly as before.
--
--   timeline          the person's final, ordered entries:
--                     [{ "position": 0, "text": "...", "time": "08:30" | null,
--                        "emoji": "🤕", "origin": "ai" | "user" }, ...]
--   voice_transcript  what speech recognition heard, as the person last edited it

alter table public.symptoms
  add column if not exists timeline jsonb,
  add column if not exists voice_transcript text;

-- A timeline, when present, must be a list (not a single object or a string).
alter table public.symptoms drop constraint if exists symptoms_timeline_is_array;
alter table public.symptoms
  add constraint symptoms_timeline_is_array
  check (timeline is null or jsonb_typeof(timeline) = 'array');
