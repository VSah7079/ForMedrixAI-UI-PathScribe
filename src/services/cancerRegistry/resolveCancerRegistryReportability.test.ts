// src/services/cancerRegistry/resolveCancerRegistryReportability.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCancerRegistryReportability } from './resolveCancerRegistryReportability';

describe('resolveCancerRegistryReportability — real, per the already-documented NAACCR finding', () => {
  it('real, a genuine invasive malignancy (/3) with no applicable exclusion is reportable', () => {
    const result = resolveCancerRegistryReportability('8500/3', 'C50.9', 'Infiltrating ductal carcinoma, breast');
    expect(result.outcome).toBe('reportable');
  });

  it('real, cervical carcinoma in situ (/2, C53) is NOT reportable — the exact, already-documented critical exception', () => {
    const result = resolveCancerRegistryReportability('8077/2', 'C53.9', 'High-grade squamous intraepithelial lesion, cervix');
    expect(result.outcome).toBe('not_reportable');
    expect(result.reason).toContain('1996');
  });

  it('real, CIN III named directly in the diagnosis text is excluded even without a topography code supplied', () => {
    const result = resolveCancerRegistryReportability('8077/2', undefined, 'CIN III, cervix biopsy');
    expect(result.outcome).toBe('not_reportable');
  });

  it('real, invasive cervical carcinoma (/3, not in situ) IS reportable — the exclusion is specific to in-situ/CIN III, not the whole site', () => {
    const result = resolveCancerRegistryReportability('8070/3', 'C53.9', 'Invasive squamous cell carcinoma, cervix');
    expect(result.outcome).toBe('reportable');
  });

  it('real, a genuine benign behavior code (/0) is never reportable', () => {
    const result = resolveCancerRegistryReportability('8140/0', 'C50.9', 'Fibroadenoma, breast');
    expect(result.outcome).toBe('not_reportable');
  });

  it('real, an unparseable ICD-O code is honestly indeterminate, never silently defaulted either way', () => {
    const result = resolveCancerRegistryReportability('not-a-code', undefined, 'Some diagnosis');
    expect(result.outcome).toBe('indeterminate');
  });

  it('real, basal cell carcinoma of the skin is a named exclusion', () => {
    const result = resolveCancerRegistryReportability('8090/3', 'C44.3', 'Basal cell carcinoma, skin of face');
    expect(result.outcome).toBe('not_reportable');
  });
});
