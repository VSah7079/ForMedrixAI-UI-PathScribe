// src/services/reportTemplates/validateFinalDiagnosisDesignation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mockReportTemplateService', () => ({
  mockReportTemplateService: { getById: vi.fn() },
}));
vi.mock('../reportParts/mockReportPartService', () => ({
  mockReportPartService: { getByIds: vi.fn() },
}));

import { mockReportTemplateService } from './mockReportTemplateService';
import { mockReportPartService } from '../reportParts/mockReportPartService';
import { validateFinalDiagnosisDesignation } from './validateFinalDiagnosisDesignation';

function template(partIds: string[]) {
  return { ok: true, data: { assembly: partIds.map(partId => ({ partId })) } } as any;
}

beforeEach(() => {
  vi.mocked(mockReportTemplateService.getById).mockReset();
  vi.mocked(mockReportPartService.getByIds).mockReset();
});

describe('validateFinalDiagnosisDesignation', () => {
  it('a real, genuinely unknown template fails honestly, never throws', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue({ ok: false, error: 'not found' } as any);
    const result = await validateFinalDiagnosisDesignation('tmpl-x');
    expect(result.ok).toBe(false);
  });

  it('a real Preliminary template (tmpl-prelim- prefix) always passes trivially, without even resolving its own real parts \u2014 the constraint has nothing to check there', async () => {
    const result = await validateFinalDiagnosisDesignation('tmpl-prelim-surgpath');
    expect(result.ok).toBe(true);
    expect(result.count).toBe(0);
    expect(mockReportTemplateService.getById).not.toHaveBeenCalled();
  });

  it('a real Final template with exactly one real designated field passes', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{ nodes: [{ type: 'paragraph', isFinalDiagnosisField: true }, { type: 'paragraph' }] }],
    } as any);
    const result = await validateFinalDiagnosisDesignation('tmpl-real');
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
  });

  it('a real Final template with zero real designated fields also passes \u2014 0 is a real, honest finding, not a failure on its own', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{ nodes: [{ type: 'paragraph' }] }],
    } as any);
    const result = await validateFinalDiagnosisDesignation('tmpl-real');
    expect(result.ok).toBe(true);
    expect(result.count).toBe(0);
  });

  it('a real Final template with two real designated fields fails, per direct guidance ("on Final reports yes")', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{ nodes: [{ type: 'paragraph', isFinalDiagnosisField: true }, { type: 'paragraph', isFinalDiagnosisField: true }] }],
    } as any);
    const result = await validateFinalDiagnosisDesignation('tmpl-real');
    expect(result.ok).toBe(false);
    expect(result.count).toBe(2);
  });

  it('counts a real designated field nested inside real, nested children (e.g. a repeat-group), not just top-level nodes', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{
        nodes: [{ type: 'repeat-group', children: [{ type: 'paragraph', isFinalDiagnosisField: true }] }],
      }],
    } as any);
    const result = await validateFinalDiagnosisDesignation('tmpl-real');
    expect(result.count).toBe(1);
  });
});

describe('validateFinalDiagnosisDesignation \u2014 real integration check against this app\u2019s own real, existing seed templates', () => {
  it('every real Final template (tmpl-gold-standard, tmpl-breast, tmpl-gi, tmpl-thoracic, tmpl-uro) has exactly one real, designated Final Diagnosis field \u2014 confirms the shared diagnosisPart designation applies correctly everywhere it\u2019s used', async () => {
    vi.doUnmock('./mockReportTemplateService');
    vi.doUnmock('../reportParts/mockReportPartService');
    vi.resetModules();
    const { validateFinalDiagnosisDesignation: realValidate } = await import('./validateFinalDiagnosisDesignation');

    for (const id of ['tmpl-gold-standard', 'tmpl-breast', 'tmpl-gi', 'tmpl-thoracic', 'tmpl-uro']) {
      const result = await realValidate(id);
      expect(result.ok, `${id} should have exactly one designated field`).toBe(true);
      expect(result.count, `${id} should have exactly one designated field`).toBe(1);
    }
  });
});
