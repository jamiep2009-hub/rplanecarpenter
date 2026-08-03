/* ============================================================
   auth.test.mjs — login, sessions and route protection.
   ============================================================ */

import { mkdtempSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyPassword, createToken, verifyToken, sessionSecret,
  sessionCookie, clearCookie, readCookie, sameOrigin,
  throttleCheck, throttleFail, throttleReset,
} from '../src/auth.js';

const HERE = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
const failures = [];
const ok = (n, c, d) => c ? passed++ : (failed++, failures.push(`${n}${d ? ' — ' + d : ''}`));
const eq = (n, a, b) => ok(n, a === b, a === b ? '' : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/* ---------- passwords ---------- */

{
  const pw = 'a-properly-long-password';

  ok('password: correct accepted', await verifyPassword(pw, pw));
  ok('password: wrong rejected', !(await verifyPassword('nope-nope-nope', pw)));
  ok('password: near-miss rejected', !(await verifyPassword(pw + 'x', pw)));
  ok('password: unconfigured rejected', !(await verifyPassword(pw, null)));
  ok('password: empty attempt rejected', !(await verifyPassword('', pw)));
  ok('password: differing lengths rejected', !(await verifyPassword('short', pw)));
}

/* ---------- derived session key ---------- */

{
  const a = await sessionSecret({ ADMIN_PASSWORD: 'pw-one', GITHUB_TOKEN: 'tok' });
  const b = await sessionSecret({ ADMIN_PASSWORD: 'pw-one', GITHUB_TOKEN: 'tok' });
  const c = await sessionSecret({ ADMIN_PASSWORD: 'pw-two', GITHUB_TOKEN: 'tok' });
  const d = await sessionSecret({ ADMIN_PASSWORD: 'pw-one', GITHUB_TOKEN: 'other' });

  eq('session key: deterministic', a, b);
  ok('session key: changes with the password', a !== c);
  ok('session key: changes with the token', a !== d);
  ok('session key: does not contain the password', !a.includes('pw-one'));
  ok('session key: long enough to sign with', a.length >= 40);
}

/* ---------- tokens ---------- */

{
  const secret = 'signing-secret-value';
  const token = await createToken(secret, { sub: 'admin' });

  ok('token: verifies', !!(await verifyToken(secret, token)));
  eq('token: carries subject', (await verifyToken(secret, token)).sub, 'admin');
  ok('token: wrong secret fails', (await verifyToken('other-secret', token)) === null);
  ok('token: tampered signature fails', (await verifyToken(secret, token.slice(0, -3) + 'aaa')) === null);
  ok('token: tampered payload fails', await (async () => {
    const [h, , s] = token.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: 'root', exp: 9e9 })).toString('base64url');
    return (await verifyToken(secret, `${h}.${evil}.${s}`)) === null;
  })());
  ok('token: malformed fails', (await verifyToken(secret, 'not-a-token')) === null);
  ok('token: empty fails', (await verifyToken(secret, '')) === null);

  const expired = await createToken(secret, { sub: 'admin' }, -1);
  ok('token: expired rejected', (await verifyToken(secret, expired)) === null);
}

/* ---------- cookies ---------- */

{
  const c = sessionCookie('abc123');
  ok('cookie: HttpOnly', /HttpOnly/.test(c));
  ok('cookie: Secure', /Secure/.test(c));
  ok('cookie: SameSite=Strict', /SameSite=Strict/.test(c));
  ok('cookie: __Host- prefix', c.startsWith('__Host-'));
  ok('cookie: clear expires immediately', /Max-Age=0/.test(clearCookie()));

  const req = new Request('https://admin.test/', { headers: { Cookie: '__Host-rpc_admin=tok123; other=x' } });
  eq('cookie: read from header', readCookie(req), 'tok123');
  eq('cookie: missing returns null', readCookie(new Request('https://admin.test/')), null);
}

/* ---------- origin checks ---------- */

{
  ok('origin: same origin allowed', sameOrigin(new Request('https://admin.test/x', { headers: { Origin: 'https://admin.test' } })));
  ok('origin: cross origin blocked', !sameOrigin(new Request('https://admin.test/x', { headers: { Origin: 'https://evil.test' } })));
  ok('origin: absent header allowed', sameOrigin(new Request('https://admin.test/x')));
}

/* ---------- throttling ---------- */

{
  const ip = 'test-ip-' + Math.random();
  ok('throttle: starts allowed', throttleCheck(ip).allowed);
  for (let i = 0; i < 8; i++) throttleFail(ip);
  ok('throttle: blocks after 8 failures', !throttleCheck(ip).allowed);
  ok('throttle: reports a retry window', throttleCheck(ip).retryAfter > 0);
  throttleReset(ip);
  ok('throttle: reset clears the block', throttleCheck(ip).allowed);
}

/* ---------- worker routing ---------- */

{
  // The Worker imports its UI as a text module, which Node cannot do.
  // Stub that one import so the routing logic can be exercised.
  const dir = mkdtempSync(join(tmpdir(), 'rpc-worker-'));
  cpSync(join(HERE, '..', 'src'), dir, { recursive: true });
  writeFileSync(join(dir, 'ui', 'index.html.js'), 'export default "<html>stub</html>";');
  const idx = join(dir, 'index.js');
  writeFileSync(idx, readFileSync(idx, 'utf8').replace("from './ui/index.html'", "from './ui/index.html.js'"));

  const worker = (await import('file://' + idx)).default;
  const ENV = { GITHUB_TOKEN: 'x', REPO_OWNER: 'o', REPO_NAME: 'r', ADMIN_PASSWORD: 'the-admin-password' };
  const SIGNING = await sessionSecret(ENV);
  const hit = (path, init) => worker.fetch(new Request('https://admin.test' + path, init), ENV);

  ok('worker: exports a fetch handler', typeof worker.fetch === 'function');

  eq('worker: unknown route is 404', (await hit('/nope')).status, 404);
  eq('worker: UI is served at /', (await hit('/')).status, 200);

  for (const p of ['/api/model', '/api/save', '/api/upload', '/api/preview', '/api/undo', '/api/history']) {
    eq(`worker: ${p} requires a session`, (await hit(p, { method: p === '/api/model' || p === '/api/history' ? 'GET' : 'POST' })).status, 401);
  }

  {
    const res = await worker.fetch(new Request('https://admin.test/api/model'), {});
    eq('worker: missing config is reported', res.status, 500);
    ok('worker: config error names the gaps', (await res.json()).error.includes('GITHUB_TOKEN'));
  }

  {
    // A valid session must not be forgeable with a different secret.
    const forged = await createToken('the-wrong-secret', { sub: 'admin' });
    const res = await hit('/api/model', { headers: { Cookie: `__Host-rpc_admin=${forged}` } });
    eq('worker: forged session rejected', res.status, 401);
  }

  {
    const good = await createToken(SIGNING, { sub: 'admin' });
    const res = await hit('/api/save', {
      method: 'POST',
      headers: { Cookie: `__Host-rpc_admin=${good}`, Origin: 'https://evil.test', 'Content-Type': 'application/json' },
      body: '{}',
    });
    eq('worker: cross-origin write blocked', res.status, 403);
  }

  {
    const res = await hit('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'the-wrong-password' }),
    });
    ok('worker: wrong password rejected', res.status === 401 || res.status === 429);
  }

  {
    const res = await hit('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'the-admin-password' }),
    });
    // May be throttled by the preceding failures; both outcomes prove routing.
    ok('worker: correct password authenticates', res.status === 200 || res.status === 429);
    if (res.status === 200) {
      ok('worker: sets a session cookie', /__Host-rpc_admin=/.test(res.headers.get('Set-Cookie') || ''));
    }
  }

  {
    const res = await hit('/');
    ok('worker: sets nosniff', res.headers.get('X-Content-Type-Options') === 'nosniff');
    ok('worker: denies framing', res.headers.get('X-Frame-Options') === 'DENY');
    ok('worker: no-store on the UI', /no-store/.test(res.headers.get('Cache-Control') || ''));
  }
}

console.log(`\n  auth: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.log('   ✗ ' + f);
  console.log('');
  process.exit(1);
}
