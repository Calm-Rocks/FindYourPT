import { supabase } from './supabaseClient';

// ---------------------------------------------------------------
// Security note on validation layers — read before changing this file.
//
// There are three independent checks, and none of them trust the others:
//   1. Here (client-side): instant feedback, but anyone can bypass this
//      by calling the Supabase API directly with dev tools — it exists
//      purely for UX, not security.
//   2. The Supabase bucket config (file_size_limit, allowed_mime_types,
//      set in migration 0004) — enforced server-side regardless of what
//      the client sends, so a tampered client can't smuggle a bad file
//      type or an oversized one past it.
//   3. Storage RLS policies (also migration 0004) — enforce WHO can write
//      WHERE, independent of file content, so even a valid JPEG can't be
//      written into another trainer's folder.
//
// The magic-byte check below exists because a file can be RENAMED to
// .jpg / browser-reported as image/jpeg while actually containing
// something else entirely — the browser's reported MIME type is just
// metadata the browser guessed, not a guarantee. Checking the file's
// actual byte signature is the only way to know what it really is.
// ---------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, matches the bucket's server-side limit
const MAX_GALLERY_IMAGES = 4;
const BUCKET_NAME = 'trainer-images';

// JPEG files start with FF D8 FF. PNG files start with the fixed 8-byte
// signature 89 50 4E 47 0D 0A 1A 0A. Checking these few bytes is enough
// to confirm the file truly is what it claims to be, regardless of its
// filename or the browser's Content-Type guess.
async function detectRealImageType(file) {
  const headerBytes = await file.slice(0, 8).arrayBuffer();
  const bytes = new Uint8Array(headerBytes);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((b, i) => bytes[i] === b)) {
    return 'image/png';
  }
  return null; // not a recognized JPEG or PNG, regardless of filename/claimed type
}

// Throws a user-facing error message string if the file fails validation;
// returns the verified real MIME type if it passes.
export async function validateImageFile(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Image must be 5MB or smaller.');
  }
  const realType = await detectRealImageType(file);
  if (!realType) {
    throw new Error('File must be a genuine JPEG or PNG image.');
  }
  return realType;
}

function extensionForType(mimeType) {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

export async function uploadProfilePhoto(userId, file) {
  const realType = await validateImageFile(file);
  const path = `${userId}/profile.${extensionForType(realType)}`;

  // upsert: true lets a trainer replace their existing profile photo by
  // re-uploading, rather than erroring on "file already exists".
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, { contentType: realType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadGalleryImage(userId, file, existingCount) {
  if (existingCount >= MAX_GALLERY_IMAGES) {
    throw new Error(`You can only have up to ${MAX_GALLERY_IMAGES} gallery images.`);
  }
  const realType = await validateImageFile(file);
  // A random-ish suffix avoids collisions between this trainer's own
  // gallery uploads — doesn't need to be cryptographically strong, just
  // unique enough within one trainer's own folder.
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${userId}/gallery/${uniqueSuffix}.${extensionForType(realType)}`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, { contentType: realType });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return data.publicUrl;
}

// Deletes by public URL — extracts the storage path Supabase encodes in
// the URL so we can call remove() with it. Used when a trainer removes a
// gallery image.
export async function deleteGalleryImage(publicUrl) {
  const marker = `/object/public/${BUCKET_NAME}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) throw new Error('Could not determine the file path to delete.');
  const path = publicUrl.slice(idx + marker.length);

  const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);
  if (error) throw error;
}

export { MAX_GALLERY_IMAGES, MAX_FILE_SIZE_BYTES };
