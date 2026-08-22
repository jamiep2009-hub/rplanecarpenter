# Reusable brief: a no-server content editor for a static site

Paste the block below into a fresh Claude Code session pointed at
another client's static site repository. Fill in the four values at the
top and delete this paragraph.

Everything after the line is the prompt. It encodes the architecture
*and* the mistakes made building the first one, so the next build does
not have to rediscover them.

---

## THE PROMPT

```
Build a content editor for this website so the owner can update it
themselves from a phone, without touching code and without a GitHub
account of their own.

Fill these in from the repository before you start:
  REPO         = <owner>/<repo>
  SITE ORIGIN  = https://<domain>
  BRANCH       = main
  HOST         = GitHub Pages (static, cannot set HTTP headers)

## Architecture — do not deviate

There is NO server. The editor is a page inside the repository, served
from the same static host as the site. GitHub's REST API allows
cross-origin requests, so the browser commits directly to the repo and
the host rebuilds. This is the entire backend.

  editor page  ──GitHub API──▶  repo  ──host rebuild──▶  live site

Do not propose Cloudflare Workers, Netlify Functions, Vercel, a
database, or a CMS. They were all considered and rejected: they add an
account, a deploy pipeline and secrets to manage, for a job that needs
none of them. If you think you need a server, you have misread the
problem.

Put the editor in a directory the host publishes (e.g. `admin/`). It
must carry `noindex`, be linked from nowhere, and be inert without a
key. It is not secret; the key is.

Access: one GitHub fine-grained token, scoped to that repository only,
Contents: Read and write. The owner pastes it once per device; it lives
in localStorage. Never commit it, never put it in a query string.

## The safety core — build this first, with tests, before any UI

Everything hinges on one guarantee: an edit changes the bytes it was
meant to change and nothing else. Build the engine and prove it before
writing a single line of interface.

1. A tag scanner that handles quoted attributes containing ">",
   comments, void elements, and the raw-text contents of <script> and
   <style>. Regex alone will mis-target nested elements; do not use it.

2. Region location by scoped selector *paths* — each selector resolved
   inside the previous match, e.g. [{cls:'card', nth:2},{tag:'h3'}].
   This gives precision without a CSS engine.

3. Ambiguity must throw, never guess. If a selector matches more than
   one element and no index was given, refuse to write. A failed edit
   is always better than a corrupted page.

4. Read and replace by byte offset. Never re-serialise the document.
   Content outside the target region is returned untouched, always.

5. Typed text is escaped on write. Prove that markup typed into a field
   cannot become markup in the page.

Then write the test that matters most: read the entire site into the
editable model, write it straight back, and assert the files are
BYTE-IDENTICAL. If that holds, an edit can only change what was edited.
Run it against the real pages in the repo, not fixtures.

## Schema-driven, not hard-coded

One file declares everything editable — id, file, label, selector path,
type, length limit. Adding a field is an entry there and nothing else.
Anything absent from that file is unreachable by the editor, which is
what keeps the blast radius small.

Derive the schema from the actual markup of the site you are given.
Verify every selector resolves against the real pages before building
the UI, and assert that in the test suite.

Repeating blocks (photo grids, testimonials, service areas) are read
into a model and regenerated. The generator must reproduce the existing
markup exactly — class order, indentation, attribute order — so that an
unchanged save is a no-op.

## Lessons already paid for — do not rediscover these

NO-OP PRESERVATION. Decoding "&mdash;" and re-encoding it produces
different bytes for identical meaning. Before writing any field,
compare the decoded current value with the incoming one and return the
original bytes if they match. Without this, opening the editor and
pressing save rewrites half the site.

FRESHLY UPLOADED IMAGES 404. The host takes ~40s to rebuild, so a photo
committed seconds ago is not yet on the live site. Every thumbnail AND
the preview must fall back to the local blob the browser already holds,
or the owner sees a broken image for something they just added. Fix
both places; fixing only the thumbnails looks fixed and is not.

CONCURRENT WRITES. Two devices, or a push while someone is editing, and
GitHub rejects the ref update with 422 "not a fast forward". Rebuild
against the newest version on every save attempt and retry on conflict.
Uploads (which cannot conflict) should heal silently; content saves
should re-read and re-apply rather than retrying blindly.

CACHE-BUST THE EDITOR ITSELF. Browsers cache JavaScript. Change a
module without changing its URL and phones keep running the old editor
against the new site, producing errors about code that no longer
exists. Version-stamp every browser-facing import INCLUDING nested
ones, and test that the stamps agree.

TESTS MUST NOT HARDCODE COUNTS of things the owner edits. "6 reviews"
breaks the moment they add a seventh — which is the entire point of the
tool. Assert relationships instead: a chip exists for every review,
every hidden slide is marked hidden, nothing was lost in a merge.

CONTENT IN JAVASCRIPT IS INVISIBLE. If a carousel holds its items in a
JS array and injects one at a time, search engines see one of them. Put
every item in the HTML and let the script choose which is visible.
Hide with opacity, not display:none, so the rest stays real rendered
content.

A STRICT CSP NEEDS THE SCRIPT OUT OF THE PAGE. An inline <script> forces
'unsafe-inline', which defeats the policy on the one page holding a
credential. Put the editor's script in its own file so its policy can
forbid inline script entirely. Note that JSON-LD blocks are data, not
script, and do not force this.

## What to build, in this order

1. The safety engine + byte-identity tests (above).
2. The schema, verified against the real markup.
3. The GitHub client: read many files in two requests via the tree API;
   commit every change in ONE commit via the Git Data API, so the site
   is never half-updated and undo is one step.
4. The interface. Phone-first. Sections for whatever the site actually
   has — photos, testimonials, page wording, contact details.
5. Photo handling, entirely in the browser: EXIF-correct rotation
   (`createImageBitmap(file, {imageOrientation:'from-image'})`), a crop
   the owner controls, resize to what is actually displayed rather than
   what the camera produced, encode WebP where supported, and generate
   a tiny blur placeholder. Never upload a 4000px phone photo for a
   600px tile.
6. Preview before publish, applied locally with no round trip.
7. Undo, driven by commit history, presented as "put it back".

## Non-negotiables for the interface

- Refusing and confirming carry equal weight wherever a choice is legal
  (cookie consent especially — that is a legal requirement, not style).
- Every destructive action confirms first.
- Errors are written for the person reading them. "Update is not a fast
  forward" is not an error message; "the website changed while you were
  editing" is.
- Nothing goes live until an explicit Publish.
- After publishing, watch the live page until the change actually
  appears, then say so. "Published" and "visible" are a minute apart.

## Also worth doing while you are in there

Audit and fix, but state plainly what the host makes impossible:
- sitemap.xml, robots.txt, canonical URLs, Open Graph tags
- LocalBusiness JSON-LD if it is a local trade
- Gate analytics behind consent; on a static host the tag must not be
  in the pages at all, or it runs before anyone can decline
- Check for stale duplicate pages left in the repo and still being
  served — they compete with the real ones and often carry placeholder
  contact details

## Do not

- Add aggregateRating or Review markup for testimonials hosted on the
  site. Google withdrew support for self-serving review markup on local
  businesses; it produces no stars and risks a manual action.
- Promise an A on a security header scan from a static host. Three of
  the five headers have no meta equivalent and cannot be set.
- Claim the website can influence a Google Business Profile rating. It
  cannot. Reviews flow from Google to the site, never the other way.
- Let a scheduled job that rewrites a live page proceed on an empty or
  erroring API response. Test every failure mode explicitly.

## Deliverables

- The editor, working, committed.
- A test suite that runs with no dependencies to install, covering the
  byte-identity guarantee, the failure modes, and the site itself.
- A setup note for the developer and a plain-English guide for the
  owner — no jargon, written for someone who has never seen GitHub.

Ask before assuming anything about the site's structure. Audit the
actual markup first; do not pattern-match from a previous build.
```

---

## Notes for you, not the prompt

**What transfers unchanged:** the architecture, the safety engine, the
photo pipeline, every lesson in that list.

**What must be rebuilt per site:** the schema, the collection
generators, and the interface sections — because they follow that
site's markup. Do not copy the schema across; it will silently target
the wrong elements.

**Roughly how long:** the first one took a full session including
several wrong turns. With this brief, expect the engine and tests in
the first pass and a working editor shortly after.

**The single most important instruction in there** is to build the
byte-identity test before the interface. Everything else is recoverable;
a tool that quietly corrupts a client's site is not.
