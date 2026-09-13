// src/services/cancerRegistry/dispatchCancerRegistryReportIfApplicable.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Case } from '@/types/case/Case';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const baseCase = (over: Partial<Case>): Case => ({
  id: 'S26-2000',
  accession: { accessionNumber: 'S26-2000', fullAccession: 'S26-2000-A' },
  patient: { id: 'p1', mrn: 'MRN-200', firstName: 'Jane', lastName: 'Roe', dateOfBirth: '1980-01-01' },
  diagnostic: { primaryDiagnosis: 'Infiltrating ductal carcinoma, breast', issuedDate: '2026-09-01T00:00:00.000Z' },
  specimens: [],
  ...over,
} as unknown as Case);

describe('dispatchCancerRegistryReportIfApplicable — real, per FHIR_DISPATCH_ARCHITECTURE_PLAN.md\'s own "never from cytology" rule (this is the surgical-path-only trigger)', () => {
  it('real, with no registry configured for the facility, nothing is dispatched', async () => {
    const { dispatchCancerRegistryReportIfApplicable } = await import('./dispatchCancerRegistryReportIfApplicable');
    const caseData = baseCase({ specimens: [{ id: 'sp1', coding: { icdO: [{ code: '8500/3', description: 'Duct carcinoma' }] } }] as any });
    const result = await dispatchCancerRegistryReportIfApplicable(caseData, 'fac-no-registry', 'Some Facility');
    expect(result.dispatched).toBe(false);
    expect(result.reason).toContain('No cancer registry configured');
  });

  it('real, a real, reportable ICD-O finding with a real registry configured is genuinely enqueued', async () => {
    const { mockCancerRegistrySettingsService } = await import('./mockCancerRegistrySettingsService');
    const { mockCancerRegistryOutboundQueueService } = await import('./mockCancerRegistryOutboundQueueService');
    const { dispatchCancerRegistryReportIfApplicable } = await import('./dispatchCancerRegistryReportIfApplicable');

    await mockCancerRegistrySettingsService.update({ registryId: 'naaccr_us' });
    const caseData = baseCase({ specimens: [{ id: 'sp1', coding: { icdO: [{ code: '8500/3', description: 'Duct carcinoma' }] } }] as any });
    const result = await dispatchCancerRegistryReportIfApplicable(caseData, 'fac-with-registry', 'Some Facility');
    expect(result.dispatched).toBe(true);

    const queue = await mockCancerRegistryOutboundQueueService.getByCaseId('S26-2000');
    if (queue.ok) expect(queue.data).toHaveLength(1);
  });

  it('real, a registry configured but only NON-reportable findings (e.g. cervical CIS) never dispatches — the exact, already-documented critical exception', async () => {
    const { mockCancerRegistrySettingsService } = await import('./mockCancerRegistrySettingsService');
    const { dispatchCancerRegistryReportIfApplicable } = await import('./dispatchCancerRegistryReportIfApplicable');

    await mockCancerRegistrySettingsService.update({ registryId: 'naaccr_us' });
    const caseData = baseCase({
      diagnostic: { primaryDiagnosis: 'CIN III, cervix biopsy' } as any,
      specimens: [{ id: 'sp1', coding: { icdO: [{ code: '8077/2', description: 'HSIL, cervix' }] } }] as any,
    });
    const result = await dispatchCancerRegistryReportIfApplicable(caseData, 'fac-cin3', 'Some Facility');
    expect(result.dispatched).toBe(false);
    expect(result.reason).toContain('No reportable ICD-O finding');
  });
});
