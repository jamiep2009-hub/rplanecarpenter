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

## Setup

Two secrets, one connection. No terminal, no CLI, no build tokens.

### 1. GitHub token

Fine-grained, so its reach is one repository.

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*
2. **Repository access** → *Only select repositories* → `rplanecarpenter`
3. **Permissions** → Repository permissions → **Contents: Read and write**
   (Metadata: Read-only is added automatically)
4. Expiry: 1 year. Copy the token.

### 2. Connect Cloudflare to the repo

In the Cloudflare dashboard → **Workers & Pages** → **Create** → **Workers**
→ **Import a repository**. Authorise GitHub, pick `rplanecarpenter`, then set:

| Setting | Value |
|---|---|
| Root directory | `_admin` |
| Build command | `npm install` |
| Deploy command | `npx wrangler deploy` |

### 3. Add the two secrets

Same screen (or afterwards under the Worker's **Settings → Variables and
Secrets**), added as **Secret**, not plain text:

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | the token from step 1 |
| `ADMIN_PASSWORD` | the password the owner will log in with |

Deploy. Cloudflare gives you a `*.workers.dev` URL — that's the editor.

It redeploys automatically whenever `_admin/` changes on `main`.

### Optional: a nicer address

Worker → **Settings** → **Domains & Routes** → **Add** → custom domain →
`admin.rplanecarpenter.co.uk`. Requires the domain's DNS to be on
Cloudflare. The website itself stays on GitHub Pages either way.

---

## Local development

Only needed if you want to change the editor itself — day-to-day use
needs none of this.

```bash
cd _admin
npm install
npm test          # run every suite
npx wrangler dev  # run the Worker locally
```

`wrangler dev` needs the same two secrets in a local `.dev.vars` file
(git-ignored):

```
GITHUB_TOKEN=github_pat_...
ADMIN_PASSWORD=whatever-you-like
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
| *"Server not configured"* | `GITHUB_TOKEN` or `ADMIN_PASSWORD` is missing from the Worker's secrets. |
| *"The website connection is not authorised"* | The GitHub token expired or lost repo access. Generate a new one and re-set `GITHUB_TOKEN`. |
| *"Could not find …, the page may have changed"* | A page's markup changed so a selector no longer matches. Run `npm test` to see which, then fix the `path` in `schema.js`. |
| *"The website changed since you loaded this page"* | The repo moved between load and save (a manual commit, or two tabs). Reload the editor and redo the edit. |
| Edits publish but the site looks the same | GitHub Pages takes ~40s to rebuild. Then hard-refresh. Check the Actions tab for a failed Pages build. |
| Photos look sideways | Only possible if a browser lacks `createImageBitmap` EXIF support. All current mobile browsers have it. |

---

## Security notes

- The password is a Cloudflare secret (encrypted at rest, write-only in
  the dashboard), compared in constant time after both sides are digested.
- The session signing key is derived from the configured secrets, so
  there is no third value to manage. Changing the password or the token
  signs existing sessions out.
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

- [ ] Both secrets set; the Cloudflare deploy succeeds
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
