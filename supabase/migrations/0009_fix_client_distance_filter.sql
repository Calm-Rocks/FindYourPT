-- ============================================================
-- SpotMyPT — migration 0009: fix client distance filter
-- Run this in the Supabase SQL editor AFTER 0008.
--
-- BUG FIXED: the "Distance" pill on the client search page (1/5/10/20/50
-- mi) was never actually wired to filter by the CLIENT's chosen maximum
-- travel distance. It was incorrectly mapped onto ignore_radius, a
-- parameter that only ever controlled whether to skip the TRAINER's own
-- stated coverage radius. Selecting "10 mi" therefore did nothing
-- resembling "show me trainers within 10 miles" — it just toggled
-- whether the trainer's own radius rule applied at all, which is a
-- completely different thing. A trainer whose own radius didn't reach
-- the search point could disappear regardless of which client distance
-- was picked, because the client's chosen number was never actually sent
-- to the distance calculation.
--
-- FIX: add a genuine client_max_distance parameter (nullable — null means
-- "no client-side cap", used for "Any distance"). When set, it filters
-- results to distance_miles <= client_max_distance, independently of
-- whether the trainer's own radius or gym matched. ignore_radius keeps
-- its original meaning (skip the trainer's own radius rule) and is now
-- always implicitly true whenever client_max_distance is provided, since
-- a client picking "show me everyone within 10 miles" should see every
-- trainer within that distance regardless of the trainer's own stated
-- radius — the client is explicitly stating their own willingness to
-- travel, which supersedes the trainer's radius assumption.
-- ============================================================

drop function if exists search_pts(double precision, double precision, smallint[], boolean);

create function search_pts(
  client_lat double precision,
  client_lon double precision,
  specialism_filter smallint[] default null,
  ignore_radius boolean default false,
  client_max_distance double precision default null
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
        -- A trainer matches if EITHER:
        --   (a) the client gave an explicit max distance and the trainer
        --       (or their gym) falls within it — this is independent of
        --       the trainer's own stated radius, since the client is the
        --       one declaring how far they'll go, or
        --   (b) no client max distance was given, and we fall back to the
        --       original rules: ignore_radius=true shows everyone,
        --       otherwise the trainer's own radius or gym proximity rule
        --       applies, same as before this migration.
        (
          client_max_distance is not null
          and least(
                haversine_miles(client_lat, client_lon, p.lat, p.lon),
                coalesce(haversine_miles(client_lat, client_lon, g.lat, g.lon), 999999)
              ) <= client_max_distance
        )
        or (
          client_max_distance is null
          and (
            ignore_radius = true
            or haversine_miles(client_lat, client_lon, p.lat, p.lon) <= p.radius_miles
            or (
              g.id is not null
              and haversine_miles(client_lat, client_lon, g.lat, g.lon) <= gym_search_radius_miles
            )
          )
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

grant execute on function search_pts(double precision, double precision, smallint[], boolean, double precision) to anon, authenticated;
