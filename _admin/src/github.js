/* ============================================================
   github.js — the only thing that writes to the repository.

   All the site edits in one save become ONE commit, built with
   the Git Data API (blobs -> tree -> commit -> ref). That matters:
   the site is never briefly half-updated, and "undo" is exactly
   one commit rather than a pile of them.
   ============================================================ */

'use strict';

const API = 'https://api.github.com';
const COMMIT_PREFIX = 'Website edit';

export class GitHub {
  constructor ({ token, owner, repo, branch = 'main', userAgent = 'rpc-admin' }) {
    if (!token) throw new Error('GitHub token is not configured.');
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.userAgent = userAgent;
  }

  get base () { return `${API}/repos/${this.owner}/${this.repo}`; }

  async call (path, options = {}) {
    const res = await fetch(path.startsWith('http') ? path : this.base + path, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': this.userAgent,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.message || ''; } catch { /* body may be empty */ }

      if (res.status === 401 || res.status === 403) {
        if (res.headers.get('X-RateLimit-Remaining') === '0') {
          throw new Error('GitHub rate limit reached. Please try again in a few minutes.');
        }
        throw new Error('The website connection is not authorised. The access token may have expired.');
      }
      if (res.status === 404) throw new Error('The website repository could not be found.');
      if (res.status === 409) throw new Error('Someone else changed the site at the same time. Please reload and try again.');
      throw new Error(`GitHub error ${res.status}${detail ? ': ' + detail : ''}`);
    }

    return res.status === 204 ? null : res.json();
  }

  /* ---------- reading ---------- */

  /** Current commit sha for the branch. */
  async headSha () {
    const ref = await this.call(`/git/ref/heads/${this.branch}`);
    return ref.object.sha;
  }

  /**
   * Read several text files at one commit. Uses the tree API so a
   * whole page-set costs two requests rather than one per file.
   */
  async readFiles (paths, sha) {
    const commitSha = sha || await this.headSha();
    const commit = await this.call(`/git/commits/${commitSha}`);
    const tree = await this.call(`/git/trees/${commit.tree.sha}?recursive=1`);

    const byPath = new Map(tree.tree.map(t => [t.path, t]));
    const out = {};

    await Promise.all(paths.map(async p => {
      const node = byPath.get(p);
      if (!node || node.type !== 'blob') { out[p] = null; return; }
      const blob = await this.call(`/git/blobs/${node.sha}`);
      out[p] = decodeBase64Utf8(blob.content.replace(/\n/g, ''));
    }));

    return { files: out, sha: commitSha };
  }

  /** List image files currently in a directory. */
  async listDir (dir, sha) {
    const commitSha = sha || await this.headSha();
    const commit = await this.call(`/git/commits/${commitSha}`);
    const tree = await this.call(`/git/trees/${commit.tree.sha}?recursive=1`);
    return tree.tree
      .filter(t => t.type === 'blob' && t.path.startsWith(dir + '/'))
      .map(t => ({ path: t.path, size: t.size }));
  }

  /* ---------- writing ---------- */

  /**
   * Commit a set of changes atomically.
   * `textFiles`   : { path: string }
   * `binaryFiles` : { path: base64 }
   * `expectedSha` : if given, the write is refused when the branch
   *                 has moved since the editor loaded — no silent
   *                 overwriting of someone else's change.
   */
  async commit ({ textFiles = {}, binaryFiles = {}, message, expectedSha }) {
    const headSha = await this.headSha();
    if (expectedSha && expectedSha !== headSha) {
      throw new Error('The website changed since you loaded this page. Please reload and try again.');
    }

    const head = await this.call(`/git/commits/${headSha}`);

    const entries = [];

    for (const [path, content] of Object.entries(textFiles)) {
      const blob = await this.call('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      });
      entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    for (const [path, base64] of Object.entries(binaryFiles)) {
      const blob = await this.call('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: base64, encoding: 'base64' }),
      });
      entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    if (entries.length === 0) return { committed: false, sha: headSha };

    const tree = await this.call('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: head.tree.sha, tree: entries }),
    });

    const commit = await this.call('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `${COMMIT_PREFIX}: ${message}`,
        tree: tree.sha,
        parents: [headSha],
      }),
    });

    await this.call(`/git/refs/heads/${this.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return { committed: true, sha: commit.sha, files: entries.map(e => e.path) };
  }

  /** Delete files in a single commit. */
  async deleteFiles (paths, message) {
    if (!paths.length) return { committed: false };
    const headSha = await this.headSha();
    const head = await this.call(`/git/commits/${headSha}`);

    const tree = await this.call('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: head.tree.sha,
        tree: paths.map(path => ({ path, mode: '100644', type: 'blob', sha: null })),
      }),
    });

    const commit = await this.call('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `${COMMIT_PREFIX}: ${message}`,
        tree: tree.sha,
        parents: [headSha],
      }),
    });

    await this.call(`/git/refs/heads/${this.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return { committed: true, sha: commit.sha };
  }

  /* ---------- history / undo ---------- */

  async recentEdits (limit = 12) {
    const commits = await this.call(`/commits?sha=${this.branch}&per_page=${limit}`);
    return commits.map(c => ({
      sha: c.sha,
      message: c.commit.message.split('\n')[0],
      date: c.commit.author?.date || c.commit.committer?.date,
      isEdit: c.commit.message.startsWith(COMMIT_PREFIX),
    }));
  }

  /**
   * Undo the most recent edit by committing the previous tree.
   * History is added to, never rewritten, so nothing is ever lost
   * and the undo itself can be undone.
   */
  async undoLast () {
    const commits = await this.call(`/commits?sha=${this.branch}&per_page=2`);
    if (commits.length < 2) throw new Error('There is nothing to undo yet.');

    const [current, previous] = commits;
    if (!current.commit.message.startsWith(COMMIT_PREFIX)) {
      throw new Error('The most recent change was not made in the editor, so it will not be undone automatically.');
    }

    const prevFull = await this.call(`/git/commits/${previous.sha}`);
    const commit = await this.call('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `${COMMIT_PREFIX}: undo "${current.commit.message.replace(COMMIT_PREFIX + ': ', '')}"`,
        tree: prevFull.tree.sha,
        parents: [current.sha],
      }),
    });

    await this.call(`/git/refs/heads/${this.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return { sha: commit.sha, undid: current.commit.message };
  }
}

/* ---------- encoding helpers ---------- */

export function decodeBase64Utf8 (b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

export function encodeBase64Utf8 (str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
