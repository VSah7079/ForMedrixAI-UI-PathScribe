// src/services/serviceResultShape.guard.test.ts — Batch 348 (PS-67)
// One service result shape across the app: ServiceResult from
// services/types.ts ({ ok: true, data } | { ok: false, error }). The older
// { success, data, error } type (types/serviceResult.ts) was removed; this
// keeps it from coming back where it lived.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

describe('one ServiceResult shape (PS-67)', () => {
  it('the old { success, data, error } type is gone and not re-exported', () => {
    expect(existsSync(resolve(SRC, 'types/serviceResult.ts'))).toBe(false);
    expect(read('types/index.ts')).not.toMatch(/from '\.\/serviceResult'/);
  });

  it('the AI services and voice-macro refinement return { ok, ... }', () => {
    for (const rel of [
      'services/aiIntegration/IAIIntegrationService.ts',
      'services/aiIntegration/PathScribeAIService.ts',
      'services/aiIntegration/MockAIIntegrationService.ts',
      'services/voicemacro/mockVoiceMacroService.ts',
    ]) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/\bsuccess\s*:/);
      expect(text, rel).not.toMatch(/import\s*\{[^}]*ServiceResult[^}]*\}\s*from\s*'(\.\.\/\.\.\/types|@\/types)'/);
    }
    expect(read('pages/SynopticReportPage/hooks/useSignOutWorkflow.ts')).not.toMatch(/result\.success/);
  });
});
