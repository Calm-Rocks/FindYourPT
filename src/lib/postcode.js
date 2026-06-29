// UK geocoding via postcodes.io — free, no API key required.
// Handles three input types:
//   1. Full postcode   e.g. "LE1 2AB"  → /postcodes/{postcode}
//   2. Outcode         e.g. "LE1"      → /outcodes/{outcode}
//   3. Place name      e.g. "Leicester" → /places?q={name}
//
// Detection: if input matches a UK postcode/outcode pattern, try postcode
// endpoints first. If neither postcode endpoint resolves it (including
// two-digit district codes like LE14 which aren't valid standalone outcodes),
// fall through to place name search. This means "LE14" will correctly fall
// back to a Leicester area result rather than silently failing.

const POSTCODES_IO_BASE = 'https://api.postcodes.io';

// Typed error so callers can show the .message directly to users.
export class PostcodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PostcodeError';
  }
}

// Pattern that matches UK postcodes and outcodes (but not plain town names).
const UK_POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;

export async function resolvePostcode(rawInput) {
  const cleaned = rawInput.trim();
  if (!cleaned) return null;

  const looksLikePostcode = UK_POSTCODE_PATTERN.test(cleaned.replace(/\s+/g, ''));

  if (looksLikePostcode) {
    // 1. Try full postcode
    try {
      const res = await fetch(`${POSTCODES_IO_BASE}/postcodes/${encodeURIComponent(cleaned)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.result) {
          return { lat: data.result.latitude, lon: data.result.longitude, postcode: data.result.postcode };
        }
      }
    } catch (_) {}

    // 2. Try outcode (extract e.g. "LE1" from "LE14 3AB" or "LE1")
    const outcode = cleaned.toUpperCase().replace(/\s+/g, '').match(/^[A-Z]{1,2}\d{1,2}[A-Z]?/)?.[0];
    if (outcode) {
      try {
        const res = await fetch(`${POSTCODES_IO_BASE}/outcodes/${encodeURIComponent(outcode)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.result) {
            return { lat: data.result.latitude, lon: data.result.longitude, postcode: outcode };
          }
        }
      } catch (_) {}
    }
    // Postcode-pattern input that didn't resolve — fall through to place search
    // so something like "LE14" still gets a useful Leicester result.
  }

  // 3. Place name search — works for towns, cities, postcodes.io /places?q=
  try {
    const res = await fetch(`${POSTCODES_IO_BASE}/places?q=${encodeURIComponent(cleaned)}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (data?.result?.[0]) {
        const place = data.result[0];
        return {
          lat: place.latitude,
          lon: place.longitude,
          postcode: place.name_1 || cleaned,
        };
      }
    }
  } catch (_) {}

  // Nothing worked
  throw new PostcodeError(
    `Couldn't find "${cleaned}" — try a full postcode (e.g. LE1 2AB) or a town name (e.g. Leicester).`
  );
}

export function looksLikeUkPostcode(value) {
  return UK_POSTCODE_PATTERN.test(value.trim());
}
