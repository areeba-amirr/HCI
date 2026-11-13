-- MediSnap: My Medicines (patient tracking and name confirmation) and the doctor's name.
--
-- Requires 20261106120000_prescription_safety.sql (public.prescriptions) to be applied first.
-- Additive only: one nullable column on public.prescriptions and two new tables. No existing
-- row, column, policy or trigger is changed.
--
--   prescriptions.doctor_name      typed by the patient; optional; never read by AI
--   medicine_status_events         append-only history of the patient's own Taken /
--                                  Not taken / Not sure record for each medicine
--   medicine_name_confirmations    append-only Confirm Name / Correct Name for medicines that
--                                  are NOT part of a saved prescription (label scans, and
--                                  prescription rows saved before originals were kept).
--                                  Saved prescriptions keep using prescription_reviews.
--
-- Both new tables point at public.scans(id): every medicine already has exactly one scans
-- row, which traces back to its source through scans.scan_group_id (the prescription) and
-- prescription_data.medicine_index (its position on it). Deleting the medicine from History
-- deletes its tracking and confirmations with it.

-- ---------------------------------------------------------------------------
-- 1. Doctor's name on a saved prescription
-- ---------------------------------------------------------------------------
-- Not covered by prescription_guard_immutable, so it stays editable while the original file
-- and the AI output remain fixed.
alter table public.prescriptions add column if not exists doctor_name text;

alter table public.prescriptions drop constraint if exists prescriptions_doctor_name_length;
alter table public.prescriptions
  add constraint prescriptions_doctor_name_length
  check (doctor_name is null or char_length(btrim(doctor_name)) between 1 and 120);

-- ---------------------------------------------------------------------------
-- 2. Taken / Not taken / Not sure history
-- ---------------------------------------------------------------------------
-- The current status of a medicine is its newest row. No row means "not recorded".
-- Nothing in MediSnap writes here except the patient's own choice.
create table if not exists public.medicine_status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null references public.scans (id) on delete cascade,
  status text not null check (status in ('taken', 'not_taken', 'not_sure')),
  recorded_at timestamptz not null default now()
);

create index if not exists medicine_status_events_scan_idx
  on public.medicine_status_events (scan_id, recorded_at desc);
create index if not exists medicine_status_events_user_idx
  on public.medicine_status_events (user_id, recorded_at desc);

alter table public.medicine_status_events enable row level security;

-- Read and add only. There are no update or delete policies, so earlier entries can't be
-- changed or removed; they go only when the medicine (or the account) is deleted.
drop policy if exists "medicine_status_events_select_own" on public.medicine_status_events;
create policy "medicine_status_events_select_own" on public.medicine_status_events
  for select using (auth.uid() = user_id);

drop policy if exists "medicine_status_events_insert_own" on public.medicine_status_events;
create policy "medicine_status_events_insert_own" on public.medicine_status_events
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.scans s
      where s.id = scan_id and s.user_id = auth.uid()
    )
  );

-- The date always comes from the database clock, so an entry can't be backdated.
create or replace function public.medicine_status_events_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.recorded_at := now();
  return new;
end;
$$;

drop trigger if exists medicine_status_events_stamp on public.medicine_status_events;
create trigger medicine_status_events_stamp
  before insert on public.medicine_status_events
  for each row execute function public.medicine_status_events_stamp();

-- ---------------------------------------------------------------------------
-- 3. Confirm Name for label scans and older prescription rows
-- ---------------------------------------------------------------------------
-- The AI reading in scans.medicine_name is never changed. The current confirmed name is
-- the newest row here.
create table if not exists public.medicine_name_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null references public.scans (id) on delete cascade,
  action text not null check (action in ('confirm', 'correct')),
  -- The name as the AI read it when the person acted. Filled in by the database.
  ai_name text,
  confirmed_name text not null check (char_length(btrim(confirmed_name)) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists medicine_name_confirmations_scan_idx
  on public.medicine_name_confirmations (scan_id, created_at desc);

alter table public.medicine_name_confirmations enable row level security;

drop policy if exists "medicine_name_confirmations_select_own" on public.medicine_name_confirmations;
create policy "medicine_name_confirmations_select_own" on public.medicine_name_confirmations
  for select using (auth.uid() = user_id);

drop policy if exists "medicine_name_confirmations_insert_own" on public.medicine_name_confirmations;
create policy "medicine_name_confirmations_insert_own" on public.medicine_name_confirmations
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.scans s
      where s.id = scan_id and s.user_id = auth.uid()
    )
  );

-- Records what the AI read, keeps "confirm" honest (it can only confirm that exact name),
-- and keeps saved prescriptions on their own review workflow.
create or replace function public.medicine_name_confirmations_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  grp uuid;
  read_name text;
begin
  select s.scan_group_id, s.medicine_name into grp, read_name
    from public.scans s where s.id = new.scan_id;

  if grp is not null and exists (select 1 from public.prescriptions p where p.id = grp) then
    raise exception 'Medicines from a saved prescription are confirmed through the prescription review';
  end if;

  new.ai_name := read_name;
  new.confirmed_name := btrim(new.confirmed_name);
  if new.action = 'confirm' and (read_name is null or new.confirmed_name <> btrim(read_name)) then
    raise exception 'Confirm can only confirm the name exactly as it was read; use correct to change it';
  end if;

  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists medicine_name_confirmations_guard on public.medicine_name_confirmations;
create trigger medicine_name_confirmations_guard
  before insert on public.medicine_name_confirmations
  for each row execute function public.medicine_name_confirmations_guard();
