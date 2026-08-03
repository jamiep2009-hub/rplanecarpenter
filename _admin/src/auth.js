/* ============================================================
   auth.js — single-user login for the admin.

   Password is never stored: the Worker holds a PBKDF2 hash and
   salt as secrets. A successful login mints a short-lived signed
   token kept in an HttpOnly, Secure, SameSite=Strict cookie, so
   it is not reachable from JavaScript and does not ride along
   with cross-site requests.
   ============================================================ */

'use strict';

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 210_000;      // OWASP guidance for SHA-256
const SESSION_HOURS = 12;

/* ---------- base64url ---------- */

function b64urlEncode (bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode (str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Length-independent comparison, to avoid leaking via timing. */
function timingSafeEqual (a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---------- password hashing ---------- */

export async function hashPassword (password, saltB64) {
  const salt = saltB64 ? b64urlDecode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256
  );
  return { hash: b64urlEncode(new Uint8Array(bits)), salt: b64urlEncode(salt) };
}

export async function verifyPassword (password, expectedHash, saltB64) {
  if (!expectedHash || !saltB64) return false;
  const { hash } = await hashPassword(password, saltB64);
  return timingSafeEqual(enc.encode(hash), enc.encode(expectedHash));
}

/* ---------- session tokens ---------- */

async function signingKey (secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function createToken (secret, payload, hours = SESSION_HOURS) {
  const body = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + hours * 3600,
  };
  const head = b64urlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const data = b64urlEncode(enc.encode(JSON.stringify(body)));
  const key = await signingKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${data}`));
  return `${head}.${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifyToken (secret, token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [head, data, sig] = parts;
  try {
    const key = await signingKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc.encode(`${head}.${data}`));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data)));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------- cookies ---------- */

export const COOKIE_NAME = '__Host-rpc_admin';

export function sessionCookie (token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export function clearCookie () {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function readCookie (request, name = COOKIE_NAME) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/* ---------- brute-force throttling ----------
   Per-isolate memory. Not a distributed lock, but combined with a
   strong password it turns online guessing into a non-starter,
   and it needs no extra services to set up.
   ------------------------------------------------------------ */

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function throttleCheck (ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) return { allowed: true, retryAfter: 0 };
  if (rec.count < MAX_ATTEMPTS) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: Math.ceil((rec.first + WINDOW_MS - now) / 1000) };
}

export function throttleFail (ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) attempts.set(ip, { first: now, count: 1 });
  else rec.count++;

  // Keep the map from growing without bound on a long-lived isolate.
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (now - v.first > WINDOW_MS) attempts.delete(k);
  }
}

export function throttleReset (ip) {
  attempts.delete(ip);
}

/** A small constant delay on failure blunts rapid guessing. */
export function loginDelay () {
  return new Promise(r => setTimeout(r, 400 + Math.random() * 300));
}

/* ---------- CSRF ----------
   SameSite=Strict already blocks cross-site form posts. This adds a
   second, explicit check that the request came from the admin origin.
   ------------------------------------------------------------ */

export function sameOrigin (request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;                      // same-origin fetches may omit it
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
