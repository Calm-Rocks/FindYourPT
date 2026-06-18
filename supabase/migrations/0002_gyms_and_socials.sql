-- ============================================================
-- FindYourPT — migration 0002: gyms, PT-gym linkage, socials
-- Run this in the Supabase SQL editor AFTER 0001_init.sql.
-- This is additive — it does not modify or drop any existing data.
-- ============================================================

-- ------------------------------------------------------------
-- gyms: physical locations a PT can be based out of.
-- is_curated distinguishes gyms we've seeded/vetted (shown as
-- suggestions to every PT) from one-off gyms a PT typed in themselves
-- (still usable, just not promoted as a suggestion to others).
-- lat/lon resolved once via postcodes.io, same pattern as pts.postcode.
-- ------------------------------------------------------------
create table if not exists gyms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  postcode        text not null,
  lat             double precision not null,
  lon             double precision not null,
  is_curated      boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists gyms_curated_idx on gyms (is_curated);

-- ------------------------------------------------------------
-- pts: add gym linkage and social/website fields.
-- gym_id is nullable — a PT can be gym-based, travel-radius-based, or both.
-- ------------------------------------------------------------
alter table pts add column if not exists gym_id uuid references gyms(id) on delete set null;
alter table pts add column if not exists website_url text;
alter table pts add column if not exists instagram_url text;
alter table pts add column if not exists facebook_url text;

create index if not exists pts_gym_idx on pts (gym_id);

-- ============================================================
-- Row Level Security for gyms
-- ============================================================
alter table gyms enable row level security;

-- Anyone can read gyms (needed for the picker list and for search results
-- to show gym names).
create policy "gyms are publicly readable"
  on gyms for select
  using (true);

-- Any authenticated PT can add a new gym (covers the "custom gym" case —
-- if it's not in the curated list, they create it). We don't restrict this
-- to "their own" gyms since gyms are a shared resource other PTs may also
-- want to select later.
create policy "authenticated users can add gyms"
  on gyms for insert
  to authenticated
  with check (true);

-- Deliberately no update/delete policy for gyms yet: editing or removing a
-- shared gym record safely (without breaking other PTs' listings pointing
-- at it) needs proper admin tooling, not a per-PT permission. Out of scope
-- for this pass — flagging it here rather than quietly omitting it.

grant select on gyms to anon, authenticated;
grant insert on gyms to authenticated;

-- ============================================================
-- Seed curated gyms — real branches of well-known UK chains, spread
-- across several cities for geographic variety. Postcodes resolved
-- against postcodes.io coordinates at time of writing.
-- ============================================================
insert into gyms (name, postcode, lat, lon, is_curated) values
  ('PureGym Sheffield Centertainment', 'S9 1EW', 53.4115, -1.3925, true),
  ('PureGym Sheffield City', 'S1 2BJ', 53.3781, -1.4673, true),
  ('PureGym Manchester Withy Grove', 'M4 2BS', 53.4839, -2.2401, true),
  ('PureGym London Canary Wharf', 'E14 4AN', 51.5051, -0.0235, true),
  ('PureGym London St Pauls', 'EC1A 7DH', 51.5181, -0.1004, true),
  ('PureGym Edinburgh Waterfront', 'EH5 1SA', 55.9819, -3.2208, true),
  ('PureGym Birmingham Longbridge', 'B31 2UQ', 52.3795, -1.9847, true),
  ('PureGym Leeds Bridgewater Place', 'LS1 4DX', 53.7935, -1.5491, true),
  ('The Gym Group Sheffield (The Moor)', 'S1 4PF', 53.3789, -1.4719, true),
  ('The Gym Group Sheffield Heeley', 'S8 0RG', 53.3597, -1.4633, true),
  ('The Gym Group Manchester Deansgate', 'M3 4EN', 53.4794, -2.2486, true),
  ('The Gym Group Manchester Portland Street', 'M1 4EH', 53.4789, -2.2386, true),
  ('The Gym Group Leeds York Road', 'LS9 6NA', 53.7967, -1.5167, true),
  ('The Gym Group Birmingham Stechford', 'B33 9AN', 52.4789, -1.8167, true),
  ('The Gym Group London Holborn Circus', 'EC4A 1AN', 51.5174, -0.1086, true),
  ('Anytime Fitness Sheffield', 'S1 2BX', 53.3801, -1.4691, true),
  ('Anytime Fitness Leeds City Centre', 'LS1 6PS', 53.7965, -1.5478, true),
  ('Snap Fitness Manchester Northern Quarter', 'M4 1HN', 53.4838, -2.2351, true)
on conflict do nothing;
