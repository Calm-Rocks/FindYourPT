-- ============================================================
-- FindYourPT — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`)
-- ============================================================

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------
-- Not using PostGIS here on purpose: PostGIS is the "correct" long-term
-- answer for geospatial queries at scale, but it's an extra extension to
-- enable and a heavier mental model than this product needs yet. A plain
-- SQL haversine function (below) is accurate to within ~0.5% for UK
-- distances and is trivial to understand/debug. Revisit if you ever need
-- spatial indexes (hundreds of thousands of PTs) — until then this is the
-- pragmatic choice, not a shortcut you'll regret.

-- ------------------------------------------------------------
-- specialisms: fixed lookup table, not free text, so filtering stays
-- consistent and we can add icons/descriptions later without a migration
-- on the pts table itself.
-- ------------------------------------------------------------
create table if not exists specialisms (
  id          smallint primary key,
  slug        text unique not null,
  label       text not null
);

insert into specialisms (id, slug, label) values
  (1, 'hypertrophy',        'Hypertrophy'),
  (2, 'weight_loss',        'Weight loss'),
  (3, 'strength_powerlift', 'Strength & powerlifting'),
  (4, 'gymnastics',         'Gymnastics strength'),
  (5, 'pre_post_natal',     'Pre/post-natal'),
  (6, 'sports_performance', 'Sports performance'),
  (7, 'mobility_rehab',     'Mobility & rehab'),
  (8, 'older_adults',       'Older adults'),
  (9, 'nutrition',          'Nutrition coaching')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- pts: one row per trainer profile.
-- id matches auth.users.id 1:1 — a PT's listing IS their account.
-- lat/lon are resolved once at signup/edit time via postcodes.io and
-- cached here, so search queries never need to call the API.
-- ------------------------------------------------------------
create table if not exists pts (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null,
  bio             text default '',
  postcode        text not null,
  lat             double precision not null,
  lon             double precision not null,
  radius_miles    integer not null default 5 check (radius_miles > 0 and radius_miles <= 100),
  rate_gbp        integer check (rate_gbp >= 0),
  listing_tier    text not null default 'standard' check (listing_tier in ('standard', 'featured')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pts_active_idx on pts (is_active);

-- ------------------------------------------------------------
-- pt_specialisms: join table, many-to-many
-- ------------------------------------------------------------
create table if not exists pt_specialisms (
  pt_id           uuid not null references pts(id) on delete cascade,
  specialism_id   smallint not null references specialisms(id) on delete cascade,
  primary key (pt_id, specialism_id)
);

create index if not exists pt_specialisms_specialism_idx on pt_specialisms (specialism_id);

-- ------------------------------------------------------------
-- enquiries: logged whenever a client contacts a PT.
-- No client account required — this is the only record of the client side.
-- Doubles as your future data source if you ever revisit performance-based
-- pricing: you can't track conversion you never logged.
-- ------------------------------------------------------------
create table if not exists enquiries (
  id              uuid primary key default gen_random_uuid(),
  pt_id           uuid not null references pts(id) on delete cascade,
  client_name     text not null,
  client_contact  text not null, -- email or phone, free text by design at this stage
  message         text default '',
  client_postcode text,
  created_at      timestamptz not null default now()
);

create index if not exists enquiries_pt_idx on enquiries (pt_id);

-- ------------------------------------------------------------
-- updated_at trigger for pts
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pts_set_updated_at on pts;
create trigger pts_set_updated_at
  before update on pts
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table pts enable row level security;
alter table pt_specialisms enable row level security;
alter table enquiries enable row level security;
alter table specialisms enable row level security;

-- specialisms: public read, no writes from the client (managed by us)
create policy "specialisms are publicly readable"
  on specialisms for select
  using (true);

-- pts: anyone can read ACTIVE listings (this is the public directory).
-- A PT can read/edit/delete only their own row, matched on auth uid.
create policy "active pt listings are publicly readable"
  on pts for select
  using (is_active = true);

create policy "a pt can read their own listing even if inactive"
  on pts for select
  using (auth.uid() = id);

create policy "a pt can insert their own listing"
  on pts for insert
  with check (auth.uid() = id);

create policy "a pt can update their own listing"
  on pts for update
  using (auth.uid() = id);

create policy "a pt can delete their own listing"
  on pts for delete
  using (auth.uid() = id);

-- pt_specialisms: publicly readable (needed to show tags in search results),
-- but only the owning PT can modify their own specialism links.
create policy "pt specialisms are publicly readable"
  on pt_specialisms for select
  using (true);

create policy "a pt can manage their own specialism links"
  on pt_specialisms for all
  using (auth.uid() = pt_id)
  with check (auth.uid() = pt_id);

-- enquiries: NOT publicly readable (contains client contact details).
-- Anyone (including anonymous clients) can INSERT an enquiry — that's the
-- whole point of the contact flow. Only the PT being contacted can read
-- enquiries addressed to them.
create policy "anyone can submit an enquiry"
  on enquiries for insert
  with check (true);

create policy "a pt can read enquiries sent to them"
  on enquiries for select
  using (auth.uid() = pt_id);

-- ============================================================
-- Distance search function
-- ============================================================
-- Haversine distance in miles between two lat/lon points, as a reusable
-- SQL function (kept separate so it's easy to unit-test/replace with
-- PostGIS's ST_Distance later without touching the search function below).
create or replace function haversine_miles(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision as $$
  select 3958.8 * 2 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2 +
      cos(radians(lat1)) * cos(radians(lat2)) *
      sin(radians(lon2 - lon1) / 2) ^ 2
    )
  );
$$ language sql immutable parallel safe;

-- search_pts: the core matching query.
-- Given a client's lat/lon, returns active PTs whose coverage radius
-- reaches that point, optionally filtered to PTs who have ANY of the
-- given specialism ids, sorted featured-first then nearest.
-- specialism_ids = NULL or '{}' means "no filter, return all matches".
create or replace function search_pts(
  client_lat double precision,
  client_lon double precision,
  specialism_filter smallint[] default null
) returns table (
  id uuid,
  display_name text,
  bio text,
  postcode text,
  radius_miles integer,
  rate_gbp integer,
  listing_tier text,
  distance_miles double precision
) as $$
  select
    p.id,
    p.display_name,
    p.bio,
    p.postcode,
    p.radius_miles,
    p.rate_gbp,
    p.listing_tier,
    haversine_miles(client_lat, client_lon, p.lat, p.lon) as distance_miles
  from pts p
  where p.is_active = true
    and haversine_miles(client_lat, client_lon, p.lat, p.lon) <= p.radius_miles
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
$$ language sql stable;

-- Allow anonymous (anon) and logged-in (authenticated) roles to call this.
grant execute on function search_pts(double precision, double precision, smallint[]) to anon, authenticated;
grant execute on function haversine_miles(double precision, double precision, double precision, double precision) to anon, authenticated;
