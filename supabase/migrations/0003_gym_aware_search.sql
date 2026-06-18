-- ============================================================
-- FindYourPT — migration 0003: gym-aware search
-- Run this in the Supabase SQL editor AFTER 0002_gyms_and_socials.sql.
-- Replaces search_pts to also match PTs via their gym's location, not
-- just their own postcode+radius. A PT matches if EITHER:
--   (a) their own postcode is within their own stated radius of the
--       client, OR
--   (b) their linked gym is within a fixed distance of the client
--       (the client is the one travelling to a gym, not the PT, so this
--       does not use the PT's radius_miles at all for the gym case).
-- GYM_SEARCH_RADIUS_MILES below is the assumed distance a client will
-- reasonably travel to a gym. Adjust this single constant if that
-- assumption needs to change later.
-- ============================================================

-- Must drop first: we're changing the return column set (adding gym_id,
-- gym_name, gym_postcode, website_url, instagram_url, facebook_url,
-- match_via), and Postgres refuses CREATE OR REPLACE across a column
-- shape change. Safe to drop — we recreate it in the same statement batch.
drop function if exists search_pts(double precision, double precision, smallint[]);

create function search_pts(
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
  distance_miles double precision,
  gym_id uuid,
  gym_name text,
  gym_postcode text,
  website_url text,
  instagram_url text,
  facebook_url text,
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
      and (
        haversine_miles(client_lat, client_lon, p.lat, p.lon) <= p.radius_miles
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

grant execute on function search_pts(double precision, double precision, smallint[]) to anon, authenticated;
