/* ============================================================
   safety.test.mjs — guards on the WEBSITE, not the admin.

   These assert the things that would actually hurt the client:
   admin code leaking onto the public site, the reviews script
   being broken by the markers, or the editor being able to reach
   files it has no business touching.
   ============================================================ */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { EDITABLE_FILES, IMAGE_DIR, TEXT_FIELDS } from '../src/schema.js';
import { readReviews } from '../src/content.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', '..');

let passed = 0, failed = 0;
const failures = [];
const ok = (n, c, d) => c ? passed++ : (failed++, failures.push(`${n}${d ? ' — ' + d : ''}`));
const eq = (n, a, b) => ok(n, a === b, a === b ? '' : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const LIVE_PAGES = ['index.html','about.html','services.html','gallery.html','contact.html','privacy-policy.html'];

/* ---------- 1. No admin code ships to the public site ---------- */

for (const page of LIVE_PAGES) {
  const html = readFileSync(join(SITE, page), 'utf8');
  ok(`no-leak: ${page} does not reference _admin`, !html.includes('_admin'));
  ok(`no-leak: ${page} has no admin script tag`, !/admin\.(js|css)/i.test(html));
  ok(`no-leak: ${page} has no worker URL`, !/workers\.dev/i.test(html));
}

/* ---------- 2. The admin folder is not published by GitHub Pages ---------- */

{
  // Jekyll (the GitHub Pages default) skips underscore-prefixed
  // directories, which is why the folder is named _admin.
  ok('pages: admin folder is underscore-prefixed', existsSync(join(SITE, '_admin')));
  ok('pages: no .nojekyll file (which would publish _admin)', !existsSync(join(SITE, '.nojekyll')),
     'a .nojekyll file would expose _admin/ on the live domain');
}

/* ---------- 3. reviews-v2.js still parses and still works ---------- */

{
  const js = readFileSync(join(SITE, 'reviews-v2.js'), 'utf8');

  ok('reviews: markers present', js.includes('/* ADMIN:reviews:start */') && js.includes('/* ADMIN:reviews:end */'));

  // It must still be syntactically valid JavaScript.
  let parses = true;
  try { new Function(js); } catch (e) { parses = false; failures.push('reviews: parse error — ' + e.message); }
  ok('reviews: file is valid JavaScript', parses);

  // And the array the site actually uses must be intact.
  const items = readReviews(js);
  eq('reviews: 6 reviews readable', items.length, 6);
  ok('reviews: first review text intact', items[0].quote.startsWith('First class work carried out by Robbie'));
  ok('reviews: every review complete', items.every(r => r.quote && r.project && r.initial));

  // The markers must sit outside the array, not inside it.
  const start = js.indexOf('/* ADMIN:reviews:start */');
  const varAt = js.indexOf('var reviews');
  ok('reviews: start marker precedes the array', start !== -1 && start < varAt);
}

/* ---------- 4. Only reviews-v2.js differs from the committed site ---------- */

{
  let changed = [];
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', ...LIVE_PAGES, 'reviews-v2.js', 'script.js', 'style.css'],
      { cwd: SITE, encoding: 'utf8' });
    changed = out.split('\n').map(l => l.slice(3).trim()).filter(Boolean);
  } catch { /* not a git checkout — skip */ }

  const unexpected = changed.filter(f => f !== 'reviews-v2.js');
  ok('diff: no site file changed except reviews-v2.js', unexpected.length === 0,
     unexpected.length ? `also changed: ${unexpected.join(', ')}` : '');
}

/* ---------- 5. The editor cannot reach anything outside its list ---------- */

{
  const allowed = new Set(EDITABLE_FILES);
  ok('scope: style.css is not editable', !allowed.has('style.css'));
  ok('scope: script.js is not editable', !allowed.has('script.js'));
  ok('scope: no path escapes the repo root', EDITABLE_FILES.every(f => !f.includes('..') && !f.startsWith('/')));
  eq('scope: images go to one directory', IMAGE_DIR, 'images');

  // Every field must point at a file the editor is allowed to open.
  const stray = TEXT_FIELDS.filter(f => !allowed.has(f.file));
  ok('scope: every field targets an allowed file', stray.length === 0, stray.map(f => f.id).join(', '));
}

/* ---------- 6. The admin bundle has no external dependencies ---------- */

{
  const srcDir = join(HERE, '..', 'src');
  const walk = d => readdirSync(d).flatMap(n => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const jsFiles = walk(srcDir).filter(f => f.endsWith('.js'));

  let bad = [];
  for (const f of jsFiles) {
    const src = readFileSync(f, 'utf8');
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const i of imports) {
      if (!i.startsWith('./') && !i.startsWith('../')) bad.push(`${f.replace(SITE, '')}: ${i}`);
    }
  }
  ok('deps: no third-party imports in the Worker', bad.length === 0, bad.join(', '));
  ok('deps: worker source files found', jsFiles.length >= 6, `${jsFiles.length} files`);
}

/* ---------- 7. Secrets are never committed ---------- */

{
  const toml = readFileSync(join(HERE, '..', 'wrangler.toml'), 'utf8');
  ok('secrets: no token in wrangler.toml', !/gh[ps]_[A-Za-z0-9]{20,}/.test(toml));
  ok('secrets: no password hash in wrangler.toml', !/ADMIN_PASSWORD_HASH\s*=/.test(toml));
  ok('secrets: no session secret in wrangler.toml', !/SESSION_SECRET\s*=/.test(toml));

  const srcDir = join(HERE, '..', 'src');
  const idx = readFileSync(join(srcDir, 'index.js'), 'utf8');
  ok('secrets: worker reads secrets from env only', idx.includes('env.GITHUB_TOKEN') && !/gh[ps]_[A-Za-z0-9]{20,}/.test(idx));
}

console.log(`\n  safety: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.log('   ✗ ' + f);
  console.log('');
  process.exit(1);
}
