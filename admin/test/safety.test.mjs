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

  // The set-up link must carry the key in the URL *fragment*. A query
  // string would be sent to the server and land in access logs.
  ok('handover: key travels in the fragment, not a query string',
     html.includes('/admin/#k=') && !/\/admin\/\?k=/.test(html));
  ok('handover: fragment is stripped from the address bar after use',
     html.includes('history.replaceState'));
  ok('handover: a too-short fragment is ignored',
     /key\.length > 20/.test(html));
}

/* ---------- 2b. Password managers can save and fill the login ---------- */

{
  const html = readFileSync(join(ADMIN, 'index.html'), 'utf8');

  // iOS Keychain and Google Password Manager generally will not offer to
  // save a password-only form. A username field is what they file it under.
  const userFields = html.match(/autocomplete="username"/g) || [];
  ok('passwords: a username field on the sign-in form', userFields.length >= 1);
  ok('passwords: a username field on the create form', userFields.length >= 2, `${userFields.length} found`);

  ok('passwords: sign-in marked current-password', html.includes('autocomplete="current-password"'));
  ok('passwords: create marked new-password', html.includes('autocomplete="new-password"'));
  // The two real password fields must be fillable. The access-key field is
  // deliberately excluded from autofill — it is not the account password,
  // and filling it with one would only confuse.
  for (const id of ['pw', 'newPw']) {
    const tag = (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
    ok(`passwords: #${id} is not opted out of autofill`, tag && !/autocomplete="off"/.test(tag), tag.slice(0, 90));
  }
  ok('passwords: the access key field stays out of autofill',
     /id="key"[^>]*autocomplete="off"|autocomplete="off"[^>]*id="key"/.test(html));

  // Managers watch for a form submission, so both flows must be real forms.
  ok('passwords: sign-in is a form submit', /<form[^>]*id="pwForm"/.test(html) && html.includes("e.target.id === 'pwForm'"));
  ok('passwords: creating a password is a form submit',
     /<form[^>]*id="newPwForm"/.test(html) && html.includes("e.target.id === 'newPwForm'"));
  ok('passwords: the create button submits that form', /form="newPwForm"/.test(html));

  // The hidden username must be offscreen, not display:none, which is
  // more likely to be skipped over by a password manager.
  ok('passwords: username field is offscreen, not display:none',
     html.includes('.sr-only{') && /clip-path:inset\(50%\)/.test(html));
  ok('passwords: username field is not focusable', /class="sr-only"[^>]*tabindex="-1"/.test(html));

  ok('passwords: the new password starts hidden',
     /id="newPw" type="password"/.test(html));
  ok('passwords: it can be revealed to be read', html.includes('data-peek'));
}

/* ---------- 2c. A just-uploaded photo is never shown as broken ---------- */

{
  const html = readFileSync(join(ADMIN, 'index.html'), 'utf8');

  // GitHub Pages takes about a minute to rebuild, so a photo added moments
  // ago 404s on the live site. Both the editor's own thumbnails and the
  // preview must fall back to the copy already in the browser.
  ok('fresh: local copies are kept for new uploads', html.includes('freshUrls'));
  ok('fresh: the main photo is kept', /freshUrls\.set\(path,/.test(html));
  ok('fresh: the blur placeholder is kept too', /freshUrls\.set\(`\$\{IMAGE_DIR\}\/\$\{lqipName\}`/.test(html));

  ok('fresh: thumbnails go through imgUrl()', html.includes('const imgUrl ='));
  ok('fresh: no thumbnail points straight at the live site',
     !/src="\$\{SITE\}\/\$\{esc\(/.test(html));

  ok('fresh: the preview substitutes local copies', html.includes('withFreshImages(html.replace'));
  ok('fresh: substitution is longest-path-first',
     /sort\(\(a, b\) => b\.length - a\.length\)/.test(html),
     'shorter names could otherwise corrupt longer ones');
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

/* ---------- 4. The working tree is clean when tests run ----------
   Catches a page edited by accident and left uncommitted, which would
   otherwise make the round-trip results above meaningless.
   ------------------------------------------------------------ */

{
  let changed = [];
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', ...LIVE_PAGES, 'script.js', 'style.css'],
      { cwd: SITE, encoding: 'utf8' });
    changed = out.split('\n').map(l => l.slice(3).trim()).filter(Boolean);
  } catch { /* not a git checkout — skip */ }
  ok('diff: no uncommitted change to a live page', changed.length === 0, changed.join(', '));
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
