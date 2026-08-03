/* ============================================================
   safety.test.mjs — guards on the WEBSITE, not the editor.

   These assert the things that would actually hurt: editor code
   leaking into the public pages, the reviews script being broken
   by the markers, a credential being committed, or the editor
   being able to reach files it has no business touching.
   ============================================================ */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { EDITABLE_FILES, IMAGE_DIR, TEXT_FIELDS } from '../schema.js';
import { readReviews } from '../content.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN = join(HERE, '..');
const SITE = join(HERE, '..', '..');

let passed = 0, failed = 0;
const failures = [];
const ok = (n, c, d) => c ? passed++ : (failed++, failures.push(`${n}${d ? ' — ' + d : ''}`));
const eq = (n, a, b) => ok(n, a === b, a === b ? '' : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const LIVE_PAGES = ['index.html','about.html','services.html','gallery.html','contact.html','privacy-policy.html'];
const TOKEN_RE = /gh[ps]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/;

/* ---------- 1. No editor code reaches the public pages ---------- */

for (const page of LIVE_PAGES) {
  const html = readFileSync(join(SITE, page), 'utf8');
  ok(`no-leak: ${page} loads no editor script`, !/admin\/(index\.html|github\.js|content\.js|htmledit\.js)/.test(html));
  ok(`no-leak: ${page} never links to the editor`, !/href=["'][^"']*\/admin\b/.test(html),
     'a public link would invite crawlers and visitors to the editor');
  ok(`no-leak: ${page} contains no token`, !TOKEN_RE.test(html));
}

/* ---------- 2. The editor page keeps itself out of search ---------- */

{
  const html = readFileSync(join(ADMIN, 'index.html'), 'utf8');
  ok('editor: has noindex', /name=["']robots["'][^>]*noindex/i.test(html));
  ok('editor: stores the key only in the browser', html.includes('localStorage'));
  ok('editor: ships no hard-coded credential', !TOKEN_RE.test(html));
  ok('editor: targets the right repository',
     html.includes("owner: 'jamiep2009-hub'") && html.includes("repo: 'rplanecarpenter'"));
}

/* ---------- 3. reviews-v2.js still parses and still works ---------- */

{
  const js = readFileSync(join(SITE, 'reviews-v2.js'), 'utf8');
  ok('reviews: markers present', js.includes('/* ADMIN:reviews:start */') && js.includes('/* ADMIN:reviews:end */'));

  let parses = true;
  try { new Function(js); } catch (e) { parses = false; failures.push('reviews: parse error — ' + e.message); }
  ok('reviews: file is valid JavaScript', parses);

  const items = readReviews(js);
  eq('reviews: 6 reviews readable', items.length, 6);
  ok('reviews: first review text intact', items[0].quote.startsWith('First class work carried out by Robbie'));
  ok('reviews: every review complete', items.every(r => r.quote && r.project && r.initial));

  const start = js.indexOf('/* ADMIN:reviews:start */');
  ok('reviews: start marker precedes the array', start !== -1 && start < js.indexOf('var reviews'));
}

/* ---------- 4. No live page has been modified ---------- */

{
  let changed = [];
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', ...LIVE_PAGES, 'script.js', 'style.css'],
      { cwd: SITE, encoding: 'utf8' });
    changed = out.split('\n').map(l => l.slice(3).trim()).filter(Boolean);
  } catch { /* not a git checkout — skip */ }
  ok('diff: no live page has been modified', changed.length === 0, changed.join(', '));
}

/* ---------- 5. The editor cannot reach anything outside its list ---------- */

{
  const allowed = new Set(EDITABLE_FILES);
  ok('scope: style.css is not editable', !allowed.has('style.css'));
  ok('scope: script.js is not editable', !allowed.has('script.js'));
  ok('scope: the editor cannot edit itself', !allowed.has('admin/index.html'));
  ok('scope: no path escapes the repo root', EDITABLE_FILES.every(f => !f.includes('..') && !f.startsWith('/')));
  eq('scope: images go to one directory', IMAGE_DIR, 'images');

  const stray = TEXT_FIELDS.filter(f => !allowed.has(f.file));
  ok('scope: every field targets an allowed file', stray.length === 0, stray.map(f => f.id).join(', '));
}

/* ---------- 6. The editor has no third-party dependencies ---------- */

{
  const files = readdirSync(ADMIN).filter(f => f.endsWith('.js')).map(f => join(ADMIN, f));
  const bad = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (!m[1].startsWith('./') && !m[1].startsWith('../')) bad.push(`${f.replace(SITE, '')}: ${m[1]}`);
    }
  }
  ok('deps: no third-party imports', bad.length === 0, bad.join(', '));
  ok('deps: engine modules present', files.length >= 5, `${files.length} files`);

  const html = readFileSync(join(ADMIN, 'index.html'), 'utf8');
  const imports = [...html.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  ok('deps: editor page imports locally only', imports.length > 0 && imports.every(i => i.startsWith('./')), imports.join(', '));
}

/* ---------- 7. GitHub Pages will publish the editor unchanged ---------- */

{
  // Pages runs Jekyll, which would interpret {{ }} and {% %}.
  const files = ['index.html', ...readdirSync(ADMIN).filter(f => f.endsWith('.js'))];
  const offenders = files.filter(f => /\{\{|\{%/.test(readFileSync(join(ADMIN, f), 'utf8')));
  ok('pages: no Liquid syntax in the editor', offenders.length === 0, offenders.join(', '));
  ok('pages: editor folder is published', !ADMIN.split('/').filter(Boolean).pop().startsWith('_'),
     'an underscore folder is skipped by Jekyll, so the editor would 404');
  ok('pages: editor entry point exists', existsSync(join(ADMIN, 'index.html')));
}

/* ---------- 8. No credential is committed anywhere ---------- */

{
  const walk = d => readdirSync(d).flatMap(n => {
    if (n === 'node_modules' || n === '.git') return [];
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const suspicious = walk(ADMIN)
    .filter(f => /\.(js|mjs|html|json|md)$/.test(f))
    .filter(f => TOKEN_RE.test(readFileSync(f, 'utf8')));
  ok('secrets: no token anywhere in the editor', suspicious.length === 0, suspicious.join(', '));
  ok('secrets: no .env committed', !existsSync(join(ADMIN, '.env')) && !existsSync(join(SITE, '.env')));
}

console.log(`\n  safety: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.log('   ✗ ' + f);
  console.log('');
  process.exit(1);
}
