/* ============================================================
   credit.js — the "Made by jplanewebsites" footer credit.

   The credit is part of the site template, not the content. The
   editor's content model (schema.js) has no field for it, and every
   publish runs pages through ensureCredit(), so nothing saved from
   the editor can remove or change it.
   ============================================================ */

'use strict';

export const CREDIT_URL = 'https://jplanewebsites.co.uk';
export const CREDIT_HTML =
  '<div class="jp-credit" data-site-credit><a href="https://jplanewebsites.co.uk" target="_blank" rel="noopener">Made by jplanewebsites</a></div>';

const ANY_CREDIT = /[ \t]*<div class="jp-credit"[^>]*>[\s\S]*?<\/div>\n?/g;

/** True when the page carries the exact, unaltered credit. */
export function hasCredit (html) {
  return typeof html === 'string' && html.split(CREDIT_HTML).length === 2;
}

/**
 * Return the page with exactly one, unaltered credit as the last thing
 * inside the footer (or before </body> if a page has no footer).
 * Idempotent: a page that is already correct comes back unchanged.
 */
export function ensureCredit (html) {
  if (typeof html !== 'string' || !/<\/body>/i.test(html)) return html;
  if (hasCredit(html)) return html;
  let out = html.replace(ANY_CREDIT, '');
  const at = out.lastIndexOf('</footer>');
  if (at !== -1) return out.slice(0, at) + '  ' + CREDIT_HTML + '\n' + out.slice(at);
  return out.replace(/<\/body>/i, CREDIT_HTML + '\n</body>');
}
