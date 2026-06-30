-- ============================================================
-- SpotMyPT — pre-launch cleanup helper (not a migration, run manually)
--
-- This is deliberately NOT an automatic "delete anything that looks like
-- test data" script. Guessing at test data by name pattern (e.g. WHERE
-- display_name LIKE '%test%') is exactly the kind of fragile query that
-- could delete a real trainer who happens to share a name pattern, or
-- miss junk listings that don't match the pattern at all. Review the
-- list yourself, then delete specific rows by their real id.
-- ============================================================

-- Step 1: Review every current listing before deleting anything.
select
  id,
  display_name,
  postcode,
  verification_status,
  is_active,
  created_at
from pts
order by created_at asc;

-- Step 2: For each row you've identified as test/demo data (not a real
-- trainer), copy its id from the list above and delete it individually.
-- Deleting a pts row cascades to remove their pt_specialisms,
-- enquiries received, and verification_submissions automatically (the
-- foreign keys were defined with ON DELETE CASCADE back in migration
-- 0001), so one delete per row is enough — no need to clean up related
-- tables separately.
--
-- delete from pts where id = 'PASTE-THE-REAL-ID-HERE';
--
-- Repeat for each test listing. Do this one at a time, not as a bulk
-- statement, so you can't accidentally wipe more than you meant to.

-- Step 3 (optional): also check for trainers with no real verification
-- documents who somehow still show approved — shouldn't be possible
-- given the review workflow, but worth a glance before going live:
select p.id, p.display_name, p.verification_status
from pts p
where p.verification_status = 'approved'
  and not exists (
    select 1 from verification_submissions vs
    where vs.pt_id = p.id and vs.status = 'approved'
  );
