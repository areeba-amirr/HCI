-- MediSnap: guided medicine identification (packaging scan evidence, "Unable to identify").
--
-- Requires 20261106120000_prescription_safety.sql and 20261113120000_my_medicines.sql.
-- Additive and non-destructive: no table, column, row or policy is removed; existing rows
-- already satisfy every new check. RLS policies are unchanged: the new columns sit on rows
-- the existing owner-only policies already protect.
--
--   prescription_reviews.evidence          'packaging_scan' when the patient confirmed or
--                                          corrected a name after scanning the box or strip
--   medicine_name_confirmations.evidence   the same, for label scans and older rows
--   medicine_name_confirmations action     adds 'unable_to_identify' (no name is stored);
--                                          the latest row still decides the current state

-- ---------------------------------------------------------------------------
-- 1. Packaging evidence on saved-prescription reviews
-- ---------------------------------------------------------------------------
alter table public.prescription_reviews add column if not exists evidence text;

alter table public.prescription_reviews drop constraint if exists prescription_reviews_evidence_check;
alter table public.prescription_reviews
  add constraint prescription_reviews_evidence_check
  check (evidence is null or (evidence = 'packaging_scan' and action in ('confirm', 'correct')));

-- ---------------------------------------------------------------------------
-- 2. Label scans and older rows: packaging evidence and "Unable to identify"
-- ---------------------------------------------------------------------------
alter table public.medicine_name_confirmations add column if not exists evidence text;

alter table public.medicine_name_confirmations drop constraint if exists medicine_name_confirmations_evidence_check;
alter table public.medicine_name_confirmations
  add constraint medicine_name_confirmations_evidence_check
  check (evidence is null or (evidence = 'packaging_scan' and action in ('confirm', 'correct')));

-- "Unable to identify" stores no name, so the name becomes optional for that action only.
alter table public.medicine_name_confirmations alter column confirmed_name drop not null;

-- The original inline check (Postgres names it medicine_name_confirmations_action_check)
-- is replaced by one that also allows 'unable_to_identify'.
alter table public.medicine_name_confirmations drop constraint if exists medicine_name_confirmations_action_check;
alter table public.medicine_name_confirmations
  add constraint medicine_name_confirmations_action_check
  check (action in ('confirm', 'correct', 'unable_to_identify'));

alter table public.medicine_name_confirmations drop constraint if exists medicine_name_confirmations_name_matches_action;
alter table public.medicine_name_confirmations
  add constraint medicine_name_confirmations_name_matches_action
  check ((action = 'unable_to_identify') = (confirmed_name is null));

-- Same guard as before, plus: "unable_to_identify" records what the AI read and no name.
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
  new.created_at := now();

  if new.action = 'unable_to_identify' then
    new.confirmed_name := null;
    new.evidence := null;
    return new;
  end if;

  new.confirmed_name := btrim(new.confirmed_name);
  if new.action = 'confirm' and (read_name is null or new.confirmed_name <> btrim(read_name)) then
    raise exception 'Confirm can only confirm the name exactly as it was read; use correct to change it';
  end if;

  return new;
end;
$$;
-- The trigger from 20261113120000 already calls this function; it is not recreated.
