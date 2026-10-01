// @vitest-environment happy-dom
//
// src/utils/hydrateGrossingBlocks.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "the container scan on the
// SynopticReportPage acts as the resolution and execution bridge."
// Tests against a real, freshly-created case (no seeded case has any
// 'Pending'-status blocks today — confirmed directly before writing
// this) using the real, seeded Renal protocol/specimen-dictionary
// pair, same real data resolveBlockCassetteColor.test.ts and
// resolveProtocolIdForSpecimen.test.ts already exercise.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};
store.set('pathscribe-user', JSON.stringify({ id: 'TEST-USER', role: 'superadmin' }));

const { caseRouter } = await import('../services/cases/CaseRouter');
const { hydrateGrossingBlocks } = await import('./hydrateGrossingBlocks');

let counter = 0;
function makeCaseId(): string {
  counter += 1;
  return `S26-GROSSING-HYDRATE-TEST-${counter}`;
}

async function seedCaseWithPendingBlocks(blockOverrides: Partial<{ status: string; cassetteColorId: string }>[] = [{}]) {
  const id = makeCaseId();
  await caseRouter.createCase({
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    status: 'in-progress', accession: { fullAccession: id }, participants: [], synopticReports: [],
    order: { priority: 'Routine' },
    specimens: [{
      id: `${id}-SP-A`, label: 'A', description: 'Kidney core biopsy',
      specimenDictionaryEntryId: 'sp-kidney-native-biopsy',
      blocks: blockOverrides.map((o, i) => ({
        id: `${id}-BLK-${i + 1}`, label: String(i + 1), status: 'Pending', stains: [], ...o,
      })),
    }],
  } as any);
  return { caseId: id, specimenId: `${id}-SP-A` };
}

describe('hydrateGrossingBlocks — real "Material Hydration & Color Resolution" step', () => {
  beforeEach(() => { counter += 1000; });

  it('resolves and persists the real, seeded Blue color for a Pending block on the Renal protocol', async () => {
    const { caseId, specimenId } = await seedCaseWithPendingBlocks();
    const result = await hydrateGrossingBlocks(caseId, specimenId);
    expect(result).toHaveLength(1);
    expect(result[0].cassetteColorId).toBe('color-blue');
  });

  it('actually persists the resolved color onto the real, stored block record', async () => {
    const { caseId, specimenId } = await seedCaseWithPendingBlocks();
    await hydrateGrossingBlocks(caseId, specimenId);
    const after = await caseRouter.getCase(caseId);
    const block = after?.specimens?.find((s: any) => s.id === specimenId)?.blocks?.[0];
    expect(block?.cassetteColorId).toBe('color-blue');
  });

  it('hydrates every real Pending block on the specimen, not just the first', async () => {
    const { caseId, specimenId } = await seedCaseWithPendingBlocks([{}, {}, {}]);
    const result = await hydrateGrossingBlocks(caseId, specimenId);
    expect(result).toHaveLength(3);
    expect(result.every(r => r.cassetteColorId === 'color-blue')).toBe(true);
  });

  it('leaves an already-Grossed block untouched — only real placeholders get hydrated', async () => {
    const { caseId, specimenId } = await seedCaseWithPendingBlocks([{ status: 'Grossed' }]);
    const result = await hydrateGrossingBlocks(caseId, specimenId);
    expect(result).toHaveLength(0);
    const after = await caseRouter.getCase(caseId);
    expect(after?.specimens?.[0]?.blocks?.[0]?.cassetteColorId).toBeUndefined();
  });

  it('re-scanning is a safe no-op — a block already hydrated (has a cassetteColorId) is not re-processed', async () => {
    const { caseId, specimenId } = await seedCaseWithPendingBlocks([{ cassetteColorId: 'color-white' }]);
    const result = await hydrateGrossingBlocks(caseId, specimenId);
    expect(result).toHaveLength(0);
    const after = await caseRouter.getCase(caseId);
    // Real, deliberate confirmation: the pre-existing (possibly
    // manually overridden) color is never silently overwritten.
    expect(after?.specimens?.[0]?.blocks?.[0]?.cassetteColorId).toBe('color-white');
  });

  it('returns an empty array for a real case with no matching specimen, never throws', async () => {
    const { caseId } = await seedCaseWithPendingBlocks();
    await expect(hydrateGrossingBlocks(caseId, 'nonexistent-specimen')).resolves.toEqual([]);
  });

  it('returns an empty array for a real, nonexistent case, never throws', async () => {
    await expect(hydrateGrossingBlocks('S26-DOES-NOT-EXIST', 'sp-1')).resolves.toEqual([]);
  });
});
