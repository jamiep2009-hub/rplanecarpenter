/* ============================================================
   github.test.mjs — the browser-to-GitHub flow.

   Exercises GitHub against a stand-in API backed by the real
   files in this repo: connect, load, edit, publish, undo. This is
   the layer that changed when the editor stopped needing a
   server, so it gets its own end-to-end check.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHub } from '../github.js';
import { readModel, applyChanges } from '../content.js';
import { EDITABLE_FILES } from '../schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', '..');

let passed = 0, failed = 0;
const failures = [];
const ok = (n, c, d) => c ? passed++ : (failed++, failures.push(`${n}${d ? ' — ' + d : ''}`));
const eq = (n, a, b) => ok(n, a === b, a === b ? '' : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
async function throwsAsync (n, fn) {
  try { await fn(); ok(n, false, 'expected a rejection'); } catch { passed++; }
}

/* ---------- a stand-in GitHub, backed by the real repo files ---------- */

function makeFakeGitHub () {
  const b64 = s => Buffer.from(s, 'utf8').toString('base64');
  const blobs = new Map();           // sha -> { content, encoding }
  const commits = new Map();         // sha -> { sha, tree, message, parents }
  const trees = new Map();           // sha -> entries
  let ref = null;                    // the branch pointer
  let n = 0;
  const nextSha = p => `${p}${String(++n).padStart(36, '0')}`;

  // Seed a first commit holding the current site files.
  const seed = [];
  for (const f of EDITABLE_FILES) {
    const sha = nextSha('b');
    blobs.set(sha, { content: b64(readFileSync(join(SITE, f), 'utf8')), encoding: 'base64' });
    seed.push({ path: f, type: 'blob', mode: '100644', sha, size: 1 });
  }
  seed.push({ path: 'images/img01.jpg', type: 'blob', mode: '100644', sha: nextSha('b'), size: 1000 });
  seed.push({ path: 'images/img02.jpg', type: 'blob', mode: '100644', sha: nextSha('b'), size: 1000 });

  const rootTree = nextSha('t');
  trees.set(rootTree, seed);
  const first = nextSha('c');
  commits.set(first, { sha: first, tree: rootTree, message: 'initial', parents: [] });
  ref = first;

  const head = () => commits.get(ref);
  /** Commits reachable from the branch, newest first. */
  const history = () => {
    const out = [];
    let sha = ref;
    while (sha && commits.has(sha)) { const c = commits.get(sha); out.push(c); sha = c.parents[0]; }
    return out;
  };

  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });

  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;

    if (!/^Bearer .+/.test(opts.headers?.Authorization || '')) return json({ message: 'Bad credentials' }, 401);
    if (opts.headers && 'User-Agent' in opts.headers) return json({ message: 'forbidden header' }, 400);

    if (/\/repos\/[^/]+\/[^/]+$/.test(u)) {
      return json({ full_name: 'jamiep2009-hub/rplanecarpenter', default_branch: 'main', permissions: { push: true } });
    }
    if (u.includes('/git/ref/heads/')) return json({ object: { sha: ref } });

    if (u.match(/\/git\/commits\/(\w+)$/) && method === 'GET') {
      const sha = u.match(/\/git\/commits\/(\w+)$/)[1];
      const c = commits.get(sha) || head();
      return json({ sha: c.sha, tree: { sha: c.tree }, parents: c.parents.map(p => ({ sha: p })) });
    }
    if (u.includes('/git/trees/') && method === 'GET') {
      return json({ tree: trees.get(u.match(/\/git\/trees\/(\w+)/)[1]) || [] });
    }
    if (u.includes('/git/blobs/') && method === 'GET') {
      const b = blobs.get(u.match(/\/git\/blobs\/(\w+)/)[1]);
      return b ? json(b) : json({ message: 'Not Found' }, 404);
    }
    if (u.endsWith('/git/blobs') && method === 'POST') {
      const sha = nextSha('b');
      blobs.set(sha, { content: body.encoding === 'utf-8' ? b64(body.content) : body.content, encoding: 'base64' });
      return json({ sha });
    }
    if (u.endsWith('/git/trees') && method === 'POST') {
      const base = [...(trees.get(body.base_tree) || [])];
      for (const e of body.tree) {
        const i = base.findIndex(x => x.path === e.path);
        if (e.sha === null) { if (i !== -1) base.splice(i, 1); continue; }
        if (i === -1) base.push({ ...e, type: 'blob', size: 1 });
        else base[i] = { ...base[i], sha: e.sha };
      }
      const sha = nextSha('t');
      trees.set(sha, base);
      return json({ sha });
    }
    if (u.endsWith('/git/commits') && method === 'POST') {
      // Creating a commit object does NOT move the branch — only the ref
      // update does. Modelling that is what makes the conflict tests real.
      const sha = nextSha('c');
      commits.set(sha, { sha, tree: body.tree, message: body.message, parents: body.parents });
      return json({ sha });
    }
    if (u.includes('/git/refs/heads/') && method === 'PATCH') {
      const target = commits.get(body.sha);
      // Real GitHub refuses a non-fast-forward unless forced.
      if (!body.force && target && !target.parents.includes(ref) && body.sha !== ref) {
        return json({ message: 'Update is not a fast forward' }, 422);
      }
      ref = body.sha;
      return json({ object: { sha: ref } });
    }
    if (u.includes('/commits?')) {
      const per = Number((u.match(/per_page=(\d+)/) || [])[1] || 30);
      return json(history().slice(0, per).map(c => ({
        sha: c.sha,
        commit: { message: c.message, author: { date: '2026-01-01T00:00:00Z' } },
      })));
    }
    return json({ message: 'unhandled ' + method + ' ' + u }, 500);
  };

  return { head, history, depth: () => history().length };
}

/* ---------- run the flow ---------- */

const fake = makeFakeGitHub();
const gh = new GitHub({ token: 'github_pat_testtoken', owner: 'jamiep2009-hub', repo: 'rplanecarpenter', branch: 'main' });

/* 1. connect */
{
  const info = await gh.checkAccess();
  eq('connect: reports the repository', info.name, 'jamiep2009-hub/rplanecarpenter');

  let threw = false;
  try { new GitHub({ token: '', owner: 'a', repo: 'b' }); } catch { threw = true; }
  ok('connect: refuses an empty key', threw);
}
{
  // A key that explicitly cannot push must be refused at setup, not at save time.
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    full_name: 'x/y', default_branch: 'main', permissions: { push: false },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await throwsAsync('connect: read-only key is rejected', () => gh.checkAccess());
  globalThis.fetch = original;
}
{
  // GitHub does not always report `permissions` for fine-grained tokens.
  // A good key must not be turned away just because the field is absent.
  const original = globalThis.fetch;
  let sawRefCall = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/git/ref/heads/')) {
      sawRefCall = true;
      return new Response(JSON.stringify({ object: { sha: 'c1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ full_name: 'x/y', default_branch: 'main' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const info = await gh.checkAccess();
  eq('connect: key with no permissions field is accepted', info.name, 'x/y');
  ok('connect: branch reachability is verified', sawRefCall);
  globalThis.fetch = original;
}
{
  // An unreachable branch must fail loudly rather than store a dud key.
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('/git/ref/heads/')
    ? new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    : new Response(JSON.stringify({ full_name: 'x/y', default_branch: 'main' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await throwsAsync('connect: unreachable branch is refused', () => gh.checkAccess());
  globalThis.fetch = original;
}

/* 2. load */
let files, sha, model;
{
  const res = await gh.readFiles(EDITABLE_FILES);
  files = res.files; sha = res.sha;
  ok('load: every page arrived', EDITABLE_FILES.every(f => typeof files[f] === 'string' && files[f].length > 100));
  ok('load: content matches the repo', files['index.html'] === readFileSync(join(SITE, 'index.html'), 'utf8'));

  model = readModel(files);
  eq('load: 10 gallery photos', model.gallery.length, 10);
  eq('load: 6 reviews', model.reviews.length, 6);
  eq('load: phone read', model.contact.phone, '07990 527683');

  const images = await gh.listDir('images', sha);
  ok('load: images listed', images.length >= 2 && images.every(i => i.path.startsWith('images/')));
}

/* 3. publish an edit */
{
  const before = fake.depth();
  const result = applyChanges(files, { text: { 'home.hero.sub': 'A brand new intro line.' } });
  eq('publish: only one file changed', result.changed.join(','), 'index.html');

  const textFiles = {};
  for (const f of result.changed) textFiles[f] = result.files[f];
  const commit = await gh.commit({ textFiles, message: 'page wording', expectedSha: sha });

  ok('publish: committed', commit.committed);
  eq('publish: exactly one new commit', fake.depth(), before + 1);
  ok('publish: message is prefixed', fake.head().message.startsWith('Website edit:'));

  const after = await gh.readFiles(['index.html']);
  ok('publish: change is live in the repo', after.files['index.html'].includes('A brand new intro line.'));
  ok('publish: rest of the page intact', after.files['index.html'].includes('Crafted by hand.'));
  sha = commit.sha;
}

/* 4. a multi-file edit is still ONE commit */
{
  // Changing a town rewrites the visible list on one page and the
  // structured data on two — a genuine multi-file save.
  const before = fake.depth();
  const fresh = (await gh.readFiles(EDITABLE_FILES)).files;
  const towns = readModel(fresh).towns;
  const result = applyChanges(fresh, { towns: [...towns, 'Sheringham'] });
  eq('atomic: two files change', result.changed.sort().join(','), 'contact.html,index.html');

  const textFiles = {};
  for (const f of result.changed) textFiles[f] = result.files[f];
  await gh.commit({ textFiles, message: 'towns covered' });
  eq('atomic: still a single commit', fake.depth(), before + 1);

  const after = (await gh.readFiles(['index.html', 'contact.html'])).files;
  ok('atomic: both files updated together',
     after['contact.html'].includes('<li>Sheringham</li>') && after['index.html'].includes('"Sheringham"'));
}

/* 5. concurrent edits are refused, not silently overwritten */
{
  try {
    await gh.commit({ textFiles: { 'index.html': 'x' }, message: 'stale', expectedSha: 'c000000000000000000000000000000000001' });
    ok('safety: stale save is refused', false, 'it was accepted');
  } catch (err) {
    ok('safety: stale save is refused', true);
    ok('safety: the refusal is marked recoverable', err.conflict === true);
    ok('safety: the message avoids git jargon', !/fast forward|422|409/i.test(err.message), err.message);
  }
}

/* 5b. The exact race that broke a real save: the branch moves between
      reading HEAD and updating the ref. An unguarded write — a photo
      upload — must heal itself rather than surfacing GitHub's
      "Update is not a fast forward". */
{
  const original = globalThis.fetch;
  let refAttempts = 0;

  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).includes('/git/refs/heads/') && opts.method === 'PATCH') {
      refAttempts++;
      if (refAttempts === 1) {
        return new Response(JSON.stringify({ message: 'Update is not a fast forward' }),
          { status: 422, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return original(url, opts);
  };

  const before = fake.depth();
  const res = await gh.commit({
    binaryFiles: { 'images/race-test.jpg': Buffer.from('bytes').toString('base64') },
    message: 'add a photo',
  });

  ok('race: the upload succeeded despite the conflict', res.committed);
  ok('race: it retried the ref update', refAttempts >= 2, `${refAttempts} attempts`);
  ok('race: the photo landed', (await gh.listDir('images')).some(i => i.path === 'images/race-test.jpg'));

  globalThis.fetch = original;
}

/* 5c. A guarded write must NOT retry behind the caller's back: re-applying
      blindly could overwrite an edit made somewhere else. The caller
      rebuilds against the newer state and decides. */
{
  const original = globalThis.fetch;
  let patches = 0;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).includes('/git/refs/heads/') && opts.method === 'PATCH') {
      patches++;
      return new Response(JSON.stringify({ message: 'Update is not a fast forward' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    return original(url, opts);
  };

  const sha = await gh.headSha();
  try {
    await gh.commit({ textFiles: { 'index.html': 'y' }, message: 'guarded', expectedSha: sha });
    ok('race: a guarded write surfaces the conflict', false, 'it was accepted');
  } catch (err) {
    ok('race: a guarded write surfaces the conflict', err.conflict === true);
    eq('race: it did not retry silently', patches, 1);
  }
  globalThis.fetch = original;
}

/* 6. binary upload */
{
  const before = fake.depth();
  const res = await gh.commit({
    binaryFiles: { 'images/test-photo.jpg': Buffer.from('fake-jpeg-bytes').toString('base64') },
    message: 'add a photo',
  });
  ok('upload: committed', res.committed);
  eq('upload: one commit', fake.depth(), before + 1);
  const listed = await gh.listDir('images');
  ok('upload: file appears in the tree', listed.some(i => i.path === 'images/test-photo.jpg'));
}

/* 7. undo */
{
  const beforeText = (await gh.readFiles(['index.html'])).files['index.html'];
  const marker = 'UNDO-ME-' + Date.now();
  const edited = beforeText.replace('Crafted by hand.', marker);
  await gh.commit({ textFiles: { 'index.html': edited }, message: 'temporary change' });
  ok('undo: change is present first', (await gh.readFiles(['index.html'])).files['index.html'].includes(marker));

  const res = await gh.undoLast();
  ok('undo: reported what it undid', res.undid.includes('temporary change'));

  const restored = (await gh.readFiles(['index.html'])).files['index.html'];
  ok('undo: change is gone', !restored.includes(marker));
  ok('undo: original text is back', restored.includes('Crafted by hand.'));
  ok('undo: history is added to, not rewritten', fake.depth() > 1);
}

/* 8. bad credentials surface a readable message */
{
  const bad = new GitHub({ token: 'x', owner: 'a', repo: 'b', branch: 'main' });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });
  try {
    await bad.headSha();
    ok('errors: unauthorised is caught', false, 'no error thrown');
  } catch (err) {
    ok('errors: message is written for a person', /access key/i.test(err.message), err.message);
    ok('errors: message leaks no jargon', !/401|Bad credentials/.test(err.message), err.message);
  }
  globalThis.fetch = original;
}

console.log(`\n  github: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.log('   ✗ ' + f);
  console.log('');
  process.exit(1);
}
