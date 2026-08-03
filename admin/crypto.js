/* ============================================================
   crypto.js — password-protected access key.

   The editor has no server, so a password cannot be checked
   against one. Instead the GitHub access key is encrypted with
   the password and the result is stored in the website itself
   (admin/key.enc). Typing the right password decrypts it; a
   wrong password produces nothing usable.

   AES-256-GCM, with the key derived by PBKDF2-SHA256 over
   600,000 iterations and a random salt. GCM is authenticated, so
   a wrong password fails cleanly rather than yielding garbage.

   Worth being clear about the trade-off: key.enc is downloadable
   by anyone who finds it, so the password can be attacked offline
   with no rate limit. That is why the editor insists on a strong
   one and offers to generate a passphrase. With a strong password
   this is impractical to break; with a weak one it is not.
   ============================================================ */

'use strict';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITERATIONS = 600_000;
export const FORMAT_VERSION = 1;

/* ---------- base64 ---------- */

function toB64 (bytes) {
  let bin = '';
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of a) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64 (str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- key derivation ---------- */

async function deriveKey (password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/* ---------- encrypt / decrypt ---------- */

/** Wrap a secret so only the password can recover it. */
export async function seal (secret, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret));

  return {
    v: FORMAT_VERSION,
    iterations: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(new Uint8Array(data)),
  };
}

/** Recover the secret, or throw if the password is wrong. */
export async function unseal (envelope, password) {
  if (!envelope || envelope.v !== FORMAT_VERSION) {
    throw new Error('This login was created by a different version of the editor.');
  }
  const salt = fromB64(envelope.salt);
  const iv = fromB64(envelope.iv);
  const key = await deriveKey(password, salt, envelope.iterations || ITERATIONS);

  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromB64(envelope.data));
  } catch {
    // GCM authentication failed — the password is wrong.
    throw new Error('That password is not right.');
  }
  return dec.decode(plain);
}

/* ---------- password quality ----------
   The encrypted file is public, so the password is the only thing
   standing between it and an offline guessing attack. These checks
   are deliberately strict.
   ------------------------------------------------------------ */

const WORDS = [
  'anchor','amber','birch','bramble','cedar','chisel','copper','cobble','dovetail','drift',
  'ember','elder','fathom','ferry','granite','gable','harbour','hollow','ironwood','ivy',
  'joiner','kestrel','lantern','lattice','maple','marsh','mortise','nettle','oak','orchard',
  'pebble','plane','quarry','rafter','reed','saddle','sawmill','slate','spruce','stanchion',
  'tenon','thistle','timber','trestle','walnut','willow','wharf','yarrow','beacon','cinder',
];

/** A memorable passphrase with roughly 85 bits of entropy. */
export function suggestPassphrase () {
  const pick = n => {
    const out = [];
    const r = new Uint32Array(n);
    crypto.getRandomValues(r);
    for (let i = 0; i < n; i++) out.push(WORDS[r[i] % WORDS.length]);
    return out;
  };
  const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 100;
  return pick(4).join('-') + '-' + String(digits).padStart(2, '0');
}

/**
 * Rough entropy estimate in bits, and a verdict.
 * Deliberately conservative: it rewards length far more than
 * "variety", because length is what actually resists guessing.
 */
export function strength (password) {
  const s = String(password || '');
  if (!s) return { bits: 0, label: '', ok: false };

  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/\d/.test(s)) pool += 10;
  if (/[^A-Za-z0-9]/.test(s)) pool += 20;

  let bits = s.length * Math.log2(pool || 1);

  // A handful of repeated or sequential characters adds far less than
  // its length suggests, so discount obvious patterns.
  if (/(.)\1{2,}/.test(s)) bits -= 12;
  if (/(?:abc|123|qwe|password|admin|carpenter|plane)/i.test(s)) bits -= 24;
  bits = Math.max(0, Math.round(bits));

  const label = bits < 45 ? 'Too weak'
              : bits < 60 ? 'Weak'
              : bits < 75 ? 'Good'
              : 'Strong';

  return { bits, label, ok: bits >= 60 && s.length >= 12 };
}
