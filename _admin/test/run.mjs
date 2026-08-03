/* Runs every test suite and fails the build if any of them fail. */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const suites = ['htmledit.test.mjs', 'content.test.mjs', 'auth.test.mjs', 'safety.test.mjs'];

let failed = 0;
for (const s of suites) {
  const res = spawnSync(process.execPath, [join(HERE, s)], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

if (failed) {
  console.log(`\n  ${failed} suite(s) failed.\n`);
  process.exit(1);
}
console.log('  All suites passed.\n');
