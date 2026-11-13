-- MediSnap: Prescription Safety & Verification
-- Additive only. Creates no columns on existing tables and changes no existing policies.
--
--   storage bucket  prescriptions          original uploaded files, private, owner-only
--   table           public.prescriptions   one row per saved prescription: the original
--                                          file's metadata, the AI output exactly as it
--                                          came back, and the current review state
--   table           public.prescription_reviews
--                                          append-only audit trail of every review action
--
-- prescriptions.id is the same uuid already stored in public.scans.scan_group_id, so the
-- existing per-medicine rows (History, Calendar, Doctor Report) keep working unchanged.

-- ---------------------------------------------------------------------------
-- 1. Private bucket for original prescriptions (images and PDFs, 20 MB max)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prescriptions',
  'prescriptions',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- Files live at <user_id>/<prescription_id>/original.<ext>. Each user reaches only their
-- own folder. There is deliberately no UPDATE policy: an original can never be replaced.
drop policy if exists "prescription_files_select_own" on storage.objects;
create policy "prescription_files_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "prescription_files_insert_own" on storage.objects;
create policy "prescription_files_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "prescription_files_delete_own" on storage.objects;
create policy "prescription_files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 2. Prescription records
-- ---------------------------------------------------------------------------
create table if not exists public.prescriptions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- The original file: metadata only. The file itself stays in storage, untouched.
  original_path text not null,
  original_mime text not null,
  original_size bigint not null check (original_size > 0),
  original_sha256 text not null,
  page_count integer not null default 1 check (page_count between 1 and 10),
  uploaded_at timestamptz not null default now(),

  -- Image checks made before extraction, and the model's own usability estimate.
  quality jsonb,

  -- AI output exactly as returned. Kept separately from any user correction.
  extraction jsonb not null,
  model text not null,

  -- Current review state per field, including user-corrected values.
  review jsonb not null default '{}'::jsonb,
  status text not null default 'AI_EXTRACTED_UNVERIFIED' check (status in (
    'AI_EXTRACTED_UNVERIFIED', 'USER_CONFIRMED', 'USER_CORRECTED',
    'PROFESSIONALLY_VERIFIED', 'NEEDS_PROFESSIONAL_REVIEW', 'UNREADABLE'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prescriptions_user_created_idx
  on public.prescriptions (user_id, created_at desc);

alter table public.prescriptions enable row level security;

drop policy if exists "prescriptions_select_own" on public.prescriptions;
create policy "prescriptions_select_own" on public.prescriptions
  for select using (auth.uid() = user_id);
drop policy if exists "prescriptions_insert_own" on public.prescriptions;
create policy "prescriptions_insert_own" on public.prescriptions
  for insert with check (auth.uid() = user_id);
drop policy if exists "prescriptions_update_own" on public.prescriptions;
create policy "prescriptions_update_own" on public.prescriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "prescriptions_delete_own" on public.prescriptions;
create policy "prescriptions_delete_own" on public.prescriptions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Review audit trail (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.prescription_reviews (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  medicine_index integer not null check (medicine_index >= 0),
  field text not null,
  action text not null check (action in ('confirm', 'correct', 'mark_unclear', 'reset')),
  previous_value text,
  new_value text,
  new_status text not null check (new_status in (
    'AI_EXTRACTED_UNVERIFIED', 'USER_CONFIRMED', 'USER_CORRECTED',
    'PROFESSIONALLY_VERIFIED', 'NEEDS_PROFESSIONAL_REVIEW', 'UNREADABLE'
  )),
  created_at timestamptz not null default now()
);

create index if not exists prescription_reviews_prescription_idx
  on public.prescription_reviews (prescription_id, created_at);

alter table public.prescription_reviews enable row level security;

-- Read and add only. No update or delete policies: history can't be rewritten. Rows go
-- only when their prescription is deleted (cascade).
drop policy if exists "prescription_reviews_select_own" on public.prescription_reviews;
create policy "prescription_reviews_select_own" on public.prescription_reviews
  for select using (auth.uid() = user_id);
drop policy if exists "prescription_reviews_insert_own" on public.prescription_reviews;
create policy "prescription_reviews_insert_own" on public.prescription_reviews
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.prescriptions p
      where p.id = prescription_id and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Guarantees enforced by the database, not just the app
-- ---------------------------------------------------------------------------
-- "Professionally verified" can only be written by the service role (a future, genuine
-- professional workflow). Patients' sessions can never set it, on any field.
create or replace function public.prescription_guard_professional()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    if tg_table_name = 'prescriptions' then
      if new.status = 'PROFESSIONALLY_VERIFIED'
         or new.review::text like '%PROFESSIONALLY_VERIFIED%' then
        raise exception 'Only an authorised professional review can mark a prescription as professionally verified';
      end if;
    elsif new.new_status = 'PROFESSIONALLY_VERIFIED' then
      raise exception 'Only an authorised professional review can mark a field as professionally verified';
    end if;
  end if;
  return new;
end;
$$;

-- The original file and the AI extraction are fixed once saved.
create or replace function public.prescription_guard_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.original_path <> old.original_path
     or new.original_mime <> old.original_mime
     or new.original_size <> old.original_size
     or new.original_sha256 <> old.original_sha256
     or new.page_count <> old.page_count
     or new.uploaded_at <> old.uploaded_at
     or new.extraction is distinct from old.extraction
     or new.model <> old.model
     or new.quality is distinct from old.quality then
    raise exception 'The original prescription and its AI extraction cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prescriptions_guard_professional on public.prescriptions;
create trigger prescriptions_guard_professional
  before insert or update on public.prescriptions
  for each row execute function public.prescription_guard_professional();

drop trigger if exists prescriptions_guard_immutable on public.prescriptions;
create trigger prescriptions_guard_immutable
  before update on public.prescriptions
  for each row execute function public.prescription_guard_immutable();

drop trigger if exists prescription_reviews_guard_professional on public.prescription_reviews;
create trigger prescription_reviews_guard_professional
  before insert on public.prescription_reviews
  for each row execute function public.prescription_guard_professional();
