# Website editor

A page on the website that edits the website. No server, no hosting, no
deployment — it commits to this repository straight from the browser
using GitHub's API.

**Open it at:** `rplanecarpenter.co.uk/admin/`

---

## Setup

One step, done once per device.

1. Open `/admin/` — it shows the instructions
2. Follow its link to create a GitHub **fine-grained token**:
   - Repository access → *Only select repositories* → `rplanecarpenter`
   - Permissions → Repository permissions → **Contents: Read and write**
3. Paste the token into the page

That's it. The key is stored in that browser only (`localStorage`) and
is sent nowhere except GitHub. Revoke it any time from GitHub settings.

To set the carpenter up, do those three steps once on **their** phone.
They never see GitHub again — they just open the page and it works.

---

## How it fits together

```
  /admin/  ──── GitHub API ────▶  this repository
  (a page on                            │
   the website)                         ▼
                                  GitHub Pages
                              rplanecarpenter.co.uk
```

The public site has **no idea the editor exists**: no script, no link,
no runtime dependency. Delete `admin/` tomorrow and the website is
unchanged.

The editor page carries `noindex`, and nothing links to it, so it stays
out of search. It is useless to anyone without a valid key.

---

## Why edits are safe

Content is located by scoped selector paths declared in `schema.js` and
rewritten in place. Everything outside the targeted region is returned
byte for byte unchanged.

| Guarantee | Enforced by |
|---|---|
| Only the edited region changes | `htmledit.js`, verified by round-trip tests |
| Reading and re-saving changes nothing | `test/content.test.mjs` |
| Ambiguous selectors refuse to write | `locateOne()` throws rather than guessing |
| Typed text can never become markup | escaped on write; injection tests |
| Only listed files are writable | `EDITABLE_FILES` in `schema.js` |
| Images can only land in `images/` | path pattern validation |
| Every save is one commit | Git Data API, so undo is one step |
| A save is refused if the repo moved | commit sha checked before writing |

```bash
node admin/test/run.mjs     # 219 assertions, no dependencies to install
```

They run against the **real page files** in this repo, and on every push
via `.github/workflows/test.yml` (which needs no configuration).

---

## Files

| File | Role |
|---|---|
| `index.html` | the whole editor — UI, photo processing, publish flow |
| `htmledit.js` | safe HTML region locate / read / replace |
| `content.js` | site ⇄ editable model |
| `render.js` | model → site markup |
| `schema.js` | **what is editable** — the contract |
| `github.js` | reads and commits via the GitHub API |

---

## Making more of the site editable

Add an entry to `TEXT_FIELDS` in `schema.js`. Nothing else changes.

```js
{
  id:    'home.hero.eyebrow',       // unique key
  file:  'index.html',              // must be in EDITABLE_FILES
  group: 'Home page',               // heading it appears under
  label: 'Small line above the headline',
  path:  [{ cls: 'hero-eyebrow' }], // scoped selector path
  type:  'line',                    // line | para | heading
  max:   80,
}
```

Selector paths resolve one step at a time, each inside the previous
match:

```js
path: [{ cls: 'svc-card', nth: 2 }, { tag: 'h3' }]   // h3 in the 3rd card
path: [{ id: 'tileGrid' }]                            // by id
path: [{ tag: 'p', nth: 1 }]                          // 2nd paragraph
```

If a selector matches more than one element and no `nth` is given, the
editor refuses to write rather than guessing. Run the tests after
adding fields — they verify every selector resolves against the real
pages and that re-writing a field unchanged is a no-op.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| *"Your access key is not valid any more"* | The token expired or was revoked. Make a new one and paste it in again. |
| *"Could not reach the website files"* | The token lacks access to this repo. Check it was scoped to `rplanecarpenter` with Contents: Read and write. |
| *"Could not find …, the page may have changed"* | A page's markup changed so a selector no longer matches. Run the tests to see which, then fix the `path` in `schema.js`. |
| *"The website changed since you loaded this page"* | Something else committed in the meantime. Reload and redo the edit. |
| Published, but the site looks the same | GitHub Pages takes ~40s to rebuild, then hard-refresh. |
| Editor asks for the key again | Browser data was cleared. Paste it in again. |

---

## Security notes

- The token is a GitHub fine-grained token limited to this one
  repository with contents-only permission. Its worst case is this
  website.
- It lives in the browser's `localStorage` on the device it was entered
  on. Anyone with an unlocked device that has it can edit the site — so
  set an expiry you're comfortable with, and revoke it if a phone is
  lost.
- The editor page is public but inert: it does nothing without a key.
- No third-party code and no build step — the browser loads these files
  directly, and a test enforces that nothing external creeps in.
- Every change is a commit, so nothing is ever unrecoverable.

### Cost

Nothing. There is no server and no service — it is a page on a site
already being hosted for free.

### Token expiry

Set a calendar reminder for the expiry date. When it lapses, the editor
says the key is no longer valid; making a new one and pasting it in
takes a minute.
