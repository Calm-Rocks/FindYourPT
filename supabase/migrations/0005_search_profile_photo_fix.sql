-- ============================================================
-- FindYourPT — migration 0005: search_pts profile photo fix
-- Run this in the Supabase SQL editor AFTER 0004_trainer_images.sql.
--
-- BUG FIXED: migration 0004 added profile_photo_url to the pts table,
-- but search_pts (defined in migration 0003) was written before that
-- column existed, so its RETURNS TABLE definition never included it.
-- The column was always being saved correctly to the database — it just
-- never made it into the data search_pts hands back to the frontend, so
-- client search results always showed the avatar-initials fallback
-- (or whatever was cached client-side) regardless of what photo a
-- trainer had actually uploaded. This migration is the fix: identical to
-- 0003's search_pts, with profile_photo_url added to both the return
-- columns and the select.
-- ============================================================

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
