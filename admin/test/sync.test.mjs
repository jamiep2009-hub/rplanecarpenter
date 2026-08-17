/* ============================================================
   sync.test.mjs — pulling reviews in from Google.

   This job rewrites a live page unattended, so the cases that
   matter most are the ones where Google misbehaves: an outage, an
   empty response, a rate limit, junk data. None of them may be
   allowed to damage the site.
   ============================================================ */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapGoogleReview, mergeReviews, fetchGoogleReviews, sync } from '../sync-google-reviews.mjs';
import { readReviews } from '../content.js';
import { locateAll, readPath } from '../htmledit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', '..');

let passed = 0, failed = 0;
const failures = [];
const ok = (n, c, d) => c ? passed++ : (failed++, failures.push(`${n}${d ? ' — ' + d : ''}`));
const eq = (n, a, b) => ok(n, a === b, a === b ? '' : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
async function throwsAsync (n, fn) {
  try { await fn(); ok(n, false, 'expected a rejection'); } catch { passed++; }
}
const quiet = () => {};

const REAL_PAGE = readFileSync(join(SITE, 'index.html'), 'utf8');
const tmpPage = () => {
  const f = join(mkdtempSync(join(tmpdir(), 'rpc-sync-')), 'index.html');
  writeFileSync(f, REAL_PAGE);
  return f;
};

const reply = body => async () => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

const GOOD = {
  status: 'OK',
  result: { reviews: [
    { author_name: 'Sarah Whitmore', rating: 5, text: 'Robbie fitted our kitchen in Wymondham and the standard is superb throughout.' },
    { author_name: 'Tom Ashby', rating: 5, text: 'Built a run of fitted wardrobes for us. Tidy, punctual and a lovely finish.' },
  ] },
};

/* ---------- 1. Mapping a single review ---------- */

{
  const m = mapGoogleReview(GOOD.result.reviews[0]);
  eq('map: text is carried through unmodified', m.quote, GOOD.result.reviews[0].text);
  eq('map: initial comes from the author', m.initial, 'S');
  eq('map: the author is named, as the terms require', m.project, 'Sarah Whitmore');
  eq('map: marked as coming from Google', m.source, 'google');

  ok('map: a poor rating is skipped', mapGoogleReview({ author_name: 'A', rating: 2, text: 'Not great at all really' }) === null);
  ok('map: a one-word review is skipped', mapGoogleReview({ author_name: 'A', rating: 5, text: 'Great!' }) === null);
  ok('map: a review with no author is skipped', mapGoogleReview({ rating: 5, text: 'Lovely work, very pleased indeed' }) === null);
  ok('map: an empty review is skipped', mapGoogleReview({ author_name: 'A', rating: 5, text: '   ' }) === null);
}

/* ---------- 2. Merging must never destroy hand-written reviews ---------- */

{
  // How many reviews the site has is the owner's business — the tests
  // assert that none are lost, not that there are exactly N.
  const manual = readReviews(REAL_PAGE);
  ok('merge: the site starts with hand-written reviews', manual.length >= 1);

  const google = GOOD.result.reviews.map(mapGoogleReview);
  const merged = mergeReviews(manual, google);

  eq('merge: nothing is lost', merged.length, manual.length + google.length);
  eq('merge: every hand-written one survives',
     merged.filter(r => r.source !== 'google').length, manual.length);
  ok('merge: hand-written order is preserved',
     merged.filter(r => r.source !== 'google').map(r => r.quote).join('|') ===
     manual.map(r => r.quote).join('|'));
  ok('merge: Google reviews lead', merged[0].source === 'google' && merged[1].source === 'google');
}
{
  // Running twice must not accumulate duplicates.
  const manual = readReviews(REAL_PAGE);
  const google = GOOD.result.reviews.map(mapGoogleReview);
  const once = mergeReviews(manual, google);
  const twice = mergeReviews(once, google);
  eq('merge: a second run adds nothing', twice.length, once.length);
  eq('merge: and is stable', JSON.stringify(twice), JSON.stringify(once));
}
{
  // A review already added by hand must not appear a second time.
  const manual = readReviews(REAL_PAGE);
  const dupe = mapGoogleReview({ author_name: 'X', rating: 5, text: manual[0].quote });
  const merged = mergeReviews(manual, [dupe]);
  eq('merge: an existing quote is not duplicated', merged.length, manual.length);
}
{
  // Google returns at most five; the cap is enforced regardless.
  const manual = readReviews(REAL_PAGE);
  const many = Array.from({ length: 9 }, (_, i) =>
    mapGoogleReview({ author_name: `Person ${i}`, rating: 5, text: `A perfectly good review number ${i} with enough words.` }));
  const merged = mergeReviews(manual, many);
  eq('merge: no more than five come from Google', merged.filter(r => r.source === 'google').length, 5);
}

/* ---------- 3. Fetching ---------- */

{
  const seen = [];
  await fetchGoogleReviews('PLACE', 'KEY', async url => { seen.push(url); return reply(GOOD)(); });
  const url = seen[0];
  ok('fetch: asks for the place', url.includes('place_id=PLACE'));
  ok('fetch: sends the key', url.includes('key=KEY'));
  ok('fetch: asks for newest first', url.includes('reviews_sort=newest'));
  ok('fetch: requests only the fields needed', url.includes('fields=review'));

  const out = await fetchGoogleReviews('P', 'K', reply(GOOD));
  eq('fetch: returns the mapped reviews', out.length, 2);
}

await throwsAsync('fetch: an HTTP error is raised', () =>
  fetchGoogleReviews('P', 'K', async () => new Response('nope', { status: 500 })));
await throwsAsync('fetch: a non-OK status is raised', () =>
  fetchGoogleReviews('P', 'K', reply({ status: 'REQUEST_DENIED', error_message: 'bad key' })));
await throwsAsync('fetch: an over-quota response is raised', () =>
  fetchGoogleReviews('P', 'K', reply({ status: 'OVER_QUERY_LIMIT' })));

/* ---------- 4. The site must survive every failure mode ---------- */

{
  const page = tmpPage();
  const res = await sync({ pagePath: page, log: quiet });
  eq('safe: no credentials means no action', res.reason, 'not-configured');
  eq('safe: and the page is untouched', readFileSync(page, 'utf8'), REAL_PAGE);
}
{
  const page = tmpPage();
  const res = await sync({ placeId: 'P', apiKey: 'K', pagePath: page, log: quiet, fetchImpl: reply({ status: 'OK', result: { reviews: [] } }) });
  eq('safe: an empty response changes nothing', res.reason, 'no-reviews');
  eq('safe: the reviews are still there',
     readReviews(readFileSync(page, 'utf8')).length, readReviews(REAL_PAGE).length);
}
{
  const page = tmpPage();
  const res = await sync({ placeId: 'P', apiKey: 'K', pagePath: page, log: quiet,
    fetchImpl: reply({ status: 'OK', result: { reviews: [
      { author_name: 'A', rating: 1, text: 'Terrible experience from start to finish' },
      { author_name: 'B', rating: 5, text: 'Good' },
    ] } }) });
  eq('safe: nothing usable changes nothing', res.reason, 'no-reviews');
  eq('safe: the page is byte-identical', readFileSync(page, 'utf8'), REAL_PAGE);
}
{
  const page = tmpPage();
  let threw = false;
  try {
    await sync({ placeId: 'P', apiKey: 'K', pagePath: page, log: quiet,
      fetchImpl: async () => { throw new Error('network down'); } });
  } catch { threw = true; }
  ok('safe: a network failure is raised, not swallowed', threw);
  eq('safe: and writes nothing', readFileSync(page, 'utf8'), REAL_PAGE);
}

/* ---------- 5. The happy path ---------- */

{
  const page = tmpPage();
  const res = await sync({ placeId: 'P', apiKey: 'K', pagePath: page, log: quiet, fetchImpl: reply(GOOD) });
  ok('sync: it wrote', res.changed);

  const html = readFileSync(page, 'utf8');
  const after = readReviews(html);
  const before = readReviews(REAL_PAGE);
  eq('sync: the page gains exactly the Google ones', after.length, before.length + 2);
  eq('sync: two are marked as Google', after.filter(r => r.source === 'google').length, 2);
  eq('sync: the hand-written ones are all still there',
     after.filter(r => r.source !== 'google').length, before.length);

  // The whole point: they must be readable without running the carousel.
  const asText = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  ok('sync: the new reviews are real text in the page',
     asText.includes('fitted our kitchen in Wymondham'));
  ok('sync: the author is named', html.includes('Sarah Whitmore'));
  ok('sync: exactly one slide starts visible',
     (html.match(/class="rv-slide is-active"/g) || []).length === 1);
  // Count by class token — "rv-chip" must not also match "rv-chip-label".
  eq('sync: a chip for every review',
     locateAll(readPath(html, [{ cls: 'rv-chips' }]), { cls: 'rv-chip' }).length, after.length);

  // Running again against the same data must be a no-op.
  const again = await sync({ placeId: 'P', apiKey: 'K', pagePath: page, log: quiet, fetchImpl: reply(GOOD) });
  eq('sync: a second run changes nothing', again.reason, 'unchanged');
  eq('sync: and the page is stable', readFileSync(page, 'utf8'), html);
}
{
  // Hostile input must not become markup.
  const page = tmpPage();
  await sync({ placeId: 'P', apiKey: 'K', pagePath: page, log: quiet,
    fetchImpl: reply({ status: 'OK', result: { reviews: [
      { author_name: '<img src=x onerror=alert(1)>', rating: 5,
        text: 'Lovely work</blockquote><script>alert(1)<\/script> and very tidy indeed' },
    ] } }) });
  const html = readFileSync(page, 'utf8');
  const scripts = (html.match(/<script/g) || []).length;
  const orig = (REAL_PAGE.match(/<script/g) || []).length;
  eq('sync: no script is injected', scripts, orig);
  ok('sync: the tag is neutralised', html.includes('&lt;script&gt;'));
  ok('sync: the author name is escaped', !html.includes('<img src=x'));
}

console.log(`\n  sync: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.log('   ✗ ' + f);
  console.log('');
  process.exit(1);
}
