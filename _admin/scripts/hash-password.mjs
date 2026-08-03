/* Turns a password into the hash + salt to store as Worker secrets.
   Usage:  node scripts/hash-password.mjs "your chosen password"      */

import { hashPassword } from '../src/auth.js';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const pw = process.argv[2];
if (!pw) {
  console.error('\n  Usage: node scripts/hash-password.mjs "your chosen password"\n');
  process.exit(1);
}
if (pw.length < 12) {
  console.error('\n  Please choose a password of at least 12 characters.\n');
  process.exit(1);
}

const { hash, salt } = await hashPassword(pw);
const session = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64url');

console.log(`
  Run these four commands, pasting the value when prompted:

    npx wrangler secret put ADMIN_PASSWORD_HASH
      ${hash}

    npx wrangler secret put ADMIN_PASSWORD_SALT
      ${salt}

    npx wrangler secret put SESSION_SECRET
      ${session}

    npx wrangler secret put GITHUB_TOKEN
      (your GitHub fine-grained token)
`);
