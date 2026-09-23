// src/services/quality/mockQaActivityTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-113. Real, localStorage-backed CRUD for QaActivityType definitions -
// same real storage convention every other mock dictionary service in
// this app uses (ok/err/storageGet/storageSet), not the separate,
// Firestore-backed CAPA foundation from a prior sprint - that's a
// genuinely different, unrelated system.
//
// Seeded with two entries - the real "Frozen vs Final Correlation"
// definition (the activity type Discordance now runs on, migrated in
// Stage 3, old ReconciliationRecord/mockReconciliationService system
// retired and deleted in Stage 5 - first release, no real production
// history to preserve) and one small, illustrative second example,
// proving a genuinely different activity can be defined against the
// same model with zero changes to the model itself (PS-113's own
// acceptance criteria).
//
// Real fix (PS-115): both entries' own jurisdictions arrays used to
// read ['US','CA','EU','UK','AU','NZ','KR'] — silently wrong under the
// field's old loose `string[]` type, since neither 'EU' nor 'UK' is a
// real Jurisdiction value in this app (types/systemConfig.ts spells
// out GB_EW/GB_SCT/GB_NIR and specific EU member states instead). A
// real UK site's own getCurrentJurisdiction() would never have matched
// 'UK', meaning these CAP/ISO-15189-mandated activities would never
// have appeared in that site's own Standard tab at all — now fixed to
// the real enum values, and the field itself is typed against
// Jurisdiction[] so this can't silently recur.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { IQaActivityTypeService } from './IQaActivityTypeService';
import type { QaActivityType } from '@/types/quality/QaActivityType';

const STORAGE_KEY = 'qa_activity_types';

// PS-113, Stage 5. Real, stable id of the "Frozen vs Final
// Correlation" activity type seeded below - moved here from the now-
// deleted reconciliationRecordMapping.ts, whose only other real job
// (converting a ReconciliationRecord into its QaActivityRecord
// equivalent) has no real callers left now that the old service and
// the modal's dual-write are both retired. This is the constant's
// real, natural home - right next to the activity type it identifies -
// used by every real reader/writer that needs to filter/tag records
// against this specific activity (ReconciliationTab.tsx,
// qualityCalculations.ts, QualityTab.tsx, AuditLogPage.tsx,
// ContributionDashboardPage.tsx, DiscordanceReconciliationModal.tsx).
export const FROZEN_FINAL_ACTIVITY_TYPE_ID = 'qa-activity-frozen-final';
export const ABNORMAL_FINDING_CONFIRMATION_ACTIVITY_TYPE_ID = 'qa-activity-abnormal-finding-confirmation';
export const GYN_CYTOLOGY_SECONDARY_SCREENING_ACTIVITY_TYPE_ID = 'qa-activity-gyn-cytology-secondary-screening';
// Real, per direct follow-up wiring the real recording UI for CYT-QA-04's
// own candidate detection (PS-218) into this already-existing, already-
// seeded activity type — exported the same way every other real
// activity type id above already is, rather than a second, informal
// string literal repeated at each real call site.
export const CYTO_HISTO_CORRELATION_ACTIVITY_TYPE_ID = 'qa-activity-cyto-histo';
// PS-324. The real surgical-pathology consumer of PS-117's generic
// case-selection engine and PS-118's generic review-capture workbench
// — exported the same way every other real activity type id above
// already is.
export const SURGICAL_PEER_REVIEW_ACTIVITY_TYPE_ID = 'qa-activity-surgical-peer-review';
export const SURGICAL_BIOPSY_RESECTION_CORRELATION_ACTIVITY_TYPE_ID = 'qa-activity-surgical-biopsy-resection';

/** Real, deliberate translation of the old ReconciliationRecord's own
 *  fixed frozenCategory/finalCategory/frozenDx/finalDx properties into
 *  this activity's own configured field schema - see
 *  QaActivityType.ts's own header for why this split exists. Values
 *  here are real, matching the exact FrozenCategory options this app
 *  already uses (types/intraop/IntraoperativeEntry.ts) -
 *  'benign' | 'atypical_suspicious' | 'malignant' | 'deferred', not
 *  invented.
 */
const FROZEN_FINAL_CATEGORY_OPTIONS = [
  { id: 'benign', label: 'Benign' },
  { id: 'atypical_suspicious', label: 'Atypical / Suspicious' },
  { id: 'malignant', label: 'Malignant' },
  { id: 'deferred', label: 'Deferred' },
];

const SEED_TYPES: QaActivityType[] = [
  {
    id: FROZEN_FINAL_ACTIVITY_TYPE_ID,
    name: 'Frozen vs Final Correlation',
    description: 'Reconciles the intraoperative frozen-section diagnosis against the final permanent-section diagnosis for the same specimen — a mandatory CAP/ISO 15189 interpretive QA check, not an optional one.',
    tabScope: 'standard',
    jurisdictions: ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'BE', 'NL', 'DE', 'FR', 'AU', 'NZ', 'KR'],
    fields: [
      { id: 'frozenCategory', label: 'Frozen Section Category', type: 'dropdown', required: true, options: FROZEN_FINAL_CATEGORY_OPTIONS },
      { id: 'finalCategory', label: 'Final Diagnosis Category', type: 'dropdown', required: true, options: FROZEN_FINAL_CATEGORY_OPTIONS },
      { id: 'frozenDx', label: 'Frozen Section Diagnosis', type: 'text', required: true, options: [] },
      { id: 'finalDx', label: 'Final Diagnosis', type: 'text', required: true, options: [] },
    ],
    teachingOnboardingEnabled: true,
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    createdBy: 'system-seed',
  },
  // Real, deliberate second example - not built out into a real
  // feature yet (no case-selection, no review UI wired to it), exists
  // specifically to prove the model itself is genuinely generic, per
  // PS-113's own acceptance criteria. A genuinely different real field
  // set from Frozen vs Final Correlation above - compares two
  // different diagnostic modalities, not two categories of the same
  // kind of read.
  {
    id: 'qa-activity-cyto-histo',
    name: 'Cytology-Histology Correlation',
    description: 'Reconciles a prior cytology diagnosis against the subsequent histologic (tissue) diagnosis for the same patient/lesion.',
    tabScope: 'standard',
    jurisdictions: ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'BE', 'NL', 'DE', 'FR', 'AU', 'NZ', 'KR'],
    fields: [
      { id: 'cytologyDx', label: 'Cytology Diagnosis', type: 'text', required: true, options: [] },
      { id: 'histologyDx', label: 'Histology Diagnosis', type: 'text', required: true, options: [] },
    ],
    teachingOnboardingEnabled: false,
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    createdBy: 'system-seed',
  },
  // Real, per direct guidance (PS-134, Sign-Out Guardrails + Secondary
  // Review Routing): the real "route a pathologist-confirmed high-risk
  // case to a peer review / QA queue" activity — genuinely reuses this
  // existing framework's own real capaTriggerRule mechanism, rather
  // than a second, parallel review-routing system, exactly as this
  // ticket's own scope named. This record is deliberately audit-trail
  // ONLY — real, per direct correction: "when would a CAPA be
  // needed?" A primary pathologist confirming their OWN finding is
  // not a nonconformity (ISO 15189:2022 Clause 8.7's real trigger for
  // a CAPA — an error, a discrepancy, a real defect) — it's the
  // diagnosis working correctly. capaTriggerRule was REMOVED here
  // after initially, incorrectly firing on every confirmed Critical/
  // Malignant finding — in a real department that diagnoses cancer
  // routinely, that would flood the real CAPA queue with hundreds of
  // records for correct, unremarkable diagnoses, burying whatever
  // genuine defects the queue exists to surface. Real, per direct
  // guidance's own three, specific, real CAPA triggers instead — none
  // of which are "a primary read was confirmed":
  //   1. Peer Review Discordance — a SECOND pathologist's independent
  //      read disagrees with the first (Benign vs. Malignant, a major
  //      grade shift). No real, live second-read/peer-review workflow
  //      exists anywhere in this app yet to produce this signal — a
  //      real, separate, larger piece of work, not built here.
  //   2. Clinical/Pathological Mismatch (PS-131) — the microscopic
  //      finding contradicts the pre-op clinical history or frozen
  //      section impression. Real, confirmed gap: PS-131's own
  //      original scope named this discrepancy check explicitly, but
  //      it was never actually built — `detectCriticalFindings.ts`
  //      has no real pre-op/clinical-indication comparison logic at
  //      all. Real, separate follow-up needed on PS-131 itself.
  //   3. Amended/Corrected Reports — a post-sign-out revision where
  //      an initial error impacts clinical management
  //      (`AmendmentRecord`, `type: 'correction'`). The real data
  //      model exists; there is no real "impacts clinical management"
  //      signal on it yet, nor any CAPA wiring from it — also real,
  //      separate follow-up.
  // Every one of these is a genuinely different, real signal from
  // "the primary pathologist confirmed their own finding," which this
  // activity type still legitimately records for audit purposes —
  // just never as a CAPA trigger on its own.
  {
    id: ABNORMAL_FINDING_CONFIRMATION_ACTIVITY_TYPE_ID,
    name: 'Abnormal/Critical Finding Confirmation',
    description: 'Records the PRIMARY pathologist\'s own confirmation of a Critical- or Malignant-severity abnormal-detection suggestion (PS-129 discrete trigger or PS-131 AI-narrative finding) at sign-out. Real, honest scope limit: this is a self-confirmation log, NOT the genuine, independent second-pathologist "multi-eye" prospective peer review that CAP/CLIA-style QA programs actually mean by review of a first-time malignancy — that real, separate, mandatory-second-reader workflow doesn\'t exist anywhere in this app yet (see PS-144). Audit-trail only — does not itself raise a CAPA record (a correct diagnosis is not a nonconformity); see this entry\'s own comment for the real, separate CAPA triggers this app still needs to build.',
    tabScope: 'standard',
    jurisdictions: ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'BE', 'NL', 'DE', 'FR', 'AU', 'NZ', 'KR'],
    fields: [
      { id: 'findingTerm', label: 'Confirmed Finding', type: 'text', required: true, options: [] },
      { id: 'findingSource', label: 'Source (Synoptic Field or Narrative Quote)', type: 'text', required: true, options: [] },
    ],
    teachingOnboardingEnabled: false,
    active: true,
    createdAt: '2026-09-03T00:00:00.000Z',
    createdBy: 'system-seed',
  },
  // Real, per direct follow-up's own detailed role research and
  // subsequent correction (Cytology & Cervical Screening module,
  // Phase 3): the underlying credential is always Cytotechnologist —
  // this app deliberately never modeled separate per-workflow-step
  // roles/participation types. What varies is the real, distinct
  // WORKFLOW REASON a secondary screening event happened: the
  // standard random-X%-sample or targeted-high-risk QC rescreen, or a
  // more senior/lead cytotechnologist's own Secondary Reviewer look at
  // a complex/discordant case before pathologist escalation. Real, per
  // direct correction: "There always a single screening event, but
  // there can be multiple Secondary Screening events for a case" — one
  // real activity record per event
  // (CytologyReviewRecord entries with role: 'qc_random_selection' |
  // 'qc_targeted_high_risk' | 'secondary_reviewer',
  // types/cytology/CytologyReviewRecord.ts), not one bundled summary. Records the real comparison
  // between the primary screen and this event
  // (resolveCytologyCategorySetConcordance, services/cytology/) via this same,
  // existing, generic framework — exactly as Frozen/Final and
  // Cytology-Histology Correlation already do — rather than a third,
  // parallel tracking system. Deliberately NO capaTriggerRule, same
  // corrected reasoning as Abnormal/Critical Finding Confirmation
  // above: a single secondary-screening discordance is real, valuable
  // audit trail, not an automatic CAPA trigger on its own (per direct
  // guidance's own Standard Operating Rule — CAPA is reserved for
  // post-sign-out major errors, unresolvable systemic breakdowns, or a
  // recurring pattern from a single provider, the real, later scope of
  // PS-147).
  {
    id: GYN_CYTOLOGY_SECONDARY_SCREENING_ACTIVITY_TYPE_ID,
    name: 'GYN Cytology Secondary Screening',
    description: 'Records one real secondary screening event on a GYN cytology case — a standard random-sample or targeted-high-risk QC rescreen, or a senior/lead cytotechnologist Secondary Reviewer look, both performed by the same real Cytotechnologist role in a different workflow capacity. Audit-trail only — does not itself raise a CAPA record; a genuinely recurring discordance pattern for one screener is real, separate, later work (PS-147).',
    tabScope: 'standard',
    jurisdictions: ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'BE', 'NL', 'DE', 'FR', 'AU', 'NZ', 'KR'],
    fields: [
      { id: 'trigger', label: 'Trigger', type: 'dropdown', required: true, options: [{ id: 'qc_random_selection', label: 'QC — Random Selection' }, { id: 'qc_targeted_high_risk', label: 'QC — Targeted High-Risk' }, { id: 'secondary_reviewer', label: 'Secondary Reviewer' }] },
      { id: 'addedByEvent', label: 'Findings Added by This Event', type: 'text', required: false, options: [] },
      { id: 'missedByEvent', label: 'Findings Missed by This Event', type: 'text', required: false, options: [] },
    ],
    teachingOnboardingEnabled: false,
    active: true,
    createdAt: '2026-09-03T00:00:00.000Z',
    createdBy: 'system-seed',
  },
  // PS-324, first real consumer of PS-117's generic case-selection
  // engine. This is genuinely the first real, live source of the
  // "Peer Review Discordance" CAPA trigger named — but never built —
  // in Abnormal/Critical Finding Confirmation's own header comment
  // above ("a SECOND pathologist's independent read disagrees with
  // the first... No real, live second-read/peer-review workflow
  // exists anywhere in this app yet to produce this signal"). This
  // activity IS that workflow, so capaTriggerRule is real here, unlike
  // its siblings above.
  //
  // samplingPercentage below is the real, admin-configurable BASE
  // rate — resolveSurgicalPeerReviewSelectionForCase.ts (this ticket)
  // is what actually applies the real, additional subspecialty risk
  // weight on top of it (ISurgicalPeerReviewRiskWeightService), a
  // separate, standalone layer per this ticket's own recorded design
  // decision, not a second field on this type itself.
  //
  // targetedSelectionRule reuses the one real signal PS-117's engine
  // currently models (hasNonDeferredFrozenCategory) — a real,
  // non-deferred intraop frozen-section call is exactly the kind of
  // high-risk surgical case CAP's own "initial cancer diagnoses"
  // targeted-review mandate means, and it's the one real signal this
  // app can express today without inventing a new one speculatively.
  {
    id: SURGICAL_PEER_REVIEW_ACTIVITY_TYPE_ID,
    name: 'Surgical Post-Sign-Out Peer Review',
    description: 'A second pathologist\'s independent review of an already-signed-out surgical case, selected by random and/or targeted sampling (PS-324) or a manual QA request, comparing the reviewer\'s own independent diagnostic impression against the original sign-out diagnosis.',
    tabScope: 'standard',
    jurisdictions: ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'BE', 'NL', 'DE', 'FR', 'AU', 'NZ', 'KR'],
    fields: [
      { id: 'originalSignOutDx', label: 'Original Sign-Out Diagnosis', type: 'text', required: true, options: [] },
      { id: 'reviewerIndependentDx', label: 'Reviewer\'s Independent Diagnosis', type: 'text', required: true, options: [] },
      { id: 'selectionReason', label: 'Selection Reason', type: 'dropdown', required: true, options: [
        { id: 'random_selection', label: 'Random Sample' },
        { id: 'targeted_high_risk', label: 'Targeted — Non-Deferred Frozen Category' },
        { id: 'manual', label: 'Manually Requested' },
      ] },
    ],
    teachingOnboardingEnabled: false,
    active: true,
    samplingPercentage: 10,
    targetedSelectionRule: { signal: 'hasNonDeferredFrozenCategory' },
    capaTriggerRule: { triggerSeverities: ['high'], deficiencyTypeId: 'def-peer-review-discordance' },
    createdAt: '2026-09-19T00:00:00.000Z',
    createdBy: 'system-seed',
  },
  // PS-324. The direct surgical-pathology analog of Cytology-Histology
  // Correlation above — same real "audit trail only, no capaTriggerRule"
  // posture, for the distinct real case where BOTH the antecedent and
  // the subsequent specimen are surgical (not cytologic). Real
  // candidate detection: resolveSurgicalBiopsyToResectionCorrelationCandidates.ts.
  {
    id: SURGICAL_BIOPSY_RESECTION_CORRELATION_ACTIVITY_TYPE_ID,
    name: 'Surgical Biopsy-to-Resection Correlation',
    description: 'Reconciles a prior surgical biopsy diagnosis against the subsequent resection specimen diagnosis for the same patient/anatomic site.',
    tabScope: 'standard',
    jurisdictions: ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'BE', 'NL', 'DE', 'FR', 'AU', 'NZ', 'KR'],
    fields: [
      { id: 'biopsyDx', label: 'Biopsy Diagnosis', type: 'text', required: true, options: [] },
      { id: 'resectionDx', label: 'Resection Diagnosis', type: 'text', required: true, options: [] },
    ],
    teachingOnboardingEnabled: false,
    active: true,
    createdAt: '2026-09-19T00:00:00.000Z',
    createdBy: 'system-seed',
  },
];

const load    = (): QaActivityType[] => storageGet<QaActivityType[]>(STORAGE_KEY, SEED_TYPES);
const persist = (data: QaActivityType[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockQaActivityTypeService: IQaActivityTypeService = {
  async getAll() {
    return ok([...load()]);
  },

  async add(type) {
    if (!type.name.trim()) return err('A real activity name is required.');
    if (type.fields.length === 0) return err('A real activity needs at least one field.');
    const types = load();
    const newType: QaActivityType = {
      ...type,
      id: `qa-activity-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    persist([...types, newType]);
    return ok(newType);
  },

  async update(id, changes) {
    const types = load();
    const idx = types.findIndex(t => t.id === id);
    if (idx === -1) return err(`Activity type ${id} not found.`);
    const updated = { ...types[idx], ...changes };
    const withUpdate = [...types];
    withUpdate[idx] = updated;
    persist(withUpdate);
    return ok(updated);
  },

  async deactivate(id) {
    return mockQaActivityTypeService.update(id, { active: false });
  },

  async reactivate(id) {
    return mockQaActivityTypeService.update(id, { active: true });
  },
};
