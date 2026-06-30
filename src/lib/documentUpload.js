import { supabase } from './supabaseClient';

// ---------------------------------------------------------------
// Same defense-in-depth model as imageUpload.js: client-side checks here
// are for UX only, not security. The real boundaries are the bucket's
// server-side file_size_limit/allowed_mime_types (migration 0007) and the
// storage RLS policies restricting each PT to their own folder, with a
// separate admin-only read policy. This bucket is also NOT public, unlike
// trainer-images — verification-docs has no public-read policy at all.
// ---------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — certificates/scans can be larger than profile photos
const BUCKET_NAME = 'verification-docs';

// PDF signature: starts with "%PDF-" (0x25 0x50 0x44 0x46 0x2D)
async function detectRealFileType(file) {
  const headerBytes = await file.slice(0, 8).arrayBuffer();
  const bytes = new Uint8Array(headerBytes);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((b, i) => bytes[i] === b)) return 'image/png';

  const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  if (pdfSignature.every((b, i) => bytes[i] === b)) return 'application/pdf';

  return null;
}

async function validateDocumentFile(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('File must be 10MB or smaller.');
  }
  const realType = await detectRealFileType(file);
  if (!realType) {
    throw new Error('File must be a genuine PDF, JPEG, or PNG.');
  }
  return realType;
}

function extensionForType(mimeType) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

// docType: 'certificate' | 'insurance' — determines the filename within
// the PT's own folder. Returns the storage PATH (not a public URL, since
// this bucket isn't public) — the path is what gets stored in the
// verification_submissions row, and signed URLs are generated on demand
// when an admin needs to actually view the file.
export async function uploadVerificationDoc(userId, file, docType) {
  const realType = await validateDocumentFile(file);
  const path = `${userId}/${docType}.${extensionForType(realType)}`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, { contentType: realType, upsert: true });
  if (error) throw error;

  return path;
}

export { MAX_FILE_SIZE_BYTES };
