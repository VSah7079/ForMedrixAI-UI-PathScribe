// @vitest-environment node
// src/services/models/firestoreModelRules.guard.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-58 source guard on firestore.rules: keeps the model catalog vendor-only
// and adoption records inside their organisation. A text check, not an
// emulator test; the emulator suite (npm run test:rules) is the real proof.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf-8');
const block = (header: string) => {
  const start = rules.indexOf(header);
  expect(start, `${header} missing from firestore.rules`).toBeGreaterThan(-1);
  const end = rules.indexOf('\n    }\n', start);
  return rules.slice(start, end);
};

describe('firestore.rules: AI model catalog and adoptions (PS-58)', () => {
  it('lets only vendor staff write the global catalog', () => {
    const b = block('match /modelCatalog/{modelId}');
    expect(b).toMatch(/allow write: if isVendorStaff\(\);/);
  });

  it('keeps adoption records inside the caller\'s organisation', () => {
    const b = block('match /organisations/{orgId}/adoptedModels/{modelId}');
    expect(b).toMatch(/allow read: if isOrgMember\(orgId\)/);
    expect(b).toMatch(/allow create: if isOrgMember\(orgId\) &&/);
    expect(b).toMatch(/request\.resource\.data\.organisationId == orgId/);
    expect(b).toMatch(/exists\(\/databases\/\$\(database\)\/documents\/modelCatalog\/\$\(modelId\)\)/);
    expect(b).toMatch(/allow update: if isOrgMember\(orgId\) &&/);
    expect(b).toMatch(/allow delete: if false;/);
  });

  it('defines isOrgMember against the organisationId claim', () => {
    expect(rules).toMatch(/function isOrgMember\(orgId\) \{\s*return isSignedIn\(\) && callerOrgId\(\) == orgId;/);
  });
});
