import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { mockIntraoperativeService as MockIntraoperativeServiceType } from './mockIntraoperativeService';

// Real, deliberate deviation from the usual beforeEach-based localStorage
// stub pattern (mockRvuCodeMapService.test.ts etc.): confirmed directly
// that mockIntraoperativeService.ts's own real import chain
// (caseRouter -> ... -> mockUserService.ts) touches localStorage at
// MODULE LOAD time, not lazily inside a function - a static top-level
// `import` is hoisted and its own side effects run before ANY of this
// test file's own top-level code, including a beforeEach registration,
// ever gets a chance to execute. The real fix: stub localStorage first,
// as genuine top-level module code (not inside a hook), THEN dynamically
// import the real service - a dynamic import() is NOT hoisted, so it
// genuinely runs after the stub already exists.
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

let mockIntraoperativeService: typeof MockIntraoperativeServiceType;
beforeAll(async () => {
  ({ mockIntraoperativeService } = await import('./mockIntraoperativeService'));
});

// Real, necessary alongside the module-scope stub above: store itself
// must still reset between tests, or a later test would see an earlier
// test's own mutations instead of the real, clean seed data - clearing
// its keys (not reassigning globalThis.localStorage, which only needs
// to happen once) is enough, since the stub functions above close over
// this same object by reference.
beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('addPreparationOutput — real, per direct guidance: resolves PS-82, the itemized, countable record of what was actually produced at the bench', () => {
  it('adds a real frozen_block output with a real, auto-generated, specimen-scoped identifier', async () => {
    const res = await mockIntraoperativeService.addPreparationOutput('intraop-001', 'spec-001-a', 'frozen_block');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const specimen = res.data.specimens.find(s => s.id === 'spec-001-a');
      const newOutput = specimen?.preparations[specimen.preparations.length - 1];
      expect(newOutput?.type).toBe('frozen_block');
      // spec-001-a is the real seed's first (and only) specimen in this
      // session, so its real specimen letter is 'A' - and it already has
      // one real, seeded frozen_block output (FS-A1), so this new one is
      // real sequence #2.
      expect(newOutput?.identifier).toBe('FS-A2');
    }
  });

  it('a touch_prep output gets a real, specimen-scoped identifier distinct in shape from a frozen block, per direct confirmation', async () => {
    const res = await mockIntraoperativeService.addPreparationOutput('intraop-003', 'spec-003-a', 'touch_prep');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const specimen = res.data.specimens.find(s => s.id === 'spec-003-a');
      const newOutput = specimen?.preparations[specimen.preparations.length - 1];
      expect(newOutput?.identifier).toBe('FS-A-TP1'); // spec-003-a has no prior preparations - real sequence #1
    }
  });

  it('two real frozen blocks on the SAME specimen get distinct, sequential identifiers - never colliding', async () => {
    await mockIntraoperativeService.addPreparationOutput('intraop-003', 'spec-003-a', 'frozen_block');
    const second = await mockIntraoperativeService.addPreparationOutput('intraop-003', 'spec-003-a', 'frozen_block');
    expect(second.ok).toBe(true);
    if (second.ok) {
      const specimen = second.data.specimens.find(s => s.id === 'spec-003-a');
      const identifiers = specimen?.preparations.map(p => p.identifier);
      expect(identifiers).toEqual(['FS-A1', 'FS-A2']);
    }
  });

  it('a real second specimen in the same session gets its own, independent letter (B), not colliding with specimen A\'s own sequence', async () => {
    await mockIntraoperativeService.addPreparationOutput('intraop-002', 'spec-002-a', 'frozen_block'); // spec-002-a already has one real seeded frozen block (FS-A1)
    const res = await mockIntraoperativeService.addPreparationOutput('intraop-002', 'spec-002-b', 'frozen_block');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const specB = res.data.specimens.find(s => s.id === 'spec-002-b');
      const newOutput = specB?.preparations[specB.preparations.length - 1];
      expect(newOutput?.identifier).toBe('FS-B1'); // specimen B's own, independent first output
    }
  });

  it('a real specimen genuinely having BOTH a touch prep AND a frozen block keeps their identifiers correctly distinct from each other', async () => {
    await mockIntraoperativeService.addPreparationOutput('intraop-003', 'spec-003-a', 'touch_prep');
    const res = await mockIntraoperativeService.addPreparationOutput('intraop-003', 'spec-003-a', 'frozen_block');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const specimen = res.data.specimens.find(s => s.id === 'spec-003-a');
      const identifiers = specimen?.preparations.map(p => `${p.type}:${p.identifier}`);
      expect(identifiers).toEqual(['touch_prep:FS-A-TP1', 'frozen_block:FS-A1']);
    }
  });

  it('accepts a real, caller-supplied identifier instead of auto-generating one, when explicitly given', async () => {
    const res = await mockIntraoperativeService.addPreparationOutput('intraop-003', 'spec-003-a', 'frozen_block', 'CUSTOM-ID-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const specimen = res.data.specimens.find(s => s.id === 'spec-003-a');
      const newOutput = specimen?.preparations[specimen.preparations.length - 1];
      expect(newOutput?.identifier).toBe('CUSTOM-ID-1');
    }
  });

  it('returns an honest error, never a fabricated success, for a real session id that does not exist', async () => {
    const res = await mockIntraoperativeService.addPreparationOutput('not-a-real-session', 'spec-001-a', 'frozen_block');
    expect(res.ok).toBe(false);
  });

  it('returns an honest error for a real session but a specimen id that does not exist within it', async () => {
    const res = await mockIntraoperativeService.addPreparationOutput('intraop-001', 'not-a-real-specimen', 'frozen_block');
    expect(res.ok).toBe(false);
  });

  it('does NOT require Quick Gross first, unlike touch_prep_performed/frozen_section_cut milestones - a real preparation output is itself downstream evidence bench work happened', async () => {
    // intraop-002's spec-002-b has only a gross_logged milestone and no
    // quickGrossDictation - would fail addMilestone's own Quick Gross
    // gate for touch_prep/frozen_section_cut, but addPreparationOutput
    // has no such gate.
    const res = await mockIntraoperativeService.addPreparationOutput('intraop-002', 'spec-002-b', 'frozen_block');
    expect(res.ok).toBe(true);
  });

  it('adding a preparation output never touches milestones[] - the two are real, deliberately separate records', async () => {
    const before = await mockIntraoperativeService.getAll();
    if (!before.ok) throw new Error('setup failed');
    const beforeMilestoneCount = before.data.find(e => e.id === 'intraop-003')?.specimens.find(s => s.id === 'spec-003-a')?.milestones.length;

    await mockIntraoperativeService.addPreparationOutput('intraop-003', 'spec-003-a', 'frozen_block');

    const after = await mockIntraoperativeService.getAll();
    if (!after.ok) throw new Error('lookup failed');
    const afterMilestoneCount = after.data.find(e => e.id === 'intraop-003')?.specimens.find(s => s.id === 'spec-003-a')?.milestones.length;
    expect(afterMilestoneCount).toBe(beforeMilestoneCount);
  });
});

describe('Real seed data — preparations[] matches the real, existing milestone narrative honestly', () => {
  it('spec-001-a (touch prep performed, then frozen cut) has real, matching preparations for both', async () => {
    const res = await mockIntraoperativeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const specimen = res.data.find(e => e.id === 'intraop-001')?.specimens.find(s => s.id === 'spec-001-a');
    expect(specimen?.preparations.map(p => p.type)).toEqual(['touch_prep', 'frozen_block']);
  });

  it('spec-002-a (touch prep SKIPPED, direct to frozen) has real preparations for ONLY the frozen block - no phantom touch prep', async () => {
    const res = await mockIntraoperativeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const specimen = res.data.find(e => e.id === 'intraop-002')?.specimens.find(s => s.id === 'spec-002-a');
    expect(specimen?.preparations.map(p => p.type)).toEqual(['frozen_block']);
  });

  it('spec-002-b/spec-003-a (only gross logged, nothing produced yet) have real, honestly empty preparations', async () => {
    const res = await mockIntraoperativeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const specB = res.data.find(e => e.id === 'intraop-002')?.specimens.find(s => s.id === 'spec-002-b');
    const spec003 = res.data.find(e => e.id === 'intraop-003')?.specimens.find(s => s.id === 'spec-003-a');
    expect(specB?.preparations).toEqual([]);
    expect(spec003?.preparations).toEqual([]);
  });
});
