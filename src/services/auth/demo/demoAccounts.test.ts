// @vitest-environment node
// src/services/auth/demo/demoAccounts.test.ts — PS-60 (Batch 343)
import { describe, it, expect } from 'vitest';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEMO_ACCOUNTS, verifyDemoCredentials, type DemoAccount } from './demoAccounts';
import { verifyPasswordHash } from './passwordHash';
import { hashDemoPassword } from '../../../../scripts/auth/hash-demo-password.mjs';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const bytes = (b64: string) => Buffer.from(b64, 'base64').length;

const account = (email: string, password: string, iterations = 1_000): DemoAccount => {
  const salt = randomBytes(16);
  return {
    email, id: 'T-1', name: 'Test', role: 'pathologist', initials: 'TT', voiceProfile: 'EN-US',
    password: { iterations, salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64') },
  };
};

describe('demo accounts (hashed, PS-60)', () => {
  it('every account stores a PBKDF2 hash: 600,000 iterations, 16-byte salt, 32-byte hash, salts all different', () => {
    expect(DEMO_ACCOUNTS.length).toBeGreaterThan(0);
    for (const a of DEMO_ACCOUNTS) {
      expect(a.password.iterations).toBeGreaterThanOrEqual(600_000);
      expect(bytes(a.password.salt)).toBe(16);
      expect(bytes(a.password.hash)).toBe(32);
    }
    expect(new Set(DEMO_ACCOUNTS.map(a => a.password.salt)).size).toBe(DEMO_ACCOUNTS.length);
  });

  it('no password is written in plain text in the sign-in code any more', () => {
    for (const rel of ['contexts/AuthContext.tsx', 'services/auth/demo/demoAccounts.ts', 'services/auth/authSession.ts']) {
      const text = readFileSync(resolve(SRC, rel), 'utf8');
      expect(text, rel).not.toMatch(/password\s*:\s*["'`]/);
    }
  });

  it('checks email (any case, spaces trimmed) and password (trimmed); anything else is refused', async () => {
    const list = [account('lab@example.org', 'Correct-Horse-9')];
    expect((await verifyDemoCredentials(' LAB@example.org ', ' Correct-Horse-9 ', list))?.id).toBe('T-1');
    expect(await verifyDemoCredentials('lab@example.org', 'correct-horse-9', list)).toBeNull();
    expect(await verifyDemoCredentials('nobody@example.org', 'Correct-Horse-9', list)).toBeNull();
    expect(await verifyDemoCredentials('lab@example.org', '', list)).toBeNull();
  });

  it('a hash made by the script (Node) verifies with Web Crypto (the browser)', async () => {
    const stored = hashDemoPassword('  Script-Made-Pass!  ', randomBytes(16), 2_000);
    expect(await verifyPasswordHash('Script-Made-Pass!', stored)).toBe(true);
    expect(await verifyPasswordHash('Script-Made-Pass', stored)).toBe(false);
  });

  it('a malformed stored hash refuses rather than throwing', async () => {
    expect(await verifyPasswordHash('x', { iterations: 1000, salt: '%%%', hash: '%%%' })).toBe(false);
  });
});
