/* ============================================================
   index.js — the admin Worker.

   Serves the editor UI and a small JSON API. It is the only
   component that can write to the repository, and it will only
   write the regions described in schema.js.
   ============================================================ */

'use strict';

import UI_HTML from './ui/index.html';
import { GitHub } from './github.js';
import {
  verifyPassword, createToken, verifyToken, sessionSecret,
  sessionCookie, clearCookie, readCookie,
  throttleCheck, throttleFail, throttleReset, loginDelay, sameOrigin,
} from './auth.js';
import {
  EDITABLE_FILES, IMAGE_DIR, TEXT_FIELDS, CONTACT_FIELDS,
  GALLERY_CATEGORIES, BENTO_SIZES, groupedTextFields,
} from './schema.js';
import { readModel, applyChanges } from './content.js';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;      // after client-side compression
const ALLOWED_IMAGE_EXT = /\.(jpg|webp)$/i;

/* ---------- responses ---------- */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const fail = (message, status = 400) => json({ ok: false, error: message }, status);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

/* ---------- helpers ---------- */

function gh (env) {
  return new GitHub({
    token: env.GITHUB_TOKEN,
    owner: env.REPO_OWNER,
    repo: env.REPO_NAME,
    branch: env.REPO_BRANCH || 'main',
  });
}

function siteOrigin (env) {
  return (env.SITE_ORIGIN || 'https://rplanecarpenter.co.uk').replace(/\/$/, '');
}

async function requireSession (request, env) {
  const token = readCookie(request);
  return verifyToken(await sessionSecret(env), token);
}

function clientIp (request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

/* ---------- route handlers ---------- */

async function handleLogin (request, env) {
  if (!sameOrigin(request)) return fail('Request blocked.', 403);

  const ip = clientIp(request);
  const gate = throttleCheck(ip);
  if (!gate.allowed) {
    return fail(`Too many attempts. Please wait ${Math.ceil(gate.retryAfter / 60)} minutes and try again.`, 429);
  }

  let body;
  try { body = await request.json(); } catch { return fail('Invalid request.'); }

  const password = String(body?.password || '');
  if (!password) return fail('Please enter your password.');

  const good = await verifyPassword(password, env.ADMIN_PASSWORD);
  if (!good) {
    throttleFail(ip);
    await loginDelay();
    return fail('That password is not right.', 401);
  }

  throttleReset(ip);
  const token = await createToken(await sessionSecret(env), { sub: 'admin' });
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}

async function handleModel (request, env) {
  const api = gh(env);
  const { files, sha } = await api.readFiles(EDITABLE_FILES);

  const missing = EDITABLE_FILES.filter(f => files[f] == null);
  if (missing.length) return fail(`Could not load: ${missing.join(', ')}`, 502);

  const model = readModel(files);
  const images = (await api.listDir(IMAGE_DIR, sha))
    .filter(i => /\.(jpg|jpeg|png|webp)$/i.test(i.path) && !/-lqip\.jpg$/i.test(i.path))
    .map(i => ({ path: i.path, size: i.size }));

  return json({
    ok: true,
    sha,
    model,
    images,
    siteOrigin: siteOrigin(env),
    schema: {
      textGroups: groupedTextFields().map(g => ({
        name: g.name,
        fields: g.fields.map(f => ({ id: f.id, label: f.label, type: f.type, max: f.max })),
      })),
      contactFields: CONTACT_FIELDS,
      categories: GALLERY_CATEGORIES,
      bentoSizes: BENTO_SIZES,
    },
  });
}

/** Apply pending changes and return the resulting page HTML, without committing. */
async function handlePreview (request, env) {
  let body;
  try { body = await request.json(); } catch { return fail('Invalid request.'); }

  const page = String(body?.page || 'index.html');
  if (!EDITABLE_FILES.includes(page) || !page.endsWith('.html')) return fail('Unknown page.');

  const api = gh(env);
  const { files } = await api.readFiles(EDITABLE_FILES);

  let result;
  try {
    result = applyChanges(files, body.changes || {});
  } catch (err) {
    return fail(err.message);
  }

  // A <base> tag makes every relative asset resolve against the live
  // site, so the preview loads the real CSS, fonts and images.
  const html = result.files[page].replace(
    /<head>/i,
    `<head>\n<base href="${siteOrigin(env)}/">`
  );

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      'X-Frame-Options': 'SAMEORIGIN',      // the editor shows this in an iframe
    },
  });
}

async function handleSave (request, env) {
  if (!sameOrigin(request)) return fail('Request blocked.', 403);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid request.'); }

  const api = gh(env);
  const { files, sha } = await api.readFiles(EDITABLE_FILES);

  let result;
  try {
    result = applyChanges(files, body.changes || {});
  } catch (err) {
    return fail(err.message);
  }

  if (result.changed.length === 0) {
    return json({ ok: true, committed: false, message: 'Nothing had changed, so nothing was published.' });
  }

  const textFiles = {};
  for (const f of result.changed) textFiles[f] = result.files[f];

  const commit = await api.commit({
    textFiles,
    message: String(body?.message || 'content update').slice(0, 72),
    expectedSha: body?.sha || sha,
  });

  return json({
    ok: true,
    committed: true,
    sha: commit.sha,
    changed: result.changed,
    message: 'Published. The website updates in about a minute.',
  });
}

async function handleUpload (request, env) {
  if (!sameOrigin(request)) return fail('Request blocked.', 403);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid request.'); }

  const uploads = Array.isArray(body?.files) ? body.files : [];
  if (!uploads.length) return fail('No photo was received.');
  if (uploads.length > 8) return fail('Please upload at most 8 photos at a time.');

  const binaryFiles = {};
  for (const u of uploads) {
    const name = String(u?.name || '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(name)) return fail(`Invalid file name: ${name}`);
    if (!ALLOWED_IMAGE_EXT.test(name)) return fail('Photos must be .jpg or .webp.');

    const b64 = String(u?.data || '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return fail('That photo could not be read.');

    const bytes = Math.floor(b64.length * 3 / 4);
    if (bytes > MAX_IMAGE_BYTES) return fail(`${name} is too large (max 3 MB after processing).`);

    binaryFiles[`${IMAGE_DIR}/${name}`] = b64;
  }

  const api = gh(env);
  const commit = await api.commit({
    binaryFiles,
    message: `add ${Object.keys(binaryFiles).length} photo(s)`,
  });

  return json({ ok: true, sha: commit.sha, paths: Object.keys(binaryFiles) });
}

async function handleUndo (request, env) {
  if (!sameOrigin(request)) return fail('Request blocked.', 403);
  const api = gh(env);
  try {
    const res = await api.undoLast();
    return json({ ok: true, ...res, message: 'Undone. The website updates in about a minute.' });
  } catch (err) {
    return fail(err.message);
  }
}

async function handleHistory (request, env) {
  const api = gh(env);
  return json({ ok: true, commits: await api.recentEdits(12) });
}

/* ---------- entry ---------- */

export default {
  async fetch (request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      // Config sanity — surfaces setup mistakes clearly instead of 500s.
      const required = ['GITHUB_TOKEN', 'ADMIN_PASSWORD'];
      const missing = required.filter(k => !env[k]);
      if (missing.length) {
        return json({ ok: false, error: `Server not configured: missing ${missing.join(', ')}.` }, 500);
      }

      if (path === '/api/login' && request.method === 'POST') return handleLogin(request, env);

      if (path === '/api/logout' && request.method === 'POST') {
        return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
      }

      // Everything past here needs a session.
      const authedRoutes = ['/api/model', '/api/save', '/api/upload', '/api/preview', '/api/undo', '/api/history'];
      if (authedRoutes.includes(path)) {
        const session = await requireSession(request, env);
        if (!session) return fail('Please log in again.', 401);

        if (path === '/api/model' && request.method === 'GET') return handleModel(request, env);
        if (path === '/api/save' && request.method === 'POST') return handleSave(request, env);
        if (path === '/api/upload' && request.method === 'POST') return handleUpload(request, env);
        if (path === '/api/preview' && request.method === 'POST') return handlePreview(request, env);
        if (path === '/api/undo' && request.method === 'POST') return handleUndo(request, env);
        if (path === '/api/history' && request.method === 'GET') return handleHistory(request, env);
        return fail('Method not allowed.', 405);
      }

      if (path === '/' || path === '/index.html') {
        return new Response(UI_HTML, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            ...SECURITY_HEADERS,
          },
        });
      }

      return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
    } catch (err) {
      // Never leak internals to the browser; the message is already
      // written for a non-technical reader where it matters.
      const message = err?.message || 'Something went wrong.';
      return json({ ok: false, error: message }, 500);
    }
  },
};
