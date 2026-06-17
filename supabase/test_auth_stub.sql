-- Minimal stand-in for Supabase's built-in `auth` schema, just enough
-- for our migration (which references auth.users and auth.uid()) to run
-- against plain Postgres for local testing. This file is NOT part of the
-- real deployment — Supabase provides the real versions of these.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Real Supabase auth.uid() reads the JWT claim of the current request.
-- For local testing we fake it with a settable session variable so we can
-- simulate "logged in as this PT" by running:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
create or replace function auth.uid() returns uuid as $$
  select coalesce(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ language sql stable;
