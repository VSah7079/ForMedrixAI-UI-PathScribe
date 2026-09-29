// src/services/deficiencies/mockDeficiencyTypeService.ts

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { DeficiencyType, IDeficiencyTypeService } from './IDeficiencyService';

// Real, per direct guidance's own established re-seed convention (see
// mockContainerTypeService.ts's own header for the full reasoning) —
// this file never had one despite several prior sessions adding new
// seed types (def-block-lost, def-cassette-dispatch-failure, etc.),
// a real, longstanding gap fixed here rather than left for the next
// new type to also silently miss.
//
// Real, honest tradeoff, same as every other version-gated mock
// service in this app: a version bump wipes the ENTIRE stored list
// and reseeds from SEED_DEFICIENCY_TYPES below, not just the changed
// entries — this includes any custom deficiency type a site added of
// its own via the real admin UI (components/Config/System/
// DeficienciesSection.tsx). Accepted here for the same reason it's
// accepted everywhere else this pattern is used in a mock/demo data
// layer: the alternative (a genuinely missing new type, silently and
// permanently, for anyone with existing localStorage data) is worse.
const DEFICIENCY_TYPE_VERSION = '4'; // bumped: added def-peer-review-discordance
const DEFICIENCY_TYPE_VERSION_KEY = 'pathscribe_deficiency_types_version';
if (typeof localStorage !== 'undefined') {
  try {
    if (localStorage.getItem(DEFICIENCY_TYPE_VERSION_KEY) !== DEFICIENCY_TYPE_VERSION) {
      localStorage.removeItem('pathscribe_deficiency_types');
      localStorage.setItem(DEFICIENCY_TYPE_VERSION_KEY, DEFICIENCY_TYPE_VERSION);
    }
  } catch { /* SSR / sandboxed env — ignore */ }
}

// Starter set — one concrete type this session actually needs
// ("Could Not Match Specimen to Dictionary"), plus a handful of the more
// common CoPathPlus-equivalent categories so the dictionary isn't empty
// on first use. All admin-editable; none of these are load-bearing code,
// just seed data.
const SEED_DEFICIENCY_TYPES: DeficiencyType[] = [
  { id: 'def-no-dict-match', name: 'Could Not Match Specimen to Dictionary', description: 'Order specimen text did not exactly match any active Specimen Dictionary entry.', status: 'Active', level: 'specimen' },
  { id: 'def-label-mismatch', name: 'Label Mismatch', description: 'Container/slide label does not match the requisition.', status: 'Active', level: 'specimen' },
  { id: 'def-container-damaged', name: 'Container Damaged', description: 'Specimen container arrived broken, leaking, or otherwise compromised.', status: 'Active', level: 'specimen' },
  { id: 'def-insufficient-volume', name: 'Insufficient Volume', description: 'Fluid/tissue quantity received is inadequate for the ordered testing.', status: 'Active', level: 'specimen' },
  // Real, per this module's own established CAPA-design decision:
  // "NO auto-CAPA. AI discordance should raise a SpecimenDeficiency...
  // Human decides — Contain, Escalate to CAPA, or leave." 'both' since
  // AiScreeningResult.specimenId is optional — a real discordance can
  // be case-level or specimen-level depending on how the real vendor
  // product itself operates.
  { id: 'def-ai-discordance', name: 'AI Screening Discordance', description: 'A pathologist/cytotechnologist recorded disagreement with a computational-pathology AI screening result.', status: 'Active', level: 'both' },
  // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
  // Laboratory Sensor & Cold-Chain Integration gap — 'both' since a
  // real excursion can affect a whole batch's own real specimens
  // (case-level) or one, specifically identified specimen depending
  // on how a real QA reviewer chooses to raise it.
  { id: 'def-cold-chain-excursion', name: 'Cold-Chain Excursion', description: 'A real, monitored transport container or storage unit reported a temperature reading outside its own defined safe range.', status: 'Active', level: 'both' },
  // Real, per direct follow-up: "if I was to create a CAPA I might
  // want to capture the information" - a DLQ dispatch failure
  // (OutboundChargeQueueEntry, status FAILED) that's systemic or
  // recurring enough to warrant real corrective/preventive action
  // review, not just a one-off retry. Level 'case', not 'specimen' -
  // a dispatch failure is a billing-transmission concern tied to the
  // case's charges as a whole, not any one specimen's tissue handling.
  { id: 'def-outbound-dispatch-failure', name: 'Outbound Billing Dispatch Failure', description: 'A charge dispatch to the external RCM system failed and was judged worth systemic CAPA review, not just a one-off retry.', status: 'Active', level: 'case' },
  // Real, per direct guidance ("Any existing gaps to deal with?" —
  // no DLQ/retry UI for the two real outbound patient-ADT/result
  // queues built alongside billing's own): deliberately a SEPARATE,
  // new type from def-outbound-dispatch-failure above, not a reuse of
  // it — that one is explicitly billing/RCM-scoped in its own name and
  // description, and labeling a patient-identity or pathology-result
  // dispatch failure as a "Billing Dispatch Failure" would be
  // factually wrong. Covers both real new queues (ADT^A08/A40/A47 and
  // ORU^R01) under one type, matching the same "one cohesive outbound
  // interface message domain" grouping OutboundMessagePreviewSection.tsx
  // already established for all four transaction types together.
  { id: 'def-outbound-interface-dispatch-failure', name: 'Outbound Interface Dispatch Failure', description: 'A patient-identity (ADT^A08/A40/A47) or pathology-result (ORU^R01) dispatch to the external interface engine failed and was judged worth systemic CAPA review, not just a one-off retry.', status: 'Active', level: 'case' },
  // Real feature, per direct follow-up: "an immediate Tissue
  // Discrepancy QA Flag is raised before sectioning... Is the
  // discrepancy being tracked in the Quality Assurance Module?"
  // Confirmed directly: it wasn't — only a computed, derived badge on
  // the Material tree, no real QA record anywhere. Reuses this same,
  // real, ISO 15189-aligned deficiency engine (raised automatically
  // by useSpecimenBlockManagement.ts's own handleUpdateBlock the
  // moment a real piece-count mismatch is confirmed at embedding) —
  // not a bespoke, parallel tracking mechanism.
  { id: 'def-tissue-discrepancy', name: 'Tissue Discrepancy', description: 'Piece count observed at embedding does not match the count recorded at grossing — possible lost or misplaced tissue.', status: 'Active', level: 'specimen' },
  { id: 'def-missing-requisition', name: 'Missing Requisition', description: 'Specimen received without accompanying paperwork or order.', status: 'Active', level: 'case' },
  { id: 'def-order-discrepancy', name: 'Specimen/Order Discrepancy', description: 'Specimen received does not match what the order describes.', status: 'Active', level: 'both' },
  {
    id: 'def-post-hoc-correction', name: 'Post-Hoc Correction', status: 'Active', level: 'both',
    description: 'A value entered at accessioning was corrected later — nobody necessarily did anything wrong at the time; the original entry simply turned out to be incorrect. Always raised and resolved together, since the whole point is to document what changed, not to leave a lingering open item.',
  },
  {
    id: 'def-missing-fixation-time', name: 'Missing Fixation Time', status: 'Active', level: 'specimen',
    description: 'Specimen type requires cold-ischemia/fixation timing (CAP/ASCO biomarker guidance, e.g. breast ER/PR/HER2) but no fixative-added time has been documented. Blocks case sign-out until resolved — see Resolution Types for the three legitimate ways to resolve it (documented, estimated, or confirmed unrecoverable).',
  },
  // Real, per direct request — genuinely distinct from
  // def-missing-fixation-time above: that one covers the real, existing
  // hard gate on fixation START (processedAt) at sign-out. This one
  // covers the real, record-only fixation END time and fixative:tissue
  // ratio confirmation (update-244) — neither of which has any gate at
  // all. Per direct decision, this is raised manually by a human who
  // notices the gap (Grossing Screen or the QA Deficiencies tab), never
  // automatically — see mockSpecimenDeficiencyService.raise() call
  // sites for the real distinction between an auto-detected deficiency
  // and a manually-raised one (SpecimenDeficiency.raisedBy).
  {
    id: 'def-missing-fixation-completion', name: 'Missing Fixation Completion Data', status: 'Active', level: 'specimen',
    description: 'Specimen reached grossing without a documented fixation end time and/or a confirmed fixative:tissue ratio (ISO 15189 traceability). Unlike Missing Fixation Time, this is never auto-raised by a gate — a reviewer identifies the gap and raises it manually.',
  },
  // Real, per the original Stain QC Module spec's own §2.4 ("a
  // control run or routine stain batch fails, PathScribe shall flag
  // the entire run, prevent clinical reporting, and trigger a
  // troubleshooting, re-stain, or solution-change workflow") — unlike
  // def-missing-fixation-completion above, this one IS auto-raised,
  // by resolveStainQcGate.ts's own real 'blocked-failed' outcome, the
  // moment a real inbound 'Run Failed' instrument status is received
  // — never left for a human to notice and raise by hand, since a
  // known instrument failure is a real, conclusive signal already in
  // hand, not a gap requiring a reviewer to first spot it.
  {
    id: 'def-stain-batch-failed', name: 'Stain Batch Failed', status: 'Active', level: 'specimen',
    description: 'An automated stainer reported a real run failure for a batch this specimen\u2019s own material was in. Blocks sign-out in every real QC enforcement mode until resolved — see resolveStainQcGate.ts\u2019s own "blocked-failed" outcome.',
  },

  // Real, per direct guidance's own cross-jurisdiction pre-analytic
  // compliance research (UKAS ISO 15189 Clause 7.2, CAP/CLIA
  // Sec 493.1241, RCPath, EU IVDR/ISO 15189, IANZ AS ISO 15189:2022,
  // KAZA/KSP/KSLM, NATA/NPAAC — see resolvePreAnalyticDateGateConfig.ts
  // for the full per-country citation and text). Real, per direct
  // guidance's own explicit correction: this is a genuine Pre-Analytic
  // Non-Conformity, left OPEN (raised via raise(), never
  // raiseAndResolve()) so it actually reaches Operations/CAPA Engine
  // review — deliberately NOT treated as an instant, closed
  // documentation event the way def-missing-fixation-time's
  // "unrecoverable" path is. Per direct guidance: "Datix / Incident
  // Logging ... trigger the CAPA tracking without delaying necessary
  // patient care beyond reason" — the case itself un-blocks immediately
  // via the administrative-override date, but the underlying
  // non-conformity stays open for real corrective/preventive review,
  // same posture as def-outbound-dispatch-failure above.
  {
    id: 'def-missing-preanalytic-date', name: 'Missing Pre-Analytic Date (Collection/Receipt)', status: 'Active', level: 'specimen',
    description: 'Specimen is missing its required collection and/or laboratory-receipt date/time. Every real jurisdiction PathScribe serves treats this as a hard block on report authorization (see resolvePreAnalyticDateGateConfig.ts) — resolved via a real, audited administrative-override date, never a silent default. Left OPEN, not auto-closed: this is a genuine Pre-Analytic Non-Conformity warranting real corrective/preventive review, not just a one-off documentation fix.',
  },
  // Real, per direct guidance's own explicit correction: a real,
  // Engine-reported block loss or damage was previously only ever
  // reflected in the block's own status field and a dispatch-history
  // display — never a real, tracked CAPA record, despite being a
  // genuine, often clinically significant non-conformity (potentially
  // unrecoverable diagnostic material — arguably more severe than a
  // missing timestamp). Same real "left OPEN, not raiseAndResolve"
  // posture as def-missing-preanalytic-date above, for the same
  // reason: this warrants real corrective/preventive review, not an
  // instant, closed documentation event. Two distinct types (not one
  // generic "block exception"), matching this dictionary's own
  // existing precedent of specific, analytics-friendly types
  // (def-tissue-discrepancy vs def-insufficient-volume, rather than
  // one generic "specimen problem") — a lab genuinely wants to know
  // "how many blocks did we lose this quarter" separately from "how
  // many arrived damaged."
  {
    id: 'def-block-lost', name: 'Block Lost', status: 'Active', level: 'specimen',
    description: 'A histology block was reported lost by the Cassette Engine — the block, and any diagnostic material in it, is genuinely unaccounted for. Real, open CAPA record, not just a status flag — the physical loss already happened regardless of any downstream workflow, and warrants real root-cause review (was this a real process gap, a one-off, a pattern at one site).',
  },
  {
    id: 'def-block-damaged', name: 'Block Damaged', status: 'Active', level: 'specimen',
    description: 'A histology block was reported damaged by the Cassette Engine — the block exists but its diagnostic integrity may be compromised. Real, open CAPA record, same reasoning as Block Lost above.',
  },
  // Real, per direct guidance's own explicit symmetry decision: a
  // complete cassette dispatch failure (CassetteDispatchOutcomeEventPayload
  // outcome === 'error' — corrected from an earlier, non-real 'failed'
  // value) prevents physical specimen container preparation entirely,
  // genuinely blocking real bench flow — the same real category of
  // non-conformity as a lost/damaged block, not merely logged history
  // the way a routine fallback_used outcome is (that stays
  // history-only, per direct guidance's own explicit decision — see
  // cassette-dispatch-outcome.ts's own comment on this exact split).
  {
    id: 'def-cassette-dispatch-failure', name: 'Cassette Dispatch Failure', status: 'Active', level: 'specimen',
    description: 'A cassette dispatch request to the Cassette Engine failed completely (outcome: error) — no cassette was produced at all, blocking real bench/grossing flow. Real, open CAPA record, not just a logged history entry — a complete failure warrants real root-cause review the way a mere fallback color substitution does not.',
  },
  // Real, per direct guidance (PS-134, Sign-Out Guardrails + Secondary
  // Review Routing): a pathologist-confirmed Critical/Malignant
  // abnormal-detection finding (PS-129/PS-131) is routed here via the
  // new QaActivityType's own capaTriggerRule
  // (services/quality/mockQaActivityTypeService.ts) — the real,
  // existing CAPA mechanism this ticket's own scope named directly,
  // rather than a second, parallel review-routing system.
  {
    id: 'def-confirmed-high-risk-finding', name: 'Confirmed High-Risk/Critical Finding — Peer Review Required', status: 'Active', level: 'case',
    description: 'A pathologist confirmed a Critical- or Malignant-severity abnormal-detection suggestion at sign-out (PS-129 discrete trigger or PS-131 AI-narrative finding). Real, open CAPA record — routes the case into the same Operations/CAPA queue every other deficiency uses, for a genuine peer/secondary review, not merely a logged history entry.',
  },
  // PS-324. Real, per Abnormal/Critical Finding Confirmation's own
  // header comment (services/quality/mockQaActivityTypeService.ts) —
  // this closes real CAPA trigger #1 named there ("Peer Review
  // Discordance — a SECOND pathologist's independent read disagrees
  // with the first... No real, live second-read/peer-review workflow
  // exists anywhere in this app yet to produce this signal"). Routed
  // here via SURGICAL_PEER_REVIEW_ACTIVITY_TYPE_ID's own real
  // capaTriggerRule — genuinely different real event from
  // def-confirmed-high-risk-finding above (a PRIMARY pathologist
  // confirming their own finding is not a nonconformity; a SECOND,
  // independent pathologist disagreeing with that finding is).
  {
    id: 'def-peer-review-discordance', name: 'Post-Sign-Out Peer Review Discordance', status: 'Active', level: 'case',
    description: 'A second pathologist\'s independent post-sign-out peer review of a surgical case reached a materially different diagnosis than the original sign-out. Real, open CAPA record — not merely a logged review history entry.',
  },  // Batch 379 (PS-359, Pete): an organisation that switches off "Grossing
  // protocol attached" in Field Requirements can complete grossing on a
  // specimen with no protocol, after a confirmation. Each such specimen gets
  // one of these, left open, so it reaches the QA deficiency queue for
  // secondary review (services/grossing/grossingCompletion.ts).
  {
    id: 'def-grossed-without-protocol', name: 'Grossed Without Protocol', status: 'Active', level: 'specimen',
    description: 'Grossing was completed on a specimen with no grossing protocol attached, which the organisation allows but routes for secondary review. Raised automatically when grossing is completed; left open for a reviewer to check the specimen\'s blocks and handling.',
  },
];

// Batch 379: a stored list gains any seed type it doesn't have yet (by id),
// so a new built-in type arrives without the version bump above, which
// would also wipe the site's own custom types. Types can be deactivated but
// not deleted, so this never brings back one an administrator removed.
const withNewSeedTypes = (stored: DeficiencyType[]): DeficiencyType[] => {
  const missing = SEED_DEFICIENCY_TYPES.filter(seed => !stored.some(t => t.id === seed.id));
  return missing.length ? [...stored, ...missing] : stored;
};
const load    = () => withNewSeedTypes(storageGet<DeficiencyType[]>('pathscribe_deficiency_types', SEED_DEFICIENCY_TYPES));
const persist = (data: DeficiencyType[]) => storageSet('pathscribe_deficiency_types', data);
let TYPES: DeficiencyType[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockDeficiencyTypeService: IDeficiencyTypeService = {
  async getAll() { await delay(); return ok([...TYPES]); },

  async add(type) {
    await delay();
    const newT: DeficiencyType = { ...type, id: 'def-' + Date.now() };
    TYPES = [...TYPES, newT];
    persist(TYPES);
    return ok({ ...newT });
  },

  async update(id, changes) {
    await delay();
    const idx = TYPES.findIndex(t => t.id === id);
    if (idx === -1) return err(`Deficiency type ${id} not found`);
    TYPES = TYPES.map(t => t.id === id ? { ...t, ...changes } : t);
    return ok({ ...TYPES[idx], ...changes });
  },

  async deactivate(id) { return mockDeficiencyTypeService.update(id, { status: 'Inactive' }); },
  async reactivate(id) { return mockDeficiencyTypeService.update(id, { status: 'Active' }); },
};
