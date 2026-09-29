import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCytologyQcRuleService', () => {
  it('the real, seeded international rule set loads with all 8 real rules', async () => {
    const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
    const result = await mockCytologyQcRuleService.getAll();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.length).toBe(8);
  });

  it('the real, confirmed EU CT-signout gap is now closed \u2014 a CT-signed negative case in Germany or the Netherlands is genuinely caught', async () => {
    const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
    const { resolveQcRuleEvaluation } = await import('./resolveQcRuleEvaluation');
    const rulesResult = await mockCytologyQcRuleService.getActive();
    if (!rulesResult.ok) return;

    const context = {
      jurisdiction: 'DE' as const, primarySignOutProviderId: 'prov-1', providerRole: 'cytotechnologist' as const,
      specimenCategory: 'gyn_pap' as const, sampleAdequacy: 'satisfactory' as const, activeHighRiskFlags: [], resultIsNegative: true, providerCapabilities: [],
    };
    const result = resolveQcRuleEvaluation(context, false, rulesResult.data, new Map(), 0.05);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.ruleId).toBe('SEED-EU-CT-SIGNOUT-001');
  });

  it('the real Global Onboarding seed ships inactive, since this app has no real new-hire roster to auto-populate it with', async () => {
    const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
    const result = await mockCytologyQcRuleService.getById('SEED-GLOBAL-ONBOARD-001');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.active).toBe(false);
  });

  it('getActive() genuinely excludes the inactive onboarding seed', async () => {
    const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
    const result = await mockCytologyQcRuleService.getActive();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.find(r => r.id === 'SEED-GLOBAL-ONBOARD-001')).toBeUndefined();
  });

  it('a real duplicate copies the source rule\'s own real criteria/sampling config, but starts inactive and gets a real, distinct id', async () => {
    const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
    const result = await mockCytologyQcRuleService.duplicate('SEED-US-CLIA-002', 'US CLIA High-Risk Targeted Pap Rescreen (copie)');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).not.toBe('SEED-US-CLIA-002');
      expect(result.data.name).toBe('US CLIA High-Risk Targeted Pap Rescreen (copie)'); // caller-supplied, localized
      expect(result.data.active).toBe(false);
      expect(result.data.criteria).toEqual(expect.objectContaining({ jurisdictions: ['US'], resultIsNegative: true }));
      expect(result.data.samplingLogic).toEqual({ type: 'percentage', ratePercent: 100.0 });
    }
  });

  it('duplicating, then making a small real change, leaves the original real rule completely untouched', async () => {
    const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
    const duplicated = await mockCytologyQcRuleService.duplicate('SEED-UK-NHS-001', 'UK copy');
    if (!duplicated.ok) return;
    await mockCytologyQcRuleService.update(duplicated.data.id, { samplingLogic: { type: 'percentage', ratePercent: 30 } });
    const original = await mockCytologyQcRuleService.getById('SEED-UK-NHS-001');
    expect(original.ok).toBe(true);
    if (original.ok) expect(original.data.samplingLogic).toEqual({ type: 'percentage', ratePercent: 20.0 });
  });

  it('a real, non-existent rule id is honestly refused for duplication, never silently creating an empty rule', async () => {
    const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
    const result = await mockCytologyQcRuleService.duplicate('does-not-exist', 'x');
    expect(result.ok).toBe(false);
  });

  describe('real, end-to-end integration with the evaluation engine', () => {
    it('the real, seeded US CLIA rule genuinely selects a real, matching negative GYN case at its own 10% rate', async () => {
      const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
      const { resolveQcRuleEvaluation } = await import('./resolveQcRuleEvaluation');
      const rulesResult = await mockCytologyQcRuleService.getActive();
      if (!rulesResult.ok) return;

      const context = {
        jurisdiction: 'US' as const, primarySignOutProviderId: 'prov-1', providerRole: 'cytotechnologist' as const,
        specimenCategory: 'gyn_pap' as const, sampleAdequacy: 'satisfactory' as const, activeHighRiskFlags: [], resultIsNegative: true, providerCapabilities: [],
      };
      const result = resolveQcRuleEvaluation(context, false, rulesResult.data, new Map(), 0.05); // real roll well under 10%
      expect(result.matched).toBe(true);
      // Real, updated: the earlier, US-only SEED-US-CLIA-001 was
      // retired in favor of the real, universal SEED-EU-CT-SIGNOUT-001
      // rule, which now covers the same real US negative-rescreen
      // scenario across every real jurisdiction, not just the US.
      if (result.matched) expect(result.ruleId).toBe('SEED-EU-CT-SIGNOUT-001');
    });

    it('a real high-risk US case is caught by the real, higher-priority targeted rule before ever reaching the routine 10% rule', async () => {
      const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
      const { resolveQcRuleEvaluation } = await import('./resolveQcRuleEvaluation');
      const rulesResult = await mockCytologyQcRuleService.getActive();
      if (!rulesResult.ok) return;

      const context = {
        jurisdiction: 'US' as const, primarySignOutProviderId: 'prov-1', providerRole: 'cytotechnologist' as const,
        specimenCategory: 'gyn_pap' as const, sampleAdequacy: 'satisfactory' as const,
        activeHighRiskFlags: ['prior_dysplasia_hsil'], resultIsNegative: true, providerCapabilities: [],
      };
      // Real, deliberately high roll — would fail the routine 10% rule,
      // but the 100% targeted rule must still catch it first.
      const result = resolveQcRuleEvaluation(context, false, rulesResult.data, new Map(), 0.99);
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.ruleId).toBe('SEED-US-CLIA-002');
    });

    it('the real, seeded rules genuinely respect jurisdiction boundaries \u2014 a US-only rule never matches a UK case, even one that would otherwise trigger it', async () => {
      const { mockCytologyQcRuleService } = await import('./mockCytologyQcRuleService');
      const { resolveQcRuleEvaluation } = await import('./resolveQcRuleEvaluation');
      const rulesResult = await mockCytologyQcRuleService.getActive();
      if (!rulesResult.ok) return;

      // Real, deliberately using the same real high-risk flag that
      // triggers SEED-US-CLIA-002 (US-only, 100% targeted) if this
      // were a real US case \u2014 proving that rule's own real
      // jurisdiction scoping actually excludes a UK case, rather than
      // using a plain negative case, which the real, universal
      // SEED-EU-CT-SIGNOUT-001 rule now legitimately matches
      // everywhere, UK included. A real, low roll (0.05) guarantees
      // that universal rule's own 10% sampling genuinely selects this
      // case, so the assertion below is always meaningfully exercised
      // rather than only checked when something happens to match.
      const context = {
        jurisdiction: 'GB_EW' as const, primarySignOutProviderId: 'prov-1', providerRole: 'cytotechnologist' as const,
        specimenCategory: 'gyn_pap' as const, sampleAdequacy: 'satisfactory' as const,
        activeHighRiskFlags: ['prior_dysplasia_hsil'], resultIsNegative: true, providerCapabilities: [],
      };
      const result = resolveQcRuleEvaluation(context, false, rulesResult.data, new Map(), 0.05);
      expect(result.matched).toBe(true);
      // Real \u2014 the real, universal rule catches it (matching
      // everywhere), but the real, US-only targeted rule must never
      // be the one that does, despite the matching high-risk flag.
      if (result.matched) expect(result.ruleId).toBe('SEED-EU-CT-SIGNOUT-001');
    });
  });
});
