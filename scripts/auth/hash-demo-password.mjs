#!/usr/bin/env node
// scripts/auth/hash-demo-password.mjs — PS-60 (Batch 343)
// Prints the stored form of a demo-account password for
// src/services/auth/demo/demoAccounts.ts: PBKDF2-SHA256, 600,000
// iterations (OWASP's current figure), a fresh random 16-byte salt.
//
//   node scripts/auth/hash-demo-password.mjs
//     (prompts for the password without echoing it)
//
// The password never goes into the source. Paste the printed
// `password: {…}` into the account's entry.

import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

export const ITERATIONS = 600_000;

export function hashDemoPassword(password, salt = randomBytes(16), iterations = ITERATIONS) {
  const hash = pbkdf2Sync(password.trim(), salt, iterations, 32, 'sha256');
  return { iterations, salt: salt.toString('base64'), hash: hash.toString('base64') };
}

async function promptHidden(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); };
  const answer = await new Promise(resolve => rl.question(question, resolve));
  rl.close();
  process.stdout.write('\n');
  return answer;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const password = process.stdin.isTTY ? await promptHidden('Password: ') : (await new Promise(r => { let d = ''; process.stdin.on('data', c => { d += c; }).on('end', () => r(d)); })).replace(/\r?\n$/, '');
  if (!password.trim()) { console.error('No password given.'); process.exit(1); }
  const h = hashDemoPassword(password);
  console.log(`password: { iterations: ${h.iterations}, salt: '${h.salt}', hash: '${h.hash}' },`);
}
