// Real UK postcode geocoding via postcodes.io — free, no API key required.
// Docs: https://postcodes.io/docs
//
// resolvePostcode: takes a full or partial postcode, returns { lat, lon, postcode }
// or null if it can't be resolved.
//
// Strategy:
//   1. Try full postcode lookup (/postcodes/{postcode})
//   2. If that 404s, try outcode lookup (/outcodes/{outcode})
//   3. If both fail, return null with a clear error message so the UI
//      can tell the user what went wrong rather than silently doing nothing.
//
// NOTE: "LE14" style inputs (two-digit district codes like LE14, DN10 etc.)
// fail BOTH lookups because they're not valid standalone outcodes in Royal Mail
// data — only the district letter+single-digit form (LE1, LE2, DN1) are valid
// outcodes. Users need to enter a full postcode (e.g. "LE14 3AB") for these
// to resolve. The function now returns a typed error so the UI can show a
// helpful message rather than just "couldn't find that postcode."

const POSTCODES_IO_BASE = 'https://api.postcodes.io';

// Return shape on success: { lat, lon, postcode }
// Return shape on failure: null
// Throws a PostcodeError with a user-facing .message on recognisable failures.

export class PostcodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PostcodeError';
  }
}

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
    // Network failure — fall through to outcode attempt
  }

  // Extract the outward code portion and try the outcode endpoint.
  // Valid outcode format: 1-2 letters, 1-2 digits, optional trailing letter
  // e.g. S1, LE1, LE2, DN1, SW1A — NOT LE14, DN10 (those need full postcodes)
  const upper = cleaned.toUpperCase().replace(/\s+/g, '');
  const outcodeMatch = upper.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);

  if (outcodeMatch) {
    const outcode = outcodeMatch[1];
    try {
      const res = await fetch(
        `${POSTCODES_IO_BASE}/outcodes/${encodeURIComponent(outcode)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.result) {
          return {
            lat: data.result.latitude,
            lon: data.result.longitude,
            postcode: outcode,
          };
        }
      }

      // Outcode also 404'd — give a specific, helpful error rather than
      // a generic "couldn't find it". Two-digit district codes like LE14,
      // DN10, etc. are the most common case here.
      if (res.status === 404) {
        // Check if this looks like a two-digit district (LE14, DN10 etc.)
        const twoDigitDistrict = outcode.match(/^[A-Z]{1,2}\d{2}$/);
        if (twoDigitDistrict) {
          throw new PostcodeError(
            `"${cleaned.toUpperCase()}" needs a full postcode to search — try something like "${outcode} 3AB". ` +
            `Partial codes like "${outcode}" aren't precise enough to locate on a map.`
          );
        }
        throw new PostcodeError(
          `Couldn't find "${cleaned.toUpperCase()}" — double-check it and try again, or enter a fuller postcode.`
        );
      }
    } catch (err) {
      if (err instanceof PostcodeError) throw err;
      // Network failure on outcode lookup too — fall through to generic null
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
