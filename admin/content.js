/* ============================================================
   content.js — reads the live site into an editable model, and
   applies edits back onto the original file bytes.

   Every write is expressed as "replace exactly this region";
   nothing else in the file is ever rewritten.
   ============================================================ */

'use strict';

import {
  readPath, replacePath, locateAll, readAttrPath,
  htmlToText, textToHtml, escapeHtml, inlineToText, textToInline,
} from './htmledit.js';
import {
  TEXT_FIELDS, COLLECTIONS, getTextField, EDITABLE_FILES, SCHEMA_ORG_FILES,
} from './schema.js';
import {
  renderGalleryGrid, renderBentoGrid, renderBeforeAfterGallery,
  renderReviewChips, renderReviewSlides, renderTownList,
} from './render.js';

/* ------------------------------------------------------------
   Headings: "line one<br><em>line two</em>"
   ------------------------------------------------------------ */

export function parseHeading (raw) {
  const m = /^([\s\S]*?)<br\s*\/?>\s*<em>([\s\S]*?)<\/em>\s*$/i.exec(raw.trim());
  if (m) return { line1: htmlToText(m[1]), line2: htmlToText(m[2]) };
  return { line1: htmlToText(raw), line2: '' };
}

export function renderHeading (v) {
  const l1 = escapeHtml(String(v.line1 ?? '').trim());
  const l2 = String(v.line2 ?? '').trim();
  return l2 ? `${l1}<br><em>${escapeHtml(l2)}</em>` : l1;
}

/* ------------------------------------------------------------
   Text fields
   ------------------------------------------------------------ */

export function readTextField (html, field) {
  const raw = readPath(html, field.path);
  if (field.type === 'heading') return parseHeading(raw);
  return inlineToText(raw);
}

/** Are two field values the same as far as the editor is concerned? */
function sameValue (a, b) {
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    const x = typeof a === 'object' ? a : { line1: a, line2: '' };
    const y = typeof b === 'object' ? b : { line1: b, line2: '' };
    return String(x.line1 ?? '').trim() === String(y.line1 ?? '').trim()
        && String(x.line2 ?? '').trim() === String(y.line2 ?? '').trim();
  }
  return String(a).trim() === String(b).trim();
}

/** Deep value-equality for collection models. */
function sameList (a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function writeTextField (html, field, value) {
  // Nothing actually changed — leave the original bytes alone. This is
  // what makes "open the editor and save" a genuine no-op, and stops
  // entity spellings like &mdash; being rewritten for no reason.
  try {
    if (sameValue(readTextField(html, field), value)) return html;
  } catch { /* fall through and let the write report the real problem */ }

  let markup;
  if (field.type === 'heading') {
    const v = typeof value === 'object' && value !== null ? value : { line1: String(value), line2: '' };
    if (!String(v.line1 ?? '').trim()) throw new Error(`"${field.label}" cannot be empty.`);
    if (String(v.line1).length > field.max) throw new Error(`"${field.label}" line 1 is too long (max ${field.max}).`);
    if (String(v.line2 ?? '').length > field.max) throw new Error(`"${field.label}" line 2 is too long (max ${field.max}).`);
    markup = renderHeading(v);
  } else {
    const s = String(value ?? '').trim();
    if (!s) throw new Error(`"${field.label}" cannot be empty.`);
    if (s.length > field.max) throw new Error(`"${field.label}" is too long (max ${field.max} characters).`);
    if (field.type === 'line' && /\r?\n/.test(s)) throw new Error(`"${field.label}" must be a single line.`);
    markup = textToInline(s);
  }
  return replacePath(html, field.path, markup);
}

/** Read every text field, grouped by the file it lives in. */
export function readAllText (files) {
  const out = {};
  for (const f of TEXT_FIELDS) {
    const html = files[f.file];
    if (html == null) continue;
    try { out[f.id] = readTextField(html, f); }
    catch { out[f.id] = f.type === 'heading' ? { line1: '', line2: '' } : ''; }
  }
  return out;
}

/* ------------------------------------------------------------
   Collections — gallery tiles
   ------------------------------------------------------------ */

export function readGallery (html) {
  const grid = readPath(html, COLLECTIONS.gallery.container);
  return locateAll(grid, COLLECTIONS.gallery.item).map(m => {
    const outer = grid.slice(m.outerStart, m.outerEnd);
    return {
      category: m.attrs['data-cat'] || 'other',
      src: readAttrPath(outer, [{ tag: 'img' }], 'src') || '',
      alt: readAttrPath(outer, [{ tag: 'img' }], 'alt') || '',
      tag: htmlToText(readPath(outer, [{ cls: 'tile-tag' }])),
      title: htmlToText(readPath(outer, [{ cls: 'tile-title' }])),
    };
  });
}

export function writeGallery (html, items) {
  validateTiles(items, COLLECTIONS.gallery);
  try { if (sameList(readGallery(html), items)) return html; } catch { /* regenerate */ }
  return replacePath(html, COLLECTIONS.gallery.container, renderGalleryGrid(items));
}

/* ------------------------------------------------------------
   Collections — homepage bento tiles
   ------------------------------------------------------------ */

export function readBento (html) {
  const grid = readPath(html, COLLECTIONS.bento.container);
  return locateAll(grid, COLLECTIONS.bento.item).map(m => {
    const outer = grid.slice(m.outerStart, m.outerEnd);
    const cls = (m.attrs.class || '').split(/\s+/);
    return {
      size: cls.includes('gx-tile-hero') ? 'hero' : cls.includes('gx-tile-wide') ? 'wide' : 'normal',
      src: readAttrPath(outer, [{ tag: 'img' }], 'src') || '',
      alt: readAttrPath(outer, [{ tag: 'img' }], 'alt') || '',
      width: Number(readAttrPath(outer, [{ tag: 'img' }], 'width')) || 600,
      height: Number(readAttrPath(outer, [{ tag: 'img' }], 'height')) || 400,
      tag: htmlToText(readPath(outer, [{ cls: 'gx-tag' }])),
      title: htmlToText(readPath(outer, [{ cls: 'gx-tile-title' }])),
    };
  });
}

export function writeBento (html, items) {
  validateTiles(items, COLLECTIONS.bento);
  try { if (sameList(readBento(html), items)) return html; } catch { /* regenerate */ }
  return replacePath(html, COLLECTIONS.bento.container, renderBentoGrid(items));
}

function validateTiles (items, coll) {
  if (!Array.isArray(items)) throw new Error('Expected a list of photos.');
  if (items.length === 0) throw new Error('At least one photo is required.');
  if (items.length > coll.max) throw new Error(`Too many photos (max ${coll.max}).`);
  items.forEach((t, i) => {
    if (!t.src) throw new Error(`Photo ${i + 1} has no image.`);
    if (!String(t.title || '').trim()) throw new Error(`Photo ${i + 1} needs a title.`);
    if (!String(t.tag || '').trim()) throw new Error(`Photo ${i + 1} needs a category label.`);
    if (String(t.title).length > 90) throw new Error(`Photo ${i + 1} title is too long (max 90).`);
    if (String(t.alt || '').length > 200) throw new Error(`Photo ${i + 1} description is too long (max 200).`);
    if (!/^images\/[A-Za-z0-9._-]+$/.test(t.src)) throw new Error(`Photo ${i + 1} has an invalid image path.`);
  });
}

/* ------------------------------------------------------------
   Collections — before & after pairs
   ------------------------------------------------------------ */

export function readBeforeAfter (html) {
  const wrap = readPath(html, COLLECTIONS.beforeafter.container);
  return locateAll(wrap, COLLECTIONS.beforeafter.item).map(m => {
    const outer = wrap.slice(m.outerStart, m.outerEnd);
    let caption = '';
    try { caption = inlineToText(readPath(outer, [{ cls: 'ba-caption' }])); } catch { /* optional */ }
    return {
      tag: htmlToText(readPath(outer, [{ cls: 'ba-pair-tag' }])),
      title: htmlToText(readPath(outer, [{ cls: 'ba-pair-title' }])),
      before: readAttrPath(outer, [{ cls: 'ba-before' }], 'src') || '',
      beforeAlt: readAttrPath(outer, [{ cls: 'ba-before' }], 'alt') || '',
      after: readAttrPath(outer, [{ cls: 'ba-after' }], 'src') || '',
      afterAlt: readAttrPath(outer, [{ cls: 'ba-after' }], 'alt') || '',
      caption,
    };
  });
}

export function writeBeforeAfter (html, items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one before & after pair is required.');
  if (items.length > COLLECTIONS.beforeafter.max) throw new Error(`Too many pairs (max ${COLLECTIONS.beforeafter.max}).`);
  items.forEach((p, i) => {
    if (!p.before || !p.after) throw new Error(`Pair ${i + 1} needs both a before and an after photo.`);
    if (!String(p.title || '').trim()) throw new Error(`Pair ${i + 1} needs a title.`);
    if (!String(p.tag || '').trim()) throw new Error(`Pair ${i + 1} needs a room label.`);
    for (const k of ['before', 'after']) {
      if (!/^images\/[A-Za-z0-9._-]+$/.test(p[k])) throw new Error(`Pair ${i + 1} has an invalid ${k} image path.`);
    }
  });
  try { if (sameList(readBeforeAfter(html), items)) return html; } catch { /* regenerate */ }
  return replacePath(html, COLLECTIONS.beforeafter.container, renderBeforeAfterGallery(items));
}

/* ------------------------------------------------------------
   Collections — reviews

   Reviews are read from, and written to, the page itself. They used
   to live in a JavaScript array, which meant only the one visible on
   load was ever real text; the other five were invisible to anything
   that did not sit through the carousel. Now every review a person
   adds in the editor lands in the HTML.
   ------------------------------------------------------------ */

export function readReviews (html) {
  const wrap = readPath(html, COLLECTIONS.reviews.container);
  return locateAll(wrap, COLLECTIONS.reviews.item).map(m => {
    const outer = wrap.slice(m.outerStart, m.outerEnd);
    return {
      quote: htmlToText(readPath(outer, [{ cls: 'rv-quote' }])),
      initial: htmlToText(readPath(outer, [{ cls: 'rv-initial' }])),
      project: htmlToText(readPath(outer, [{ cls: 'rv-project' }])),
    };
  });
}

/** Write the reviews and keep the selector chips in step. */
export function writeReviews (html, items) {
  validateReviews(items);
  try { if (sameList(readReviews(html), items)) return html; } catch { /* regenerate */ }
  let out = replacePath(html, [{ cls: 'rv-quote-wrap' }], renderReviewSlides(items));
  out = replacePath(out, [{ cls: 'rv-chips' }], renderReviewChips(items));
  return out;
}

function validateReviews (items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one review is required.');
  if (items.length > COLLECTIONS.reviews.max) throw new Error(`Too many reviews (max ${COLLECTIONS.reviews.max}).`);
  items.forEach((r, i) => {
    if (!String(r.quote || '').trim()) throw new Error(`Review ${i + 1} has no text.`);
    if (String(r.quote).length > 600) throw new Error(`Review ${i + 1} is too long (max 600 characters).`);
    if (!String(r.project || '').trim()) throw new Error(`Review ${i + 1} needs a project label.`);
    if (String(r.project).length > 40) throw new Error(`Review ${i + 1} project label is too long (max 40).`);
    if (String(r.initial || '').trim().length !== 1) throw new Error(`Review ${i + 1} initial must be a single letter.`);
  });
}

/* ------------------------------------------------------------
   Service-area towns

   The visible list and the structured data are regenerated from one
   model, so what a visitor reads and what Google reads cannot drift
   apart — which was the whole point of listing towns at all.
   ------------------------------------------------------------ */

export function readTowns (html) {
  const list = readPath(html, COLLECTIONS.towns.container);
  return locateAll(list, COLLECTIONS.towns.item)
    .map(m => htmlToText(list.slice(m.innerStart, m.innerEnd)))
    .filter(Boolean);
}

export function writeTowns (html, towns) {
  validateTowns(towns);
  try { if (sameList(readTowns(html), towns)) return html; } catch { /* regenerate */ }
  return replacePath(html, COLLECTIONS.towns.container, renderTownList(towns));
}

function validateTowns (towns) {
  if (!Array.isArray(towns) || towns.length === 0) throw new Error('At least one town is required.');
  if (towns.length > COLLECTIONS.towns.max) throw new Error(`Too many towns (max ${COLLECTIONS.towns.max}).`);
  towns.forEach((t, i) => {
    const s = String(t || '').trim();
    if (!s) throw new Error(`Town ${i + 1} is blank.`);
    if (s.length > 40) throw new Error(`"${s.slice(0, 20)}…" is too long (max 40 characters).`);
    if (/[<>]/.test(s)) throw new Error(`"${s}" contains characters that are not allowed.`);
  });
  const seen = new Set();
  for (const t of towns) {
    const k = String(t).trim().toLowerCase();
    if (seen.has(k)) throw new Error(`"${t}" is listed twice.`);
    seen.add(k);
  }
}

/** Mirror the town list into the page's LocalBusiness areaServed. */
export function writeAreaServed (html, towns) {
  const sel = [{ tag: 'script', attrs: { type: 'application/ld+json' } }];
  let raw;
  try { raw = readPath(html, sel); } catch { return html; }   // page carries none

  let data;
  try { data = JSON.parse(raw); } catch { return html; }      // never mangle what we cannot parse

  const next = [
    { '@type': 'AdministrativeArea', name: 'Norfolk' },
    ...towns.map(t => ({ '@type': 'City', name: String(t).trim() })),
  ];
  if (JSON.stringify(data.areaServed) === JSON.stringify(next)) return html;

  data.areaServed = next;
  return replacePath(html, sel, '\n' + JSON.stringify(data, null, 2) + '\n');
}

/* ------------------------------------------------------------
   Contact details — replaced by exact value across every page.
   ------------------------------------------------------------ */

/** 07990 527683 -> { display, tel, wa } */
export function phoneForms (input) {
  const digits = String(input).replace(/[^\d+]/g, '');
  let national;
  if (digits.startsWith('+44')) national = '0' + digits.slice(3);
  else if (digits.startsWith('44')) national = '0' + digits.slice(2);
  else if (digits.startsWith('0')) national = digits;
  else throw new Error('Phone number must be a UK number, e.g. 07990 527683.');

  if (!/^0\d{9,10}$/.test(national)) throw new Error('That does not look like a valid UK phone number.');

  const intl = '+44' + national.slice(1);
  const display = national.length === 11
    ? `${national.slice(0, 5)} ${national.slice(5)}`
    : `${national.slice(0, 4)} ${national.slice(4)}`;

  return { display, tel: intl, wa: intl.replace('+', '') };
}

export function readContact (files) {
  const contact = files['contact.html'] || '';
  let phone = '', email = '';
  try {
    const href = readAttrPath(contact, [{ cls: 'ci-item', nth: 0 }, { tag: 'a' }], 'href') || '';
    phone = htmlToText(readPath(contact, [{ cls: 'ci-item', nth: 0 }, { tag: 'a' }])) || href.replace('tel:', '');
  } catch { /* leave blank */ }
  try {
    const href = readAttrPath(contact, [{ cls: 'ci-item', nth: 1 }, { tag: 'a' }], 'href') || '';
    email = href.replace('mailto:', '');
  } catch { /* leave blank */ }
  return { phone, email };
}

/**
 * Rewrite contact details across every page.
 * Uses exact-string replacement of the CURRENT values so no
 * unrelated text can be caught by accident.
 */
export function writeContact (files, current, next) {
  const out = { ...files };
  const edits = [];

  if (next.phone && next.phone !== current.phone) {
    const from = phoneForms(current.phone);
    const to = phoneForms(next.phone);
    edits.push([from.tel, to.tel], [from.wa, to.wa], [from.display, to.display]);
    // also catch the un-spaced national form if it appears
    edits.push([from.display.replace(/\s/g, ''), to.display.replace(/\s/g, '')]);
  }

  if (next.email && next.email !== current.email) {
    const e = String(next.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error('That does not look like a valid email address.');
    edits.push([current.email, e]);
  }

  if (edits.length === 0) return out;

  for (const file of EDITABLE_FILES) {
    if (out[file] == null) continue;
    let s = out[file];
    for (const [from, to] of edits) {
      if (!from || from === to) continue;
      s = s.split(from).join(to);
    }
    out[file] = s;
  }
  return out;
}

/* ------------------------------------------------------------
   Whole-model read
   ------------------------------------------------------------ */

export function readModel (files) {
  const model = { text: readAllText(files), contact: readContact(files) };

  try { model.gallery = readGallery(files['gallery.html']); } catch { model.gallery = []; }
  try { model.bento = readBento(files['index.html']); } catch { model.bento = []; }
  try { model.beforeafter = readBeforeAfter(files['gallery.html']); } catch { model.beforeafter = []; }
  try { model.reviews = readReviews(files['index.html']); } catch { model.reviews = []; }
  try { model.towns = readTowns(files['contact.html']); } catch { model.towns = []; }

  return model;
}

/**
 * Apply a batch of changes to the given files.
 * Returns { files, changed } where `changed` lists the files whose
 * bytes actually differ — unchanged files are never committed.
 */
export function applyChanges (files, changes) {
  let out = { ...files };

  if (changes.text) {
    for (const [id, value] of Object.entries(changes.text)) {
      const field = getTextField(id);
      if (!field) throw new Error(`Unknown field "${id}".`);
      if (out[field.file] == null) throw new Error(`Page ${field.file} is not loaded.`);
      out[field.file] = writeTextField(out[field.file], field, value);
    }
  }

  if (changes.contact) {
    out = writeContact(out, readContact(files), changes.contact);
  }

  if (changes.gallery) out['gallery.html'] = writeGallery(out['gallery.html'], changes.gallery);
  if (changes.bento) out['index.html'] = writeBento(out['index.html'], changes.bento);
  if (changes.beforeafter) out['gallery.html'] = writeBeforeAfter(out['gallery.html'], changes.beforeafter);

  if (changes.reviews) out['index.html'] = writeReviews(out['index.html'], changes.reviews);

  if (changes.towns) {
    out['contact.html'] = writeTowns(out['contact.html'], changes.towns);
    for (const f of SCHEMA_ORG_FILES) {
      if (out[f] != null) out[f] = writeAreaServed(out[f], changes.towns);
    }
  }

  const changed = Object.keys(out).filter(f => out[f] !== files[f]);
  return { files: out, changed };
}
