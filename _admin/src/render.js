/* ============================================================
   render.js — turns the editable model back into site markup.

   These generators must reproduce the site's existing markup
   exactly, including class order and indentation, so that an
   edit which changes nothing produces a byte-identical file.
   The round-trip tests enforce that.
   ============================================================ */

'use strict';

import { escapeHtml, escapeAttr, textToInline } from './htmledit.js';

/* ---------- Gallery page tiles ---------- */

export function renderGalleryTile (t) {
  return '<div class="tile" data-cat="' + escapeAttr(t.category) + '">' +
    '<img src="' + escapeAttr(t.src) + '" alt="' + escapeAttr(t.alt) + '" ' +
    'loading="lazy" width="600" height="270">' +
    '<div class="tile-label">' +
      '<span class="tile-tag">' + escapeHtml(t.tag) + '</span>' +
      '<span class="tile-title">' + escapeHtml(t.title) + '</span>' +
    '</div>' +
  '</div>';
}

export function renderGalleryGrid (items) {
  return '\n      ' + items.map(renderGalleryTile).join('\n      ') + '\n    ';
}

/* ---------- Home page bento tiles ---------- */

const BENTO_CLASS = { hero: ' gx-tile-hero', wide: ' gx-tile-wide', normal: '' };

export function renderBentoTile (t) {
  const size = BENTO_CLASS[t.size] ?? '';
  const w = t.width || 600;
  const h = t.height || 400;
  return '<a class="gx-tile' + size + '" href="gallery.html">\n' +
    '  <img src="' + escapeAttr(t.src) + '" alt="' + escapeAttr(t.alt) + '" ' +
    'loading="lazy" width="' + w + '" height="' + h + '">\n' +
    '  <div class="gx-label">\n' +
    '    <span class="gx-tag">' + escapeHtml(t.tag) + '</span>\n' +
    '    <span class="gx-tile-title">' + escapeHtml(t.title) + '</span>\n' +
    '  </div>\n' +
    '</a>';
}

export function renderBentoGrid (items) {
  return '\n' + items.map(renderBentoTile).join('\n') + '\n    ';
}

/* ---------- Before & After pairs ---------- */

const BA_HANDLE =
  '<div class="ba-handle" role="slider" tabindex="0"\n' +
  '                 aria-label="Drag to compare before and after"\n' +
  '                 aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">\n' +
  '              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">\n' +
  '                <path d="M8 11L3 6M8 11L3 16M14 11L19 6M14 11L19 16" stroke="#0a0806" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n' +
  '              </svg>\n' +
  '            </div>';

export function renderBeforeAfterPair (p) {
  const lqip = s => s.replace(/\.(jpg|jpeg|png|webp)$/i, '-lqip.jpg');
  return '<div class="ba-pair reveal">\n' +
    '        <div class="ba-pair-head">\n' +
    '          <span class="ba-pair-tag">' + escapeHtml(p.tag) + '</span>\n' +
    '          <h3 class="ba-pair-title">' + escapeHtml(p.title) + '</h3>\n' +
    '        </div>\n' +
    '        <div class="ba-slider" style="background-image:url(\'' + escapeAttr(lqip(p.before)) + '\')">\n' +
    '          <img class="ba-before" src="' + escapeAttr(p.before) + '"\n' +
    '               alt="' + escapeAttr(p.beforeAlt) + '"\n' +
    '               draggable="false" loading="lazy" decoding="async" width="1080" height="1440">\n' +
    '          <div class="ba-after-wrap" style="background-image:url(\'' + escapeAttr(lqip(p.after)) + '\')">\n' +
    '            <img class="ba-after" src="' + escapeAttr(p.after) + '"\n' +
    '                 alt="' + escapeAttr(p.afterAlt) + '"\n' +
    '                 draggable="false" loading="lazy" decoding="async" width="1080" height="1440">\n' +
    '          </div>\n' +
    '          <div class="ba-divider">\n' +
    '            ' + BA_HANDLE + '\n' +
    '          </div>\n' +
    '          <span class="ba-label ba-label-before" aria-hidden="true">Before</span>\n' +
    '          <span class="ba-label ba-label-after" aria-hidden="true">After</span>\n' +
    '        </div>\n' +
    (p.caption ? '        <p class="ba-caption">' + textToInline(p.caption) + '</p>\n' : '') +
    '      </div>';
}

export function renderBeforeAfterGallery (items) {
  return '\n\n      ' + items.map(renderBeforeAfterPair).join('\n\n      ') + '\n\n    ';
}

/* ---------- Reviews ---------- */

/** JS string literal with non-ASCII escaped, matching the file's existing style. */
function jsString (s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
    else if (c > 0x7e) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += ch;
  }
  return '"' + out + '"';
}

export function renderReviewsArray (items) {
  const rows = items.map(r =>
    '    { quote: ' + jsString(r.quote) + ',\n' +
    '      project: ' + jsString(r.project) + ', initial: ' + jsString(r.initial) + ' },'
  ).join('\n');
  return '\n  var reviews = [\n' + rows + '\n  ];\n  ';
}

export function renderReviewChips (items) {
  const rows = items.map((r, i) =>
    '      <button class="rv-chip' + (i === 0 ? ' is-active' : '') + '" type="button" data-i="' + i + '">' +
    '<span class="rv-chip-num">' + String(i + 1).padStart(2, '0') + '</span>' +
    '<span class="rv-chip-label">' + escapeHtml(r.project) + '</span></button>'
  ).join('\n');
  return '\n' + rows + '\n  ';
}

export function renderReviewQuote (first) {
  return '\n' +
    '    <span class="rv-quote-mark" aria-hidden="true">"</span>\n' +
    '    <blockquote class="rv-quote">' + escapeHtml(first.quote) + '</blockquote>\n' +
    '    <footer class="rv-meta">\n' +
    '      <span class="rv-initial">' + escapeHtml(first.initial) + '</span>\n' +
    '      <span class="rv-project">' + escapeHtml(first.project) + '</span>\n' +
    '    </footer>\n' +
    '  ';
}
