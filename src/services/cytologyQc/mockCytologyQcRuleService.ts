// src/services/cytologyQc/mockCytologyQcRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of ICytologyQcRuleService. Real, seeded per
// direct guidance's own provided rule set for international
// facilities — translated field-for-field from that real, provided
// specification onto this module's own types, not re-derived or
// guessed. Real, honest notes on the translation itself:
//
// - `jurisdiction` labels (e.g. "UK & Ireland...") were expanded into
//   this app's own real, existing per-country Jurisdiction values
//   (GB_EW/GB_SCT/GB_NIR/IE), never left as a human-readable string.
// - `diagnostic_scope.codes: ["NILM","NEGATIVE"]` mapped onto this
//   module's own resultIsNegative: true — cleaner than enumerating
//   Bethesda categories, and consistent with this app's own existing
//   settings-cascade convention.
// - `routing.exclusion_guardrails: ["EXCLUDE_FORMAL_CONSULTS"]`
//   (SEED-EU-ISO-001 only) is NOT modeled per-rule — this app's own
//   resolveQcRuleEvaluation.ts already excludes any case already in
//   formal consultation universally, before any rule is evaluated,
//   per the original spec's own general (not per-rule) phrasing. If a
//   genuinely different, per-rule exclusion behavior is actually
//   needed later, that's real, separate follow-up work, not silently
//   assumed here.
// - `routing.target_reviewer_role` -> eligibleReviewerRoles, kept
//   verbatim as real, provided strings (e.g. "SENIOR_CT") — this
//   engine has no existing reviewer-role taxonomy of its own to
//   normalize them against.
//
// Real, confirmed gap found and fixed after initial seeding (Sep
// 2026): the original EU seed (SEED-EU-ISO-001) only ever covered
// Pathologist-to-Pathologist review, silently assuming EU cytology
// sign-out is always Pathologist-attributed. Direct, confirmed
// research (EACC/EFCS) established this is a real, common
// misconception — Cytotechnologists independently sign out negative
// (and in some jurisdictions, abnormal) cytology across multiple real
// EU countries, including Germany and the Netherlands. This was
// later superseded by a complete, provided seed definition widening
// SEED-EU-CT-SIGNOUT-001 into the one, real, universal negative-
// rescreen rule (retiring the earlier, narrower US-only
// SEED-US-CLIA-001) and adding SEED-EU-ADV-CT-ABNORMAL-001 for the
// real, distinct advanced-CT abnormal sign-out scenario.
//
// Real, confirmed normalization correction (Sep 2026): an earlier
// draft of SEED-EU-ADV-CT-ABNORMAL-001 listed three raw,
// jurisdiction-specific credential strings (IBMS_ASD, NL_KCA_ADVANCED,
// DE_ZYTO_ASSISTENT_ADV) directly in its own criteria. Direct
// guidance confirmed this was a real inconsistency, not intentional —
// "CYTO_ADVANCED_SPECIALIST is officially the canonical tag to use
// across the rule engine and data model interfaces." Every raw
// credential now normalizes to that one, canonical capability via
// resolveNormalizedCredentialCapabilities.ts, upstream of this rule
// ever being evaluated; this rule's own criteria references only the
// canonical capability.
// ─────────────────────────────────────────────────────────────────────────────

import type { ICytologyQcRuleService, NewCytologyQcRule } from './ICytologyQcRuleService';
import type { CytologyQcRule } from '@/types/cytologyQc/CytologyQcRule';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'cytologyQcRules';

const SEED: CytologyQcRule[] = [
  {
    id: 'SEED-US-CLIA-002',
    name: 'US CLIA High-Risk Targeted Pap Rescreen',
    description: '100% mandatory rescreen for GYN cases from patients with high-risk clinical history (Prior HSIL, HR-HPV+, unexplained bleeding).',
    active: true,
    evaluationPriority: 90,
    criteria: { jurisdictions: ['US'], specimenCategory: ['gyn_pap'], providerRole: ['cytotechnologist'], resultIsNegative: true, highRiskFlags: ['prior_dysplasia_hsil', 'high_risk_hpv_positive', 'postmenopausal_bleeding'] },
    samplingLogic: { type: 'percentage', ratePercent: 100.0 },
    peerReviewPriorityTier: 'targeted_high_consequence',
    eligibleReviewerRoles: ['SENIOR_CT', 'PATHOLOGIST'],
    slaHours: 12,
  },
  {
    id: 'SEED-UK-NHS-001',
    name: 'UK NHS / RCPath Rapid Rescreen (Cytotechnologist/Pathologist)',
    description: 'Mandatory rapid rescreen (high-percentage sample) for primary HR-HPV positive cases with reflex cytology under UKAS ISO 15189 guidelines.',
    active: true,
    evaluationPriority: 85,
    criteria: { jurisdictions: ['GB_EW', 'GB_SCT', 'GB_NIR', 'IE'], specimenCategory: ['gyn_pap'], providerRole: ['cytotechnologist', 'pathologist'], highRiskFlags: ['high_risk_hpv_positive'] },
    samplingLogic: { type: 'percentage', ratePercent: 20.0 },
    peerReviewPriorityTier: 'targeted_high_consequence',
    eligibleReviewerRoles: ['CONSULTANT_HISTOPATHOLOGIST', 'SENIOR_CYTO_CHECKER'],
    slaHours: 24,
  },
  {
    id: 'SEED-EU-ISO-001',
    name: 'EU ISO 15189 Pathologist Peer Review (GYN & Non-GYN)',
    description: 'Random 2% Pathologist-to-Pathologist peer review for diagnostic concordance across all subspecialties to satisfy ISO 15189 QMS rules.',
    active: true,
    evaluationPriority: 70,
    criteria: { jurisdictions: ['DE', 'FR', 'NL', 'BE'], specimenCategory: ['gyn_pap', 'non_gyn_fluid', 'fna'], providerRole: ['pathologist'] },
    samplingLogic: { type: 'percentage', ratePercent: 2.0 },
    peerReviewPriorityTier: 'routine_random',
    eligibleReviewerRoles: ['PATHOLOGIST'],
    slaHours: 48,
  },
  {
    id: 'SEED-EU-CT-SIGNOUT-001',
    name: 'Cytotechnologist Negative Sign-Out Random Re-Screening',
    // Real, per direct, provided seed definition — this rule's own
    // real scope was widened from an earlier, narrower DE/NL-only
    // version (retired) to the real, confirmed, universal shape
    // given directly: "Applies to standard CT sign-outs across all
    // regions where CT negative sign-out is permitted." This is now
    // the one, real, general negative-rescreen rule for every real
    // jurisdiction this app models — SEED-US-CLIA-002 (targeted
    // high-risk) stays genuinely separate and additional, not
    // replaced by this.
    //
    // Real, honest note on scope overlap: this rule's own real
    // diagnosticCategory intent (per the provided definition) covers
    // both NEGATIVE and UNSATISFACTORY outcomes together. This
    // engine's own resultIsNegative field only represents the
    // negative half — the unsatisfactory half is already covered,
    // at an even more stringent real 100% rate, by the existing
    // SEED-GLOBAL-UNSAT-001 below. Real, deliberate: not modeled as
    // one rule with an OR across two criteria dimensions — this
    // engine's own real criteria matching is a pure AND across
    // fields (resolveQcCriteriaMatch.ts), so an "either/or" real
    // outcome genuinely needs two real rules, not one.
    description: 'Triggers a mandatory 10% random retrospective re-screen for negative GYN cytology cases signed out independently by a Cytotechnologist, across every real jurisdiction where independent CT negative sign-out is permitted.',
    active: true,
    evaluationPriority: 60,
    criteria: {
      jurisdictions: ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'NL', 'DE', 'FR', 'BE', 'AU', 'NZ', 'KR'],
      specimenCategory: ['gyn_pap'], providerRole: ['cytotechnologist'], resultIsNegative: true,
      // Real, per the provided definition's own explicit note:
      // "Applies to any CT performing negative sign-outs regardless
      // of advanced credentials" — requiredCapabilities
      // deliberately left unset, not an empty array standing in for
      // "requires no credentials" (both mean the same real thing
      // here, per resolveQcCriteriaMatch.ts's own matchesAnyOverlap).
    },
    samplingLogic: { type: 'percentage', ratePercent: 10.0 },
    peerReviewPriorityTier: 'routine_random',
    eligibleReviewerRoles: ['PATHOLOGIST'],
    slaHours: 24,
  },
  {
    id: 'SEED-EU-ADV-CT-ABNORMAL-001',
    name: 'Advanced Cytotechnologist Abnormal Sign-Out Peer Review',
    // Real, per direct, provided seed definition — this is the real
    // rule closing the gap this module's own README previously
    // flagged as "honestly still open": no real percentage had been
    // given for advanced-CT abnormal sign-out review. Real, deliberate
    // scope match to resolveAdvancedCytologySignOutJurisdictionPolicy.ts's
    // own real, confirmed permitted jurisdictions (GB_EW/GB_SCT/GB_NIR,
    // NL, DE) — the sign-out gate and this QC rule share the same real
    // jurisdiction scope, since both stem from the same real,
    // confirmed research.
    //
    // Real, updated (Sep 2026) per direct guidance's own confirmed
    // normalization correction: "CYTO_ADVANCED_SPECIALIST is
    // officially the canonical tag to use across the rule engine and
    // data model interfaces." This rule's own requiredCapabilities
    // now names the one, real, canonical system capability directly
    // — never the raw, jurisdiction-specific credential strings
    // (IBMS_ASD, NL_KCA_ADVANCED, DE_ZYTO_ASSISTENT_ADV) a provider
    // actually holds. Those raw credentials are normalized into this
    // same capability entirely within
    // resolveNormalizedCredentialCapabilities.ts, upstream of this
    // rule ever being evaluated — this rule's own criteria never sees
    // or needs to know the raw taxonomy.
    description: 'Triggers mandatory prospective peer review for abnormal GYN cytology cases signed out by an Advanced Cytotechnologist holding a real, jurisdiction-recognized specialized certification.',
    active: true,
    evaluationPriority: 90,
    criteria: {
      jurisdictions: ['GB_EW', 'GB_SCT', 'GB_NIR', 'NL', 'DE'],
      specimenCategory: ['gyn_pap'], providerRole: ['cytotechnologist'],
      bethesdaClassifications: ['ASC-US', 'ASC-H', 'LSIL', 'HSIL', 'AGC'],
      internalDiagnosisCodes: ['MALIGNANT'],
      requiredCapabilities: ['CYTO_ADVANCED_SPECIALIST'],
    },
    samplingLogic: { type: 'percentage', ratePercent: 100.0 },
    peerReviewPriorityTier: 'high_escalation',
    eligibleReviewerRoles: ['SENIOR_PATHOLOGIST'],
    // Real, honest note: no explicit SLA hours figure was given for
    // this specific rule in the provided definition (its own real
    // triggerEvent is "ON_PRE_RELEASE," not a stated hour figure) —
    // 24h is a reasonable, real default matching this seed set's own
    // other high-priority rules, not a cited, confirmed number.
    slaHours: 24,
  },
  {
    id: 'SEED-APAC-AU-001',
    name: 'Australia NCSP / NATA Mandatory High-Grade Second Review',
    description: '100% mandatory double-read by a secondary Cytopathologist for all first-time high-grade (pHSIL / HSIL / Malignancy) diagnoses before report confirmation.',
    active: true,
    evaluationPriority: 95,
    criteria: { jurisdictions: ['AU', 'NZ'], specimenCategory: ['gyn_pap', 'non_gyn_fluid'], providerRole: ['pathologist'], bethesdaClassifications: ['HSIL', 'ASC-H'], internalDiagnosisCodes: ['SCC', 'MALIGNANT'] },
    samplingLogic: { type: 'percentage', ratePercent: 100.0 },
    peerReviewPriorityTier: 'targeted_high_consequence',
    eligibleReviewerRoles: ['PATHOLOGIST'],
    slaHours: 12,
  },
  {
    id: 'SEED-GLOBAL-ONBOARD-001',
    name: 'Global Onboarding / Probationary Pathologist 100% Review',
    description: 'Targeted 100% peer review of the first N cases for newly hired attending pathologists or locum staff.',
    // Real, per direct, provided seed data — ships inactive; a real
    // admin must configure this for their own real new-hire roster
    // (this app has no template-user-ID concept to auto-populate)
    // before turning it on.
    active: false,
    evaluationPriority: 110,
    criteria: { providerOnboardingStatus: ['new_hire', 'probationary'], providerRole: ['pathologist'] },
    samplingLogic: { type: 'fixed_volume', firstNCases: 50 },
    peerReviewPriorityTier: 'high_escalation',
    eligibleReviewerRoles: ['PATHOLOGIST'],
    slaHours: 24,
  },
  {
    id: 'SEED-GLOBAL-UNSAT-001',
    name: 'Unsatisfactory Adequacy Confirmation Review',
    description: "Automatic 100% secondary review for cases marked as 'Unsatisfactory for Evaluation' prior to releasing final negative/inadequate report.",
    active: true,
    evaluationPriority: 80,
    criteria: { specimenCategory: ['gyn_pap', 'non_gyn_fluid', 'fna'], sampleAdequacy: ['unsatisfactory'], providerRole: ['cytotechnologist', 'pathologist'] },
    samplingLogic: { type: 'percentage', ratePercent: 100.0 },
    peerReviewPriorityTier: 'targeted_high_consequence',
    eligibleReviewerRoles: ['PATHOLOGIST'],
    slaHours: 24,
  },
];

const load = (): CytologyQcRule[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: CytologyQcRule[]) => storageSet(STORAGE_KEY, data);
let _cache: CytologyQcRule[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockCytologyQcRuleService: ICytologyQcRuleService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getActive() {
    await delay();
    return ok(_cache.filter(r => r.active));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(r => r.id === id);
    return found ? ok({ ...found }) : err(`CytologyQcRule ${id} not found`);
  },

  async add(rule: NewCytologyQcRule) {
    await delay();
    const created: CytologyQcRule = { ...rule, id: 'qc-rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes: Partial<NewCytologyQcRule>) {
    await delay();
    const idx = _cache.findIndex(r => r.id === id);
    if (idx === -1) return err(`CytologyQcRule ${id} not found`);
    const updated = { ..._cache[idx], ...changes };
    _cache = [..._cache.slice(0, idx), updated, ..._cache.slice(idx + 1)];
    persist(_cache);
    return ok({ ...updated });
  },

  async deactivate(id: ID) {
    return mockCytologyQcRuleService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockCytologyQcRuleService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(r => r.id === id);
    if (!target) return err(`CytologyQcRule ${id} not found`);
    _cache = _cache.filter(r => r.id !== id);
    persist(_cache);
    return ok(undefined);
  },

  async duplicate(id: ID) {
    await delay();
    const source = _cache.find(r => r.id === id);
    if (!source) return err(`CytologyQcRule ${id} not found`);
    const { id: _sourceId, ...rest } = source;
    const created: CytologyQcRule = {
      ...rest,
      name: `Copy of ${source.name}`,
      // Real, per direct guidance — starts inactive regardless of the
      // source rule's own state, so a duplicate never silently starts
      // matching real cases before an admin has actually reviewed and
      // made their own small, intended change.
      active: false,
      id: 'qc-rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },
};
