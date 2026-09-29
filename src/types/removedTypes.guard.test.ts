// src/types/removedTypes.guard.test.ts — Batch 366 (PS-68)
// Types removed as unused designs stay removed. A delta zip can't delete a
// file, so this also catches a copy of the repo where the file was not
// deleted by hand.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?)$/.test(name) && !name.endsWith('.guard.test.ts') ? [path] : [];
  });
}

describe('removed types stay removed', () => {
  it('ReportSnapshot is gone; ReportVersionRecord is the one release record (PS-68)', () => {
    expect(existsSync(resolve(SRC, 'types/case/ReportSnapshot.ts'))).toBe(false);
    // Comments may name it (they explain the removal); code may not import it.
    const users = sourceFiles(SRC).filter(f => /from\s+['"][^'"]*\/ReportSnapshot['"]|\b(ReportSnapshotHistory|ReportSnapshotType|isOperativeSnapshot)\b/.test(readFileSync(f, 'utf8')));
    expect(users).toEqual([]);
  });
});
