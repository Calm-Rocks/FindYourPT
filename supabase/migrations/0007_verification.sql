-- ============================================================
-- FindYourPT — migration 0007: trainer verification
-- Run this in the Supabase SQL editor AFTER 0006_any_distance_search.sql.
--
-- Adds:
--   - is_admin flag on pts (used to gate the admin review page)
--   - verification_status on pts (unverified / pending / approved / rejected)
--   - verification_submissions table (document upload tracking + review)
--   - a private storage bucket for verification documents (NOT publicly
--     readable, unlike trainer-images)
--   - search_pts updated to only return approved listings
--
-- IMPORTANT — making yourself admin: after running this migration, you
-- must manually set your own account as admin via SQL, since there's no
-- UI for this yet (and shouldn't be — granting admin should be a
-- deliberate, rare action). Run this once, substituting your own user id
-- (find it in Authentication → Users in the dashboard):
--
--   update pts set is_admin = true where id = 'YOUR_USER_ID_HERE';
--
-- If you don't yet have a pts row (haven't created a listing), insert one
-- or run this against auth.users directly — see the comment near the
-- bottom of this file for the alternative.
-- ============================================================

-- ------------------------------------------------------------
-- pts: admin flag and verification status
-- ------------------------------------------------------------
alter table pts add column if not exists is_admin boolean not null default false;
alter table pts add column if not exists verification_status text not null default 'unverified'
  check (verification_status in ('unverified', 'pending', 'approved', 'rejected'));
alter table pts add column if not exists verification_rejection_reason text;

-- ------------------------------------------------------------
-- verification_submissions: one row per document submission.
-- A PT can have multiple submissions over time (e.g. resubmitting after
-- rejection), so this is a log, not a single mutable record — keeps a
-- full history for accountability.
-- ------------------------------------------------------------
create table if not exists verification_submissions (
  id                  uuid primary key default gen_random_uuid(),
  pt_id               uuid not null references pts(id) on delete cascade,
  certificate_url     text not null,
  insurance_url       text not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected')),
  rejection_reason    text,
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists verification_submissions_pt_idx on verification_submissions (pt_id);
create index if not exists verification_submissions_status_idx on verification_submissions (status);

-- ============================================================
-- Row Level Security: verification_submissions
-- ============================================================
alter table verification_submissions enable row level security;

-- A PT can see their OWN submissions only (not other PTs' — these contain
-- document URLs to private files, treat as sensitive).
create policy "a pt can view their own submissions"
  on verification_submissions for select
  using (auth.uid() = pt_id);

-- A PT can create a submission for themselves only.
create policy "a pt can submit their own verification documents"
  on verification_submissions for insert
  with check (auth.uid() = pt_id);

-- Admins can view ALL submissions — this is the core of the review queue.
-- Checks the is_admin flag on the admin's own pts row.
create policy "admins can view all submissions"
  on verification_submissions for select
  using (
    exists (
      select 1 from pts where pts.id = auth.uid() and pts.is_admin = true
    )
  );

-- Admins can update any submission (to approve/reject).
create policy "admins can update any submission"
  on verification_submissions for update
  using (
    exists (
      select 1 from pts where pts.id = auth.uid() and pts.is_admin = true
    )
  );

grant select, insert on verification_submissions to authenticated;
grant update on verification_submissions to authenticated;

-- ============================================================
-- Row Level Security: admins can also update ANY pt's verification_status
-- (needed so approving a submission can also update the pt row's status).
-- This is IN ADDITION to the existing "a pt can update their own listing"
-- policy from migration 0001 — it does not replace it.
-- ============================================================
create policy "admins can update any pt verification status"
  on pts for update
  using (
    exists (
      select 1 from pts as admin_check where admin_check.id = auth.uid() and admin_check.is_admin = true
    )
  );

-- ============================================================
-- Private storage bucket for verification documents.
-- UNLIKE trainer-images, this bucket is NOT public — documents are
-- sensitive (certificates, insurance details) and should only be
-- readable by the uploading PT and admins, never by anonymous visitors
-- or other PTs.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];

-- Path convention: {user_id}/certificate.{ext}, {user_id}/insurance.{ext}
-- Same ownership-boundary pattern as trainer-images.

-- A PT can upload only into their own folder.
create policy "a pt can upload their own verification docs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A PT can read/replace only their own documents — NOT publicly readable,
-- and NOT readable by other (non-admin) PTs.
create policy "a pt can view their own verification docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "a pt can update their own verification docs"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can view ANY trainer's verification documents — required for
-- the review queue to actually display the uploaded files.
create policy "admins can view all verification docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and exists (
      select 1 from pts where pts.id = auth.uid() and pts.is_admin = true
    )
  );

grant select, insert, update on storage.objects to authenticated;

-- ============================================================
-- search_pts: only show approved listings.
-- This is a meaningful behavior change — until a PT is approved, their
-- listing will NOT appear in client search results, even if is_active
-- is true. is_active still controls whether an approved PT is
-- temporarily paused; verification_status controls whether they're
-- allowed to be found at all.
-- ============================================================

drop function if exists search_pts(double precision, double precision, smallint[], boolean);

create function search_pts(
  client_lat double precision,
  client_lon double precision,
  specialism_filter smallint[] default null,
  ignore_radius boolean default false
) returns table (
  id uuid,
  display_name text,
  bio text,
  postcode text,
  radius_miles integer,
  rate_gbp integer,
  listing_tier text,
  distance_miles double precision,
  gym_id uuid,
  gym_name text,
  gym_postcode text,
  website_url text,
  instagram_url text,
  facebook_url text,
  profile_photo_url text,
  match_via text
) as $$
  declare
    gym_search_radius_miles constant double precision := 8;
  begin
    return query
    select
      p.id,
      p.display_name,
      p.bio,
      p.postcode,
      p.radius_miles,
      p.rate_gbp,
      p.listing_tier,
      least(
        haversine_miles(client_lat, client_lon, p.lat, p.lon),
        coalesce(haversine_miles(client_lat, client_lon, g.lat, g.lon), 999999)
      ) as distance_miles,
      p.gym_id,
      g.name as gym_name,
      g.postcode as gym_postcode,
      p.website_url,
      p.instagram_url,
      p.facebook_url,
      p.profile_photo_url,
      case
        when g.id is not null
             and haversine_miles(client_lat, client_lon, g.lat, g.lon) <= gym_search_radius_miles
             and haversine_miles(client_lat, client_lon, g.lat, g.lon)
                 <= haversine_miles(client_lat, client_lon, p.lat, p.lon)
          then 'gym'
        else 'travel_radius'
      end as match_via
    from pts p
    left join gyms g on g.id = p.gym_id
    where p.is_active = true
      and p.verification_status = 'approved'
      and (
        ignore_radius = true
        or haversine_miles(client_lat, client_lon, p.lat, p.lon) <= p.radius_miles
        or (
          g.id is not null
          and haversine_miles(client_lat, client_lon, g.lat, g.lon) <= gym_search_radius_miles
        )
      )
      and (
        specialism_filter is null
        or array_length(specialism_filter, 1) is null
        or exists (
          select 1 from pt_specialisms ps
          where ps.pt_id = p.id
            and ps.specialism_id = any(specialism_filter)
        )
      )
    order by
      (p.listing_tier = 'featured') desc,
      distance_miles asc;
  end;
$$ language plpgsql stable;

grant execute on function search_pts(double precision, double precision, smallint[], boolean) to anon, authenticated;

-- ============================================================
-- AFTER RUNNING THIS MIGRATION: make yourself an admin.
-- ============================================================
-- 1. Find your user id: Supabase dashboard → Authentication → Users →
--    click your account → copy the UUID.
-- 2. If you already have a pts row (you've created a listing):
--      update pts set is_admin = true where id = 'YOUR_USER_ID_HERE';
-- 3. If you DON'T have a pts row yet, you can't be flagged as admin
--    this way — create a minimal listing first (even a placeholder),
--    then run the update above. This is intentional: admin status is
--    tied to a real account in the pts table, the same table everything
--    else checks against.
