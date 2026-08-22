/* ============================================================
   app.js — the editor.

   Kept out of the page so that admin/index.html can carry a
   Content-Security-Policy with no 'unsafe-inline' in script-src.
   This is the one page holding a GitHub access key, so an
   injected script here would matter far more than anywhere else
   on the site; a strict policy is worth the extra file.
   ============================================================ */

import { GitHub } from './github.js?v=4';
import { seal, unseal, suggestPassphrase, strength } from './crypto.js?v=4';
import { readModel, applyChanges, findUnusedImages } from './content.js?v=4';
import {
  EDITABLE_FILES, REFERENCE_FILES, IMAGE_DIR, GALLERY_CATEGORIES, BENTO_SIZES, groupedTextFields,
} from './schema.js?v=4';

/* ============================================================
   Configuration — the repository this editor maintains.
   ============================================================ */
const REPO = { owner: 'jamiep2009-hub', repo: 'rplanecarpenter', branch: 'main' };
const SITE = location.origin;
const KEY_STORE = 'rpc-editor-key';
const DRAFT_STORE = 'rpc-editor-draft';
const LOCK_FILE = 'admin/key.enc';   // the password-protected access key

/* ============================================================
   Icons
   ============================================================ */
const I = {
  photo:'<path d="M3 5h18v14H3z"/><circle cx="8.5" cy="10" r="1.6"/><path d="m21 16-5-5-5 5-3-3-5 5"/>',
  star:'<path d="M12 2.5l2.9 6.4 7 .7-5.3 4.6 1.6 6.8L12 17.4 5.8 21l1.6-6.8L2.1 9.6l7-.7z"/>',
  text:'<path d="M4 6h16M4 12h16M4 18h11"/>',
  swap:'<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  chev:'<path d="m9 18 6-6-6-6"/>', down:'<path d="m6 9 6 6 6-6"/>',
  back:'<path d="m15 18-6-6 6-6"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>',
  up:'<path d="m18 15-6-6-6 6"/>', dn:'<path d="m6 9 6 6 6-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  bin:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  warn:'<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  undo:'<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-5.7L3 10"/>',
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  up2:'<path d="M12 19V5M5 12l7-7 7 7"/>',
  out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  share:'<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
};
const svg = (d, w = 20) =>
  `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ============================================================
   State
   ============================================================ */
const S = {
  gh:null, ready:false, loading:true, view:'menu', group:null,
  files:null, sha:null, base:null, draft:null, images:[], schema:null, busy:false,
  unused:null,      // images nothing points at; null until looked up
  tidyPicked:new Set(),
  lock:null,        // the encrypted key from the website, if one exists
  mode:'checking',  // checking | password | key | ready
};
const clone = o => JSON.parse(JSON.stringify(o));

/* A just-uploaded photo is not on the live site yet — GitHub Pages needs
   about a minute to rebuild. Show it from the local blob until then, so
   the editor never displays a broken image for something you just added. */
const freshUrls = new Map();
const imgUrl = path => freshUrls.get(path) || `${SITE}/${path}`;

/** Point a rendered page at local copies of anything not yet deployed. */
function withFreshImages (html) {
  if (!freshUrls.size) return html;
  let out = html;
  // Longest paths first, so one filename can never be a prefix of another.
  for (const path of [...freshUrls.keys()].sort((a, b) => b.length - a.length)) {
    out = out.split(path).join(freshUrls.get(path));
  }
  return out;
}
const $ = id => document.getElementById(id);

/* ============================================================
   Toast
   ============================================================ */
function toast (msg, kind = 'ok', ms = 3800) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = svg(kind === 'ok' ? I.check : I.warn, 17) + '<span>' + esc(msg) + '</span>';
  el.style.pointerEvents = 'auto';
  $('toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* ============================================================
   Unpublished work

   Edits live in the page's memory, so a phone call, a backgrounded
   tab or an accidental close used to lose them. The working copy is
   now written to the device as it is typed and offered back on
   return. It is cleared the moment it is published.
   ============================================================ */

let draftTimer = null;

function saveDraft () {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(function () {
    try {
      if (!S.draft || changeCount() === 0) { localStorage.removeItem(DRAFT_STORE); return; }
      localStorage.setItem(DRAFT_STORE, JSON.stringify({
        at: Date.now(), sha: S.sha, draft: S.draft,
      }));
    } catch (e) { /* private mode, or full — the session still holds it */ }
  }, 600);
}

function clearDraft () {
  clearTimeout(draftTimer);
  try { localStorage.removeItem(DRAFT_STORE); } catch (e) { /* ignore */ }
}

function readDraft () {
  try {
    const raw = localStorage.getItem(DRAFT_STORE);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !v.draft) return null;
    if ((Date.now() - (v.at || 0)) > 14 * 86400000) return null;   // stale
    return v;
  } catch (e) { return null; }
}

function describeAge (ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'a moment ago';
  if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const d = Math.round(h / 24);
  return d + (d === 1 ? ' day ago' : ' days ago');
}

/** Offer unpublished work back, once the site has loaded. */
async function offerDraft () {
  const saved = readDraft();
  if (!saved) return;

  // Count what is actually different from what is now live.
  const was = S.draft;
  S.draft = saved.draft;
  const n = changeCount();
  S.draft = was;

  if (n === 0) { clearDraft(); return; }

  const moved = saved.sha && S.sha && saved.sha !== S.sha;
  const keep = await confirmSheet(
    'Unpublished changes',
    `You have ${n} change${n > 1 ? 's' : ''} from ${describeAge(saved.at)} that were never published.` +
    (moved ? ' The website has changed since, so some may no longer fit.' : ''),
    'Restore them');

  if (keep) {
    S.draft = saved.draft;
    render();
    toast('Restored. Publish when you are ready.', 'ok', 4200);
  } else {
    clearDraft();
  }
}

/* ============================================================
   Change tracking
   ============================================================ */
function changes () {
  if (!S.base || !S.draft) return {};
  const out = {};
  const text = {};
  for (const [k, v] of Object.entries(S.draft.text || {})) {
    if (JSON.stringify(v) !== JSON.stringify(S.base.text[k])) text[k] = v;
  }
  if (Object.keys(text).length) out.text = text;
  for (const key of ['gallery','bento','beforeafter','reviews','towns']) {
    if (JSON.stringify(S.draft[key]) !== JSON.stringify(S.base[key])) out[key] = S.draft[key];
  }
  if (JSON.stringify(S.draft.contact) !== JSON.stringify(S.base.contact)) out.contact = S.draft.contact;
  return out;
}
function changeCount () {
  const c = changes();
  let n = 0;
  if (c.text) n += Object.keys(c.text).length;
  for (const k of ['gallery','bento','beforeafter','reviews','towns','contact']) if (c[k]) n++;
  return n;
}
function syncBar () {
  saveDraft();
  const n = changeCount();
  $('bar').classList.toggle('show', n > 0 && S.ready);
  $('barTxt').innerHTML = n ? `${n} unsaved change${n > 1 ? 's' : ''}<small>Preview, then publish to go live</small>` : '';
}
window.addEventListener('beforeunload', e => { if (changeCount() > 0) { e.preventDefault(); e.returnValue = ''; } });

/* ============================================================
   Image processing — EXIF-safe rotate, resize, compress
   ============================================================ */
/* ============================================================
   Crop & straighten

   The frame is the canvas, so what is shown is exactly what gets
   saved — no separate preview to disagree with the result. Pan by
   dragging, zoom by pinching, straighten with the slider. The
   image is always kept covering the frame, so a crop can never
   come out with an empty corner.
   ============================================================ */
async function cropSheet (file, { ratio, outW, outH, quality = 0.84 }) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name} is too large.`);

  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }

  return new Promise(resolve => {
    const DW = 640, DH = Math.round(DW / ratio);      // internal canvas resolution
    let angle = 0, quarter = 0, scale = 1, tx = 0, ty = 0;

    const w = sheet('Crop the photo', `
      <div class="crop-stage" id="cropStage">
        <canvas id="cropCanvas" width="${DW}" height="${DH}"></canvas>
        <div class="crop-grid"></div>
        <div class="crop-hint">Drag to move · pinch to zoom</div>
      </div>
      <div class="crop-tools">
        <label for="cropAngle">Straighten</label>
        <input type="range" id="cropAngle" min="-12" max="12" step="0.5" value="0">
        <span class="crop-deg" id="cropDeg">0.0°</span>
      </div>
      <div class="two" style="margin-top:12px">
        <button class="btn" data-rot="1">${svg(I.undo,15)} Rotate 90°</button>
        <button class="btn" data-reset="1">Reset</button>
      </div>
    `, `<button class="btn" data-cancel="1">Cancel</button>
        <button class="btn btn-gold" data-use="1">Use photo</button>`);

    const stage = w.querySelector('#cropStage');
    const cv = w.querySelector('#cropCanvas');
    const ctx = cv.getContext('2d');

    /* Source dimensions after any quarter-turns. */
    const srcW = () => (quarter % 2 ? bmp.height : bmp.width);
    const srcH = () => (quarter % 2 ? bmp.width : bmp.height);

    /* Smallest scale that still covers the frame at this angle. */
    function minScale (fw, fh) {
      const a = Math.abs(angle * Math.PI / 180);
      const need = {
        w: Math.abs(fw * Math.cos(a)) + Math.abs(fh * Math.sin(a)),
        h: Math.abs(fw * Math.sin(a)) + Math.abs(fh * Math.cos(a)),
      };
      return { s: Math.max(need.w / srcW(), need.h / srcH()), need };
    }

    function clampAll () {
      const { s: min, need } = minScale(DW, DH);
      if (scale < min) scale = min;
      const bx = Math.max(0, (scale * srcW() - need.w) / 2);
      const by = Math.max(0, (scale * srcH() - need.h) / 2);
      tx = Math.max(-bx, Math.min(bx, tx));
      ty = Math.max(-by, Math.min(by, ty));
    }

    function paint (c, fw, fh, k) {
      c.save();
      c.fillStyle = '#111';
      c.fillRect(0, 0, fw, fh);
      c.translate(fw / 2, fh / 2);
      c.rotate(angle * Math.PI / 180);
      c.translate(tx * k, ty * k);
      c.scale(scale * k, scale * k);
      c.rotate(quarter * Math.PI / 2);
      c.imageSmoothingQuality = 'high';
      c.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      c.restore();
    }

    function render () { clampAll(); paint(ctx, DW, DH, 1); }

    /* ---- reset to a sensible starting crop ---- */
    function reset () {
      angle = 0; quarter = 0; tx = 0; ty = 0;
      scale = minScale(DW, DH).s;
      w.querySelector('#cropAngle').value = '0';
      w.querySelector('#cropDeg').textContent = '0.0°';
      render();
    }
    reset();

    /* ---- pan and pinch ---- */
    const pts = new Map();
    let startDist = 0, startScale = 1, startMid = null, startTx = 0, startTy = 0;

    stage.addEventListener('pointerdown', e => {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stage.classList.add('dragging');
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        startDist = Math.hypot(a.x - b.x, a.y - b.y);
        startScale = scale;
        startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      startTx = tx; startTy = ty;
    });

    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const k = DW / stage.getBoundingClientRect().width;   // screen px -> canvas px

      if (pts.size === 1) {
        // Pan in the image's own frame, so dragging feels right when rotated.
        const a = -angle * Math.PI / 180;
        const dx = (e.clientX - prev.x) * k, dy = (e.clientY - prev.y) * k;
        tx += (dx * Math.cos(a) - dy * Math.sin(a)) / scale;
        ty += (dx * Math.sin(a) + dy * Math.cos(a)) / scale;
      } else if (pts.size === 2) {
        const [a2, b2] = [...pts.values()];
        const dist = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        if (startDist > 0) scale = startScale * (dist / startDist);
      }
      render();
    });

    function release (e) {
      pts.delete(e.pointerId);
      if (!pts.size) stage.classList.remove('dragging');
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    /* ---- straighten ---- */
    w.querySelector('#cropAngle').addEventListener('input', e => {
      angle = Number(e.target.value);
      w.querySelector('#cropDeg').textContent = angle.toFixed(1) + '°';
      render();
    });

    /* ---- buttons ---- */
    w.addEventListener('click', async e => {
      if (e.target.closest('[data-rot]')) { quarter = (quarter + 1) % 4; tx = ty = 0; scale = minScale(DW, DH).s; render(); return; }
      if (e.target.closest('[data-reset]')) { reset(); return; }
      if (e.target.closest('[data-cancel]') || e.target === w) { bmp.close?.(); w.remove(); resolve(null); return; }

      if (e.target.closest('[data-use]')) {
        const out = document.createElement('canvas');
        out.width = outW; out.height = outH;
        paint(out.getContext('2d'), outW, outH, outW / DW);

        const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
        const blob = await new Promise(r => out.toBlob(r, type, quality));

        const lc = document.createElement('canvas');
        const lw = 24, lh = Math.max(1, Math.round(lw * outH / outW));
        lc.width = lw; lc.height = lh;
        lc.getContext('2d').drawImage(out, 0, 0, lw, lh);
        const lqip = await new Promise(r => lc.toBlob(r, 'image/jpeg', 0.4));

        bmp.close?.();
        w.remove();
        resolve({ main: blob, lqip, width: outW, height: outH, ext: type === 'image/webp' ? 'webp' : 'jpg' });
      }
    });
  });
}

const toBase64 = blob => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1]);
  fr.onerror = () => rej(new Error('Could not read the photo.'));
  fr.readAsDataURL(blob);
});

/** Does this browser encode WebP? Cached — the answer cannot change. */
let webpOk = null;
function supportsWebp () {
  if (webpOk === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpOk;
}

function safeName (original, prefix, ext = 'jpg') {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  const stem = String(original || 'photo').replace(/\.[^.]+$/, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'photo';
  return `${prefix}-${stem}-${stamp}${rand}.${ext}`;
}

/** Crop, then upload. Returns null if the crop was cancelled. */
async function cropAndUpload (file, opts, prefix) {
  const out = await cropSheet(file, opts);
  if (!out) return null;
  return uploadProcessed(out, file.name, prefix);
}

async function uploadProcessed (out, originalName, prefix) {
  const name = safeName(originalName, prefix, out.ext || 'jpg');
  // The placeholder stays JPEG: it is 24px wide, so the format saves nothing.
  const lqipName = name.replace(/\.(webp|jpg)$/, '-lqip.jpg');
  const binaryFiles = {};
  binaryFiles[`${IMAGE_DIR}/${name}`] = await toBase64(out.main);
  binaryFiles[`${IMAGE_DIR}/${lqipName}`] = await toBase64(out.lqip);

  await S.gh.commit({ binaryFiles, message: 'add a photo' });

  const path = `${IMAGE_DIR}/${name}`;
  freshUrls.set(path, URL.createObjectURL(out.main));
  freshUrls.set(`${IMAGE_DIR}/${lqipName}`, URL.createObjectURL(out.lqip));
  S.images.unshift({ path, size: out.main.size });
  return { path, width: out.width, height: out.height };
}

/* Crop shapes. Before/after must match so the two halves line up;
   4:3 suits room photos and is what the gallery tiles crop from. */
const CROP = {
  tile: { ratio: 4 / 3, outW: 1200, outH: 900,  quality: 0.80 },
  ba:   { ratio: 3 / 4, outW: 1080, outH: 1440, quality: 0.82 },
};

/* ============================================================
   First-run setup
   ============================================================ */
function viewPassword (err) {
  return `<div class="setup"><form class="setup-card" id="pwForm">
    <div class="setup-mark">RP</div>
    <h1>Website Editor</h1>
    <p class="lede">R. Plane Carpenter</p>
    <input class="sr-only" id="pwUser" type="text" name="username" value="rplanecarpenter.co.uk"
           autocomplete="username" readonly tabindex="-1" aria-hidden="true">
    <div class="field">
      <label for="pw">Password</label>
      <input class="inp" id="pw" type="password" name="password" autocomplete="current-password" required autofocus>
      ${err ? `<div class="hint" style="color:var(--err);font-weight:700">${esc(err)}</div>` : ''}
    </div>
    <button class="btn btn-gold btn-block" type="submit" id="pwBtn">Sign in</button>
    <div class="privacy">
      ${svg(I.lock, 15)}
      <span>Signing in unlocks this website's editor. Nothing you type is sent anywhere.</span>
    </div>
    <button type="button" class="btn btn-block" data-usekey="1" style="margin-top:10px;border:0;background:none;color:var(--ink-3);font-size:13px">Use an access key instead</button>
  </form></div>`;
}

function viewSetup (err) {
  return `<div class="setup"><form class="setup-card" id="setupForm">
    <div class="setup-mark">RP</div>
    <h1>Website Editor</h1>
    <p class="lede">One-time setup — about two minutes.</p>
    <ol class="setup-steps">
      <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">this GitHub page</a> and sign in.</li>
      <li>Under <b>Repository access</b> choose <b>Only select repositories</b>, then pick <b>rplanecarpenter</b>.</li>
      <li>Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>.</li>
      <li>Tap <b>Generate token</b>, copy it, and paste it below.</li>
    </ol>
    <div class="field">
      <label for="key">Access key</label>
      <input class="inp key-in" id="key" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required>
      ${err ? `<div class="hint" style="color:var(--err);font-weight:700">${esc(err)}</div>` : ''}
    </div>
    <button class="btn btn-gold btn-block" type="submit" id="setupBtn">Connect</button>
    ${S.lock ? `<button type="button" class="btn btn-block" data-usepw="1" style="margin-top:10px;border:0;background:none;color:var(--ink-3);font-size:13px">Sign in with a password instead</button>` : ''}
    <div class="privacy">
      ${svg(I.lock, 15)}
      <span>The key is stored only on this device and is sent nowhere except GitHub. It can be revoked at any time from your GitHub settings.</span>
    </div>
  </form></div>`;
}

/* ============================================================
   Views
   ============================================================ */
const MENU = [
  { id:'gallery',     ico:I.photo, t:'Gallery photos',   s:'Add, edit and reorder your project photos' },
  { id:'bento',       ico:I.home,  t:'Homepage photos',  s:'The featured grid on the front page' },
  { id:'beforeafter', ico:I.swap,  t:'Before & After',   s:'Photo comparison sliders' },
  { id:'reviews',     ico:I.star,  t:'Reviews',          s:'What your customers say' },
  { id:'text',        ico:I.text,  t:'Page wording',     s:'Headings and paragraphs on every page' },
  { id:'contact',     ico:I.phone, t:'Contact details',  s:'Phone number and email address' },
  { id:'towns',       ico:I.pin,   t:'Towns covered',    s:'The areas listed on your map' },
];

function viewMenu () {
  const counts = {
    gallery:(S.draft.gallery||[]).length, bento:(S.draft.bento||[]).length,
    beforeafter:(S.draft.beforeafter||[]).length, reviews:(S.draft.reviews||[]).length,
    towns:(S.draft.towns||[]).length,
  };
  return `<div class="menu">${MENU.map(m => `
    <button class="menu-item" data-go="${m.id}">
      <span class="menu-ico">${svg(m.ico, 21)}</span>
      <span class="menu-txt"><strong>${m.t}</strong><span>${counts[m.id] != null ? counts[m.id] + ' items · ' : ''}${m.s}</span></span>
      ${svg(I.chev, 17)}
    </button>`).join('')}
  </div>
  <div class="sec-title">Site</div>
  <div class="menu">
    <button class="menu-item" data-go="tidy">
      <span class="menu-ico" style="background:var(--surface-2);color:var(--ink-2)">${svg(I.bin, 20)}</span>
      <span class="menu-txt"><strong>Tidy up photos</strong><span>Remove photos nothing on the site uses</span></span>
      ${svg(I.chev, 17)}
    </button>
    <button class="menu-item" data-go="login">
      <span class="menu-ico" style="background:var(--surface-2);color:var(--ink-2)">${svg(I.lock, 20)}</span>
      <span class="menu-txt"><strong>Password login</strong><span>${S.lock ? 'Change the password' : 'Sign in with a password instead of a key'}</span></span>
      ${svg(I.chev, 17)}
    </button>
    <button class="menu-item" data-go="handover">
      <span class="menu-ico" style="background:var(--surface-2);color:var(--ink-2)">${svg(I.share, 20)}</span>
      <span class="menu-txt"><strong>Set up another device</strong><span>Give someone else access to this editor</span></span>
      ${svg(I.chev, 17)}
    </button>
    <button class="menu-item" data-act="undo">
      <span class="menu-ico" style="background:var(--surface-2);color:var(--ink-2)">${svg(I.undo, 20)}</span>
      <span class="menu-txt"><strong>Undo last change</strong><span>Put the website back the way it was</span></span>
      ${svg(I.chev, 17)}
    </button>
    <button class="menu-item" data-act="visit">
      <span class="menu-ico" style="background:var(--surface-2);color:var(--ink-2)">${svg(I.eye, 20)}</span>
      <span class="menu-txt"><strong>View live website</strong><span>Opens the front page</span></span>
      ${svg(I.chev, 17)}
    </button>
    <button class="menu-item" data-act="forget">
      <span class="menu-ico" style="background:var(--surface-2);color:var(--ink-2)">${svg(I.out, 20)}</span>
      <span class="menu-txt"><strong>Sign out of this device</strong><span>Removes the saved access key</span></span>
      ${svg(I.chev, 17)}
    </button>
  </div>`;
}

const catLabel = v => (GALLERY_CATEGORIES.find(c => c.value === v) || {}).label || v;
const sizeLabel = v => (BENTO_SIZES.find(c => c.value === v) || {}).label || v;

function tileRows (list, kind) {
  if (!list.length) return `<div class="empty">${svg(I.photo, 38)}<p>No photos yet.</p></div>`;
  return list.map((t, i) => `
    <div class="card"><div class="card-b">
      <div class="row">
        <img class="thumb" src="${esc(imgUrl(t.src))}" alt="" loading="lazy">
        <div class="row-main">
          <div class="t">${esc(t.title)}</div>
          <div class="s">${esc(t.alt || 'No description')}</div>
          <span class="pill gold">${esc(t.tag)}</span>
          ${kind === 'gallery' ? `<span class="pill">${esc(catLabel(t.category))}</span>` : ''}
          ${kind === 'bento' ? `<span class="pill">${esc(sizeLabel(t.size))}</span>` : ''}
        </div>
      </div>
      <div class="tools">
        <button class="btn btn-sm" data-edit="${i}">${svg(I.edit,14)} Edit</button>
        <button class="btn btn-sm" data-mv="${i}:-1" ${i === 0 ? 'disabled' : ''}>${svg(I.up,14)}</button>
        <button class="btn btn-sm" data-mv="${i}:1" ${i === list.length - 1 ? 'disabled' : ''}>${svg(I.dn,14)}</button>
        <button class="btn btn-sm btn-danger" data-del="${i}" style="margin-left:auto">${svg(I.bin,14)}</button>
      </div>
    </div></div>`).join('');
}

function viewTiles (kind) {
  const list = S.draft[kind] || [];
  const max = kind === 'bento' ? 12 : 60;
  return `<div class="note">${svg(I.warn,17)}<span>${kind === 'bento'
      ? 'These are the photos on your front page. Keep it to your best work — around 10 looks best.'
      : 'These photos appear on your Gallery page and can be filtered by type.'}</span></div>
    ${tileRows(list, kind)}
    <div class="two" style="margin-top:14px">
      <button class="btn btn-gold" data-add="1" ${list.length >= max ? 'disabled' : ''}>
        ${svg(I.plus,15)} Add photo</button>
      <button class="btn" data-addmany="1" ${list.length >= max ? 'disabled' : ''}>
        ${svg(I.up2,15)} Add several</button>
    </div>
    <input type="file" accept="image/*" multiple id="batchFile" class="hidden">`;
}

function viewBeforeAfter () {
  const list = S.draft.beforeafter || [];
  const rows = list.length ? list.map((p, i) => `
    <div class="card"><div class="card-b">
      <div class="ba-thumbs">
        <figure><figcaption>Before</figcaption><img src="${esc(imgUrl(p.before))}" alt="" loading="lazy"></figure>
        <figure><figcaption>After</figcaption><img src="${esc(imgUrl(p.after))}" alt="" loading="lazy"></figure>
      </div>
      <div class="row-main" style="margin-top:12px">
        <div class="t">${esc(p.title)}</div>
        <span class="pill gold">${esc(p.tag)}</span>
      </div>
      <div class="tools">
        <button class="btn btn-sm" data-edit="${i}">${svg(I.edit,14)} Edit</button>
        <button class="btn btn-sm" data-mv="${i}:-1" ${i === 0 ? 'disabled' : ''}>${svg(I.up,14)}</button>
        <button class="btn btn-sm" data-mv="${i}:1" ${i === list.length - 1 ? 'disabled' : ''}>${svg(I.dn,14)}</button>
        <button class="btn btn-sm btn-danger" data-del="${i}" style="margin-left:auto">${svg(I.bin,14)}</button>
      </div>
    </div></div>`).join('') : `<div class="empty">${svg(I.swap,38)}<p>No before &amp; after pairs yet.</p></div>`;
  return `<div class="note">${svg(I.warn,17)}<span>Upload the room before you started and after you finished. Photos work best taken from the same spot.</span></div>
    ${rows}
    <button class="btn btn-gold btn-block" data-add="1" style="margin-top:14px">${svg(I.plus,15)} Add a before &amp; after</button>`;
}

function viewReviews () {
  const list = S.draft.reviews || [];
  const rows = list.length ? list.map((r, i) => `
    <div class="card"><div class="card-b">
      <div class="row">
        <div class="menu-ico" style="width:38px;height:38px;border-radius:50%;font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600">${esc(r.initial)}</div>
        <div class="row-main">
          <div class="s" style="font-size:13.5px;color:var(--ink-2);line-height:1.5">&ldquo;${esc(r.quote.slice(0,130))}${r.quote.length > 130 ? '…' : ''}&rdquo;</div>
          <span class="pill gold">${esc(r.project)}</span>
        </div>
      </div>
      <div class="tools">
        <button class="btn btn-sm" data-edit="${i}">${svg(I.edit,14)} Edit</button>
        <button class="btn btn-sm" data-mv="${i}:-1" ${i === 0 ? 'disabled' : ''}>${svg(I.up,14)}</button>
        <button class="btn btn-sm" data-mv="${i}:1" ${i === list.length - 1 ? 'disabled' : ''}>${svg(I.dn,14)}</button>
        <button class="btn btn-sm btn-danger" data-del="${i}" style="margin-left:auto">${svg(I.bin,14)}</button>
      </div>
    </div></div>`).join('') : `<div class="empty">${svg(I.star,38)}<p>No reviews yet.</p></div>`;
  return `<div class="note">${svg(I.warn,17)}<span>The first review in this list is the one shown when someone lands on your homepage.</span></div>
    ${rows}
    <button class="btn btn-gold btn-block" data-add="1" style="margin-top:14px">${svg(I.plus,15)} Add a review</button>`;
}

function viewText () {
  return S.schema.textGroups.map((g, gi) => {
    const dirty = g.fields.some(f => JSON.stringify(S.draft.text[f.id]) !== JSON.stringify(S.base.text[f.id]));
    const open = S.group === gi;
    return `<div class="grp ${open ? 'open' : ''} ${dirty ? 'dirty' : ''}">
      <button class="grp-h" data-grp="${gi}">
        <strong>${esc(g.name)}</strong><span class="n">${g.fields.length}</span>${svg(I.down, 16)}
      </button>
      <div class="grp-b">${open ? g.fields.map(fieldHtml).join('') : ''}</div>
    </div>`;
  }).join('');
}

function fieldHtml (f) {
  const v = S.draft.text[f.id];
  if (f.type === 'heading') {
    const o = typeof v === 'object' && v ? v : { line1:'', line2:'' };
    return `<div class="field">
      <label>${esc(f.label)}</label>
      <div class="two">
        <input class="inp" data-tf="${f.id}:line1" value="${esc(o.line1)}" maxlength="${f.max}" placeholder="First line">
        <input class="inp" data-tf="${f.id}:line2" value="${esc(o.line2)}" maxlength="${f.max}" placeholder="Second line (italic)">
      </div>
      <div class="hint">The second line shows in italic gold on the website.</div>
    </div>`;
  }
  const s = String(v ?? '');
  const over = s.length > f.max;
  if (f.type === 'para') {
    return `<div class="field">
      <label>${esc(f.label)}<span class="count ${over ? 'over' : ''}" data-c="${f.id}">${s.length}/${f.max}</span></label>
      <textarea class="ta" data-tf="${f.id}" maxlength="${f.max + 40}">${esc(s)}</textarea>
      <div class="hint">Wrap words in **stars** to make them bold.</div>
    </div>`;
  }
  return `<div class="field">
    <label>${esc(f.label)}<span class="count ${over ? 'over' : ''}" data-c="${f.id}">${s.length}/${f.max}</span></label>
    <input class="inp" data-tf="${f.id}" value="${esc(s)}" maxlength="${f.max + 20}">
  </div>`;
}

function viewHandover () {
  const key = localStorage.getItem(KEY_STORE) || '';
  const link = `${SITE}/admin/#k=${encodeURIComponent(key)}`;
  return `<div class="note">${svg(I.warn,17)}<span>This link contains your access key. Treat it like a password &mdash; send it directly to the person who needs it, and to nobody else.</span></div>

    <div class="card"><div class="card-b">
      <div class="field">
        <label>Set-up link</label>
        <div class="linkbox" id="linkBox">${esc(link)}</div>
        <div class="hint">Opening this on another phone signs it in automatically. The key disappears from the address bar straight away.</div>
      </div>
      <div class="two">
        <button class="btn btn-gold" data-copylink="1">${svg(I.copy,15)} Copy link</button>
        <button class="btn" data-sharelink="1">${svg(I.share,15)} Share</button>
      </div>
    </div></div>

    <div class="sec-title">How to hand it over</div>
    <div class="card"><div class="card-b">
      <p style="margin:0 0 10px;font-size:14.5px;color:var(--ink-2)"><strong style="color:var(--ink)">If you're with them:</strong> tap Share, send it to their phone, and open it there. Then add the page to their home screen.</p>
      <p style="margin:0;font-size:14.5px;color:var(--ink-2)"><strong style="color:var(--ink)">If you're not:</strong> send the link by message, and tell them to delete the message once it's working.</p>
    </div></div>

    <div class="sec-title">Worth doing</div>
    <div class="card"><div class="card-b">
      <p style="margin:0;font-size:14.5px;color:var(--ink-2)">This shares the key you're using, so revoking it would sign you out too. For a client it's tidier to make them <strong style="color:var(--ink)">their own key</strong> on GitHub, sign in with it here on their phone, and keep yours separate &mdash; then either can be revoked without affecting the other.</p>
    </div></div>`;
}

function viewTidy () {
  const list = S.unused;

  if (list === null) {
    return `<div class="center" style="min-height:40vh"><div class="spinner"></div><span>Looking through your photos…</span></div>`;
  }
  if (!list.length) {
    return `<div class="empty">${svg(I.check, 38)}<p>Nothing to tidy — every photo on the site is being used.</p></div>`;
  }

  const total = list.reduce((n, i) => n + (i.size || 0), 0);
  return `<div class="note">${svg(I.warn,17)}<span>These photos are on the website but nothing points at them &mdash; usually a photo added and then not published. Removing them changes nothing that visitors see.</span></div>

    ${list.map((im, i) => `
      <div class="card"><div class="card-b">
        <div class="row">
          <img class="thumb" src="${esc(imgUrl(im.path))}" alt="" loading="lazy">
          <div class="row-main">
            <div class="t" style="font-family:var(--mono);font-size:13px;word-break:break-all">${esc(im.path.replace('images/',''))}</div>
            <div class="s">${Math.round((im.size || 0) / 1024)} KB &middot; not used anywhere</div>
            <label class="pill" style="cursor:pointer;margin-top:9px;display:inline-flex;align-items:center;gap:7px">
              <input type="checkbox" data-tidy="${i}" ${S.tidyPicked.has(im.path) ? 'checked' : ''} style="margin:0">
              Remove this one
            </label>
          </div>
        </div>
      </div></div>`).join('')}

    <div class="card" style="margin-top:14px"><div class="card-b">
      <button class="btn btn-block" data-tidyall="1" style="margin-bottom:10px">
        ${S.tidyPicked.size === list.length ? 'Clear selection' : `Select all ${list.length}`}
      </button>
      <button class="btn btn-danger btn-block" data-tidygo="1" ${S.tidyPicked.size ? '' : 'disabled'}>
        ${svg(I.bin,15)} Remove ${S.tidyPicked.size || 'nothing'}${S.tidyPicked.size ? ` of ${list.length}` : ''}
      </button>
      <div class="hint" style="text-align:center;margin-top:9px">
        ${list.length} unused &middot; ${(total / 1048576).toFixed(1)} MB in total
      </div>
    </div></div>`;
}

function viewTowns () {
  const towns = S.draft.towns || [];
  return `<div class="note">${svg(I.warn,17)}<span>These appear under the map on your contact page, and are also what tells Google which areas you cover. Both are updated together.</span></div>

    <div class="card"><div class="card-b">
      <div class="field">
        <label for="townsBox">One town per line<span class="count" id="townCount">${towns.length}</span></label>
        <textarea class="ta" id="townsBox" rows="14" style="line-height:1.9;font-size:15px"
          placeholder="Norwich&#10;Great Yarmouth&#10;King's Lynn">${esc(towns.join('\n'))}</textarea>
        <div class="hint">They show in the order you list them. Blank lines are ignored.</div>
      </div>
      <button class="btn btn-block" data-sorttowns="1">Sort A&ndash;Z</button>
    </div></div>`;
}

function viewLogin () {
  const has = !!S.lock;
  return `<div class="note">${svg(I.warn,17)}<span>${has
    ? 'A password login is already set up. Setting a new one replaces it everywhere &mdash; anyone using the old password will need the new one.'
    : 'This lets you sign in with just a password on any device, instead of pasting an access key.'}</span></div>

    <form class="card" id="newPwForm"><div class="card-b">
      <input class="sr-only" type="text" name="username" value="rplanecarpenter.co.uk"
             autocomplete="username" readonly tabindex="-1" aria-hidden="true">
      <div class="field">
        <label for="newPw">Password</label>
        <div class="pw-row">
          <input class="inp" id="newPw" type="password" name="new-password" autocomplete="new-password"
                 autocapitalize="off" spellcheck="false" placeholder="Choose a strong password">
          <button class="peek" type="button" data-peek="1" aria-label="Show password">${svg(I.eye,18)}</button>
        </div>
        <div class="gauge" style="margin-top:9px"><div class="ticks" id="pwTicks"></div><span class="gauge-label" id="pwLabel">&mdash;</span></div>
        <div class="hint">Long beats complicated. Four unrelated words is stronger than one clever word.</div>
      </div>
      <button class="btn btn-block" type="button" data-suggest="1">${svg(I.undo,15)} Suggest a passphrase</button>
    </div></form>

    <div class="card"><div class="card-b">
      <p style="margin:0;font-size:14px;color:var(--ink-2)">Your access key gets locked with this password and stored in the website. Anyone with the password can then edit the site from any device &mdash; no key needed.</p>
    </div></div>

    <button class="btn btn-gold btn-block" type="submit" form="newPwForm" data-savelogin="1" style="margin-top:14px">${has ? 'Replace the password' : 'Create the login'}</button>

    <div class="note" style="margin-top:16px;background:var(--surface-2);border-color:var(--line);color:var(--ink-3)">
      ${svg(I.lock,17)}<span>The locked key is a file on the website, so a weak password could be guessed at by someone who finds it. That is why a strong one is required.</span>
    </div>`;
}

function viewContact () {
  const c = S.draft.contact || {};
  return `<div class="note">${svg(I.warn,17)}<span>Changing these updates your phone number or email <strong>everywhere</strong> on the website, including the WhatsApp button.</span></div>
    <div class="card"><div class="card-b">
      <div class="field"><label>Phone number</label>
        <input class="inp" data-ct="phone" value="${esc(c.phone)}" inputmode="tel">
        <div class="hint">UK mobile or landline, e.g. 07990 527683</div></div>
      <div class="field"><label>Email address</label>
        <input class="inp" data-ct="email" value="${esc(c.email)}" inputmode="email">
        <div class="hint">Where your enquiry emails are sent</div></div>
    </div></div>`;
}

/* ============================================================
   Render
   ============================================================ */
const TITLES = {
  menu:'Website Editor', gallery:'Gallery photos', bento:'Homepage photos',
  beforeafter:'Before & After', reviews:'Reviews', text:'Page wording', contact:'Contact details',
  handover:'Set up another device',
  login:'Password login',
  towns:'Towns covered',
  tidy:'Tidy up photos',
};

function render (err) {
  const root = $('root');
  if (!S.ready) {
    if (S.loading || S.mode === 'checking') {
      root.innerHTML = `<div class="center"><div class="spinner"></div><span>Loading your website…</span></div>`;
      return;
    }
    root.innerHTML = S.mode === 'password' ? viewPassword(err) : viewSetup(err);
    syncBar();
    if (S.mode === 'password') setTimeout(() => $('pw')?.focus(), 60);
    return;
  }
  const body =
    S.view === 'menu' ? viewMenu() :
    S.view === 'gallery' ? viewTiles('gallery') :
    S.view === 'bento' ? viewTiles('bento') :
    S.view === 'beforeafter' ? viewBeforeAfter() :
    S.view === 'reviews' ? viewReviews() :
    S.view === 'text' ? viewText() :
    S.view === 'contact' ? viewContact() :
    S.view === 'handover' ? viewHandover() :
    S.view === 'login' ? viewLogin() :
    S.view === 'towns' ? viewTowns() :
    S.view === 'tidy' ? viewTidy() : '';

  root.innerHTML = `<div class="app">
    <header class="topbar">
      ${S.view !== 'menu' ? `<button class="back" data-go="menu" aria-label="Back">${svg(I.back,18)}</button>` : ''}
      <h1>${S.view === 'menu' ? '<span class="sub">R. Plane Carpenter</span>' : ''}${esc(TITLES[S.view])}</h1>
    </header>
    <main>${body}</main>
  </div>`;
  syncBar();
}

/* ============================================================
   Sheets
   ============================================================ */
function sheet (title, bodyHtml, footHtml) {
  const wrap = document.createElement('div');
  wrap.className = 'scrim';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-h"><h2>${esc(title)}</h2><button class="back" data-close="1" aria-label="Close">${svg(I.x,18)}</button></div>
    <div class="sheet-b">${bodyHtml}</div>
    ${footHtml ? `<div class="sheet-f">${footHtml}</div>` : ''}</div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove(); });
  return wrap;
}

function confirmSheet (title, message, confirmLabel = 'Delete') {
  return new Promise(resolve => {
    const w = sheet(title, `<p style="margin:0;color:var(--ink-2)">${esc(message)}</p>`,
      `<button class="btn" data-close="1">Cancel</button><button class="btn btn-danger" data-yes="1">${esc(confirmLabel)}</button>`);
    w.addEventListener('click', e => {
      if (e.target.closest('[data-yes]')) { w.remove(); resolve(true); }
      else if (e.target === w || e.target.closest('[data-close]')) resolve(false);
    });
  });
}

const imagePicker = selected => `<div class="imgpick">${S.images.map(im =>
  `<button type="button" data-pick="${esc(im.path)}" class="${im.path === selected ? 'on' : ''}">
    <img src="${esc(imgUrl(im.path))}" alt="" loading="lazy"></button>`).join('')}</div>`;

function editTile (kind, index) {
  const isNew = index == null;
  const list = S.draft[kind];
  const t = isNew ? { src:'', alt:'', tag:'', title:'', category:'kitchen', size:'normal', width:600, height:400 } : clone(list[index]);

  const extra = kind === 'gallery'
    ? `<div class="field"><label>Which filter does it belong to?</label>
        <select class="sel" data-f="category">${GALLERY_CATEGORIES.map(c =>
          `<option value="${c.value}" ${t.category === c.value ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>`
    : `<div class="field"><label>Tile size on the homepage</label>
        <select class="sel" data-f="size">${BENTO_SIZES.map(c =>
          `<option value="${c.value}" ${t.size === c.value ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>`;

  const w = sheet(isNew ? 'Add photo' : 'Edit photo', `
    <div class="field"><label>Photo</label>
      <div id="pv" style="margin-bottom:10px">${t.src ? `<img src="${esc(imgUrl(t.src))}" style="width:100%;max-height:230px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">` : ''}</div>
      <div class="drop" id="drop">${svg(I.up2,26)}<strong>Choose a photo</strong><span>Straight from your camera roll</span></div>
      <input type="file" accept="image/*" id="file" class="hidden">
      ${S.images.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:13px;color:var(--ink-3);font-weight:600">Or reuse a photo already on the site</summary><div style="margin-top:10px">${imagePicker(t.src)}</div></details>` : ''}
    </div>
    <div class="field"><label>Title</label><input class="inp" data-f="title" value="${esc(t.title)}" maxlength="90" placeholder="White shaker kitchen, walnut worktop"></div>
    <div class="field"><label>Short label</label><input class="inp" data-f="tag" value="${esc(t.tag)}" maxlength="40" placeholder="Country Kitchen">
      <div class="hint">The small gold text above the title.</div></div>
    ${extra}
    <div class="field"><label>Description</label>
      <textarea class="ta" data-f="alt" maxlength="200" placeholder="Describe the photo for Google and for people using screen readers.">${esc(t.alt)}</textarea>
      <div class="hint">Leave blank and one will be written from the title and label.</div></div>
  `, `<button class="btn" data-close="1">Cancel</button><button class="btn btn-gold" data-save="1">${isNew ? 'Add photo' : 'Save'}</button>`);

  const get = f => w.querySelector(`[data-f="${f}"]`);
  w.querySelector('#drop').onclick = () => w.querySelector('#file').click();
  w.querySelector('#file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const drop = w.querySelector('#drop');
    drop.innerHTML = `<div class="spinner" style="margin:0 auto 8px"></div><strong>Processing…</strong><span>Rotating, resizing and optimising</span>`;
    try {
      const up = await cropAndUpload(file, CROP.tile, kind);
      if (!up) { drop.innerHTML = `${svg(I.up2,26)}<strong>Choose a photo</strong><span>Straight from your camera roll</span>`; e.target.value = ''; return; }
      t.src = up.path; t.width = up.width; t.height = up.height;
      w.querySelector('#pv').innerHTML = `<img src="${esc(imgUrl(up.path))}" style="width:100%;max-height:230px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">`;
      drop.innerHTML = `${svg(I.check,26)}<strong>Photo ready</strong><span>Tap to choose a different one</span>`;
    } catch (err) {
      toast(err.message, 'err');
      drop.innerHTML = `${svg(I.up2,26)}<strong>Choose a photo</strong><span>Straight from your camera roll</span>`;
    }
  };

  w.addEventListener('click', e => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      t.src = pick.dataset.pick;
      w.querySelectorAll('.imgpick button').forEach(b => b.classList.toggle('on', b === pick));
      w.querySelector('#pv').innerHTML = `<img src="${esc(imgUrl(t.src))}" style="width:100%;max-height:230px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">`;
      return;
    }
    if (!e.target.closest('[data-save]')) return;
    t.title = get('title').value.trim();
    t.tag = get('tag').value.trim();
    t.alt = get('alt').value.trim();
    if (kind === 'gallery') t.category = get('category').value; else t.size = get('size').value;
    if (!t.src) return toast('Please choose a photo.', 'err');
    if (!t.title) return toast('Please give the photo a title.', 'err');
    if (!t.tag) return toast('Please add a short label.', 'err');
    if (!t.alt) t.alt = `${t.title} — ${t.tag} by R. Plane Carpenter, Norwich.`;
    if (isNew) list.push(t); else list[index] = t;
    w.remove(); render();
  });
}

function editPair (index) {
  const isNew = index == null;
  const list = S.draft.beforeafter;
  const p = isNew ? { tag:'', title:'', before:'', after:'', beforeAlt:'', afterAlt:'', caption:'' } : clone(list[index]);

  const slot = (which, label) => `
    <div class="field"><label>${label} photo</label>
      <div id="pv-${which}" style="margin-bottom:8px">${p[which] ? `<img src="${esc(imgUrl(p[which]))}" style="width:100%;height:170px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">` : ''}</div>
      <div class="drop" data-drop="${which}">${svg(I.up2,24)}<strong>Choose ${label.toLowerCase()} photo</strong></div>
      <input type="file" accept="image/*" data-file="${which}" class="hidden"></div>`;

  const w = sheet(isNew ? 'Add before & after' : 'Edit before & after', `
    <div class="grid2">${slot('before','Before')}${slot('after','After')}</div>
    <div class="field"><label>Room label</label><input class="inp" data-f="tag" value="${esc(p.tag)}" maxlength="40" placeholder="Utility Room"></div>
    <div class="field"><label>Title</label><input class="inp" data-f="title" value="${esc(p.title)}" maxlength="90" placeholder="Bare room to bespoke utility"></div>
    <div class="field"><label>Caption</label><input class="inp" data-f="caption" value="${esc(p.caption)}" maxlength="200" placeholder="Utility room · bespoke cabinetry">
      <div class="hint">Wrap words in **stars** to make them bold.</div></div>
  `, `<button class="btn" data-close="1">Cancel</button><button class="btn btn-gold" data-save="1">${isNew ? 'Add' : 'Save'}</button>`);

  w.querySelectorAll('[data-drop]').forEach(d => { d.onclick = () => w.querySelector(`[data-file="${d.dataset.drop}"]`).click(); });
  w.querySelectorAll('[data-file]').forEach(inp => {
    inp.onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const which = inp.dataset.file;
      const drop = w.querySelector(`[data-drop="${which}"]`);
      drop.innerHTML = `<div class="spinner" style="margin:0 auto"></div>`;
      try {
        const up = await cropAndUpload(file, CROP.ba, 'ba');
        if (!up) { drop.innerHTML = `${svg(I.up2,24)}<strong>Choose ${which} photo</strong>`; e.target.value = ''; return; }
        p[which] = up.path;
        w.querySelector(`#pv-${which}`).innerHTML = `<img src="${esc(imgUrl(up.path))}" style="width:100%;height:170px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">`;
        drop.innerHTML = `${svg(I.check,24)}<strong>Ready</strong>`;
      } catch (err) {
        toast(err.message, 'err');
        drop.innerHTML = `${svg(I.up2,24)}<strong>Choose photo</strong>`;
      }
    };
  });

  w.addEventListener('click', e => {
    if (!e.target.closest('[data-save]')) return;
    const g = f => w.querySelector(`[data-f="${f}"]`).value.trim();
    p.tag = g('tag'); p.title = g('title'); p.caption = g('caption');
    if (!p.before || !p.after) return toast('Please choose both a before and an after photo.', 'err');
    if (!p.tag) return toast('Please add a room label.', 'err');
    if (!p.title) return toast('Please add a title.', 'err');
    if (!p.beforeAlt) p.beforeAlt = `${p.tag} before work started, by R. Plane Carpenter, Norwich.`;
    if (!p.afterAlt) p.afterAlt = `${p.tag} finished — ${p.title}, by R. Plane Carpenter, Norwich.`;
    if (isNew) list.push(p); else list[index] = p;
    w.remove(); render();
  });
}

function editReview (index) {
  const isNew = index == null;
  const list = S.draft.reviews;
  const r = isNew ? { quote:'', project:'', initial:'' } : clone(list[index]);
  const w = sheet(isNew ? 'Add review' : 'Edit review', `
    <div class="field"><label>What they said</label><textarea class="ta" data-f="quote" maxlength="600" style="min-height:130px">${esc(r.quote)}</textarea></div>
    <div class="two">
      <div class="field"><label>Project</label><input class="inp" data-f="project" value="${esc(r.project)}" maxlength="40" placeholder="Bespoke kitchen"></div>
      <div class="field"><label>First initial</label><input class="inp" data-f="initial" value="${esc(r.initial)}" maxlength="1" placeholder="J" style="text-transform:uppercase"></div>
    </div>
    <div class="hint">Only the first initial is shown, to keep your customer's name private.</div>
  `, `<button class="btn" data-close="1">Cancel</button><button class="btn btn-gold" data-save="1">${isNew ? 'Add' : 'Save'}</button>`);

  w.addEventListener('click', e => {
    if (!e.target.closest('[data-save]')) return;
    const g = f => w.querySelector(`[data-f="${f}"]`).value.trim();
    r.quote = g('quote'); r.project = g('project'); r.initial = g('initial').toUpperCase().slice(0,1);
    if (!r.quote) return toast('Please add the review text.', 'err');
    if (!r.project) return toast('Please add a project label.', 'err');
    if (!r.initial) return toast('Please add the first initial.', 'err');
    if (isNew) list.push(r); else list[index] = r;
    w.remove(); render();
  });
}

/* ============================================================
   Adding several photos at once

   The single-photo flow asks for a crop and a caption per photo,
   which is right for one and painful for ten. After a job there are
   usually ten. These are centre-cropped and uploaded together, then
   captioned in one list — and any of them can still be opened and
   cropped properly afterwards.
   ============================================================ */

/** Centre-crop and encode without opening the crop tool. */
async function autoProcess (file, { ratio, outW, outH, quality }) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);

  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }

  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (sw / sh > ratio) { const nw = Math.round(sh * ratio); sx = Math.round((sw - nw) / 2); sw = nw; }
  else { const nh = Math.round(sw / ratio); sy = Math.round((sh - nh) / 2); sh = nh; }

  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, outW, outH);

  const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
  const main = await new Promise(r => c.toBlob(r, type, quality));

  const lc = document.createElement('canvas');
  const lw = 24, lh = Math.max(1, Math.round(lw * outH / outW));
  lc.width = lw; lc.height = lh;
  lc.getContext('2d').drawImage(c, 0, 0, lw, lh);
  const lqip = await new Promise(r => lc.toBlob(r, 'image/jpeg', 0.4));

  bmp.close?.();
  return { main, lqip, width: outW, height: outH, ext: type === 'image/webp' ? 'webp' : 'jpg' };
}

async function addSeveral (kind, files) {
  const list = S.draft[kind];
  const max = kind === 'bento' ? 12 : 60;
  const room = max - list.length;
  if (room <= 0) return toast('There is no room for more photos here.', 'warn');

  const chosen = [...files].slice(0, Math.min(room, 12));
  if (chosen.length < files.length) {
    toast(`Adding the first ${chosen.length} — that is all there is room for.`, 'warn', 5000);
  }

  const w = sheet(`Adding ${chosen.length} photos`, `
    <div id="batchList">${chosen.map((f, i) => `
      <div class="row" style="padding:10px 0;border-top:${i ? '1px solid var(--line-2)' : '0'}">
        <div class="thumb" id="bt-${i}" style="display:grid;place-items:center"><div class="spinner"></div></div>
        <div class="row-main">
          <div class="t" style="font-size:13.5px;word-break:break-all">${esc(f.name)}</div>
          <div class="s" id="bs-${i}">Waiting…</div>
        </div>
      </div>`).join('')}</div>
  `, '');

  const done = [];
  for (let i = 0; i < chosen.length; i++) {
    const status = w.querySelector(`#bs-${i}`);
    const thumb = w.querySelector(`#bt-${i}`);
    try {
      status.textContent = 'Processing…';
      const out = await autoProcess(chosen[i], CROP.tile);
      status.textContent = 'Uploading…';
      const up = await uploadProcessed(out, chosen[i].name, kind);
      thumb.outerHTML = `<img class="thumb" src="${esc(imgUrl(up.path))}" alt="">`;
      w.querySelector(`#bs-${i}`).textContent = 'Added';
      done.push({ ...up, name: chosen[i].name });
    } catch (err) {
      status.textContent = err.message;
      status.style.color = 'var(--err)';
    }
  }

  w.remove();
  if (!done.length) return toast('None of those could be added.', 'err');
  captionBatch(kind, done);
}

/** One list, one category, a title each — then they are all in. */
function captionBatch (kind, uploaded) {
  const list = S.draft[kind];

  const niceName = n => n.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60);

  const shared = kind === 'gallery'
    ? `<div class="field"><label>Which filter do these belong to?</label>
        <select class="sel" id="bCat">${GALLERY_CATEGORIES.map(c =>
          `<option value="${c.value}">${esc(c.label)}</option>`).join('')}</select></div>`
    : `<div class="field"><label>Tile size for these</label>
        <select class="sel" id="bSize">${BENTO_SIZES.map(c =>
          `<option value="${c.value}">${esc(c.label)}</option>`).join('')}</select></div>`;

  const w = sheet(`Name these ${uploaded.length}`, `
    <div class="field"><label>Short label for all of them</label>
      <input class="inp" id="bTag" placeholder="Fitted Kitchen" maxlength="40">
      <div class="hint">The small gold text above each title.</div></div>
    ${shared}
    <div class="sec-title">Titles</div>
    ${uploaded.map((u, i) => `
      <div class="row" style="padding:11px 0;border-top:${i ? '1px solid var(--line-2)' : '0'}">
        <img class="thumb" src="${esc(imgUrl(u.path))}" alt="" style="width:56px;height:56px">
        <div class="row-main">
          <input class="inp" data-bt="${i}" value="${esc(niceName(u.name))}" maxlength="90">
        </div>
      </div>`).join('')}
  `, `<button class="btn" data-close="1">Cancel</button>
      <button class="btn btn-gold" data-badd="1">Add all ${uploaded.length}</button>`);

  w.addEventListener('click', e => {
    if (!e.target.closest('[data-badd]')) return;
    const tag = w.querySelector('#bTag').value.trim();
    if (!tag) return toast('Please add a short label.', 'err');

    const cat = kind === 'gallery' ? w.querySelector('#bCat').value : null;
    const size = kind === 'bento' ? w.querySelector('#bSize').value : null;

    let added = 0;
    uploaded.forEach((u, i) => {
      const title = w.querySelector(`[data-bt="${i}"]`).value.trim() || tag;
      const t = {
        src: u.path, title, tag,
        alt: `${title} — ${tag} by R. Plane Carpenter, Norwich.`,
        width: u.width, height: u.height,
      };
      if (kind === 'gallery') t.category = cat; else t.size = size;
      list.push(t);
      added++;
    });

    w.remove();
    render();
    toast(`${added} photos added. Publish when you are ready.`, 'ok', 5000);
  });
}

/* ============================================================
   Going live

   GitHub Pages rebuilds a minute or so after a commit, so
   "Published" is not the same as "visible". Rather than leave
   that to a guess, watch the real page until the change actually
   shows up, then say so.
   ============================================================ */

/**
 * A short run of text that is present in the new file but not the old.
 * Polling for that is a reliable signal the rebuild has landed.
 */
function livenessNeedle (oldText, newText) {
  if (!oldText || !newText) return null;
  let i = 0;
  const max = Math.min(oldText.length, newText.length);
  while (i < max && oldText[i] === newText[i]) i++;
  if (i >= newText.length) return null;                  // only deletions
  const needle = newText.slice(i, i + 80).trim();
  return needle.length >= 12 && !oldText.includes(needle) ? needle : null;
}

async function confirmLive (page, needle) {
  if (!needle) return false;
  const url = `${SITE}/${page}`;
  for (let attempt = 0; attempt < 22; attempt++) {
    await new Promise(r => setTimeout(r, attempt === 0 ? 8000 : 4000));
    try {
      const res = await fetch(`${url}?live=${Date.now()}`, { cache: 'no-store' });
      if (res.ok && (await res.text()).includes(needle)) return true;
    } catch { /* offline or mid-deploy — keep waiting */ }
  }
  return false;
}

function setPublishStatus (text, tone) {
  const el = $('barTxt');
  if (!el) return;
  el.innerHTML = text
    ? `<span style="color:var(--${tone || 'ink-3'})">${esc(text)}</span>`
    : '';
  $('bar').classList.toggle('show', !!text || changeCount() > 0);
}

/* ============================================================
   Preview / publish — both entirely local until Publish
   ============================================================ */
const PAGE_FOR = { gallery:'gallery.html', bento:'index.html', beforeafter:'gallery.html', reviews:'index.html', contact:'contact.html', towns:'contact.html', text:'index.html', menu:'index.html' };

function doPreview () {
  const c = changes();
  if (!Object.keys(c).length) return toast('Nothing to preview yet.', 'warn');

  const page = PAGE_FOR[S.view] || 'index.html';
  let html;
  try {
    html = applyChanges(S.files, c).files[page];
  } catch (err) {
    return toast(err.message, 'err', 6000);
  }
  // A <base> tag makes relative assets resolve against the live site;
  // withFreshImages then redirects anything not published yet to the
  // copy already in this browser, so new photos show immediately.
  html = withFreshImages(html.replace(/<head>/i, `<head>\n<base href="${SITE}/">`));

  const w = sheet('Preview', `<iframe class="frame"></iframe>`,
    `<button class="btn" data-close="1">Close</button><button class="btn btn-gold" data-pub="1">Publish now</button>`);
  w.querySelector('.sheet-b').style.padding = '0';
  const doc = w.querySelector('iframe').contentDocument;
  doc.open(); doc.write(html); doc.close();

  w.addEventListener('click', e => { if (e.target.closest('[data-pub]')) { w.remove(); doPublish(); } });
}

async function doPublish () {
  const c = changes();
  if (!Object.keys(c).length) return toast('Nothing to publish.', 'warn');
  if (S.busy) return;

  S.busy = true;
  const btn = $('btnPublish');
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';

  const summary = Object.keys(c).map(k => ({
    text:'page wording', gallery:'gallery photos', bento:'homepage photos',
    beforeafter:'before & after', reviews:'reviews', contact:'contact details',
    towns:'towns covered',
  }[k] || k)).join(', ');

  try {
    let done = null;

    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      // Build against the newest version of the site every time. If
      // something changed elsewhere — another device, or a change pushed
      // straight to the repository — it is carried forward rather than
      // overwritten, and only the edits made here are applied on top.
      const { files, sha } = await S.gh.readFiles(EDITABLE_FILES);
      const result = applyChanges(files, c);

      if (!result.changed.length) { done = { committed: false, files, sha }; break; }

      const textFiles = {};
      for (const f of result.changed) textFiles[f] = result.files[f];

      try {
        const commit = await S.gh.commit({ textFiles, message: summary, expectedSha: sha });
        // Pick a page whose change we can watch for on the live site.
        const watched = result.changed.find(f => f.endsWith('.html')) || result.changed[0];
        done = {
          committed: true, files: result.files, sha: commit.sha,
          watch: watched && { page: watched, needle: livenessNeedle(files[watched], result.files[watched]) },
        };
      } catch (err) {
        if (!err.conflict || attempt === 2) throw err;
        toast('The website just changed — merging your edit and trying again…', 'warn', 2800);
        await new Promise(r => setTimeout(r, 600));
      }
    }

    S.files = done.files;
    S.sha = done.sha;
    S.base = clone(S.draft);
    clearDraft();

    if (!done.committed) {
      toast('Nothing had actually changed.', 'warn', 4200);
    } else {
      toast('Published. Watching for it to appear…', 'ok', 4200);
      if (done.watch && done.watch.needle) {
        setPublishStatus('Publishing… the website is rebuilding', 'ink-3');
        confirmLive(done.watch.page, done.watch.needle).then(live => {
          setPublishStatus('');
          toast(live
            ? 'It is live on the website now.'
            : 'Published, but it has not appeared yet. Give it another minute, then refresh.',
            live ? 'ok' : 'warn', live ? 5000 : 7000);
        });
      }
    }
  } catch (err) {
    toast(err.conflict
      ? 'Could not save — the website kept changing underneath. Wait a moment and press Publish again.'
      : err.message, 'err', 7000);
  } finally {
    S.busy = false;
    btn.disabled = false; btn.innerHTML = label;
    syncBar(); render();
  }
}

/**
 * Work out which photos nothing points at. Reads more than the editable
 * pages — the hero and the van are referenced only from CSS, and
 * scanning the pages alone would offer to delete both.
 */
async function findUnused () {
  if (S.unused !== null) return;                 // already looked
  render();
  try {
    const { files } = await S.gh.readFiles(REFERENCE_FILES);
    S.unused = findUnusedImages(files, S.images);
    S.tidyPicked = new Set();
  } catch (err) {
    S.unused = [];
    toast(err.message, 'err', 6000);
  }
  render();
}

/* ============================================================
   Load
   ============================================================ */
async function load () {
  S.loading = true; render();
  try {
    const { files, sha } = await S.gh.readFiles(EDITABLE_FILES);
    const missing = EDITABLE_FILES.filter(f => files[f] == null);
    if (missing.length) throw new Error(`Could not load: ${missing.join(', ')}`);

    S.files = files;
    S.sha = sha;
    S.base = readModel(files);
    S.draft = clone(S.base);
    S.unused = null;
    S.tidyPicked = new Set();
    S.images = (await S.gh.listDir(IMAGE_DIR, sha))
      .filter(i => /\.(jpg|jpeg|png|webp)$/i.test(i.path) && !/-lqip\.jpg$/i.test(i.path))
      .map(i => ({ path: i.path, size: i.size }));
    S.schema = {
      textGroups: groupedTextFields().map(g => ({
        name: g.name,
        fields: g.fields.map(f => ({ id: f.id, label: f.label, type: f.type, max: f.max })),
      })),
    };
    S.ready = true;
  } catch (err) {
    S.ready = false;
    S.loading = false;
    render(err.message);
    return;
  } finally {
    S.loading = false;
  }
  render();
}

/* ============================================================
   Events
   ============================================================ */
document.addEventListener('submit', async e => {
  if (e.target.id === 'newPwForm') {
    e.preventDefault();
    const btn = document.querySelector('[data-savelogin]');
    const pw = $('newPw').value;
    const st = strength(pw);
    if (!st.ok) return toast('That password is not strong enough. Try the suggested passphrase.', 'err', 5200);
    if (!(await confirmSheet(
      S.lock ? 'Replace the password?' : 'Create the login?',
      S.lock ? 'Anyone using the old password will need the new one.'
             : 'You will be able to sign in with just this password, on any device.',
      S.lock ? 'Replace it' : 'Create it'))) return;

    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div>';
    try {
      const key = localStorage.getItem(KEY_STORE);
      if (!key) throw new Error('No access key is stored on this device.');
      const envelope = await seal(key, pw);
      await S.gh.commit({
        textFiles: { [LOCK_FILE]: JSON.stringify(envelope, null, 2) + '\n' },
        message: S.lock ? 'update the password login' : 'create the password login',
      });
      S.lock = envelope;
      toast('Password login ready. It works on any device in about a minute.', 'ok', 6000);
      // Leave the field populated for a moment so the password manager
      // still sees it when it decides whether to offer a save.
      setTimeout(() => { S.view = 'menu'; render(); }, 900);
    } catch (err) {
      toast(err.message, 'err', 6000);
      btn.disabled = false; btn.innerHTML = label;
    }
    return;
  }

  if (e.target.id === 'pwForm') {
    e.preventDefault();
    const btn = $('pwBtn');
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
    try {
      // Deliberately slow by design — this is what makes guessing costly.
      const key = await unseal(S.lock, $('pw').value);
      S.gh = new GitHub({ token: key, ...REPO });
      localStorage.setItem(KEY_STORE, key);
      await load();
      if (S.ready) offerDraft();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Sign in';
      render(err.message);
      setTimeout(() => { const el = $('pw'); if (el) { el.value = ''; el.focus(); } }, 30);
    }
    return;
  }
  if (e.target.id !== 'setupForm') return;
  e.preventDefault();
  const btn = $('setupBtn');
  const key = $('key').value.trim();
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    const gh = new GitHub({ token: key, ...REPO });
    await gh.checkAccess();
    localStorage.setItem(KEY_STORE, key);
    S.gh = gh;
    await load();
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Connect';
    render(err.message);
  }
});

document.addEventListener('click', async e => {
  const go = e.target.closest('[data-go]');
  if (go) { S.view = go.dataset.go; S.group = null; render(); window.scrollTo(0,0); return; }

  if (go && go.dataset.go === 'tidy') { findUnused(); }

  const tidyAll = e.target.closest('[data-tidyall]');
  if (tidyAll) {
    if (S.tidyPicked.size === (S.unused || []).length) S.tidyPicked.clear();
    else (S.unused || []).forEach(i => S.tidyPicked.add(i.path));
    render();
    return;
  }

  const tidyGo = e.target.closest('[data-tidygo]');
  if (tidyGo) {
    const paths = [...S.tidyPicked];
    if (!paths.length) return;
    if (!(await confirmSheet(
      `Remove ${paths.length} photo${paths.length > 1 ? 's' : ''}?`,
      'They are not used anywhere on the website, so nothing visitors see will change. This can be undone.',
      'Remove them'))) return;

    tidyGo.disabled = true;
    const label = tidyGo.innerHTML;
    tidyGo.innerHTML = '<div class="spinner"></div>';
    try {
      await S.gh.deleteFiles(paths, `tidy up ${paths.length} unused photo(s)`);
      S.unused = (S.unused || []).filter(i => !S.tidyPicked.has(i.path));
      S.images = S.images.filter(i => !S.tidyPicked.has(i.path));
      S.tidyPicked.clear();
      toast('Removed. The website is unchanged for visitors.', 'ok', 5000);
      render();
    } catch (err) {
      toast(err.message, 'err', 6500);
      tidyGo.disabled = false; tidyGo.innerHTML = label;
    }
    return;
  }

  const grp = e.target.closest('[data-grp]');
  if (grp) { const i = Number(grp.dataset.grp); S.group = S.group === i ? null : i; render(); return; }

  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'visit') { window.open(SITE, '_blank', 'noopener'); return; }
    if (a === 'forget') {
      if (changeCount() && !(await confirmSheet('Sign out?', 'You have unsaved changes that will be lost.', 'Sign out'))) return;
      localStorage.removeItem(KEY_STORE);
      clearDraft();
      S.gh = null; S.ready = false; S.draft = null; S.base = null;
      render(); return;
    }
    if (a === 'undo') {
      if (!(await confirmSheet('Undo the last change?', 'This puts the website back the way it was before your last publish. You can undo this too.', 'Undo it'))) return;
      try { const r = await S.gh.undoLast(); toast('Undone. The website updates in about a minute.', 'ok', 5200); await load(); }
      catch (err) { toast(err.message, 'err', 6500); }
      return;
    }
  }

  const kind = S.view;
  const editor = { gallery:i => editTile('gallery', i), bento:i => editTile('bento', i), beforeafter:editPair, reviews:editReview }[kind];

  const add = e.target.closest('[data-add]');
  if (add && editor) { editor(null); return; }

  if (e.target.closest('[data-addmany]')) { $('batchFile')?.click(); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed && editor) { editor(Number(ed.dataset.edit)); return; }

  const mv = e.target.closest('[data-mv]');
  if (mv) {
    const [i, d] = mv.dataset.mv.split(':').map(Number);
    const list = S.draft[kind]; const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    render(); return;
  }

  const del = e.target.closest('[data-del]');
  if (del) {
    const i = Number(del.dataset.del);
    const list = S.draft[kind];
    if (list.length <= 1) return toast('You need to keep at least one.', 'warn');
    if (!(await confirmSheet('Remove this?', 'It will disappear from the website when you publish.', 'Remove'))) return;
    list.splice(i, 1); render(); return;
  }

  if (e.target.closest('[data-usekey]')) { S.mode = 'key'; render(); return; }
  if (e.target.closest('[data-usepw]')) { S.mode = 'password'; render(); return; }

  if (e.target.closest('[data-sorttowns]')) {
    S.draft.towns = [...(S.draft.towns || [])].sort((a, b) => a.localeCompare(b, 'en'));
    render();
    return;
  }

  if (e.target.closest('[data-suggest]')) {
    const el = $('newPw');
    el.value = suggestPassphrase();
    el.type = 'text';                      // a suggestion is no use unseen
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const peek = e.target.closest('[data-peek]');
  if (peek) {
    const el = $('newPw');
    const showing = el.type === 'text';
    el.type = showing ? 'password' : 'text';
    peek.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    return;
  }

  const copyLink = e.target.closest('[data-copylink]');
  if (copyLink) {
    const text = $('linkBox').textContent;
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copied. Send it to the other phone.', 'ok');
    } catch {
      const r = document.createRange();
      r.selectNodeContents($('linkBox'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(r);
      toast('Press and hold the link to copy it.', 'warn', 5000);
    }
    return;
  }

  const shareLink = e.target.closest('[data-sharelink]');
  if (shareLink) {
    const text = $('linkBox').textContent;
    if (navigator.share) {
      try { await navigator.share({ title: 'Website Editor', url: text }); } catch { /* dismissed */ }
    } else {
      toast('Sharing is not available on this browser — use Copy link instead.', 'warn', 5000);
    }
    return;
  }

  if (e.target.closest('#btnPreview')) return doPreview();
  if (e.target.closest('#btnPublish')) return doPublish();
});

document.addEventListener('change', async e => {
  if (e.target.id === 'batchFile') {
    const files = e.target.files;
    e.target.value = '';
    if (files && files.length) await addSeveral(S.view, files);
    return;
  }

  const box = e.target.closest('[data-tidy]');
  if (!box) return;
  const im = (S.unused || [])[Number(box.dataset.tidy)];
  if (!im) return;
  if (box.checked) S.tidyPicked.add(im.path); else S.tidyPicked.delete(im.path);
  render();
});

document.addEventListener('input', e => {
  const tf = e.target.closest('[data-tf]');
  if (tf) {
    const [id, part] = tf.dataset.tf.split(':');
    if (part) {
      const cur = S.draft.text[id];
      S.draft.text[id] = { ...(typeof cur === 'object' && cur ? cur : { line1:'', line2:'' }), [part]: tf.value };
    } else {
      S.draft.text[id] = tf.value;
      const c = document.querySelector(`[data-c="${id}"]`);
      if (c) {
        const max = Number(c.textContent.split('/')[1]);
        c.textContent = `${tf.value.length}/${max}`;
        c.classList.toggle('over', tf.value.length > max);
      }
    }
    syncBar();
    const g = tf.closest('.grp');
    if (g) g.classList.add('dirty');
    return;
  }
  const ct = e.target.closest('[data-ct]');
  if (ct) { S.draft.contact[ct.dataset.ct] = ct.value; syncBar(); return; }

  if (e.target.id === 'townsBox') {
    S.draft.towns = e.target.value.split('\n').map(t => t.trim()).filter(Boolean);
    const c = $('townCount');
    if (c) c.textContent = S.draft.towns.length;
    syncBar();
    return;
  }

  if (e.target.id === 'newPw') {
    const st = strength(e.target.value);
    const ticks = $('pwTicks');
    if (!ticks) return;
    if (!ticks.children.length) for (let i = 0; i < 4; i++) ticks.appendChild(document.createElement('span'));
    const filled = st.bits < 45 ? 1 : st.bits < 60 ? 2 : st.bits < 75 ? 3 : 4;
    [...ticks.children].forEach((t, i) => {
      t.className = 'tick' + (i < filled && e.target.value ? ' on' : '')
        + (filled >= 3 ? ' good' : '') + (filled === 4 ? ' strong' : '');
    });
    $('pwLabel').textContent = e.target.value ? st.label : '—';
  }
});

/* ---- boot ----
   A setup link carries the key in the URL fragment (#k=…). Fragments
   are never sent to a server, and this page is static, so the key goes
   straight from one device to another without touching anything in
   between. It is wiped from the address bar the moment it is read.
   ------------------------------------------------------------ */
function keyFromLink () {
  const m = /[#&]k=([^&]+)/.exec(location.hash || '');
  if (!m) return null;
  let key = null;
  try { key = decodeURIComponent(m[1]); } catch { key = null; }
  history.replaceState(null, '', location.pathname + location.search);
  return key && key.length > 20 ? key : null;
}

/** Is a password login set up on this website? */
async function fetchLock () {
  try {
    const res = await fetch(`./key.enc?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.v ? data : null;
  } catch {
    return null;                 // no login configured — that is fine
  }
}

(async function boot () {
  const linked = keyFromLink();
  if (linked) localStorage.setItem(KEY_STORE, linked);
  const saved = linked || localStorage.getItem(KEY_STORE);

  S.lock = await fetchLock();

  if (saved) {
    S.gh = new GitHub({ token: saved, ...REPO });
    await load();
    if (linked && S.ready) toast('This device is set up. You can start editing.', 'ok', 5200);
    else if (S.ready) offerDraft();
    return;
  }

  S.loading = false;
  S.mode = S.lock ? 'password' : 'key';
  render();
})();
