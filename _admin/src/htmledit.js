/* ============================================================
   htmledit.js — precise, dependency-free HTML region editing.

   This is the safety-critical core of the admin. Every edit the
   carpenter makes flows through here, so the guarantees matter:

     1. It NEVER reformats, re-indents or re-serialises the
        document. Bytes outside the targeted region are returned
        untouched, always.
     2. It locates regions with a real tag scanner — quotes,
        comments, <script>/<style> raw text and void elements are
        all handled — so it cannot mis-target a nested element.
     3. If a region cannot be located unambiguously it throws
        rather than guessing. A failed edit is always better than
        a corrupted page.

   Runs identically in Node (so it is unit-tested) and in a
   Cloudflare Worker (no platform APIs used).
   ============================================================ */

'use strict';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

/**
 * Walk every tag in a document, in order.
 * Skips comments, doctypes and the contents of raw-text elements,
 * and respects quoted attribute values so a ">" inside an
 * attribute never terminates a tag early.
 */
function* scanTags (html) {
  let i = 0;
  const lower = html.toLowerCase();

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) return;

    // <!-- comment -->
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    // <!doctype ...> / <![CDATA[...]]>
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    // <?xml ... ?>
    if (html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const isClosing = html[lt + 1] === '/';
    const nameStart = lt + (isClosing ? 2 : 1);
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(html.slice(nameStart, nameStart + 64));
    if (!nameMatch) { i = lt + 1; continue; }

    const name = nameMatch[0].toLowerCase();

    // Find the closing ">" of this tag, honouring quoted values.
    let j = nameStart + nameMatch[0].length;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    if (j >= html.length) return;          // unterminated tag — stop scanning

    const tagEnd = j + 1;                   // offset just past ">"
    const selfClosing = html[j - 1] === '/';

    yield {
      name,
      isClosing,
      selfClosing,
      start: lt,        // offset of "<"
      end: tagEnd,      // offset just past ">"
      source: html.slice(lt, tagEnd),
    };

    // Raw-text elements: jump straight to their closing tag so that
    // markup-looking text inside JS/CSS is never treated as tags.
    if (!isClosing && !selfClosing && RAW_TEXT_ELEMENTS.has(name)) {
      const close = lower.indexOf('</' + name, tagEnd);
      i = close === -1 ? html.length : close;
      continue;
    }

    i = tagEnd;
  }
}

/** Parse the attributes out of a single tag's source text. */
function parseAttrs (tagSource) {
  const attrs = {};
  // Strip "<name" and the trailing ">" / "/>"
  const inner = tagSource.replace(/^<\/?[a-zA-Z][a-zA-Z0-9:-]*/, '').replace(/\/?>$/, '');
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2]
              : m[3] !== undefined ? m[3]
              : m[4] !== undefined ? m[4]
              : '';
    attrs[key] = val;
  }
  return attrs;
}

function classList (attrs) {
  return (attrs.class || '').split(/\s+/).filter(Boolean);
}

/**
 * Does this open tag match the selector?
 * Selector shape: { tag?, id?, cls?, attrs? }
 */
function tagMatches (tag, sel) {
  if (tag.isClosing) return false;
  if (sel.tag && tag.name !== sel.tag.toLowerCase()) return false;

  const attrs = parseAttrs(tag.source);

  if (sel.id && attrs.id !== sel.id) return false;

  if (sel.cls) {
    const want = Array.isArray(sel.cls) ? sel.cls : [sel.cls];
    const have = classList(attrs);
    for (const c of want) if (!have.includes(c)) return false;
  }

  if (sel.attrs) {
    for (const [k, v] of Object.entries(sel.attrs)) {
      if (attrs[k.toLowerCase()] !== v) return false;
    }
  }

  return true;
}

/**
 * Find every element matching the selector.
 * Returns [{ innerStart, innerEnd, outerStart, outerEnd, tagName, attrs }]
 */
function locateAll (html, sel) {
  const results = [];
  const tags = [...scanTags(html)];

  for (let idx = 0; idx < tags.length; idx++) {
    const open = tags[idx];
    if (!tagMatches(open, sel)) continue;

    // Void / self-closing: no inner content.
    if (open.selfClosing || VOID_ELEMENTS.has(open.name)) {
      results.push({
        tagName: open.name,
        attrs: parseAttrs(open.source),
        outerStart: open.start,
        outerEnd: open.end,
        innerStart: open.end,
        innerEnd: open.end,
        void: true,
      });
      continue;
    }

    // Walk forward tracking depth of same-named tags.
    let depth = 1;
    let close = null;
    for (let k = idx + 1; k < tags.length; k++) {
      const t = tags[k];
      if (t.name !== open.name) continue;
      if (t.selfClosing || VOID_ELEMENTS.has(t.name)) continue;
      if (t.isClosing) {
        depth--;
        if (depth === 0) { close = t; break; }
      } else {
        depth++;
      }
    }
    if (!close) continue;   // unbalanced — skip rather than guess

    results.push({
      tagName: open.name,
      attrs: parseAttrs(open.source),
      outerStart: open.start,
      outerEnd: close.end,
      innerStart: open.end,
      innerEnd: close.start,
      void: false,
    });
  }

  return results;
}

function describeSelector (sel) {
  const bits = [];
  if (sel.tag) bits.push(sel.tag);
  if (sel.id) bits.push('#' + sel.id);
  if (sel.cls) bits.push('.' + (Array.isArray(sel.cls) ? sel.cls.join('.') : sel.cls));
  if (sel.attrs) for (const [k, v] of Object.entries(sel.attrs)) bits.push(`[${k}="${v}"]`);
  if (sel.nth != null) bits.push(`(nth=${sel.nth})`);
  return bits.join('') || '(empty selector)';
}

/** Locate exactly one element, or throw. */
function locateOne (html, sel) {
  const all = locateAll(html, sel);
  const nth = sel.nth == null ? 0 : sel.nth;

  if (all.length === 0) {
    throw new Error(`Could not find ${describeSelector(sel)} — the page may have changed.`);
  }
  if (sel.nth == null && all.length > 1) {
    throw new Error(
      `${describeSelector(sel)} matched ${all.length} elements; a specific "nth" is required to edit it safely.`
    );
  }
  if (!all[nth]) {
    throw new Error(`${describeSelector(sel)} has no match at position ${nth} (found ${all.length}).`);
  }
  return all[nth];
}

/** Read the inner HTML of the targeted element. */
function readInner (html, sel) {
  const r = locateOne(html, sel);
  return html.slice(r.innerStart, r.innerEnd);
}

/** Replace the inner HTML of the targeted element. Everything else is byte-identical. */
function replaceInner (html, sel, newInner) {
  const r = locateOne(html, sel);
  if (r.void) throw new Error(`${describeSelector(sel)} is a void element and has no inner content.`);
  return html.slice(0, r.innerStart) + newInner + html.slice(r.innerEnd);
}

/** Replace the entire element, opening and closing tags included. */
function replaceOuter (html, sel, newOuter) {
  const r = locateOne(html, sel);
  return html.slice(0, r.outerStart) + newOuter + html.slice(r.outerEnd);
}

/** Read a single attribute value off the targeted element. */
function readAttr (html, sel, attr) {
  const r = locateOne(html, sel);
  return r.attrs[attr.toLowerCase()] ?? null;
}

/**
 * Set an attribute on the targeted element, rewriting only that
 * attribute's value in place where it already exists.
 */
function setAttr (html, sel, attr, value) {
  const r = locateOne(html, sel);
  const openEnd = r.void ? r.outerEnd : r.innerStart;
  const openTag = html.slice(r.outerStart, openEnd);
  const key = attr.toLowerCase();

  const re = new RegExp(`(\\s${key}\\s*=\\s*)(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i');
  let newOpen;

  if (re.test(openTag)) {
    newOpen = openTag.replace(re, (_m, lead) => `${lead}"${escapeAttr(value)}"`);
  } else {
    // Insert before the closing ">" (or "/>")
    newOpen = openTag.replace(/(\s*\/?>)$/, ` ${key}="${escapeAttr(value)}"$1`);
  }

  return html.slice(0, r.outerStart) + newOpen + html.slice(openEnd);
}

/* ---------- scoped paths ----------
   A path is an array of selectors, each resolved INSIDE the
   previous match. This lets the schema say "the <h3> inside the
   3rd .svc-card" without needing a real CSS engine, and keeps
   every lookup unambiguous.
   ------------------------------------------------------------ */

function locatePath (html, path) {
  const sels = Array.isArray(path) ? path : [path];
  if (sels.length === 0) throw new Error('Empty selector path.');

  let base = 0;
  let scope = html;
  let region = null;

  for (const sel of sels) {
    const r = locateOne(scope, sel);
    region = {
      tagName: r.tagName,
      attrs: r.attrs,
      void: r.void,
      outerStart: base + r.outerStart,
      outerEnd: base + r.outerEnd,
      innerStart: base + r.innerStart,
      innerEnd: base + r.innerEnd,
    };
    base = region.innerStart;
    scope = html.slice(region.innerStart, region.innerEnd);
  }

  return region;
}

function readPath (html, path) {
  const r = locatePath(html, path);
  return html.slice(r.innerStart, r.innerEnd);
}

function replacePath (html, path, newInner) {
  const r = locatePath(html, path);
  if (r.void) throw new Error('Target is a void element and has no inner content.');
  return html.slice(0, r.innerStart) + newInner + html.slice(r.innerEnd);
}

function readAttrPath (html, path, attr) {
  const r = locatePath(html, path);
  return r.attrs[attr.toLowerCase()] ?? null;
}

function setAttrPath (html, path, attr, value) {
  const r = locatePath(html, path);
  const openEnd = r.void ? r.outerEnd : r.innerStart;
  const openTag = html.slice(r.outerStart, openEnd);
  const key = attr.toLowerCase();

  const re = new RegExp(`(\\s${key}\\s*=\\s*)(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i');
  const newOpen = re.test(openTag)
    ? openTag.replace(re, (_m, lead) => `${lead}"${escapeAttr(value)}"`)
    : openTag.replace(/(\s*\/?>)$/, ` ${key}="${escapeAttr(value)}"$1`);

  return html.slice(0, r.outerStart) + newOpen + html.slice(openEnd);
}

/* ---------- text helpers ---------- */

function escapeHtml (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', middot: '·',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  amp_: '&',
};

/** Turn stored markup into the plain text the editor shows. */
function htmlToText (html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
    })
    .trim();
}

/** Turn editor text back into markup, preserving intentional line breaks. */
function textToHtml (text) {
  return escapeHtml(String(text).trim()).replace(/\r?\n/g, '<br>');
}

/* ---------- inline emphasis ----------
   The site uses <b> inside a couple of captions. Rather than
   show raw markup to a non-technical editor — or silently strip
   it — bold is surfaced as **double asterisks**, the convention
   people already know from messaging apps.
   ------------------------------------------------------------ */

/** Markup -> editor text, turning <b>/<strong> into **bold**. */
function inlineToText (html) {
  const withMarkers = String(html)
    .replace(/<(?:b|strong)\b[^>]*>/gi, ' ')
    .replace(/<\/(?:b|strong)>/gi, ' ');
  return htmlToText(withMarkers).replace(/ /g, '**');
}

/** Editor text -> markup, turning **bold** back into <b>. */
function textToInline (text) {
  const escaped = textToHtml(text);
  let i = 0;
  return escaped.replace(/\*\*/g, () => (i++ % 2 === 0 ? '<b>' : '</b>'))
    // An unpaired marker would leave a dangling tag — put it back as text.
    .replace(/<b>(?![\s\S]*<\/b>)/g, '**');
}

export {
  scanTags,
  parseAttrs,
  classList,
  locateAll,
  locateOne,
  locatePath,
  readPath,
  replacePath,
  readAttrPath,
  setAttrPath,
  readInner,
  replaceInner,
  replaceOuter,
  readAttr,
  setAttr,
  escapeHtml,
  escapeAttr,
  htmlToText,
  textToHtml,
  inlineToText,
  textToInline,
  describeSelector,
  VOID_ELEMENTS,
};
