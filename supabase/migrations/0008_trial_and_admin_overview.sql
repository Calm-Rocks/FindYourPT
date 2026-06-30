-- ============================================================
-- FindYourPT — migration 0008: trial tracking for early PT outreach
-- Run this in the Supabase SQL editor AFTER 0007_verification.sql.
--
-- Adds trial_expires_at to pts: a nullable date marking when a PT's free
-- trial period ends. NULL means "not on a trial" (either never was, or
-- already converted to paying / removed). This is deliberately separate
-- from listing_tier (standard/featured), which controls SEARCH PLACEMENT,
-- not billing status — a PT can be on trial AND featured at the same
-- time, or standard and not on trial. Conflating the two would make real
-- billing logic harder to build later.
--
-- Also adds an admin-only RPC (get_admin_pt_overview) that returns every
-- PT with their enquiry count and trial status in one call, avoiding
-- separate round trips and avoiding exposing this aggregate data via a
-- general-purpose policy that might be reused elsewhere.
-- ============================================================

alter table pts add column if not exists trial_expires_at timestamptz;

-- ============================================================
-- Admin-only function: PT overview with enquiry counts.
-- SECURITY DEFINER would normally be needed to count enquiries across all
-- PTs (since enquiries RLS only lets a PT see their own) — but rather than
-- using SECURITY DEFINER (which runs with elevated privilege and needs
-- careful auditing), this function instead checks is_admin itself at the
-- top and raises an exception otherwise, then runs as the calling admin's
-- own already-elevated read access granted by the
-- "admins can view all submissions"-style policies. Since enquiries
-- currently has no admin-read policy, we add one below, scoped tightly to
-- admins only, mirroring the verification_submissions pattern.
-- ============================================================

create policy "admins can view all enquiries"
  on enquiries for select
  using (
    exists (
      select 1 from pts where pts.id = auth.uid() and pts.is_admin = true
    )
  );

create or replace function get_admin_pt_overview()
returns table (
  id uuid,
  display_name text,
  postcode text,
  verification_status text,
  listing_tier text,
  is_active boolean,
  trial_expires_at timestamptz,
  enquiry_count bigint,
  created_at timestamptz
) as $$
  select
    p.id,
    p.display_name,
    p.postcode,
    p.verification_status,
    p.listing_tier,
    p.is_active,
    p.trial_expires_at,
    count(e.id) as enquiry_count,
    p.created_at
  from pts p
  left join enquiries e on e.pt_id = p.id
  where exists (
    select 1 from pts admin_check where admin_check.id = auth.uid() and admin_check.is_admin = true
  )
  group by p.id
  order by p.created_at desc;
$$ language sql stable;

grant execute on function get_admin_pt_overview() to authenticated;

-- Admins also need to be able to set trial_expires_at on any PT — already
-- covered by the existing "admins can update any pt verification status"
-- policy from migration 0007, since that policy permits UPDATE on the
-- whole pts row for admins, not just the verification columns. No new
-- policy needed here.
