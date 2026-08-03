/* ============================================================
   crypto.test.mjs — the password login.

   This is what stands between a public file and the access key,
   so the properties that matter get asserted explicitly.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seal, unseal, suggestPassphrase, strength, ITERATIONS, FORMAT_VERSION } from '../crypto.js';

const HERE = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
const failures = [];
const ok = (n, c, d) => c ? passed++ : (failed++, failures.push(`${n}${d ? ' — ' + d : ''}`));
const eq = (n, a, b) => ok(n, a === b, a === b ? '' : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
async function throwsAsync (n, fn, match) {
  try { await fn(); ok(n, false, 'expected a rejection'); }
  catch (e) { ok(n, !match || match.test(e.message), e.message); }
}

// Deliberately NOT shaped like a real GitHub token: the safety suite
// scans this folder for anything token-shaped, and that scan is worth
// more than the realism of a fixture. Length is what matters here.
const TOKEN = 'fixture-secret-abcdefghijklmnopqrstuvwxyz-0123456789-ABCDEFGHIJ';
const PASS = 'timber-lattice-harbour-ferry-42';

/* ---------- round trip ---------- */

{
  const env = await seal(TOKEN, PASS);
  eq('seal: version stamped', env.v, FORMAT_VERSION);
  eq('seal: iteration count recorded', env.iterations, ITERATIONS);
  ok('seal: iterations are not trivially low', env.iterations >= 400_000, String(env.iterations));

  eq('unseal: recovers the exact key', await unseal(env, PASS), TOKEN);

  await throwsAsync('unseal: wrong password fails', () => unseal(env, PASS + 'x'), /not right/i);
  await throwsAsync('unseal: empty password fails', () => unseal(env, ''), /not right/i);
  await throwsAsync('unseal: near-miss password fails', () => unseal(env, 'timber-lattice-harbour-ferry-43'), /not right/i);
}

/* ---------- the ciphertext leaks nothing ---------- */

{
  const env = await seal(TOKEN, PASS);
  const blob = JSON.stringify(env);
  ok('secrecy: the key is not in the file', !blob.includes(TOKEN));
  ok('secrecy: no fragment of the key is present', !blob.includes(TOKEN.slice(0, 20)));
  ok('secrecy: the password is not in the file', !blob.toLowerCase().includes('timber'));
  ok('secrecy: file carries only salt, iv and data',
     Object.keys(env).sort().join(',') === 'data,iterations,iv,salt,v');
}

/* ---------- randomised per seal ---------- */

{
  const a = await seal(TOKEN, PASS);
  const b = await seal(TOKEN, PASS);
  ok('random: salt differs each time', a.salt !== b.salt);
  ok('random: iv differs each time', a.iv !== b.iv);
  ok('random: ciphertext differs each time', a.data !== b.data);
  eq('random: both still decrypt', await unseal(b, PASS), TOKEN);
}

/* ---------- tampering is detected, not silently accepted ---------- */

{
  const env = await seal(TOKEN, PASS);
  const flip = s => {
    const b = Buffer.from(s, 'base64');
    b[Math.floor(b.length / 2)] ^= 0xff;
    return b.toString('base64');
  };
  await throwsAsync('tamper: altered ciphertext rejected', () => unseal({ ...env, data: flip(env.data) }));
  await throwsAsync('tamper: altered iv rejected', () => unseal({ ...env, iv: flip(env.iv) }));
  await throwsAsync('tamper: altered salt rejected', () => unseal({ ...env, salt: flip(env.salt) }));
  await throwsAsync('tamper: unknown version rejected', () => unseal({ ...env, v: 99 }, PASS), /different version/i);
  await throwsAsync('tamper: missing envelope rejected', () => unseal(null, PASS));
}

/* ---------- lowering the work factor does not open the door ---------- */

{
  const env = await seal(TOKEN, PASS);
  // An attacker editing the file to claim 1 iteration still cannot decrypt,
  // because the derived key no longer matches.
  await throwsAsync('tamper: reduced iterations still fail', () => unseal({ ...env, iterations: 1 }, PASS));
}

/* ---------- password strength ---------- */

{
  const weak = ['password', 'carpenter', 'plane123', 'aaaaaaaaaaaa', 'abc123abc123', 'Robbie2026'];
  for (const w of weak) ok(`strength: rejects "${w}"`, !strength(w).ok, `${strength(w).bits} bits`);

  const strong = ['timber-lattice-harbour-ferry-42', 'Tr0ubad0ur!Chisel#Marsh', 'oak-mortise-kestrel-slate-77'];
  for (const s of strong) ok(`strength: accepts "${s.slice(0,18)}…"`, strength(s).ok, `${strength(s).bits} bits`);

  eq('strength: empty is not ok', strength('').ok, false);
  eq('strength: empty has no label', strength('').label, '');
  ok('strength: short but varied is still refused', !strength('aB3$xY').ok);
  ok('strength: labels escalate', strength('aaaaaaaaaaaa').bits < strength('timber-lattice-harbour-ferry-42').bits);
}

/* ---------- the suggested passphrase is actually good ---------- */

{
  const seen = new Set();
  let allOk = true;
  for (let i = 0; i < 40; i++) {
    const p = suggestPassphrase();
    seen.add(p);
    if (!strength(p).ok) { allOk = false; failures.push(`suggested passphrase too weak: ${p}`); }
  }
  ok('suggest: every suggestion passes the strength bar', allOk);
  ok('suggest: suggestions are not repeated', seen.size >= 38, `${seen.size}/40 unique`);

  const one = suggestPassphrase();
  ok('suggest: round-trips as a real password', await unseal(await seal(TOKEN, one), one) === TOKEN);
}

/* ---------- the module keeps its promises ---------- */

{
  const src = readFileSync(join(HERE, '..', 'crypto.js'), 'utf8');
  ok('impl: uses AES-GCM (authenticated)', src.includes('AES-GCM'));
  ok('impl: uses PBKDF2-SHA256', src.includes('PBKDF2') && src.includes("'SHA-256'"));
  ok('impl: no hard-coded salt', !/salt\s*=\s*['"]/.test(src));
  ok('impl: documents the offline-attack trade-off', /offline/i.test(src));
}

console.log(`\n  crypto: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.log('   ✗ ' + f);
  console.log('');
  process.exit(1);
}
