// src/services/batches/resolveStainQcGate.test.ts
import { describe, it, expect } from 'vitest';
import { resolveStainQcGate, resolveEffectiveQcEnforcementMode } from './resolveStainQcGate';

describe('resolveStainQcGate \u2014 real, per PS-289/PS-292\u2019s own Gating Strategy research', () => {
  it('no real enforcement mode resolved anywhere \u2014 not-applicable, never a default-enforced gate', () => {
    const status = resolveStainQcGate({ effectiveMode: undefined, stainingInstrumentStatus: undefined, hasVisualReadConfirmation: false });
    expect(status).toBe('not-applicable');
  });

  describe('Enforced mode', () => {
    it('blocks with no real visual-read confirmation yet', () => {
      const status = resolveStainQcGate({ effectiveMode: 'Enforced', stainingInstrumentStatus: undefined, hasVisualReadConfirmation: false });
      expect(status).toBe('blocked-enforced');
    });

    it('clears once a real visual-read confirmation exists, even with no instrument status at all', () => {
      const status = resolveStainQcGate({ effectiveMode: 'Enforced', stainingInstrumentStatus: undefined, hasVisualReadConfirmation: true });
      expect(status).toBe('clear');
    });

    it('a real "Run Completed" instrument status alone is NOT enough under Enforced \u2014 a human confirmation is still genuinely required', () => {
      const status = resolveStainQcGate({ effectiveMode: 'Enforced', stainingInstrumentStatus: 'Run Completed', hasVisualReadConfirmation: false });
      expect(status).toBe('blocked-enforced');
    });
  });

  describe('Auto-Resolve mode \u2014 real, per the research\u2019s own "without blocking the user"', () => {
    it('clears even with NO instrument status at all yet \u2014 never blocks merely because a success signal hasn\u2019t arrived', () => {
      const status = resolveStainQcGate({ effectiveMode: 'Auto-Resolve', stainingInstrumentStatus: undefined, hasVisualReadConfirmation: false });
      expect(status).toBe('clear');
    });

    it('clears on a real "Run Completed" status', () => {
      const status = resolveStainQcGate({ effectiveMode: 'Auto-Resolve', stainingInstrumentStatus: 'Run Completed', hasVisualReadConfirmation: false });
      expect(status).toBe('clear');
    });

    it('a real, CONFIRMED failure still blocks under Auto-Resolve \u2014 per the original spec\u2019s own \u00a72.4, "prevent clinical reporting" is unconditional', () => {
      const status = resolveStainQcGate({ effectiveMode: 'Auto-Resolve', stainingInstrumentStatus: 'Run Failed', hasVisualReadConfirmation: false });
      expect(status).toBe('blocked-failed');
    });
  });

  describe('Hybrid mode', () => {
    it('clears automatically on a real "Run Completed" status, no manual confirmation needed', () => {
      const status = resolveStainQcGate({ effectiveMode: 'Hybrid', stainingInstrumentStatus: 'Run Completed', hasVisualReadConfirmation: false });
      expect(status).toBe('clear');
    });

    it('with no instrument status at all (missing/inconclusive), falls back to requiring manual confirmation', () => {
      const blocked = resolveStainQcGate({ effectiveMode: 'Hybrid', stainingInstrumentStatus: undefined, hasVisualReadConfirmation: false });
      expect(blocked).toBe('blocked-hybrid');
      const cleared = resolveStainQcGate({ effectiveMode: 'Hybrid', stainingInstrumentStatus: undefined, hasVisualReadConfirmation: true });
      expect(cleared).toBe('clear');
    });

    it('a real, confirmed failure still blocks under Hybrid too, same as every other mode', () => {
      const status = resolveStainQcGate({ effectiveMode: 'Hybrid', stainingInstrumentStatus: 'Run Failed', hasVisualReadConfirmation: true });
      expect(status).toBe('blocked-failed');
    });
  });

  it('a real, confirmed failure blocks in EVERY real mode, unconditionally \u2014 the one rule that overrides all others', () => {
    for (const mode of ['Enforced', 'Auto-Resolve', 'Hybrid'] as const) {
      const status = resolveStainQcGate({ effectiveMode: mode, stainingInstrumentStatus: 'Run Failed', hasVisualReadConfirmation: true });
      expect(status).toBe('blocked-failed');
    }
  });
});

describe('resolveEffectiveQcEnforcementMode \u2014 real, per direct decision ("both \u2014 instrument-level default, per-stain override")', () => {
  it('a real StainType override wins when set, regardless of the WorkstationGroup\u2019s own default', () => {
    expect(resolveEffectiveQcEnforcementMode('Enforced', 'Auto-Resolve')).toBe('Enforced');
  });

  it('falls back to the real WorkstationGroup default when no StainType override is set', () => {
    expect(resolveEffectiveQcEnforcementMode(undefined, 'Auto-Resolve')).toBe('Auto-Resolve');
  });

  it('resolves to undefined \u2014 not a fabricated default \u2014 when neither level has a real mode set', () => {
    expect(resolveEffectiveQcEnforcementMode(undefined, undefined)).toBeUndefined();
  });
});
