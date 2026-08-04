/* ============================================================
   sync-google-reviews.mjs

   Pulls reviews from the Google Business Profile and writes them
   into the website as real HTML, so they are readable by search
   engines and by anyone with JavaScript switched off.

   Run by .github/workflows/sync-reviews.yml, which is where the
   "server" lives — there isn't one, and this needs none.

   Three things worth knowing about the design:

   1. It only ever replaces reviews it put there itself (marked
      data-src="google"). Anything written by hand in the editor is
      left exactly as it is.
   2. It refuses to write when the API returns nothing useful. A bad
      response must never be able to empty the reviews section.
   3. Google's Places terms allow a temporary cache, not a permanent
      store, and require reviews to be shown unmodified with the
      author's name. Refreshing daily keeps this within that, and the
      author's name is carried through rather than reduced to an
      initial.

   Environment:
     GOOGLE_PLACES_API_KEY   from Google Cloud
     GOOGLE_PLACE_ID         the Business Profile's place id
   Both absent -> exits quietly, changing nothing.
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReviews, writeReviews } from './content.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..', 'index.html');

const MIN_RATING = 4;          // only reviews worth showing
const MIN_WORDS = 6;           // "Great!" tells a visitor nothing
const MAX_GOOGLE = 5;          // the API returns at most five

/* ------------------------------------------------------------
   Shaping a Google review into the site's model
   ------------------------------------------------------------ */

export function mapGoogleReview (r) {
  const text = String(r.text || '').trim();
  const author = String(r.author_name || '').trim();
  if (!text || !author) return null;
  if (Number(r.rating) < MIN_RATING) return null;
  if (text.split(/\s+/).length < MIN_WORDS) return null;

  return {
    // Shown unmodified, as Google's terms require.
    quote: text,
    initial: author[0].toUpperCase(),
    project: author,
    source: 'google',
  };
}

/**
 * Google's reviews, followed by everything written by hand.
 * Hand-written reviews are never touched or reordered among themselves.
 */
export function mergeReviews (existing, googleReviews) {
  const manual = existing.filter(r => r.source !== 'google');
  const seen = new Set(manual.map(r => r.quote.trim().toLowerCase()));

  const fresh = [];
  for (const g of googleReviews) {
    const key = g.quote.trim().toLowerCase();
    if (seen.has(key)) continue;        // already on the site by hand
    seen.add(key);
    fresh.push(g);
    if (fresh.length >= MAX_GOOGLE) break;
  }

  return [...fresh, ...manual];
}

/* ------------------------------------------------------------
   Fetching
   ------------------------------------------------------------ */

export async function fetchGoogleReviews (placeId, apiKey, fetchImpl = fetch) {
  const url = 'https://maps.googleapis.com/maps/api/place/details/json'
    + `?place_id=${encodeURIComponent(placeId)}`
    + '&fields=review,rating,user_ratings_total'
    + '&reviews_sort=newest'
    + '&language=en-GB'
    + `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Google replied ${res.status}`);

  const data = await res.json();
  if (data.status !== 'OK') {
    throw new Error(`Google returned status ${data.status}${data.error_message ? ': ' + data.error_message : ''}`);
  }

  return (data.result?.reviews || []).map(mapGoogleReview).filter(Boolean);
}

/* ------------------------------------------------------------
   Entry point
   ------------------------------------------------------------ */

export async function sync ({ placeId, apiKey, pagePath = PAGE, fetchImpl = fetch, log = console.log } = {}) {
  if (!placeId || !apiKey) {
    log('No Google credentials configured — nothing to do.');
    return { changed: false, reason: 'not-configured' };
  }

  const html = readFileSync(pagePath, 'utf8');
  const existing = readReviews(html);

  const google = await fetchGoogleReviews(placeId, apiKey, fetchImpl);
  log(`Google returned ${google.length} usable review(s).`);

  // A quiet API must never be able to wipe the section.
  if (google.length === 0) {
    log('Nothing usable came back; leaving the site as it is.');
    return { changed: false, reason: 'no-reviews' };
  }

  const merged = mergeReviews(existing, google);
  if (merged.length === 0) {
    log('Merge produced nothing; refusing to write.');
    return { changed: false, reason: 'empty-merge' };
  }

  // writeReviews validates, and returns the input untouched if nothing differs.
  const out = writeReviews(html, merged);
  if (out === html) {
    log('Already up to date.');
    return { changed: false, reason: 'unchanged' };
  }

  writeFileSync(pagePath, out);
  log(`Updated: ${merged.filter(r => r.source === 'google').length} from Google, ` +
      `${merged.filter(r => r.source !== 'google').length} written by hand.`);
  return { changed: true, count: merged.length };
}

/* Run directly by the workflow. */
if (process.argv[1] && process.argv[1].endsWith('sync-google-reviews.mjs')) {
  sync({ placeId: process.env.GOOGLE_PLACE_ID, apiKey: process.env.GOOGLE_PLACES_API_KEY })
    .then(r => { if (r.changed) console.log('::notice::Reviews updated from Google'); })
    .catch(err => { console.error('Review sync failed:', err.message); process.exit(1); });
}
