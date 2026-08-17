/* ============================================================
   Safety tests for htmledit.js

   The whole promise of this admin is "it cannot damage the
   website". These tests are that promise, written down. They run
   against the REAL page files in the repo, not fixtures.
   ============================================================ */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  locateAll, locateOne, readInner, replaceInner, replaceOuter,
  readAttr, setAttr, htmlToText, textToHtml, escapeHtml, scanTags,
  readPath, replacePath, readAttrPath, setAttrPath,
} from '../htmledit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', '..');

let passed = 0, failed = 0;
const failures = [];

function ok (name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}
function eq (name, actual, expected) {
  const same = actual === expected;
  ok(name, same, same ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function throws (name, fn) {
  try { fn(); ok(name, false, 'expected it to throw, but it did not'); }
  catch { passed++; }
}

const LIVE_PAGES = [
  'index.html', 'about.html', 'services.html',
  'gallery.html', 'contact.html', 'privacy-policy.html',
];

/* ---------- 1. Scanner correctness ---------- */

{
  const html = `<div class="a"><span>x</span></div>`;
  const tags = [...scanTags(html)].map(t => `${t.isClosing ? '/' : ''}${t.name}`);
  eq('scanner: basic tag sequence', tags.join(','), 'div,span,/span,/div');
}
{
  // A ">" inside an attribute value must not end the tag early.
  const html = `<div data-x="a > b"><p>hi</p></div>`;
  const tags = [...scanTags(html)].map(t => t.name);
  eq('scanner: ">" inside attribute', tags.join(','), 'div,p,p,div');
}
{
  // Markup-looking text inside <script> must not be scanned as tags.
  const html = `<div><script>var s = "</div><b>";<\/script><p>real</p></div>`;
  const inner = readInner(html, { tag: 'p' });
  eq('scanner: ignores markup inside <script>', inner, 'real');
}
{
  const html = `<div><!-- <p>commented</p> --><p>real</p></div>`;
  eq('scanner: ignores markup inside comments', readInner(html, { tag: 'p' }), 'real');
}
{
  // Void elements must not consume a closing tag.
  const html = `<div class="w"><img src="a.jpg"><p>after</p></div>`;
  eq('scanner: void elements', readInner(html, { cls: 'w' }), '<img src="a.jpg"><p>after</p>');
}

/* ---------- 2. Nesting is resolved by depth, not first-match ---------- */

{
  const html = `<div class="outer">A<div class="inner">B</div>C</div>`;
  eq('nesting: outer captures full inner', readInner(html, { cls: 'outer' }), 'A<div class="inner">B</div>C');
  eq('nesting: inner captures only itself', readInner(html, { cls: 'inner' }), 'B');
}
{
  const html = `<section id="s"><div><div><span id="deep">D</span></div></div></section>`;
  eq('nesting: deep target', readInner(html, { id: 'deep' }), 'D');
}

/* ---------- 3. Ambiguity is refused, never guessed ---------- */

{
  const html = `<p class="x">1</p><p class="x">2</p>`;
  throws('ambiguity: multiple matches without nth throws', () => readInner(html, { cls: 'x' }));
  eq('ambiguity: nth=0 selects first', readInner(html, { cls: 'x', nth: 0 }), '1');
  eq('ambiguity: nth=1 selects second', readInner(html, { cls: 'x', nth: 1 }), '2');
  throws('ambiguity: out-of-range nth throws', () => readInner(html, { cls: 'x', nth: 9 }));
  throws('missing selector throws', () => readInner(html, { cls: 'nope' }));
}
{
  // Class matching must be token-based, not substring.
  const html = `<div class="btn-primary">A</div><div class="btn">B</div>`;
  eq('class matching is token-based', readInner(html, { cls: 'btn' }), 'B');
}

/* ---------- 4. Byte-exactness: everything outside the edit is untouched ---------- */

for (const page of LIVE_PAGES) {
  let html;
  try { html = readFileSync(join(SITE, page), 'utf8'); }
  catch { continue; }

  // Rewriting a region with its own current content must be a no-op.
  const targets = [
    { tag: 'title' },
    { cls: 'rpc-drawer-inner' },
  ];
  for (const sel of targets) {
    const matches = locateAll(html, sel);
    if (matches.length !== 1) continue;
    const current = readInner(html, sel);
    const out = replaceInner(html, sel, current);
    ok(`byte-exact: ${page} ${JSON.stringify(sel)} identity rewrite`, out === html,
       out === html ? '' : `length ${html.length} -> ${out.length}`);
  }

  // Changing one region must change ONLY that region.
  const sel = { tag: 'title' };
  if (locateAll(html, sel).length === 1) {
    const before = readInner(html, sel);
    const out = replaceInner(html, sel, 'ZZZ');
    const restored = replaceInner(out, sel, before);
    ok(`byte-exact: ${page} round-trip restores original`, restored === html);

    const idx = out.indexOf('ZZZ');
    const prefixSame = out.slice(0, idx) === html.slice(0, idx);
    ok(`byte-exact: ${page} prefix untouched`, prefixSame);
  }
}

/* ---------- 5. Attribute editing ---------- */

{
  let html = `<img class="hero" src="old.jpg" alt="Old text" width="10">`;
  eq('attr: read', readAttr(html, { cls: 'hero' }, 'src'), 'old.jpg');

  html = setAttr(html, { cls: 'hero' }, 'src', 'new.jpg');
  eq('attr: set existing', readAttr(html, { cls: 'hero' }, 'src'), 'new.jpg');
  ok('attr: siblings preserved', html.includes('width="10"') && html.includes('alt="Old text"'));

  html = setAttr(html, { cls: 'hero' }, 'loading', 'lazy');
  eq('attr: add missing', readAttr(html, { cls: 'hero' }, 'loading'), 'lazy');

  html = setAttr(html, { cls: 'hero' }, 'alt', 'Quote " and <tag>');
  ok('attr: value is escaped', html.includes('&quot;') && html.includes('&lt;tag&gt;'));
}
{
  // Single-quoted and unquoted attribute values must survive.
  let html = `<a class="x" href='a.html' data-n=5>t</a>`;
  eq('attr: single-quoted read', readAttr(html, { cls: 'x' }, 'href'), 'a.html');
  eq('attr: unquoted read', readAttr(html, { cls: 'x' }, 'data-n'), '5');
  html = setAttr(html, { cls: 'x' }, 'href', 'b.html');
  eq('attr: single-quoted set', readAttr(html, { cls: 'x' }, 'href'), 'b.html');
}

/* ---------- 6. Text <-> HTML conversion ---------- */

eq('text: entities decoded', htmlToText('Bare room &mdash; done'), 'Bare room — done');
eq('text: <br> becomes newline', htmlToText('a<br>b'), 'a\nb');
eq('text: tags stripped', htmlToText('<em>hi</em> there'), 'hi there');
eq('text: numeric entity', htmlToText('&#8212;'), '—');
eq('text: escape on the way back', textToHtml('a & b <c>'), 'a &amp; b &lt;c&gt;');
eq('text: newline becomes <br>', textToHtml('a\nb'), 'a<br>b');
{
  // Round-trip must be stable for the copy actually on the site.
  const samples = ['Crafted by hand.', 'One craftsman & twenty years', 'Norwich · Norfolk'];
  for (const s of samples) {
    eq(`text: round-trip "${s}"`, htmlToText(textToHtml(s)), s);
  }
}

/* ---------- 7. Injection cannot escape a text field ---------- */

{
  const html = `<h1 class="t">safe</h1>`;
  const evil = '</h1><script>alert(1)<\/script><h1>';
  const out = replaceInner(html, { cls: 't' }, textToHtml(evil));
  ok('injection: no raw <script> lands in the document', !/<script/i.test(out));
  ok('injection: document still has exactly one h1', locateAll(out, { tag: 'h1' }).length === 1);
}

/* ---------- 8. Every live page survives a full parse ---------- */

for (const page of LIVE_PAGES) {
  let html;
  try { html = readFileSync(join(SITE, page), 'utf8'); } catch { continue; }
  const tags = [...scanTags(html)];
  ok(`parse: ${page} yields tags`, tags.length > 50, `only ${tags.length} tags`);

  // <body> must resolve to a single balanced region on every page.
  const body = locateAll(html, { tag: 'body' });
  ok(`parse: ${page} has exactly one <body>`, body.length === 1, `found ${body.length}`);
  if (body.length === 1) {
    ok(`parse: ${page} body region is non-trivial`, body[0].innerEnd - body[0].innerStart > 500);
  }
}

/* ---------- 9. Scoped paths ---------- */

{
  const html = `
    <div class="grid">
      <div class="card"><h3>One</h3><p>First body</p></div>
      <div class="card"><h3>Two</h3><p>Second body</p></div>
      <div class="card"><h3>Three</h3><p>Third body</p></div>
    </div>`;

  eq('path: h3 in card 0', readPath(html, [{ cls: 'card', nth: 0 }, { tag: 'h3' }]), 'One');
  eq('path: h3 in card 2', readPath(html, [{ cls: 'card', nth: 2 }, { tag: 'h3' }]), 'Three');
  eq('path: p in card 1', readPath(html, [{ cls: 'card', nth: 1 }, { tag: 'p' }]), 'Second body');

  const out = replacePath(html, [{ cls: 'card', nth: 1 }, { tag: 'h3' }], 'CHANGED');
  ok('path: only the targeted card changed',
     out.includes('<h3>One</h3>') && out.includes('<h3>CHANGED</h3>') && out.includes('<h3>Three</h3>'));
  eq('path: rest of document byte-identical',
     out.replace('CHANGED', 'Two'), html);
}
{
  // Scoped path must not leak outside its parent.
  const html = `<div class="a"><span>inside</span></div><span>outside</span>`;
  eq('path: scope is respected', readPath(html, [{ cls: 'a' }, { tag: 'span' }]), 'inside');
}
{
  const html = `<div class="card"><img src="a.jpg" alt="A"></div><div class="card"><img src="b.jpg" alt="B"></div>`;
  eq('path: attr read scoped', readAttrPath(html, [{ cls: 'card', nth: 1 }, { tag: 'img' }], 'src'), 'b.jpg');
  const out = setAttrPath(html, [{ cls: 'card', nth: 1 }, { tag: 'img' }], 'src', 'z.jpg');
  ok('path: attr set scoped', out.includes('a.jpg') && out.includes('z.jpg') && !out.includes('b.jpg'));
}

/* ---------- 10. Real-site selectors used by the schema ---------- */

{
  const index = readFileSync(join(SITE, 'index.html'), 'utf8');

  eq('site: hero headline', htmlToText(readPath(index, [{ cls: 'hero-h1' }])).split('\n')[0], 'Crafted by hand.');
  eq('site: services card 1 title', readPath(index, [{ cls: 'svc-card', nth: 0 }, { tag: 'h3' }]), 'Bespoke Kitchens');
  eq('site: services card 4 title', readPath(index, [{ cls: 'svc-card', nth: 3 }, { tag: 'h3' }]), 'Bespoke Carpentry');

  const gx = locateAll(index, { cls: 'gx-grid' });
  ok('site: one bento grid', gx.length === 1, `found ${gx.length}`);

  // Counts are deliberately not asserted: photos and reviews are content
  // the owner adds and removes, so a fixed number would fail the moment
  // they did exactly what the editor is for.
  const tiles = locateAll(readPath(index, [{ cls: 'gx-grid' }]), { cls: 'gx-tile' });
  ok('site: the bento grid has tiles', tiles.length >= 1, `found ${tiles.length}`);

  const chips = locateAll(readPath(index, [{ cls: 'rv-chips' }]), { cls: 'rv-chip' });
  ok('site: there are review chips', chips.length >= 1, `found ${chips.length}`);
}
{
  const gallery = readFileSync(join(SITE, 'gallery.html'), 'utf8');
  const tiles = locateAll(readPath(gallery, [{ id: 'tileGrid' }]), { cls: 'tile' });
  ok('site: the gallery has tiles', tiles.length >= 1, `found ${tiles.length}`);

  const pairs = locateAll(readPath(gallery, [{ cls: 'ba-gallery' }]), { cls: 'ba-pair' });
  ok('site: there are before/after pairs', pairs.length >= 1, `found ${pairs.length}`);
}
{
  const contact = readFileSync(join(SITE, 'contact.html'), 'utf8');
  const phone = readAttrPath(contact, [{ cls: 'ci-item', nth: 0 }, { tag: 'a' }], 'href');
  eq('site: phone href', phone, 'tel:+447990527683');
}

/* ---------- report ---------- */

console.log(`\n  htmledit: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.log('   ✗ ' + f);
  console.log('');
  process.exit(1);
}
