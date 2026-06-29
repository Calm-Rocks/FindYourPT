-- ============================================================
-- FindYourPT — migration 0006: any-distance client search
-- Run this in the Supabase SQL editor AFTER 0005.
--
-- BUG FIXED: when a client selects "Any distance", the DB was still
-- filtering by each PT's own stated coverage radius, which meant PTs
-- who don't cover the searched location were excluded even though the
-- client was willing to travel to them. "Any distance" from the client's
-- perspective means "I'll come to you" — the PT's radius is irrelevant.
--
-- New parameter: ignore_radius (default false).
-- When true, skips the radius filter entirely and returns all active PTs
-- sorted by distance, so the client can see everyone regardless of where
-- the PT says they operate.
-- ============================================================

drop function if exists search_pts(double precision, double precision, smallint[]);

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
      and (
        -- When ignore_radius is true (client says "Any distance"), skip the
        -- PT's coverage radius entirely — the client is willing to travel to
        -- wherever the PT operates, so show all active PTs regardless.
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
