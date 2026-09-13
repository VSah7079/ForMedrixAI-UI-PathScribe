// src/services/digitalPathology/recordAiHumanConcordance.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('recordAiHumanConcordance — real, per this module\'s own established "NO auto-CAPA" design decision', () => {
  it('real, a genuine CONCORDANT judgment records cleanly and raises no deficiency at all', async () => {
    const { mockAiScreeningResultService } = await import('./mockAiScreeningResultService');
    const { mockSpecimenDeficiencyService } = await import('../deficiencies/mockSpecimenDeficiencyService');
    const { recordAiHumanConcordance } = await import('./recordAiHumanConcordance');

    const ordered = await mockAiScreeningResultService.order({ caseId: 'S26-0001-SP-001', vendorId: 'dp-vendor-paige-prostate', orderedAt: new Date().toISOString() });
    if (!ordered.ok) throw new Error('setup failed');

    const result = await recordAiHumanConcordance(ordered.data.id, true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.humanConcordant).toBe(true);

    const deficiencies = await mockSpecimenDeficiencyService.getByCaseId('S26-0001-SP-001');
    if (deficiencies.ok) expect(deficiencies.data.filter(d => d.deficiencyTypeId === 'def-ai-discordance')).toHaveLength(0);
  });

  it('real, a genuine DISCORDANT judgment raises a real, open deficiency — never auto-escalated to CAPA', async () => {
    const { mockAiScreeningResultService } = await import('./mockAiScreeningResultService');
    const { mockSpecimenDeficiencyService } = await import('../deficiencies/mockSpecimenDeficiencyService');
    const { recordAiHumanConcordance } = await import('./recordAiHumanConcordance');

    const ordered = await mockAiScreeningResultService.order({ caseId: 'S26-0002-SP-001', specimenId: 'S26-0002-SP-001-A', vendorId: 'dp-vendor-pathai-aisight-dx', orderedAt: new Date().toISOString() });
    if (!ordered.ok) throw new Error('setup failed');

    const result = await recordAiHumanConcordance(ordered.data.id, false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.humanConcordant).toBe(false);

    const deficiencies = await mockSpecimenDeficiencyService.getByCaseId('S26-0002-SP-001');
    if (!deficiencies.ok) throw new Error('lookup failed');
    const aiDeficiency = deficiencies.data.find(d => d.deficiencyTypeId === 'def-ai-discordance');
    expect(aiDeficiency).toBeDefined();
    // Real, direct verification: raised 'open', never auto-resolved or
    // auto-escalated — a real human decides what happens next.
    expect(aiDeficiency?.status).toBe('open');
    expect(aiDeficiency?.specimenId).toBe('S26-0002-SP-001-A');
  });

  it('real, a genuinely non-existent result id is an honest failure, not a silent no-op', async () => {
    const { recordAiHumanConcordance } = await import('./recordAiHumanConcordance');
    const result = await recordAiHumanConcordance('does-not-exist', false);
    expect(result.ok).toBe(false);
  });
});
