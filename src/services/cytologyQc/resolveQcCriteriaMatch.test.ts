import { describe, it, expect } from 'vitest';
import { resolveQcCriteriaMatch, type QcEvaluationCaseContext } from './resolveQcCriteriaMatch';
import type { QcRuleCriteria } from '@/types/cytologyQc/CytologyQcRule';

const baseContext = (over: Partial<QcEvaluationCaseContext> = {}): QcEvaluationCaseContext => ({
  jurisdiction: 'US',
  primarySignOutProviderId: 'prov-1',
  providerRole: 'cytotechnologist',
  specimenCategory: 'gyn_pap',
  sampleAdequacy: 'satisfactory',
  activeHighRiskFlags: [],
  resultIsNegative: true,
  providerCapabilities: [],
  ...over,
});

describe('resolveQcCriteriaMatch', () => {
  it('an empty criteria object matches every real case, per the "unset dimension never excludes" rule', () => {
    expect(resolveQcCriteriaMatch({}, baseContext())).toBe(true);
  });

  it('a real specimenCategory filter only matches the real, specified categories', () => {
    const criteria: QcRuleCriteria = { specimenCategory: ['fna'] };
    expect(resolveQcCriteriaMatch(criteria, baseContext({ specimenCategory: 'fna' }))).toBe(true);
    expect(resolveQcCriteriaMatch(criteria, baseContext({ specimenCategory: 'gyn_pap' }))).toBe(false);
  });

  it('multiple real criteria dimensions are ANDed together, not ORed', () => {
    const criteria: QcRuleCriteria = { providerRole: ['pathologist'], sampleAdequacy: ['unsatisfactory'] };
    expect(resolveQcCriteriaMatch(criteria, baseContext({ providerRole: 'pathologist', sampleAdequacy: 'unsatisfactory' }))).toBe(true);
    expect(resolveQcCriteriaMatch(criteria, baseContext({ providerRole: 'pathologist', sampleAdequacy: 'satisfactory' }))).toBe(false);
  });

  it('a real highRiskFlags criteria matches on any overlap, never requiring every flag present', () => {
    const criteria: QcRuleCriteria = { highRiskFlags: ['prior_dysplasia_hsil', 'postmenopausal_bleeding'] };
    expect(resolveQcCriteriaMatch(criteria, baseContext({ activeHighRiskFlags: ['postmenopausal_bleeding'] }))).toBe(true);
    expect(resolveQcCriteriaMatch(criteria, baseContext({ activeHighRiskFlags: ['clinical_symptoms'] }))).toBe(false);
  });

  it('a real onboarding-status criteria never matches a context with no real onboarding status set', () => {
    const criteria: QcRuleCriteria = { providerOnboardingStatus: ['new_hire'] };
    expect(resolveQcCriteriaMatch(criteria, baseContext({ providerOnboardingStatus: undefined }))).toBe(false);
    expect(resolveQcCriteriaMatch(criteria, baseContext({ providerOnboardingStatus: 'new_hire' }))).toBe(true);
  });

  it('a real resultIsNegative criteria correctly distinguishes negative from non-negative cases, without needing to enumerate every Bethesda category', () => {
    const negativeOnly: QcRuleCriteria = { resultIsNegative: true };
    expect(resolveQcCriteriaMatch(negativeOnly, baseContext({ resultIsNegative: true }))).toBe(true);
    expect(resolveQcCriteriaMatch(negativeOnly, baseContext({ resultIsNegative: false }))).toBe(false);
  });

  it('a real jurisdiction-level criteria matches multiple real jurisdictions grouped as one region, per direct guidance\'s own "UK & Ireland" grouping', () => {
    const ukAndIreland: QcRuleCriteria = { jurisdictions: ['GB_EW', 'GB_SCT', 'GB_NIR', 'IE'] };
    expect(resolveQcCriteriaMatch(ukAndIreland, baseContext({ jurisdiction: 'GB_SCT' }))).toBe(true);
    expect(resolveQcCriteriaMatch(ukAndIreland, baseContext({ jurisdiction: 'US' }))).toBe(false);
  });

  it('a real requiredCapabilities criteria matches a provider holding the one, normalized capability it requires \u2014 never a raw, jurisdiction-specific credential string', () => {
    const requiresAdvancedCyto: QcRuleCriteria = { requiredCapabilities: ['CYTO_ADVANCED_SPECIALIST'] };
    expect(resolveQcCriteriaMatch(requiresAdvancedCyto, baseContext({ providerCapabilities: ['CYTO_ADVANCED_SPECIALIST'] }))).toBe(true);
    expect(resolveQcCriteriaMatch(requiresAdvancedCyto, baseContext({ providerCapabilities: [] }))).toBe(false);
  });

  it('an unset requiredCapabilities criteria matches every real provider, credentialed or not', () => {
    expect(resolveQcCriteriaMatch({}, baseContext({ providerCapabilities: [] }))).toBe(true);
    expect(resolveQcCriteriaMatch({}, baseContext({ providerCapabilities: ['CYTO_ADVANCED_SPECIALIST'] }))).toBe(true);
  });
});
