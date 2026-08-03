/* ============================================================
   Round-trip tests for content.js

   The headline guarantee: reading the site into the editable
   model and writing that model straight back must reproduce the
   original files byte for byte. If that holds, an edit can only
   ever change the thing that was edited.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readModel, applyChanges, readGallery, writeGallery, readTowns, writeTowns,
  readBento, writeBento, readBeforeAfter, writeBeforeAfter,
  readReviews, writeReviews, writeReviewsIntoHome,
  parseHeading, renderHeading, phoneForms, readContact,
} from '../content.js';
import { EDITABLE_FILES, TEXT_FIELDS } from '../schema.js';
import { locateAll, readPath } from '../htmledit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', '..');

let passed = 0, failed = 0;
const failures = [];
const ok = (n, c, d) => c ? passed++ : (failed++, failures.push(`${n}${d ? ' — ' + d : ''}`));
const eq = (n, a, b) => ok(n, a === b, a === b ? '' : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const throws = (n, fn) => { try { fn(); ok(n, false, 'expected a throw'); } catch { passed++; } };

const files = {};
for (const f of EDITABLE_FILES) files[f] = readFileSync(join(SITE, f), 'utf8');

/* ---------- 1. The model reads ---------- */

const model = readModel(files);

ok('model: text fields read', Object.keys(model.text).length === TEXT_FIELDS.length,
   `${Object.keys(model.text).length}/${TEXT_FIELDS.length}`);
ok('model: gallery has 10 tiles', model.gallery.length === 10, `${model.gallery.length}`);
ok('model: bento has 10 tiles', model.bento.length === 10, `${model.bento.length}`);
ok('model: 2 before/after pairs', model.beforeafter.length === 2, `${model.beforeafter.length}`);
ok('model: 6 reviews', model.reviews.length === 6, `${model.reviews.length}`);
eq('model: contact phone', model.contact.phone, '07990 527683');
eq('model: contact email', model.contact.email, 'rplanecarpenter@hotmail.co.uk');

ok('model: no empty text field', Object.entries(model.text).every(([, v]) =>
  typeof v === 'object' ? String(v.line1 || '').length > 0 : String(v).length > 0));

/* ---------- 2. Identity round-trips — the core guarantee ---------- */

{
  const out = writeGallery(files['gallery.html'], readGallery(files['gallery.html']));
  ok('round-trip: gallery grid byte-identical', out === files['gallery.html'],
     out === files['gallery.html'] ? '' : diffHint(files['gallery.html'], out));
}
{
  const out = writeBento(files['index.html'], readBento(files['index.html']));
  ok('round-trip: bento grid byte-identical', out === files['index.html'],
     out === files['index.html'] ? '' : diffHint(files['index.html'], out));
}
{
  const out = writeBeforeAfter(files['gallery.html'], readBeforeAfter(files['gallery.html']));
  ok('round-trip: before/after byte-identical', out === files['gallery.html'],
     out === files['gallery.html'] ? '' : diffHint(files['gallery.html'], out));
}
{
  const out = writeReviews(files['reviews-v2.js'], readReviews(files['reviews-v2.js']));
  ok('round-trip: reviews array byte-identical', out === files['reviews-v2.js'],
     out === files['reviews-v2.js'] ? '' : diffHint(files['reviews-v2.js'], out));
}
{
  const out = writeReviewsIntoHome(files['index.html'], readReviews(files['reviews-v2.js']));
  ok('round-trip: homepage chips + quote byte-identical', out === files['index.html'],
     out === files['index.html'] ? '' : diffHint(files['index.html'], out));
}

/* Every text field written back with its own value must be a no-op. */
{
  let allSame = true;
  const offenders = [];
  for (const f of TEXT_FIELDS) {
    const before = files[f.file];
    const value = model.text[f.id];
    const after = applyChanges(files, { text: { [f.id]: value } }).files[f.file];
    if (after !== before) { allSame = false; offenders.push(f.id); }
  }
  ok('round-trip: every text field re-writes identically', allSame, offenders.join(', '));
}

/* The full model applied at once must change nothing. */
{
  const res = applyChanges(files, {
    text: model.text,
    gallery: model.gallery,
    bento: model.bento,
    beforeafter: model.beforeafter,
    reviews: model.reviews,
  });
  ok('round-trip: whole model applied changes no files', res.changed.length === 0,
     `changed: ${res.changed.join(', ')}`);
}

/* ---------- 3. A real edit changes only what it should ---------- */

{
  const res = applyChanges(files, { text: { 'home.hero.sub': 'A brand new intro line.' } });
  eq('edit: only index.html changed', res.changed.join(','), 'index.html');

  const before = files['index.html'];
  const after = res.files['index.html'];
  ok('edit: new text present', after.includes('A brand new intro line.'));
  ok('edit: old text gone', !after.includes('One craftsman. Twenty years of precision'));

  // Length delta must equal exactly the text delta — nothing else moved.
  const expected = before.length
    - 'One craftsman. Twenty years of precision joinery, bespoke kitchens, and fitted furniture &mdash; made to measure for your home.'.length
    + 'A brand new intro line.'.length;
  eq('edit: byte delta is exactly the edit', after.length, expected);
}
{
  // Adding a gallery tile must leave the rest of the page alone.
  const items = [...model.gallery, {
    category: 'kitchen', src: 'images/img01.jpg',
    alt: 'A new kitchen', tag: 'New Kitchen', title: 'A brand new project',
  }];
  const res = applyChanges(files, { gallery: items });
  eq('edit: adding a tile touches only gallery.html', res.changed.join(','), 'gallery.html');

  const grid = readPath(res.files['gallery.html'], [{ id: 'tileGrid' }]);
  eq('edit: tile count is 11', locateAll(grid, { cls: 'tile' }).length, 11);

  // The footer, header and before/after block must be untouched.
  const tail = files['gallery.html'].slice(files['gallery.html'].indexOf('<footer>'));
  ok('edit: footer untouched', res.files['gallery.html'].endsWith(tail));
}
{
  // Editing reviews updates the JS and the homepage together.
  const rs = model.reviews.map((r, i) => i === 0 ? { ...r, project: 'Changed label' } : r);
  const res = applyChanges(files, { reviews: rs });
  eq('edit: reviews touch both files', res.changed.sort().join(','), 'index.html,reviews-v2.js');
  ok('edit: chip label updated', res.files['index.html'].includes('Changed label'));
  ok('edit: js array updated', res.files['reviews-v2.js'].includes('Changed label'));
}

/* ---------- 4. Validation refuses bad input ---------- */

throws('validate: empty text rejected', () => applyChanges(files, { text: { 'home.hero.sub': '   ' } }));
throws('validate: over-length text rejected', () => applyChanges(files, { text: { 'home.hero.sub': 'x'.repeat(400) } }));
throws('validate: newline in a single-line field rejected', () => applyChanges(files, { text: { 'home.hero.eyebrow': 'a\nb' } }));
throws('validate: unknown field rejected', () => applyChanges(files, { text: { 'nope.nope': 'x' } }));
throws('validate: empty gallery rejected', () => applyChanges(files, { gallery: [] }));
throws('validate: tile without title rejected', () =>
  applyChanges(files, { gallery: [{ category: 'kitchen', src: 'images/a.jpg', alt: 'x', tag: 'T', title: '' }] }));
throws('validate: path traversal in image src rejected', () =>
  applyChanges(files, { gallery: [{ category: 'kitchen', src: '../../etc/passwd', alt: 'x', tag: 'T', title: 'T' }] }));
throws('validate: absolute url in image src rejected', () =>
  applyChanges(files, { gallery: [{ category: 'kitchen', src: 'https://evil.com/a.jpg', alt: 'x', tag: 'T', title: 'T' }] }));
throws('validate: review initial must be one letter', () =>
  applyChanges(files, { reviews: [{ quote: 'q', project: 'p', initial: 'JJ' }] }));
throws('validate: empty reviews rejected', () => applyChanges(files, { reviews: [] }));

/* ---------- 5. Escaping holds under edit ---------- */

{
  const res = applyChanges(files, { text: { 'home.hero.sub': 'Fish & chips <b>bold</b> "quoted"' } });
  const out = res.files['index.html'];
  ok('escape: ampersand encoded', out.includes('Fish &amp; chips'));
  ok('escape: tag neutralised', out.includes('&lt;b&gt;bold&lt;/b&gt;'));
  // index.html legitimately contains one <b> in the before/after caption,
  // so the guarantee is "no NEW element", not "none at all".
  eq('escape: no injected element',
     locateAll(out, { tag: 'b' }).length,
     locateAll(files['index.html'], { tag: 'b' }).length);
}
{
  const items = [{ ...model.gallery[0], title: 'Evil"><script>x()<\/script>' }, ...model.gallery.slice(1)];
  const out = applyChanges(files, { gallery: items }).files['gallery.html'];
  const scripts = locateAll(out, { tag: 'script' }).length;
  const origScripts = locateAll(files['gallery.html'], { tag: 'script' }).length;
  eq('escape: no extra <script> from a tile title', scripts, origScripts);
}

/* ---------- 6. Headings ---------- */

eq('heading: parse line1', parseHeading('One<br><em>Two</em>').line1, 'One');
eq('heading: parse line2', parseHeading('One<br><em>Two</em>').line2, 'Two');
eq('heading: render', renderHeading({ line1: 'One', line2: 'Two' }), 'One<br><em>Two</em>');
eq('heading: render single line', renderHeading({ line1: 'Solo', line2: '' }), 'Solo');
eq('heading: round-trip', renderHeading(parseHeading('A &amp; B<br><em>C</em>')), 'A &amp; B<br><em>C</em>');

/* ---------- 7. Phone handling ---------- */

eq('phone: national in', phoneForms('07990527683').display, '07990 527683');
eq('phone: spaced in', phoneForms('07990 527683').tel, '+447990527683');
eq('phone: intl in', phoneForms('+447990527683').display, '07990 527683');
eq('phone: whatsapp form', phoneForms('07990 527683').wa, '447990527683');
throws('phone: rubbish rejected', () => phoneForms('hello'));
throws('phone: too short rejected', () => phoneForms('0799'));

{
  // Changing the phone must update every page that carries it.
  const next = { ...model.contact, phone: '07123 456789' };
  const res = applyChanges(files, { contact: next });
  const pagesWithOld = EDITABLE_FILES.filter(f => res.files[f]?.includes('447990527683'));
  ok('contact: old number gone everywhere', pagesWithOld.length === 0, pagesWithOld.join(', '));
  ok('contact: tel link updated', res.files['contact.html'].includes('tel:+447123456789'));
  ok('contact: whatsapp updated', res.files['index.html'].includes('wa.me/447123456789'));
  ok('contact: printed number updated', res.files['contact.html'].includes('07123 456789'));
}
{
  const next = { ...model.contact, email: 'new@example.com' };
  const res = applyChanges(files, { contact: next });
  ok('contact: email updated everywhere',
     !EDITABLE_FILES.some(f => res.files[f]?.includes('rplanecarpenter@hotmail.co.uk')));
  throws('contact: bad email rejected', () =>
    applyChanges(files, { contact: { ...model.contact, email: 'not-an-email' } }));
}

/* ---------- 8. Service-area towns ---------- */

{
  const towns = readTowns(files['contact.html']);
  eq('towns: 16 read from the page', towns.length, 16);
  ok('towns: names are plain text', towns.every(t => /^[A-Za-z' -]+$/.test(t)), towns.join(','));
  ok('towns: apostrophes survive', towns.includes("King's Lynn"));

  const out = writeTowns(files['contact.html'], towns);
  ok('towns: identity round-trip is byte-identical', out === files['contact.html']);
}
{
  // The visible list and the structured data must move together, or the
  // page and what Google reads drift apart.
  const towns = readTowns(files['contact.html']);
  const res = applyChanges(files, { towns: [...towns, 'Sheringham'] });

  eq('towns: adding one touches both pages', res.changed.sort().join(','), 'contact.html,index.html');
  ok('towns: the visible list gained it', res.files['contact.html'].includes('<li>Sheringham</li>'));

  for (const page of ['index.html', 'contact.html']) {
    const ld = JSON.parse(res.files[page].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const names = ld.areaServed.map(a => a.name);
    ok(`towns: ${page} areaServed gained it`, names.includes('Sheringham'));
    eq(`towns: ${page} areaServed matches the list`, names.slice(1).join(','), [...towns, 'Sheringham'].join(','));
    eq(`towns: ${page} keeps Norfolk first`, ld.areaServed[0]['@type'], 'AdministrativeArea');
    ok(`towns: ${page} rest of the schema is intact`, ld.telephone === '+447990527683' && ld.geo && ld.hasOfferCatalog);
  }
}
{
  const towns = readTowns(files['contact.html']);
  const res = applyChanges(files, { towns: towns.filter(t => t !== 'Watton') });
  ok('towns: removing one drops it from the page', !res.files['contact.html'].includes('<li>Watton</li>'));
  const ld = JSON.parse(res.files['index.html'].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  ok('towns: removing one drops it from the schema', !ld.areaServed.some(a => a.name === 'Watton'));
}

throws('towns: empty list rejected', () => applyChanges(files, { towns: [] }));
throws('towns: blank entry rejected', () => applyChanges(files, { towns: ['Norwich', '   '] }));
throws('towns: duplicate rejected', () => applyChanges(files, { towns: ['Norwich', 'norwich'] }));
throws('towns: over-long name rejected', () => applyChanges(files, { towns: ['x'.repeat(60)] }));
throws('towns: markup in a name rejected', () => applyChanges(files, { towns: ['<script>x</script>'] }));

{
  // Even if validation were bypassed, output must stay inert.
  const res = applyChanges(files, { towns: ['Norwich & District', 'Diss'] });
  ok('towns: ampersand is escaped', res.files['contact.html'].includes('<li>Norwich &amp; District</li>'));
}

/* ---------- helpers ---------- */

function diffHint (a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `first difference at ${i}: ${JSON.stringify(a.slice(i, i + 60))} vs ${JSON.stringify(b.slice(i, i + 60))}`;
}

console.log(`\n  content: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.log('   ✗ ' + f);
  console.log('');
  process.exit(1);
}
