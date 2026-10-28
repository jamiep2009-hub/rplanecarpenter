/* The footer credit must be on every page and survive any edit. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDIT_HTML, hasCredit, ensureCredit } from '../credit.js';
import { applyChanges, readModel } from '../content.js';
import { TEXT_FIELDS, EDITABLE_FILES } from '../schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  FAIL', name); } };

const PAGES = ['index.html','about.html','services.html','gallery.html','contact.html','privacy-policy.html'];
const files = Object.fromEntries(EDITABLE_FILES.map(f => [f, readFileSync(join(SITE, f), 'utf8')]));

for (const p of PAGES) {
  const html = readFileSync(join(SITE, p), 'utf8');
  ok(`${p}: carries the credit exactly once`, hasCredit(html));
  ok(`${p}: credit is the last thing in the footer`, /jplanewebsites<\/a><\/div>\s*<\/footer>/.test(html));
  ok(`${p}: credit links to jplanewebsites.co.uk`, html.includes('href="https://jplanewebsites.co.uk"'));
  ok(`${p}: ensureCredit leaves a correct page alone`, ensureCredit(html) === html);
}

ok('css: credit is styled', /\.jp-credit\{/.test(readFileSync(join(SITE, 'style.css'), 'utf8')));
ok('schema: no field touches the credit or footer-bottom',
  !JSON.stringify(TEXT_FIELDS).match(/jp-credit|footer-bottom|jplanewebsites/));

const page = files['about.html'];
const stripped = page.replace(CREDIT_HTML, '');
ok('ensureCredit restores a removed credit', hasCredit(ensureCredit(stripped)));
const tampered = page.replace('Made by jplanewebsites', 'Made by someone else');
ok('ensureCredit repairs an altered credit', hasCredit(ensureCredit(tampered)) && !ensureCredit(tampered).includes('someone else'));
const doubled = page.replace('</footer>', CREDIT_HTML + '\n</footer>');
ok('ensureCredit collapses duplicates', hasCredit(ensureCredit(doubled)));
ok('ensureCredit falls back to </body> without a footer',
  hasCredit(ensureCredit('<html><body><p>x</p></body></html>')));
ok('ensureCredit ignores fragments', ensureCredit('<p>x</p>') === '<p>x</p>');

// A real edit through the content model keeps the credit, even when the
// starting page had lost it.
const model = readModel(files);
const field = TEXT_FIELDS.find(f => f.file === 'index.html' && f.type === 'line');
const start = { ...files, 'index.html': files['index.html'].replace(CREDIT_HTML, '') };
const res = applyChanges(start, { text: { [field.id]: 'A brand new line of words' } });
ok('applyChanges: edited page still has the credit', hasCredit(res.files['index.html']));
ok('applyChanges: edit applied', res.files['index.html'].includes('A brand new line of words'));
const towns = applyChanges(files, { towns: model.towns });
ok('applyChanges: no-op edit changes nothing', towns.changed.length === 0);

console.log(`\n  credit: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
