// Real UK postcode geocoding via postcodes.io — free, no API key required.
// Docs: https://postcodes.io/docs
//
// resolvePostcode: takes a full or partial postcode, returns { lat, lon, postcode }
// or null if it can't be resolved. We try a full-postcode lookup first; if that
// 404s (e.g. user only typed the outward code, like "S1"), we fall back to the
// outcode endpoint, which still gives us a usable centroid.

const POSTCODES_IO_BASE = 'https://api.postcodes.io';

export async function resolvePostcode(rawInput) {
  const cleaned = rawInput.trim();
  if (!cleaned) return null;

  // Try full postcode lookup first.
  try {
    const res = await fetch(
      `${POSTCODES_IO_BASE}/postcodes/${encodeURIComponent(cleaned)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.result) {
        return {
          lat: data.result.latitude,
          lon: data.result.longitude,
          postcode: data.result.postcode,
        };
      }
    }
  } catch (err) {
    // Network error on the full lookup — fall through to outcode attempt
    // rather than failing outright, since the user might have typed just
    // an outward code anyway (which would never succeed as a full lookup).
  }

  // Fall back to outcode lookup (e.g. "S1" instead of "S1 2JA").
  const outcodeGuess = cleaned.toUpperCase().replace(/\s+/g, '').match(/^[A-Z]{1,2}\d{1,2}[A-Z]?/);
  if (outcodeGuess) {
    try {
      const res = await fetch(
        `${POSTCODES_IO_BASE}/outcodes/${encodeURIComponent(outcodeGuess[0])}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.result) {
          return {
            lat: data.result.latitude,
            lon: data.result.longitude,
            postcode: outcodeGuess[0],
          };
        }
      }
    } catch (err) {
      // Both attempts failed — give up and let the caller handle null.
    }
  }

  return null;
}

// Lightweight client-side format check, used to give instant feedback
// before hitting the network. Not a substitute for the real lookup above —
// postcodes.io is the source of truth on whether a postcode actually exists.
export function looksLikeUkPostcode(value) {
  const v = value.trim().toUpperCase();
  return /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/.test(v);
}
