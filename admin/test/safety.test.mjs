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

// The editor's script was moved out of the page so its CSP could forbid
// inline script. Behaviour is asserted against app.js; markup and policy
// against index.html.
const APP = readFileSync(join(HERE, '..', 'app.js'), 'utf8');
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
  const html = readFileSync(join(ADMIN, 'index.html'), 'utf8') + APP;
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
  const html = readFileSync(join(ADMIN, 'index.html'), 'utf8') + APP;

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
  const html = readFileSync(join(ADMIN, 'index.html'), 'utf8') + APP;

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

/* ---------- 2d. Crop tool, and confirming a change went live ---------- */

{
  const html = readFileSync(join(ADMIN, 'index.html'), 'utf8') + APP;

  // The frame is the canvas, so the preview cannot disagree with the result.
  ok('crop: the tool exists', html.includes('async function cropSheet'));
  ok('crop: one paint routine drives preview and output', /function paint \(c, fw, fh, k\)/.test(html));
  ok('crop: the image is kept covering the frame', html.includes('function minScale') && html.includes('function clampAll'));
  ok('crop: panning is clamped, so no empty corners', /tx = Math\.max\(-bx, Math\.min\(bx, tx\)\)/.test(html));
  ok('crop: pinch to zoom', html.includes('startDist'));
  ok('crop: straighten control', html.includes('cropAngle'));
  ok('crop: quarter turns', html.includes('data-rot'));
  ok('crop: cancelling leaves nothing uploaded', html.includes('resolve(null)') && html.includes('if (!up)'));

  // Both crop shapes must be locked: the before/after halves have to match.
  ok('crop: before/after is 3:4', /ba:\s*\{ ratio: 3 \/ 4/.test(html));
  ok('crop: tiles are 4:3', /tile:\s*\{ ratio: 4 \/ 3/.test(html));

  ok('live: a needle is derived from the change', html.includes('function livenessNeedle'));
  ok('live: the real page is polled', html.includes('async function confirmLive'));
  ok('live: polling defeats the cache', /cache: 'no-store'/.test(html) && html.includes('?live='));
  ok('live: it gives up rather than spinning forever', /attempt < 22/.test(html));
  ok('live: it says so when the change appears', html.includes('It is live on the website now'));

  ok('towns: the editor has a screen for them', html.includes('function viewTowns'));
  ok('towns: edits are tracked', html.includes("e.target.id === 'townsBox'"));
}

/* ---------- 2e. Search-engine basics ---------- */

{
  const need = ['sitemap.xml', 'robots.txt'];
  for (const f of need) ok(`seo: ${f} exists`, existsSync(join(SITE, f)));

  const robots = readFileSync(join(SITE, 'robots.txt'), 'utf8');
  ok('seo: robots points at the sitemap', /Sitemap:\s*https:\/\/rplanecarpenter\.co\.uk\/sitemap\.xml/.test(robots));
  ok('seo: robots keeps crawlers out of the editor', /Disallow:\s*\/admin\//.test(robots));
  ok('seo: robots does not block the site', !/^Disallow:\s*\/$/m.test(robots));

  const sitemap = readFileSync(join(SITE, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  eq('seo: sitemap lists every page', locs.length, LIVE_PAGES.length);
  ok('seo: sitemap uses absolute https urls', locs.every(u => u.startsWith('https://rplanecarpenter.co.uk/')));
  ok('seo: sitemap does not list the editor', !locs.some(u => u.includes('/admin')));

  for (const page of LIVE_PAGES) {
    const html = readFileSync(join(SITE, page), 'utf8');
    const canon = (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
    ok(`seo: ${page} has one canonical`, (html.match(/rel="canonical"/g) || []).length === 1);
    ok(`seo: ${page} canonical is absolute`, canon && canon.startsWith('https://rplanecarpenter.co.uk/'));
    ok(`seo: ${page} is in the sitemap`, locs.includes(canon), canon);

    for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) {
      ok(`seo: ${page} has ${tag}`, html.includes(`"${tag}"`));
    }
    const ogImg = (html.match(/property="og:image" content="([^"]+)"/) || [])[1];
    ok(`seo: ${page} share image is absolute`, ogImg && ogImg.startsWith('https://'));
  }
}

/* ---------- 2f. Duplicate copies of the site are gone ---------- */

{
  // These were live, carried placeholder phone numbers, and competed with
  // the real pages for the same search terms.
  for (const f of ['preview.html', 'index-new.html', 'index-v3.html',
                   'rplanecarpenter-website.html', 'hero.b64']) {
    ok(`clean: ${f} is no longer published`, !existsSync(join(SITE, f)));
  }
  ok('clean: the duplicate release/ copy is gone', !existsSync(join(SITE, 'release')));

  for (const page of LIVE_PAGES) {
    const html = readFileSync(join(SITE, page), 'utf8');
    ok(`clean: ${page} carries no placeholder number`,
       !/07XXX|\+447000000000|\+441234567890/.test(html));
  }
}

/* ---------- 2g. A deploy must not leave stale editor code running ----------
   Browsers cache JavaScript. When the editor's modules changed but their
   URLs did not, phones kept running the previous version against the new
   site and produced errors about code that no longer existed. Every
   browser-facing import therefore carries a version stamp, and they must
   all agree — a half-updated editor is worse than an old one.
   ------------------------------------------------------------ */

{
  const browserFiles = ['app.js', 'content.js', 'render.js'];
  const stamps = new Set();
  let bare = [];

  for (const f of browserFiles) {
    const src = readFileSync(join(ADMIN, f), 'utf8');
    for (const m of src.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)) {
      const spec = m[1];
      const v = /\?v=(\d+)$/.exec(spec);
      if (v) stamps.add(v[1]); else bare.push(`${f}: ${spec}`);
    }
  }

  ok('cache: every editor import is version-stamped', bare.length === 0, bare.join(', '));
  eq('cache: the stamps all agree', stamps.size, 1);
  ok('cache: a stamp is actually present', stamps.size === 1 && [...stamps][0].length > 0);

  // schema.js and htmledit.js have no local imports of their own; if that
  // ever changes they must be stamped too, so assert the assumption.
  for (const f of ['schema.js', 'htmledit.js', 'crypto.js', 'github.js']) {
    const src = readFileSync(join(ADMIN, f), 'utf8');
    const local = [...src.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map(m => m[1]);
    const unstamped = local.filter(x => !/\?v=\d+$/.test(x));
    ok(`cache: ${f} has no unstamped local import`, unstamped.length === 0, unstamped.join(', '));
  }
}

/* ---------- 2h. Nothing non-essential loads before consent ----------
   UK PECR requires permission before analytics cookies, not after.
   The pages must therefore carry no tag at all — it is injected only
   once someone has agreed.
   ------------------------------------------------------------ */

{
  for (const page of LIVE_PAGES) {
    const html = readFileSync(join(SITE, page), 'utf8');
    ok(`consent: ${page} loads no analytics of its own`,
       !/<script[^>]+src="[^"]*googletagmanager/.test(html),
       'a tag in the markup runs before any choice can be made');
    ok(`consent: ${page} has no inline gtag call`, !/gtag\s*\(/.test(html));
    // The policy naming googletagmanager is correct — it permits the
    // script the consent banner may later inject, it does not load it.
    ok(`consent: ${page} permits it only via the policy`, html.includes('script-src'));
    ok(`consent: ${page} includes the consent script`, html.includes('cookies-v2.js'));
    ok(`consent: ${page} includes the consent styles`, html.includes('cookies-v2.css'));
  }

  const js = readFileSync(join(SITE, 'cookies-v2.js'), 'utf8');

  // The only mention of Google must sit inside the function that runs on consent.
  const fnStart = js.indexOf('function startAnalytics');
  const fnEnd = js.indexOf('\n  }', fnStart);
  const inside = js.slice(fnStart, fnEnd);
  ok('consent: Google is only ever referenced inside startAnalytics',
     (js.match(/googletagmanager/g) || []).length === 1 && inside.includes('googletagmanager'));

  ok('consent: refusing is offered as plainly as accepting',
     js.includes('data-ck="denied"') && js.includes('data-ck="granted"'));
  ok('consent: the choice can be withdrawn later', js.includes('ck-reopen'));
  ok('consent: withdrawing deletes what was set', js.includes('clearAnalyticsCookies'));
  ok('consent: consent expires and is asked again', /MAX_AGE_DAYS\s*=\s*\d+/.test(js));
  ok('consent: the choice itself is not stored in a cookie',
     js.includes('localStorage.setItem(STORE') && !/document\.cookie\s*=\s*STORE/.test(js));
  ok('consent: private browsing does not break it', /catch \(e\)/.test(js));

  const css = readFileSync(join(SITE, 'cookies-v2.css'), 'utf8');
  // Both buttons must carry the same weight — that is a legal requirement.
  const yes = /\.ck-yes\s*\{[\s\S]*?\}/.exec(css)[0];
  const no = /\.ck-no\s*\{[\s\S]*?\}/.exec(css)[0];
  ok('consent: neither button is visually hidden',
     !/display:\s*none/.test(yes + no) && !/opacity:\s*0/.test(yes + no));
  ok('consent: both buttons share the same shape', css.includes('.ck-btn {'));

  const policy = readFileSync(join(SITE, 'privacy-policy.html'), 'utf8');
  ok('consent: the policy no longer claims there are no cookies',
     !/This website does not use cookies/.test(policy) &&
     !/I do not use analytics software/.test(policy));
  ok('consent: the policy names the cookies actually set',
     policy.includes('_ga') && policy.includes('Google Analytics'));
  ok('consent: the policy explains how to change your mind',
     /Cookie choice/.test(policy));
}

/* ---------- 2i. Security policy ----------
   GitHub Pages cannot set HTTP response headers, so what can be done
   from the document itself is done: a Content-Security-Policy and a
   referrer policy via meta. Three headers (X-Content-Type-Options,
   X-Frame-Options, Permissions-Policy) have no meta equivalent and
   are simply unavailable on this host — that is a limitation to state
   plainly, not to paper over.
   ------------------------------------------------------------ */

{
  const cspOf = html => (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];

  for (const page of LIVE_PAGES) {
    const html = readFileSync(join(SITE, page), 'utf8');
    const csp = cspOf(html);
    ok(`csp: ${page} has a policy`, !!csp);
    if (!csp) continue;

    // Placed before anything it is meant to govern.
    ok(`csp: ${page} policy precedes the first resource`,
       html.indexOf('Content-Security-Policy') < html.indexOf('<link'));

    // The pages carry no executable inline script, so the policy must
    // not weaken script-src — that is the whole value of having one.
    const scriptSrc = /script-src ([^;]+)/.exec(csp)[1];
    ok(`csp: ${page} script-src has no 'unsafe-inline'`, !scriptSrc.includes("'unsafe-inline'"), scriptSrc);
    ok(`csp: ${page} script-src has no 'unsafe-eval'`, !scriptSrc.includes("'unsafe-eval'"));

    for (const d of ['default-src', 'base-uri', 'object-src', 'form-action', 'frame-ancestors']) {
      ok(`csp: ${page} sets ${d}`, csp.includes(d + ' '));
    }
    ok(`csp: ${page} blocks plugins`, /object-src 'none'/.test(csp));
    ok(`csp: ${page} upgrades insecure requests`, csp.includes('upgrade-insecure-requests'));
    ok(`csp: ${page} sets a referrer policy`, /name="referrer" content="strict-origin/.test(html));

    // Everything the page genuinely loads has to be allowed, or the
    // policy breaks the site — which is worse than not having one.
    if (html.includes('fonts.googleapis.com')) ok(`csp: ${page} allows the font stylesheet`, csp.includes('https://fonts.googleapis.com'));
    if (html.includes('fonts.gstatic.com')) ok(`csp: ${page} allows the font files`, csp.includes('https://fonts.gstatic.com'));
    ok(`csp: ${page} allows analytics once consented`, csp.includes('googletagmanager.com'));
    ok(`csp: ${page} allows its own data: images`, /img-src[^;]*data:/.test(csp));
  }

  // The editor holds an access key, so its policy is the strict one —
  // which is why its script was moved out of the page.
  const admin = readFileSync(join(ADMIN, 'index.html'), 'utf8');
  const adminCsp = cspOf(admin);
  ok('csp: the editor has a policy', !!adminCsp);
  ok('csp: the editor allows no inline script at all', /script-src 'self';/.test(adminCsp), adminCsp);
  ok('csp: the editor carries no inline module', !/<script type="module">/.test(admin));
  ok('csp: the editor loads its script from a file', /src="\.\/app\.js/.test(admin));
  ok('csp: the editor may reach GitHub', adminCsp.includes('https://api.github.com'));
  ok('csp: the editor may show blob previews', /img-src[^;]*blob:/.test(adminCsp));
  ok('csp: the editor cannot be framed', adminCsp.includes("frame-ancestors 'none'"));
  ok('csp: the extracted script exists', existsSync(join(ADMIN, 'app.js')));
}

/* ---------- 3. Reviews are in the page, and the script still drives them ---------- */

{
  const js = readFileSync(join(SITE, 'reviews-v2.js'), 'utf8');
  const html = readFileSync(join(SITE, 'index.html'), 'utf8');

  let parses = true;
  try { new Function(js); } catch (e) { parses = false; failures.push('reviews: parse error — ' + e.message); }
  ok('reviews: the script is valid JavaScript', parses);

  // The whole point of the change: content lives in the page, not the script.
  ok('reviews: the script holds no review text', !/var reviews\s*=\s*\[/.test(js),
     'content in a JS array is invisible to anything that does not run the carousel');
  ok('reviews: the script reads slides from the page', js.includes(".querySelectorAll('.rv-slide')"));

  const items = readReviews(html);
  ok('reviews: readable from the markup', items.length >= 1, `${items.length}`);
  ok('reviews: every one is complete', items.every(r => r.quote && r.project && r.initial));

  // One visible, every other one present but hidden — asserted as a
  // relationship, since the owner adds and removes reviews freely.
  eq('reviews: one slide starts active', (html.match(/class="rv-slide is-active"/g) || []).length, 1);
  eq('reviews: every other slide is hidden from assistive tech',
     (html.match(/class="rv-slide" data-i="\d+" aria-hidden="true"/g) || []).length, items.length - 1);

  // Hidden must mean faded, not removed — display:none content carries less weight.
  const css = readFileSync(join(SITE, 'reviews-v2.css'), 'utf8');
  ok('reviews: hidden slides are faded, not display:none',
     /\.rv-slide\s*\{[^}]*opacity:\s*0/.test(css) && !/\.rv-slide\s*\{[^}]*display:\s*none/.test(css));
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

  const imports = [...APP.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  ok('deps: the editor imports locally only', imports.length > 0 && imports.every(i => i.startsWith('./')), imports.join(', '));
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
