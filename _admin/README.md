# Website Editor — setup and maintenance

A small Cloudflare Worker that lets a non-technical owner edit the
R. Plane Carpenter website: page wording, photos, before/after
sliders, reviews and contact details.

This folder is **not part of the published website**. GitHub Pages runs
Jekyll, which skips directories beginning with `_`, so nothing in
`_admin/` is ever served from `rplanecarpenter.co.uk`.

---

## How it fits together

```
  Editor (phone/laptop)        Cloudflare Worker            GitHub repo
  admin.rplanecarpenter.co.uk  ── commits via API ──▶  jamiep2009-hub/rplanecarpenter
                                                              │
                                                              ▼
                                                        GitHub Pages
                                                    rplanecarpenter.co.uk
```

The Worker is the only thing that can write to the repo. It holds the
GitHub token as a secret; the owner never sees it and never needs a
GitHub account.

**Nothing about the public site changes.** No admin code is served from
it, no extra JavaScript, no runtime dependency on the Worker. If the
Worker is switched off tomorrow, the website carries on exactly as it is.

---

## Why edits are safe

Content is located by CSS-style selectors declared in `src/schema.js` and
rewritten in place. Everything outside the targeted region is returned
byte for byte unchanged.

| Guarantee | Enforced by |
|---|---|
| Only the edited region changes | `src/htmledit.js`, verified by round-trip tests |
| Reading and re-saving changes nothing | `test/content.test.mjs` |
| Ambiguous selectors refuse to write | `locateOne()` throws rather than guessing |
| Typed text can never become markup | escaped on write; injection tests |
| Only listed files are writable | `EDITABLE_FILES` in `src/schema.js` |
| Images can only land in `images/` | path pattern validation |
| Every save is one commit | Git Data API, so undo is one step |

Run `npm test` for the full suite (231 assertions, including checks
against the real page files in this repo).

---

## First-time setup

### 1. Create a GitHub token

Use a **fine-grained personal access token** so its reach is limited to
this one repository.

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*
2. **Repository access** → *Only select repositories* → `rplanecarpenter`
3. **Permissions** → Repository permissions → **Contents: Read and write**
   (nothing else is needed)
4. Set an expiry you're happy to renew — 1 year is reasonable
5. Copy the token; you will not see it again

### 2. Install and generate secrets

```bash
cd _admin
npm install
node scripts/hash-password.mjs "a password of at least 12 characters"
```

That prints the four `wrangler secret put` commands to run. The password
itself is never stored — only a PBKDF2 hash and its salt.

### 3. Set the secrets

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_PASSWORD_SALT
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GITHUB_TOKEN
```

### 4. Deploy

```bash
npx wrangler deploy
```

Wrangler prints a `*.workers.dev` URL. That is already usable.

### 5. (Optional) Use a custom domain

Uncomment the `[[routes]]` block in `wrangler.toml`, then in the
Cloudflare dashboard add `admin.rplanecarpenter.co.uk` as a custom
domain for the Worker. This requires the domain's DNS to be on
Cloudflare.

Note the site itself stays on GitHub Pages either way — only the
`admin.` subdomain points at the Worker.

---

## Local development

```bash
npm test          # run every suite
npx wrangler dev  # run the Worker locally
```

`wrangler dev` needs the same secrets; add them to a local `.dev.vars`
file (git-ignored) while developing:

```
GITHUB_TOKEN=github_pat_...
SESSION_SECRET=...
ADMIN_PASSWORD_HASH=...
ADMIN_PASSWORD_SALT=...
```

---

## Making more of the site editable

Add an entry to `TEXT_FIELDS` in `src/schema.js`. No other file changes.

```js
{
  id:    'home.hero.eyebrow',      // unique key
  file:  'index.html',             // must be in EDITABLE_FILES
  group: 'Home page',              // heading it appears under
  label: 'Small line above the headline',
  path:  [{ cls: 'hero-eyebrow' }],// scoped selector path
  type:  'line',                   // line | para | heading
  max:   80,                       // character limit
}
```

**Selector paths** are resolved one step at a time, each inside the
previous match, so you can target precisely without a CSS engine:

```js
path: [{ cls: 'svc-card', nth: 2 }, { tag: 'h3' }]   // h3 in the 3rd card
path: [{ id: 'tileGrid' }]                            // by id
path: [{ tag: 'p', nth: 1 }]                          // 2nd paragraph
```

If a selector matches more than one element and no `nth` is given, the
editor refuses to write rather than guessing. After adding fields, run
`npm test` — the suite verifies every selector resolves against the real
pages and that writing a field back unchanged is a no-op.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| *"Server not configured"* | A secret is missing. Re-run the `wrangler secret put` commands. |
| *"The website connection is not authorised"* | The GitHub token expired or lost repo access. Generate a new one and re-set `GITHUB_TOKEN`. |
| *"Could not find …, the page may have changed"* | A page's markup changed so a selector no longer matches. Run `npm test` to see which, then fix the `path` in `schema.js`. |
| *"The website changed since you loaded this page"* | The repo moved between load and save (a manual commit, or two tabs). Reload the editor and redo the edit. |
| Edits publish but the site looks the same | GitHub Pages takes ~40s to rebuild. Then hard-refresh. Check the Actions tab for a failed Pages build. |
| Photos look sideways | Only possible if a browser lacks `createImageBitmap` EXIF support. All current mobile browsers have it. |

---

## Security notes

- Password is stored as PBKDF2-SHA256, 210,000 iterations, per-user salt.
- Sessions are HMAC-signed, 12-hour expiry, in a `__Host-` prefixed
  `HttpOnly; Secure; SameSite=Strict` cookie — unreachable from JS.
- Write endpoints additionally verify the request origin.
- Login is throttled to 8 attempts per 15 minutes per IP, with a delay
  on failure.
- The GitHub token is scoped to one repo with contents-only permission,
  so its worst case is limited to this website.
- No third-party runtime dependencies — the Worker imports nothing but
  its own modules (enforced by a test).

---

## Handover checklist

- [ ] Secrets set; `npx wrangler deploy` succeeds
- [ ] Custom domain resolves (if used)
- [ ] Owner can log in and publish a test edit
- [ ] Owner has bookmarked the editor and added it to their home screen
- [ ] `HANDOVER.md` sent to the owner
- [ ] Token expiry date noted in a calendar reminder
- [ ] Decide who owns the Cloudflare and GitHub accounts long term

### Ongoing cost

Zero at this scale. Cloudflare Workers' free tier is 100,000 requests
per day; this uses a handful. Images live in the repo, so there is no
storage bill.
