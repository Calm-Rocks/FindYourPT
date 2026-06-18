-- Minimal stand-in for Supabase's built-in `storage` schema, just enough
-- to test our real bucket/RLS policies against vanilla Postgres. NOT part
-- of the real deployment — Supabase provides the genuine versions.

create schema if not exists storage;

create table if not exists storage.buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
-- Real Supabase uses text ids for buckets (e.g. 'avatars'), not uuids —
-- match that here so our migration's `id` column works as written.
alter table storage.buckets alter column id type text;

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz default now()
);

-- Real implementation: splits the object path on '/' and returns all but
-- the last segment (the filename itself), e.g. 'abc/gallery/x.jpg' -> {abc,gallery}
create or replace function storage.foldername(name text) returns text[] as $$
  select case
    when array_length(string_to_array(name, '/'), 1) <= 1 then array[]::text[]
    else (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
  end;
$$ language sql immutable;
