import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveReportTemplate, traceReportTemplateResolution, resolveIsFinalStatus } from './TemplateRoutingService';

describe('TemplateRoutingService — Pass 0 / 0a (client override, Enterprise fallback)', () => {
  it('a facility with its own real override resolves via Pass 0, never checking Enterprise at all', () => {
    const result = resolveReportTemplate({
      performingFacilityId: 'FAC-A',
      enterpriseFacilityId: 'ENT-1',
      _facilityOverrides: { 'FAC-A': 'tmpl-facility-a', 'ENT-1': 'tmpl-enterprise' },
    } as any);
    expect(result.resolvedBy).toBe('client-override');
    expect(result.templateId).toBe('tmpl-facility-a');
  });

  it('real, per direct guidance: a facility with NO own override rolls up to its real Enterprise parent\'s own rule', () => {
    const result = resolveReportTemplate({
      performingFacilityId: 'FAC-A',
      enterpriseFacilityId: 'ENT-1',
      _facilityOverrides: { 'ENT-1': 'tmpl-enterprise' }, // FAC-A has no entry of its own
    } as any);
    expect(result.resolvedBy).toBe('client-override-enterprise');
    expect(result.templateId).toBe('tmpl-enterprise');
  });

  it('neither the facility nor its Enterprise has a rule — falls through past Pass 0/0a entirely', () => {
    const trace = traceReportTemplateResolution({
      performingFacilityId: 'FAC-A',
      enterpriseFacilityId: 'ENT-1',
      subspecialtyId: 'gi',
      _facilityOverrides: {},
    } as any);
    expect(trace.result.resolvedBy).toBe('subspecialty');
    const pass0a = trace.passes.find(p => p.pass === 'client-override-enterprise');
    expect(pass0a?.matched).toBe(false);
    expect(pass0a?.reached).toBe(true);
  });

  it('no enterpriseFacilityId provided at all (e.g. the facility IS the Enterprise, or has no parent) — Pass 0a is reached but has nothing to check, same real behavior as before this feature existed', () => {
    const trace = traceReportTemplateResolution({
      performingFacilityId: 'FAC-STANDALONE',
      subspecialtyId: 'gi',
      _facilityOverrides: {},
    } as any);
    const pass0a = trace.passes.find(p => p.pass === 'client-override-enterprise');
    expect(pass0a?.reached).toBe(true);
    expect(pass0a?.inputProvided).toBe(false);
    expect(pass0a?.matched).toBe(false);
    expect(trace.result.resolvedBy).toBe('subspecialty');
  });

  it('Pass 0a is correctly skipped (not reached) when Pass 0 itself already resolved it', () => {
    const trace = traceReportTemplateResolution({
      performingFacilityId: 'FAC-A',
      enterpriseFacilityId: 'ENT-1',
      _facilityOverrides: { 'FAC-A': 'tmpl-facility-a', 'ENT-1': 'tmpl-enterprise' },
    } as any);
    const pass0a = trace.passes.find(p => p.pass === 'client-override-enterprise');
    expect(pass0a?.reached).toBe(false);
  });

  it('real precedence: physician preference is NOT checked before the Enterprise fallback — Pass 0a still outranks Pass 0b', () => {
    const result = resolveReportTemplate({
      performingFacilityId: 'FAC-A',
      enterpriseFacilityId: 'ENT-1',
      orderingPhysicianId: 'PHYS-1',
      _facilityOverrides: { 'ENT-1': 'tmpl-enterprise' },
      _physicianOverrides: { 'PHYS-1': 'tmpl-physician-pref' },
    } as any);
    expect(result.resolvedBy).toBe('client-override-enterprise');
    expect(result.templateId).toBe('tmpl-enterprise');
  });
});

describe('TemplateRoutingService — resolveReportTemplateAsync real Enterprise resolution', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves the real Enterprise parent via mockFacilityService and uses it when the facility itself has no override', async () => {
    vi.doMock('../facilities/mockFacilityService', () => ({
      mockFacilityService: {
        getById: vi.fn().mockResolvedValue({ ok: true, data: { id: 'FAC-A', isEnterprise: false, parentId: 'ENT-1', roles: [] } }),
      },
    }));
    vi.doMock('../routingRules/mockRoutingRuleService', () => ({
      mockRoutingRuleService: {
        getFacilityMap: vi.fn().mockResolvedValue({ ok: true, data: { 'ENT-1': 'tmpl-enterprise' } }),
        getPhysicianMap: vi.fn().mockResolvedValue({ ok: true, data: {} }),
        getProtocolMap: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      },
    }));
    const { resolveReportTemplateAsync } = await import('./TemplateRoutingService');
    const result = await resolveReportTemplateAsync({ performingFacilityId: 'FAC-A' });
    expect(result.resolvedBy).toBe('client-override-enterprise');
    expect(result.templateId).toBe('tmpl-enterprise');
  });

  it('never resolves an Enterprise fallback for a facility that IS itself the Enterprise — nothing further to roll up to', async () => {
    vi.doMock('../facilities/mockFacilityService', () => ({
      mockFacilityService: {
        getById: vi.fn().mockResolvedValue({ ok: true, data: { id: 'ENT-1', isEnterprise: true, parentId: undefined, roles: [] } }),
      },
    }));
    vi.doMock('../routingRules/mockRoutingRuleService', () => ({
      mockRoutingRuleService: {
        getFacilityMap: vi.fn().mockResolvedValue({ ok: true, data: {} }),
        getPhysicianMap: vi.fn().mockResolvedValue({ ok: true, data: {} }),
        getProtocolMap: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      },
    }));
    const { resolveReportTemplateAsync } = await import('./TemplateRoutingService');
    const result = await resolveReportTemplateAsync({ performingFacilityId: 'ENT-1', subspecialtyId: 'gi' });
    // Falls all the way through to subspecialty — never a
    // client-override-enterprise resolution for the Enterprise's own id.
    expect(result.resolvedBy).toBe('subspecialty');
  });

  it('real, per direct guidance ("Routing Rules should also be tied to a Performing Lab facility"): resolves the case\'s real performing lab and passes it through to getFacilityMap/getPhysicianMap/getProtocolMap', async () => {
    const getFacilityMap = vi.fn().mockResolvedValue({ ok: true, data: {} });
    vi.doMock('../facilities/mockFacilityService', () => ({
      mockFacilityService: {
        getById: vi.fn().mockResolvedValue({ ok: true, data: { id: 'FAC-A', isEnterprise: false, parentId: undefined, roles: ['performing_lab'] } }),
      },
    }));
    vi.doMock('../routingRules/mockRoutingRuleService', () => ({
      mockRoutingRuleService: {
        getFacilityMap,
        getPhysicianMap: vi.fn().mockResolvedValue({ ok: true, data: {} }),
        getProtocolMap: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      },
    }));
    const { resolveReportTemplateAsync } = await import('./TemplateRoutingService');
    await resolveReportTemplateAsync({ performingFacilityId: 'FAC-A' });
    // FAC-A holds the performing_lab role itself, so
    // resolvePerformingLabFacilityId resolves it to its own real id —
    // confirmed passed through, not silently dropped.
    expect(getFacilityMap).toHaveBeenCalledWith('FAC-A');
  });
});

describe('TemplateRoutingService — Pass -1 (Preliminary status gate)', () => {
  it('resolveIsFinalStatus: only finalized, pending-release, and closed count as genuinely final', () => {
    expect(resolveIsFinalStatus('finalized')).toBe(true);
    expect(resolveIsFinalStatus('pending-release')).toBe(true);
    expect(resolveIsFinalStatus('closed')).toBe(true);
    expect(resolveIsFinalStatus('pending-countersign')).toBe(false);
    expect(resolveIsFinalStatus('in-progress')).toBe(false);
    expect(resolveIsFinalStatus('pathologist-review')).toBe(false);
    expect(resolveIsFinalStatus(undefined)).toBe(false);
  });

  it('a case not yet finalized routes to the Preliminary template, skipping every other pass entirely, even with a real facility override that would otherwise win', () => {
    const result = resolveReportTemplate({
      caseStatus: 'in-progress',
      performingFacilityId: 'FAC-A',
      _facilityOverrides: { 'FAC-A': 'tmpl-facility-a' },
    } as any);
    expect(result.resolvedBy).toBe('preliminary-status');
    expect(result.templateId).toBe('tmpl-prelim-surgpath');
  });

  it('real, per PS-292\'s own explicit "stay strict" decision: pending-countersign still routes to Preliminary \u2014 the content isn\'t genuinely done until the attending\'s own countersign completes', () => {
    const result = resolveReportTemplate({ caseStatus: 'pending-countersign', subspecialtyId: 'breast' } as any);
    expect(result.resolvedBy).toBe('preliminary-status');
    expect(result.templateId).toBe('tmpl-prelim-surgpath');
  });

  it('real, deliberately investigated edge case: pending-release is treated as genuinely final, not Preliminary \u2014 the attending has already completed sign-out at that point, only external release is held back', () => {
    const result = resolveReportTemplate({ caseStatus: 'pending-release', subspecialtyId: 'breast' } as any);
    expect(result.resolvedBy).toBe('subspecialty');
    expect(result.templateId).not.toBe('tmpl-prelim-surgpath');
  });

  it('finalized proceeds normally to Final-report resolution', () => {
    const result = resolveReportTemplate({ caseStatus: 'finalized', subspecialtyId: 'breast' } as any);
    expect(result.resolvedBy).toBe('subspecialty');
  });

  it('an omitted caseStatus skips the gate entirely and resolves exactly as it did before this field existed \u2014 never a forced Preliminary default on missing data', () => {
    const result = resolveReportTemplate({ subspecialtyId: 'breast' } as any);
    expect(result.resolvedBy).toBe('subspecialty');
    expect(result.templateId).not.toBe('tmpl-prelim-surgpath');
  });
});
