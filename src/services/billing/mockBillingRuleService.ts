// src/services/billing/mockBillingRuleService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IBillingRuleService } from './IBillingRuleService';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import { resolveBillingRuleAt } from './resolveBillingRuleAt';
import { applyNaturalSunset } from './codeEngine/naturalSunset';
import { listAllSites, getOrganisation } from '../organisation/organisationService';

const STORAGE_KEY = 'billing_rule_versions_v1';

// Real, initial migration seed, per direct guidance's own "Initial
// migration" instructions: version 1 for every existing real
// billingCode this app already resolves against
// (codeMapTable.ts/CODE_MAP_TABLE - kept in sync with those same real,
// verified CPT codes/RVU values, including the same honest, disclosed
// RVU gaps for IHC-ADDL/PIN4-PANEL/FROZEN-FIRST/FROZEN-ADDL - real
// coding rule verified via direct search, RVU not fabricated). No real
// changeReason/approvedBy for this seed - it represents existing,
// already-shipped behavior being formally versioned for the first
// time, not a real rule change with a real approver behind it.
//
// Real fix, per direct guidance found during review: level and
// billingType added as two distinct, explicit fields (never merged
// - granularity and billing component type govern completely
// different operational lifecycle rules) - level values match
// CODE_MAP_TABLE's own real classification for these same codes;
// billingType defaults to 'Global' for this initial seed, same
// default CODE_MAP_TABLE itself uses.
//
// Real fix, per direct guidance (PS-92): description strings below
// are now the same synthetic "Code {cpt} — {Level} Level" format
// CODE_MAP_TABLE/mockRvuCodeMapService already use - this file's own
// descriptions were the one real gap PS-92's earlier pass missed,
// since this is a separate, third copy of the same reference data,
// found and closed during this review.
const SEED_VERSIONS: BillingRuleVersion[] = [
  { billingCode: '88300', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88300', description: 'Code 88300 — Specimen Level', level: 'specimen', billingType: 'Global', quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Real CPT code/description verified via direct search; RVU intentionally left unset for the client to configure' },
  { billingCode: '88302', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88302', description: 'Code 88302 — Specimen Level', rvuWork: 0.13, level: 'specimen', billingType: 'Global', quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: '88304', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88304', description: 'Code 88304 — Specimen Level', rvuWork: 0.21, level: 'specimen', billingType: 'Global', quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: '88305', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88305', description: 'Code 88305 — Specimen Level', rvuWork: 0.73, level: 'specimen', billingType: 'Global', quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: '88307', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88307', description: 'Code 88307 — Specimen Level', rvuWork: 1.55, level: 'specimen', billingType: 'Global', quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: '88309', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88309', description: 'Code 88309 — Specimen Level', level: 'specimen', billingType: 'Global', quantityRules: 'per specimen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Real CPT code/description verified via direct search; RVU intentionally left unset for the client to configure' },
  { billingCode: 'SPECIAL-STAIN', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88312', description: 'Code 88312 — Stain Level', rvuWork: 0.53, level: 'stain', billingType: 'Global', quantityRules: 'per special stain ordered', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: 'IHC-FIRST', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88342', description: 'Code 88342 — Stain Level', rvuWork: 0.68, level: 'stain', billingType: 'Global', modifiersAllowed: ['26', 'TC'], quantityRules: 'per block, first real IHC stain', bundlingRules: 'IHC sequence first', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - existing app behavior' },
  { billingCode: 'IHC-ADDL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88341', description: 'Code 88341 — Stain Level', level: 'stain', billingType: 'Global', modifiersAllowed: ['26', 'TC'], quantityRules: 'per block, each additional real IHC stain', bundlingRules: 'IHC sequence additional', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - real CPT code/coding rule verified via direct search; RVU honestly unverified, not fabricated' },
  // Real, direct follow-up (PS-83): Work RVU sourced via web search
  // (findacode.com — the authoritative CMS PPRRVU file itself wasn't
  // directly parseable), not fabricated or extrapolated from the stale
  // 2015 RUC figure this ticket's own history already rejected. Seed
  // data the customer validates against their own current fee schedule
  // (per direct guidance) — PENDING_APPROVAL, same posture as the 88307
  // illustrative example above, not silently promoted to ACTIVE.
  { billingCode: 'IHC-ADDL', version: 2, effectiveFrom: '2026-09-18', effectiveTo: null, status: 'PENDING_APPROVAL', cpt: '88341', description: 'Code 88341 — Stain Level', rvuWork: 0.55, level: 'stain', billingType: 'Global', modifiersAllowed: ['26', 'TC'], quantityRules: 'per block, each additional real IHC stain', bundlingRules: 'IHC sequence additional', country: 'US', createdAt: '2026-09-18T00:00:00.000Z', createdBy: 'system-seed', changeReason: 'Work RVU 0.55 sourced via web search (findacode.com) — not verified against the authoritative CMS PPRRVU file directly. Customer must validate against their own current fee schedule before this version is approved.', submittedForApprovalBy: 'system-seed', submittedForApprovalAt: '2026-09-18T00:00:00.000Z' },
  { billingCode: 'PIN4-PANEL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88344', description: 'Code 88344 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per specimen, standalone multiplex panel', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - real CPT code/coding rule verified via direct search; RVU honestly unverified, not fabricated' },
  { billingCode: 'PIN4-PANEL', version: 2, effectiveFrom: '2026-09-18', effectiveTo: null, status: 'PENDING_APPROVAL', cpt: '88344', description: 'Code 88344 — Stain Level', rvuWork: 0.75, level: 'stain', billingType: 'Global', quantityRules: 'per specimen, standalone multiplex panel', country: 'US', createdAt: '2026-09-18T00:00:00.000Z', createdBy: 'system-seed', changeReason: 'Work RVU 0.75 sourced via web search (findacode.com) — not verified against the authoritative CMS PPRRVU file directly. Customer must validate against their own current fee schedule before this version is approved.', submittedForApprovalBy: 'system-seed', submittedForApprovalAt: '2026-09-18T00:00:00.000Z' },
  // Real, per direct fix - discovered via direct testing that
  // mockStainTypeService.ts's p63/CK5/6 Dual Stain pointed its own
  // defaultBillingCode at PIN4-PANEL above, a clinically different,
  // prostate-specific cocktail (P504S/p63/HMWCK) that only happens to
  // share the same real CPT code (88344, the generic multiplex-
  // antibody-stain procedure code). A shared CPT doesn't mean a shared
  // billingCode - reusing PIN4-PANEL would have shown the wrong panel
  // name in this specimen's own real audit trail. Its own, honestly-
  // named entry instead, same real CPT.
  { billingCode: 'P63-CK56-DUAL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88344', description: 'Code 88344 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, standalone dual-antibody stain', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Real, per direct fix - same real CPT as PIN4-PANEL, genuinely different panel; RVU honestly unverified, not fabricated' },
  { billingCode: 'FROZEN-FIRST', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88331', description: 'Code 88331 — Block Level', level: 'block', billingType: 'Global', quantityRules: 'per specimen, first frozen tissue block', documentationRequirements: ['pathologist interpretation'], country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - real CPT code/coding rule verified via direct search; RVU honestly unverified, not fabricated' },
  // Real, direct follow-up (PS-83) — same posture as IHC-ADDL/PIN4-PANEL
  // above: web-search-sourced (findacode.com), not the authoritative
  // PPRRVU file, PENDING_APPROVAL pending customer validation. Close to
  // but not identical to the 2015 RUC figure (1.19) this ticket's own
  // history already flagged as too stale to use — plausible decade-long
  // drift, not a red flag.
  { billingCode: 'FROZEN-FIRST', version: 2, effectiveFrom: '2026-09-18', effectiveTo: null, status: 'PENDING_APPROVAL', cpt: '88331', description: 'Code 88331 — Block Level', rvuWork: 1.16, level: 'block', billingType: 'Global', quantityRules: 'per specimen, first frozen tissue block', documentationRequirements: ['pathologist interpretation'], country: 'US', createdAt: '2026-09-18T00:00:00.000Z', createdBy: 'system-seed', changeReason: 'Work RVU 1.16 sourced via web search (findacode.com) — not verified against the authoritative CMS PPRRVU file directly. Customer must validate against their own current fee schedule before this version is approved.', submittedForApprovalBy: 'system-seed', submittedForApprovalAt: '2026-09-18T00:00:00.000Z' },
  { billingCode: 'FROZEN-ADDL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88332', description: 'Code 88332 — Block Level', level: 'block', billingType: 'Global', quantityRules: 'per specimen, each additional frozen tissue block', documentationRequirements: ['pathologist interpretation'], country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Initial migration - real CPT code/coding rule verified via direct search; RVU honestly unverified, not fabricated' },
  { billingCode: 'FROZEN-ADDL', version: 2, effectiveFrom: '2026-09-18', effectiveTo: null, status: 'PENDING_APPROVAL', cpt: '88332', description: 'Code 88332 — Block Level', rvuWork: 0.58, level: 'block', billingType: 'Global', quantityRules: 'per specimen, each additional frozen tissue block', documentationRequirements: ['pathologist interpretation'], country: 'US', createdAt: '2026-09-18T00:00:00.000Z', createdBy: 'system-seed', changeReason: 'Work RVU 0.58 sourced via web search (findacode.com) — not verified against the authoritative CMS PPRRVU file directly. Customer must validate against their own current fee schedule before this version is approved.', submittedForApprovalBy: 'system-seed', submittedForApprovalAt: '2026-09-18T00:00:00.000Z' },
  // Real, per direct guidance's own detailed CPT research - Anatomic
  // Pathology FISH (88364-88377), three real, distinct scoring-method
  // variants, each its own base/add-on/multiplex trio. See
  // MolecularBillingRule.ts/calculateMolecularUnits.ts for how a real
  // target count resolves to these. PS-92 synthetic descriptions only,
  // same as every other real dictionary entry - no real AMA text.
  { billingCode: 'FISH-MANUAL-BASE', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88368', description: 'Code 88368 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, first probe, manual direct count', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-MANUAL-ADDL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88369', description: 'Code 88369 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, each additional probe, manual direct count', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-MANUAL-MULTIPLEX', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88377', description: 'Code 88377 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, 3+ probes, manual direct count', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-COMPASSIST-BASE', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88367', description: 'Code 88367 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, first probe, computer-assisted', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-COMPASSIST-ADDL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88373', description: 'Code 88373 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, each additional probe, computer-assisted', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-COMPASSIST-MULTIPLEX', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88374', description: 'Code 88374 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, 3+ probes, computer-assisted', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-QUAL-BASE', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88365', description: 'Code 88365 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, first probe, qualitative/non-quantitative', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-QUAL-ADDL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88364', description: 'Code 88364 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, each additional probe, qualitative/non-quantitative', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-QUAL-MULTIPLEX', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88366', description: 'Code 88366 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, 3+ probes, qualitative/non-quantitative', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  // Real, per direct guidance - Cytogenetic FISH (88271-88275), a
  // genuinely different real structural model: a per-probe multiplier
  // (88271 x N) rather than a base/add-on/multiplex trio, plus real,
  // separate cell-count-tier codes (88272-88275) for the analysis
  // itself, paired alongside the probe charge, not part of the same
  // multiplier count.
  { billingCode: 'FISH-CYTO-PROBE', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88271', description: 'Code 88271 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, N units = N real probes hybridized', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-CYTO-3-5CELL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88272', description: 'Code 88272 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, chromosomal ISH, 3-5 cells analyzed', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-CYTO-10-30CELL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88273', description: 'Code 88273 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, chromosomal ISH, 10-30 cells analyzed', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-CYTO-25-99CELL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88274', description: 'Code 88274 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, interphase ISH, 25-99 cells analyzed', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  { billingCode: 'FISH-CYTO-100-300CELL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88275', description: 'Code 88275 — Stain Level', level: 'stain', billingType: 'Global', quantityRules: 'per block, interphase ISH, 100-300 cells analyzed', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; RVU intentionally left unset for the client to configure' },
  // Real, per direct guidance ("Cytology GYN will be coming soon") -
  // confirmed via direct search before adding, same PS-92 discipline
  // as every other real code in this dictionary. 88164 (conventional,
  // Bethesda system) and 88175 (liquid-based, automated screening with
  // manual review - the ThinPrep-typical modern variant) are each one
  // real, representative code among several real, valid alternatives
  // that depend on a lab's own screening workflow (manual vs
  // automated) - notes below disclose this honestly, not fabricated
  // as the one, universally-correct choice.
  { billingCode: 'PAP-CONVENTIONAL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88164', description: 'Code 88164 — Specimen Level', level: 'specimen', billingType: 'Global', quantityRules: 'per specimen, conventional Pap smear, Bethesda system reporting', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; real code verified via direct search. One of several real, valid conventional-Pap codes (88150-88155 non-Bethesda, 88164-88167 Bethesda) depending on the lab\'s own reporting system - confirm against your actual workflow before relying on this default. RVU intentionally left unset.' },
  { billingCode: 'PAP-THINPREP', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88175', description: 'Code 88175 — Specimen Level', level: 'specimen', billingType: 'Global', quantityRules: 'per specimen, liquid-based Pap (ThinPrep), automated screening with manual review', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; real code verified via direct search. One of several real, valid liquid-based codes (88142/88143 manual screening, 88174/88175 automated) depending on the lab\'s own screening workflow - confirm against your actual workflow before relying on this default. RVU intentionally left unset.' },
  { billingCode: 'HPV-HIGHRISK-SCREEN', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '87624', description: 'Code 87624 — Specimen Level', level: 'specimen', billingType: 'Global', quantityRules: 'per specimen, high-risk HPV types, pooled result - billed when only the screen is performed', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; real code verified via direct search (revised 2025 CPT set). RVU intentionally left unset.' },
  { billingCode: 'HPV-GENOTYPING', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '87625', description: 'Code 87625 — Specimen Level', level: 'specimen', billingType: 'Global', quantityRules: 'per specimen, HPV types 16/18 (includes 45 if performed) - individually reported, real reflex test following a positive 87624 screen', country: 'US', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system-seed', notes: 'Synthetic description per PS-92; real code verified via direct search. Honest, disclosed limitation: this app has no real, conditional result-based billing logic yet - see the "HPV High-Risk Screening with Reflex Genotyping" Diagnostic Assay entry\'s own notes for how the reflex portion is (and is not yet) handled.' },
  // Real, per direct request ahead of the Billing expert meeting - a
  // realistic PENDING_APPROVAL example (Pending Billing Rule
  // Approvals had zero seed data, confirmed directly). A plausible
  // annual RVU update to an EXISTING, active code (88307 v1 stays
  // ACTIVE and resolvable throughout - this v2 draft is not yet
  // resolvable by resolveBillingRuleAt, per this file's own real
  // PENDING_APPROVAL semantics), submitted by one real user, awaiting
  // a different real reviewer. Honest, explicit disclosure: the RVU
  // delta below is illustrative for the demo, not a verified real
  // 2027 CMS Physician Fee Schedule figure - see notes.
  { billingCode: '88307', version: 2, effectiveFrom: '2027-01-01', effectiveTo: null, status: 'PENDING_APPROVAL', cpt: '88307', description: 'Code 88307 — Specimen Level', rvuWork: 1.58, level: 'specimen', billingType: 'Global', quantityRules: 'per specimen', country: 'US', createdAt: '2026-08-20T09:00:00.000Z', createdBy: 'PATH-UK-002', changeReason: 'Illustrative example ahead of the annual CMS Physician Fee Schedule update cycle (final rule typically released in November for the following year) - RVU delta shown is for demo purposes only, not a verified real 2027 figure.', submittedForApprovalBy: 'PATH-UK-002', submittedForApprovalAt: '2026-08-20T09:00:00.000Z' },
];

// PS-89 §10 (Batch 333): rows stored before the Code Engine have no
// vocabulary (and a few no country); they are read as CPT / US. This is a
// field completion, not a new version, so it needs no changeReason.
const backfill = (v: BillingRuleVersion): BillingRuleVersion =>
  (v.vocabulary && v.country ? v : { ...v, vocabulary: v.vocabulary ?? 'CPT', country: v.country ?? 'US' });

/** All stored billing rule versions (shared with the Code Engine's
 *  import service). */
export const loadBillingRuleVersions = (): BillingRuleVersion[] => storageGet<BillingRuleVersion[]>(STORAGE_KEY, SEED_VERSIONS).map(backfill);
export const persistBillingRuleVersions = (versions: BillingRuleVersion[]) => storageSet(STORAGE_KEY, versions);
const load    = loadBillingRuleVersions;
const persist = persistBillingRuleVersions;

/** The country of the organisation a billing site belongs to, for the
 *  country filter (PS-89 §8). Undefined when unknown: no filtering. */
async function countryForSite(siteId: string | undefined): Promise<string | undefined> {
  if (!siteId) return undefined;
  try {
    const site = (await listAllSites()).find(s => s.id === siteId);
    if (!site?.organisationId) return undefined;
    return (await getOrganisation(site.organisationId))?.country;
  } catch {
    return undefined;
  }
}

/** A row created by a bulk import is decided with its job, not alone. */
const importJobRowError = (v: BillingRuleVersion) =>
  v.importJobId && v.status === 'PENDING_APPROVAL'
    ? `Version ${v.version} of "${v.billingCode}" belongs to import job ${v.importJobId}; approve or reject the job as a whole.`
    : null;

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

export const mockBillingRuleService: IBillingRuleService = {
  async getAll() {
    return ok([...load()].sort((a, b) => a.billingCode.localeCompare(b.billingCode) || (a.siteId ?? '').localeCompare(b.siteId ?? '') || a.version - b.version));
  },

  async getVersionsForBillingCode(billingCode, siteId) {
    // Real, deliberate: when siteId is given, returns ONLY that site's
    // own real version history for this billingCode - NOT merged with
    // the enterprise-wide one, since those are genuinely independent
    // real sequences (see BillingRuleVersion.ts's own header). Omitting
    // siteId returns the enterprise-wide history, exactly as before
    // site scoping existed.
    return ok(load().filter(v => v.billingCode === billingCode && (v.siteId ?? undefined) === (siteId ?? undefined)).sort((a, b) => a.version - b.version));
  },

  async getActiveRuleAt(billingCode, dateOfService, siteId, options) {
    // PS-89 §8: the country comes from site → organisation unless the
    // caller gives one; vocabulary defaults to CPT.
    const country = options?.country ?? await countryForSite(siteId);
    return ok(resolveBillingRuleAt(billingCode, dateOfService, load(), siteId, {
      vocabulary: options?.vocabulary ?? 'CPT',
      ...(country ? { country } : {}),
    }));
  },

  async createVersion(input) {
    if (!input.billingCode.trim()) return err('A billingCode is required.');
    if (!input.effectiveFrom) return err('A real effectiveFrom date is required.');
    if (!input.cpt.trim()) return err('A real CPT code is required — customers may create custom billingCodes, but they must map to a real CPT/HCPCS/RVU value, never invent their own.');

    const versions = load();
    // Real, deliberate: version numbering is scoped to
    // (billingCode, siteId) together - a site's own override history
    // is a real, independent sequence from the enterprise-wide row's
    // own history for the same billingCode, per direct, explicit
    // guidance and BillingRuleVersion.ts's own header.
    const existingForScope = versions.filter(v => v.billingCode === input.billingCode && (v.siteId ?? undefined) === (input.siteId ?? undefined));
    const nextVersion = existingForScope.length === 0 ? 1 : Math.max(...existingForScope.map(v => v.version)) + 1;

    // Real governance rule, per direct guidance: any version beyond
    // the first real one for a (billingCode, siteId) scope needs a
    // real changeReason on record - a rule change without a stated
    // reason isn't real audit history. A site's very first override of
    // an already-existing enterprise billingCode is still that site's
    // OWN version 1 - a real, new record, not "beyond the first" for
    // that site's own scope, so no changeReason is forced on it.
    if (nextVersion > 1 && !input.changeReason?.trim()) {
      return err('A real change reason is required when creating a new version of an existing billingCode/site combination.');
    }

    const newVersion: BillingRuleVersion = {
      ...input,
      version: nextVersion,
      // Real, per direct guidance's own Four-Eyes Principle
      // requirement: a new rule change no longer goes live on save.
      // An explicit status is still honored (the real, initial
      // migration seed passes 'ACTIVE' directly in its own literal
      // array below, never through this function, but any future
      // caller with a genuine reason to bypass DRAFT can still do so
      // explicitly).
      status: input.status ?? 'DRAFT',
      createdAt: new Date().toISOString(),
      vocabulary: input.vocabulary ?? 'CPT',
    };
    persist([...versions, newVersion]);
    return ok(newVersion);
  },

  async submitForApproval(billingCode, version, siteId, submittedBy) {
    const versions = load();
    const idx = versions.findIndex(v => v.billingCode === billingCode && v.version === version && (v.siteId ?? undefined) === (siteId ?? undefined));
    if (idx === -1) return err(`No real version ${version} found for billingCode "${billingCode}"${siteId ? ` at site "${siteId}"` : ' (enterprise-wide)'}.`);
    if (versions[idx].status !== 'DRAFT') return err(`Version ${version} of "${billingCode}" is not a real draft (currently ${versions[idx].status}) - only a draft can be submitted for approval.`);

    const updated: BillingRuleVersion = { ...versions[idx], status: 'PENDING_APPROVAL', submittedForApprovalBy: submittedBy, submittedForApprovalAt: new Date().toISOString() };
    const next = [...versions];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },

  async approveVersion(billingCode, version, siteId, reviewedBy) {
    const versions = load();
    const idx = versions.findIndex(v => v.billingCode === billingCode && v.version === version && (v.siteId ?? undefined) === (siteId ?? undefined));
    if (idx === -1) return err(`No real version ${version} found for billingCode "${billingCode}"${siteId ? ` at site "${siteId}"` : ' (enterprise-wide)'}.`);
    const target = versions[idx];
    if (target.status !== 'PENDING_APPROVAL') return err(`Version ${version} of "${billingCode}" is not real pending approval (currently ${target.status}).`);
    const jobRow = importJobRowError(target);
    if (jobRow) return err(jobRow);
    // Real, per direct guidance's own Four-Eyes Principle (dual
    // control) requirement - hard-enforced here, not just in the UI.
    // The person who drafted or submitted a change can never be the
    // one who approves it.
    if (reviewedBy === target.createdBy || reviewedBy === target.submittedForApprovalBy) {
      return err('Four-Eyes Principle: the person who drafted or submitted this change cannot approve it. A different, real reviewer is required.');
    }

    // PS-89 §6 natural sunset (Batch 333). This used to mark the prior
    // ACTIVE version RETIRED on approval, so approving a future-dated
    // change left every earlier date of service with no rule. Now the
    // prior version stays ACTIVE and is closed at the moment before the
    // new one starts (codeEngine/naturalSunset.ts).
    const updated: BillingRuleVersion = { ...target, status: 'ACTIVE', reviewedBy, reviewedAt: new Date().toISOString() };
    const versionsWithApproval = [...versions];
    versionsWithApproval[idx] = updated;
    persist(applyNaturalSunset(versionsWithApproval, updated).versions);
    return ok(updated);
  },

  async rejectVersion(billingCode, version, siteId, reviewedBy, rejectionReason) {
    if (!rejectionReason.trim()) return err('A real rejection reason is required.');
    const versions = load();
    const idx = versions.findIndex(v => v.billingCode === billingCode && v.version === version && (v.siteId ?? undefined) === (siteId ?? undefined));
    if (idx === -1) return err(`No real version ${version} found for billingCode "${billingCode}"${siteId ? ` at site "${siteId}"` : ' (enterprise-wide)'}.`);
    const target = versions[idx];
    if (target.status !== 'PENDING_APPROVAL') return err(`Version ${version} of "${billingCode}" is not real pending approval (currently ${target.status}).`);
    const jobRow = importJobRowError(target);
    if (jobRow) return err(jobRow);
    // Same real, hard-enforced dual-control gate as approveVersion.
    if (reviewedBy === target.createdBy || reviewedBy === target.submittedForApprovalBy) {
      return err('Four-Eyes Principle: the person who drafted or submitted this change cannot reject it either. A different, real reviewer is required.');
    }

    const updated: BillingRuleVersion = { ...target, status: 'REJECTED', reviewedBy, reviewedAt: new Date().toISOString(), rejectionReason: rejectionReason.trim() };
    const next = [...versions];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },

  async retireVersion(billingCode, version, effectiveTo, siteId) {
    const versions = load();
    const idx = versions.findIndex(v => v.billingCode === billingCode && v.version === version && (v.siteId ?? undefined) === (siteId ?? undefined));
    if (idx === -1) return err(`No real version ${version} found for billingCode "${billingCode}"${siteId ? ` at site "${siteId}"` : ' (enterprise-wide)'}.`);

    const updated: BillingRuleVersion = { ...versions[idx], status: 'RETIRED', effectiveTo: effectiveTo ?? versions[idx].effectiveTo ?? new Date().toISOString() };
    const next = [...versions];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },
};
