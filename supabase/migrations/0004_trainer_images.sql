-- ============================================================
-- FindYourPT — migration 0004: trainer images (profile photo + gallery)
-- Run this in the Supabase SQL editor AFTER 0003_gym_aware_search.sql.
--
-- IMPORTANT — bucket creation: Supabase Storage buckets are usually
-- created via the dashboard (Storage tab) or the Management API, not raw
-- SQL, because bucket creation also needs config like public/private and
-- size limits set through Supabase's own validation layer. This migration
-- creates the bucket via SQL for completeness and reproducibility, but if
-- it errors in your project's SQL editor, create it manually instead:
--   Storage → New bucket → name: "trainer-images" → Public bucket: ON
--   → File size limit: 5MB → Allowed MIME types: image/jpeg, image/png
-- Then skip the "insert into storage.buckets" statement below and run the
-- policy statements only.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trainer-images', 'trainer-images', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png'];

-- ============================================================
-- Path convention (enforced by the policies below, not just by
-- convention): every object's path starts with the uploading trainer's
-- own auth.uid(), as the first path segment —
--   {user_id}/profile.jpg
--   {user_id}/gallery/{uuid}.jpg
-- storage.foldername(name) splits the object path into an array of
-- folder segments; foldername(name)[1] is therefore the user_id segment.
-- This is what lets us check "is this trainer writing into their OWN
-- folder" without needing a separate lookup table.
-- ============================================================

-- Public read: anyone (including anonymous clients browsing the site)
-- can view any trainer's images, since that's the whole point of a
-- public profile photo and gallery.
create policy "trainer images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'trainer-images');

-- A trainer can upload ONLY into a path starting with their own user id.
-- This is the actual access-control boundary — even if someone tampers
-- with the upload code client-side, the database will reject a write to
-- any path not starting with their own auth.uid().
create policy "a trainer can upload into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trainer-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A trainer can overwrite (re-upload) or delete only their own files —
-- same boundary, applied to update/delete.
create policy "a trainer can update their own images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'trainer-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "a trainer can delete their own images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trainer-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- pts table: add columns to reference the uploaded images.
-- We store full public URLs (Supabase Storage public buckets serve via a
-- stable URL pattern), not just paths, so the frontend doesn't need to
-- reconstruct URLs or make an extra call to resolve them.
-- gallery_urls is a fixed-size-checked array — the 4-image cap is
-- enforced in application code (and re-checked there on every upload),
-- not by a DB constraint, since constraining array length via SQL is
-- possible but adds complexity for a limit that's a product choice, not
-- a data-integrity rule.
-- ============================================================
alter table pts add column if not exists profile_photo_url text;
alter table pts add column if not exists gallery_urls text[] not null default '{}';
