// src/services/reportTemplates/resolveFinalDiagnosisText.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mockReportTemplateService', () => ({
  mockReportTemplateService: { getById: vi.fn() },
}));
vi.mock('../reportParts/mockReportPartService', () => ({
  mockReportPartService: { getByIds: vi.fn() },
}));

import { mockReportTemplateService } from './mockReportTemplateService';
import { mockReportPartService } from '../reportParts/mockReportPartService';
import { resolveFinalDiagnosisText } from './resolveFinalDiagnosisText';

function template(partIds: string[]) {
  return { ok: true, data: { assembly: partIds.map(partId => ({ partId })) } } as any;
}

beforeEach(() => {
  vi.mocked(mockReportTemplateService.getById).mockReset();
  vi.mocked(mockReportPartService.getByIds).mockReset();
});

describe('resolveFinalDiagnosisText', () => {
  it('a real, genuinely unknown template returns undefined honestly, never throws', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue({ ok: false, error: 'not found' } as any);
    const result = await resolveFinalDiagnosisText('tmpl-x', {});
    expect(result).toBeUndefined();
    expect(mockReportPartService.getByIds).not.toHaveBeenCalled();
  });

  it('no real node anywhere marked isFinalDiagnosisField returns undefined \u2014 never a guessed field', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{ nodes: [{ type: 'paragraph', bindingKey: 'diagnostic.diagnosticComment' }] }],
    } as any);
    const result = await resolveFinalDiagnosisText('tmpl-1', { diagnostic: { diagnosticComment: 'Some text.' } });
    expect(result).toBeUndefined();
  });

  it('a real, flat (non-repeat-group) designated field resolves its real value directly', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{ nodes: [{ type: 'paragraph', bindingKey: 'diagnostic.finalDiagnosis', isFinalDiagnosisField: true }] }],
    } as any);
    const result = await resolveFinalDiagnosisText('tmpl-1', { diagnostic: { finalDiagnosis: 'Invasive ductal carcinoma.' } });
    expect(result).toBe('Invasive ductal carcinoma.');
  });

  it('a real designated field inside a real repeat-group concatenates every real specimen\u2019s own value, per direct guidance', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{
        nodes: [{
          type: 'repeat-group', iterateOver: 'specimens', itemAlias: 'specimen',
          children: [{ type: 'paragraph', bindingKey: 'specimen.diagnosis', isFinalDiagnosisField: true }],
        }],
      }],
    } as any);
    const answers = { specimens: [{ diagnosis: 'Specimen A: benign.' }, { diagnosis: 'Specimen B: malignant.' }] };
    const result = await resolveFinalDiagnosisText('tmpl-1', answers);
    expect(result).toBe('Specimen A: benign.\n\nSpecimen B: malignant.');
  });

  it('a real repeat-group with one real specimen genuinely empty skips only that one, never fabricating a placeholder for it', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{
        nodes: [{
          type: 'repeat-group', iterateOver: 'specimens', itemAlias: 'specimen',
          children: [{ type: 'paragraph', bindingKey: 'specimen.diagnosis', isFinalDiagnosisField: true }],
        }],
      }],
    } as any);
    const answers = { specimens: [{ diagnosis: 'Specimen A: benign.' }, { diagnosis: '' }, { diagnosis: undefined }] };
    const result = await resolveFinalDiagnosisText('tmpl-1', answers);
    expect(result).toBe('Specimen A: benign.');
  });

  it('a real designated field with a genuinely empty repeat-group array (no real specimens at all yet) returns undefined', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [{
        nodes: [{
          type: 'repeat-group', iterateOver: 'specimens', itemAlias: 'specimen',
          children: [{ type: 'paragraph', bindingKey: 'specimen.diagnosis', isFinalDiagnosisField: true }],
        }],
      }],
    } as any);
    const result = await resolveFinalDiagnosisText('tmpl-1', { specimens: [] });
    expect(result).toBeUndefined();
  });

  it('designated fields found across two real, separate parts on the same template are both resolved and concatenated', async () => {
    vi.mocked(mockReportTemplateService.getById).mockResolvedValue(template(['part-1', 'part-2']));
    vi.mocked(mockReportPartService.getByIds).mockResolvedValue({
      ok: true, data: [
        { nodes: [{ type: 'paragraph', bindingKey: 'diagnostic.a', isFinalDiagnosisField: true }] },
        { nodes: [{ type: 'paragraph', bindingKey: 'diagnostic.b', isFinalDiagnosisField: true }] },
      ],
    } as any);
    const result = await resolveFinalDiagnosisText('tmpl-1', { diagnostic: { a: 'First.', b: 'Second.' } });
    expect(result).toBe('First.\n\nSecond.');
  });
});
