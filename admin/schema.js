/* ============================================================
   schema.js — everything the admin is allowed to touch.

   This file is the contract. If a field is not described here,
   the admin has no way to change it, which is what keeps the
   blast radius of the editor small and predictable.

   Adding a new editable field is a matter of adding an entry
   here — no changes to the Worker or the front end.
   ============================================================ */

'use strict';

/** Pages the admin may read and write. Anything else is refused. */
export const EDITABLE_FILES = [
  'index.html',
  'about.html',
  'services.html',
  'gallery.html',
  'contact.html',
  'privacy-policy.html',
];

/** Directory new photos are committed into. */
export const IMAGE_DIR = 'images';

/* ------------------------------------------------------------
   Text fields
   type:
     line    — one line of plain text
     para    — a paragraph; blank lines are not allowed, <br> is
     heading — two-part headline: "line one" + italic "line two"
   ------------------------------------------------------------ */

export const TEXT_FIELDS = [
  /* ---------- Home page ---------- */
  { id: 'home.hero.eyebrow', file: 'index.html', group: 'Home page', label: 'Small line above the headline',
    path: [{ cls: 'hero-eyebrow' }], type: 'line', max: 80 },
  { id: 'home.hero.title', file: 'index.html', group: 'Home page', label: 'Main headline',
    path: [{ cls: 'hero-h1' }], type: 'heading', max: 60 },
  { id: 'home.hero.sub', file: 'index.html', group: 'Home page', label: 'Intro paragraph',
    path: [{ cls: 'hero-sub' }], type: 'para', max: 320 },

  { id: 'home.services.eyebrow', file: 'index.html', group: 'Home page', label: 'Services — small line',
    path: [{ cls: 'section-head', nth: 0 }, { cls: 'eyebrow' }], type: 'line', max: 60 },
  { id: 'home.services.title', file: 'index.html', group: 'Home page', label: 'Services — heading',
    path: [{ cls: 'section-h', nth: 0 }], type: 'heading', max: 60 },
  { id: 'home.services.lead', file: 'index.html', group: 'Home page', label: 'Services — intro',
    path: [{ cls: 'lead', nth: 0 }], type: 'para', max: 320 },

  { id: 'home.ba.eyebrow', file: 'index.html', group: 'Home page', label: 'Before & After — small line',
    path: [{ cls: 'section-head', nth: 1 }, { cls: 'eyebrow' }], type: 'line', max: 60 },
  { id: 'home.ba.title', file: 'index.html', group: 'Home page', label: 'Before & After — heading',
    path: [{ cls: 'section-h', nth: 1 }], type: 'heading', max: 60 },
  { id: 'home.ba.lead', file: 'index.html', group: 'Home page', label: 'Before & After — intro',
    path: [{ cls: 'lead', nth: 1 }], type: 'para', max: 240 },
  { id: 'home.ba.caption', file: 'index.html', group: 'Home page', label: 'Before & After — caption',
    path: [{ cls: 'ba-caption' }], type: 'para', max: 200 },

  { id: 'home.work.eyebrow', file: 'index.html', group: 'Home page', label: 'Featured work — small line',
    path: [{ cls: 'gx-eyebrow' }], type: 'line', max: 60 },
  { id: 'home.work.title', file: 'index.html', group: 'Home page', label: 'Featured work — heading',
    path: [{ cls: 'gx-title' }], type: 'heading', max: 60 },

  { id: 'home.reviews.score', file: 'index.html', group: 'Home page', label: 'Reviews — line under the stars',
    path: [{ cls: 'rv-score-label' }], type: 'line', max: 120 },

  /* ---------- Home page service cards ---------- */
  ...[0, 1, 2, 3].flatMap(i => ([
    { id: `home.svc.${i}.title`, file: 'index.html', group: 'Home page — service cards',
      label: `Card ${i + 1} — title`,
      path: [{ cls: 'svc-card', nth: i }, { tag: 'h3' }], type: 'line', max: 48 },
    { id: `home.svc.${i}.body`, file: 'index.html', group: 'Home page — service cards',
      label: `Card ${i + 1} — description`,
      path: [{ cls: 'svc-card', nth: i }, { tag: 'p' }], type: 'para', max: 300 },
  ])),

  /* ---------- About page ---------- */
  { id: 'about.hero.title', file: 'about.html', group: 'About page', label: 'Page headline',
    path: [{ cls: 'page-hero-h' }], type: 'heading', max: 60 },
  { id: 'about.hero.sub', file: 'about.html', group: 'About page', label: 'Page intro',
    path: [{ cls: 'page-hero-sub' }], type: 'para', max: 300 },
  { id: 'about.body.title', file: 'about.html', group: 'About page', label: 'Section heading',
    path: [{ cls: 'about-grid' }, { tag: 'h2' }], type: 'line', max: 120 },
  { id: 'about.body.p1', file: 'about.html', group: 'About page', label: 'Paragraph 1',
    path: [{ cls: 'reveal-left' }, { tag: 'p', nth: 0 }], type: 'para', max: 600 },
  { id: 'about.body.p2', file: 'about.html', group: 'About page', label: 'Paragraph 2',
    path: [{ cls: 'reveal-left' }, { tag: 'p', nth: 1 }], type: 'para', max: 600 },
  { id: 'about.body.p3', file: 'about.html', group: 'About page', label: 'Paragraph 3',
    path: [{ cls: 'reveal-left' }, { tag: 'p', nth: 2 }], type: 'para', max: 600 },
  { id: 'about.quote', file: 'about.html', group: 'About page', label: 'Pull quote',
    path: [{ cls: 'about-quote' }], type: 'para', max: 300 },

  { id: 'about.van.eyebrow', file: 'about.html', group: 'About page — van panel', label: 'Small line',
    path: [{ cls: 'vsh-eyebrow' }], type: 'line', max: 60 },
  { id: 'about.van.title', file: 'about.html', group: 'About page — van panel', label: 'Headline',
    path: [{ cls: 'vsh-title' }], type: 'heading', max: 40 },
  { id: 'about.van.sub', file: 'about.html', group: 'About page — van panel', label: 'Sub-line',
    path: [{ cls: 'vsh-sub' }], type: 'line', max: 60 },

  /* ---------- Services page ---------- */
  { id: 'services.hero.title', file: 'services.html', group: 'Services page', label: 'Page headline',
    path: [{ cls: 'page-hero-h' }], type: 'heading', max: 60 },
  { id: 'services.hero.sub', file: 'services.html', group: 'Services page', label: 'Page intro',
    path: [{ cls: 'page-hero-sub' }], type: 'para', max: 300 },
  ...[0, 1, 2, 3].flatMap(i => ([
    { id: `services.card.${i}.title`, file: 'services.html', group: 'Services page — cards',
      label: `Card ${i + 1} — title`,
      path: [{ cls: 'svc-card', nth: i }, { tag: 'h3' }], type: 'line', max: 48 },
    { id: `services.card.${i}.body`, file: 'services.html', group: 'Services page — cards',
      label: `Card ${i + 1} — description`,
      path: [{ cls: 'svc-card', nth: i }, { tag: 'p' }], type: 'para', max: 300 },
  ])),

  /* ---------- Gallery page ---------- */
  { id: 'gallery.hero.title', file: 'gallery.html', group: 'Gallery page', label: 'Page headline',
    path: [{ cls: 'page-hero-h' }], type: 'heading', max: 60 },
  { id: 'gallery.hero.sub', file: 'gallery.html', group: 'Gallery page', label: 'Page intro',
    path: [{ cls: 'page-hero-sub' }], type: 'para', max: 300 },
  { id: 'gallery.ba.title', file: 'gallery.html', group: 'Gallery page', label: 'Before & After — heading',
    path: [{ cls: 'section-h' }], type: 'heading', max: 60 },
  { id: 'gallery.ba.lead', file: 'gallery.html', group: 'Gallery page', label: 'Before & After — intro',
    path: [{ cls: 'lead' }], type: 'para', max: 240 },

  /* ---------- Contact page ---------- */
  { id: 'contact.hero.title', file: 'contact.html', group: 'Contact page', label: 'Page headline',
    path: [{ cls: 'page-hero-h' }], type: 'heading', max: 60 },
  { id: 'contact.hero.sub', file: 'contact.html', group: 'Contact page', label: 'Page intro',
    path: [{ cls: 'page-hero-sub' }], type: 'para', max: 300 },
  { id: 'contact.intro', file: 'contact.html', group: 'Contact page', label: 'Intro above the details',
    path: [{ cls: 'contact-intro' }], type: 'para', max: 320 },
  { id: 'contact.hours', file: 'contact.html', group: 'Contact page', label: 'Opening hours',
    path: [{ cls: 'ci-item', nth: 3 }, { cls: 'ci-text' }, { tag: 'span' }], type: 'line', max: 60 },
  { id: 'contact.location', file: 'contact.html', group: 'Contact page', label: 'Location',
    path: [{ cls: 'ci-item', nth: 2 }, { cls: 'ci-text' }, { tag: 'span' }], type: 'line', max: 60 },

  /* ---------- Service area map ---------- */
  { id: 'areas.eyebrow', file: 'contact.html', group: 'Areas covered', label: 'Small line',
    path: [{ cls: 'mp-eyebrow' }], type: 'line', max: 60 },
  { id: 'areas.title', file: 'contact.html', group: 'Areas covered', label: 'Heading',
    path: [{ cls: 'mp-title' }], type: 'heading', max: 60 },
  { id: 'areas.lead', file: 'contact.html', group: 'Areas covered', label: 'Intro',
    path: [{ cls: 'mp-lead' }], type: 'para', max: 320 },
  { id: 'areas.note', file: 'contact.html', group: 'Areas covered', label: 'Line under the town list',
    path: [{ cls: 'mp-note' }], type: 'para', max: 160 },
];

/* ------------------------------------------------------------
   Contact details — these appear in many places across every
   page, so they are edited by exact value replacement rather
   than by selector. Changing the phone number rewrites the
   tel: link, the printed number and the WhatsApp link together.
   ------------------------------------------------------------ */

export const CONTACT_FIELDS = [
  { id: 'phone', label: 'Phone number', kind: 'phone', hint: 'UK mobile, e.g. 07990 527683' },
  { id: 'email', label: 'Email address', kind: 'email', hint: 'Where enquiries are sent' },
];

/* ------------------------------------------------------------
   Collections — repeating blocks regenerated from a model.
   Each has a container the admin owns entirely; nothing outside
   the container is ever rewritten.
   ------------------------------------------------------------ */

export const GALLERY_CATEGORIES = [
  { value: 'kitchen',  label: 'Kitchens' },
  { value: 'wardrobe', label: 'Wardrobes & Storage' },
  { value: 'joinery',  label: 'Joinery & Shelving' },
  { value: 'other',    label: 'Other Projects' },
];

export const BENTO_SIZES = [
  { value: 'hero',   label: 'Large (2×2)' },
  { value: 'wide',   label: 'Wide (2×1)' },
  { value: 'normal', label: 'Standard' },
];

export const COLLECTIONS = {
  gallery: {
    label: 'Gallery photos',
    file: 'gallery.html',
    container: [{ id: 'tileGrid' }],
    item: { cls: 'tile' },
    max: 60,
  },
  bento: {
    label: 'Homepage featured photos',
    file: 'index.html',
    container: [{ cls: 'gx-grid' }],
    item: { cls: 'gx-tile' },
    max: 12,
  },
  beforeafter: {
    label: 'Before & After',
    file: 'gallery.html',
    container: [{ cls: 'ba-gallery' }],
    item: { cls: 'ba-pair' },
    max: 12,
  },
  reviews: {
    label: 'Reviews',
    file: 'index.html',
    container: [{ cls: 'rv-quote-wrap' }],
    item: { cls: 'rv-slide' },
    max: 20,
  },
  towns: {
    label: 'Towns covered',
    file: 'contact.html',
    container: [{ cls: 'mp-list' }],
    item: { tag: 'li' },
    max: 40,
  },
};

/**
 * Pages carrying LocalBusiness structured data. The town list is
 * mirrored into `areaServed` on each, so what Google reads can never
 * drift from what the page says.
 */
export const SCHEMA_ORG_FILES = ['index.html', 'contact.html'];

/** Look up a text field definition by id. */
export function getTextField (id) {
  return TEXT_FIELDS.find(f => f.id === id) || null;
}

/** Group text fields for display, preserving declaration order. */
export function groupedTextFields () {
  const groups = [];
  const byName = new Map();
  for (const f of TEXT_FIELDS) {
    if (!byName.has(f.group)) {
      const g = { name: f.group, fields: [] };
      byName.set(f.group, g);
      groups.push(g);
    }
    byName.get(f.group).fields.push(f);
  }
  return groups;
}
