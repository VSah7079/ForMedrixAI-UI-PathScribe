// src/services/digitalPathology/mockAiScreeningResultService.ts
import type { IAiScreeningResultService, NewAiScreeningResult } from './IAiScreeningResultService';
import type { AiScreeningResult, AiScreeningFinding } from '@/types/digitalPathology/AiScreeningResult';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

// ─── Seed data ──────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Can you put some seed data in so that
// I can demonstrate the DP... columns"). Real vendor ids from
// mockDpVendorService.ts's own seeded dictionary, against the same
// real, already-seeded cases mockWsiScanBatchService.ts's own new
// seed batches use. S26-4404's own real, already-seeded diagnostic
// findings (Gleason 7/Grade Group 2, perineural involvement) are the
// real, honest basis for this AI result's own findings/triageLevel —
// never contradicting what that case's own real report already says.
const SEED_AI_RESULTS: AiScreeningResult[] = [
  {
    id: 'ai-result-seed-4404', caseId: 'S26-4404', specimenId: 'S26-4404-SP-1', vendorId: 'dp-vendor-paige-prostate',
    status: 'completed', orderedAt: '2026-09-13T08:00:00.000Z', completedAt: '2026-09-13T08:45:00.000Z',
    findings: [
      { id: 'find-4404-1', label: 'Tumor region identified \u2014 Gleason pattern 4+3, Grade Group 2', confidenceScore: 0.94 },
      { id: 'find-4404-2', label: 'Perineural invasion present', confidenceScore: 0.87 },
    ],
    biomarkers: [{ name: 'Ki-67', value: '18%' }, { name: 'Gleason Score', value: '7 (4+3)' }],
    slideTriage: { reviewRecommended: true, triageLevel: 'high_risk', primaryFinding: 'Malignancy Detected' },
  },
  // Real, deliberate genuinely different vendor shape \u2014 PathAI's
  // own real product reports findings + biomarkers with no real
  // 3-level triageLevel of its own, distinct from Paige's above.
  {
    id: 'ai-result-seed-4408', caseId: 'S26-4408', specimenId: 'S26-4408-SP-1', vendorId: 'dp-vendor-pathai-aisight-dx',
    status: 'completed', orderedAt: '2026-09-13T09:00:00.000Z', completedAt: '2026-09-13T09:40:00.000Z',
    findings: [
      { id: 'find-4408-1', label: 'Invasive carcinoma, grade 3, upper outer quadrant', confidenceScore: 0.91 },
    ],
    biomarkers: [{ name: 'ER', value: 'Positive (95%)' }, { name: 'PR', value: 'Positive (80%)' }, { name: 'HER2', value: '2+ (Equivocal)' }],
  },
  // Real, BD FocalPoint/Hologic Genius-style vendor \u2014 no real
  // triageLevel or biomarkers at all, matching that real product's
  // own actual reporting shape (findings-only gallery).
  {
    id: 'ai-result-seed-5002cyt', caseId: 'S26-5002-CYT-001', specimenId: 'S26-5002-SP-1', vendorId: 'dp-vendor-hologic-genius',
    status: 'completed', orderedAt: '2026-09-13T07:00:00.000Z', completedAt: '2026-09-13T07:25:00.000Z',
    findings: [
      { id: 'find-5002-1', label: 'Atypical squamous cells, cannot exclude HSIL', confidenceScore: 0.78 },
    ],
  },
  // Real fix (PS-319 — same gap as mockWsiScanBatchService.ts's own
  // new seed batches above: no AI screening data existed for any
  // Outreach (O26-*) case, so the AI Triage column was blank for
  // every one of them on the worklist). These three results are real,
  // plausible AI reads against O26-0001/0002/0003's own already-
  // seeded gross descriptions — never contradicting what those
  // cases' own real reports already say.
  // O26-0001 (colon resection): AI read matches the case's own real
  // gross finding almost exactly — invasive adenocarcinoma extending
  // into, but not through, the muscularis propria.
  {
    id: 'ai-result-seed-o26-0001', caseId: 'O26-0001', specimenId: 'O26-0001-SP-A', vendorId: 'dp-vendor-proscia-concentriq',
    status: 'completed', orderedAt: '2026-09-18T08:00:00.000Z', completedAt: '2026-09-18T08:45:00.000Z',
    findings: [
      { id: 'find-o26-0001-1', label: 'Invasive adenocarcinoma identified, hepatic flexure — extends into but not through the muscularis propria', confidenceScore: 0.92 },
      { id: 'find-o26-0001-2', label: 'Tumor budding, low grade', confidenceScore: 0.81 },
    ],
    biomarkers: [{ name: 'Ki-67', value: '35%' }],
    slideTriage: { reviewRecommended: true, triageLevel: 'high_risk', primaryFinding: 'Malignancy Detected' },
  },
  // O26-0002 (lung lobectomy): deliberately left at status 'ordered'
  // with no findings yet — mirrors that case's own real clinical
  // context (EGFR/ALK/ROS1 molecular workup still pending) and gives
  // the AI Triage column a real "ordered, not yet back" state to show
  // (resolveDpTriageBadge already treats an 'ordered' result as
  // "nothing to badge yet" — see resolveWorklistDpBadges.test.ts).
  {
    id: 'ai-result-seed-o26-0002', caseId: 'O26-0002', specimenId: 'O26-0002-SP-A', vendorId: 'dp-vendor-pathai-aisight-dx',
    status: 'ordered', orderedAt: '2026-09-18T09:00:00.000Z',
    findings: [],
  },
  // O26-0003 (radical prostatectomy): AI read matches the case's own
  // real Gleason 3+4=7 grade and flags the same close posterolateral
  // margin its own gross description already documents.
  {
    id: 'ai-result-seed-o26-0003', caseId: 'O26-0003', specimenId: 'O26-0003-SP-A', vendorId: 'dp-vendor-paige-prostate',
    status: 'completed', orderedAt: '2026-09-18T10:00:00.000Z', completedAt: '2026-09-18T10:45:00.000Z',
    findings: [
      { id: 'find-o26-0003-1', label: 'Tumor region identified — Gleason pattern 3+4, Grade Group 2, left mid-gland peripheral zone', confidenceScore: 0.90 },
      { id: 'find-o26-0003-2', label: 'Tumor within 1mm of inked margin — close margin flagged', confidenceScore: 0.85 },
    ],
    biomarkers: [{ name: 'Gleason Score', value: '7 (3+4)' }],
    slideTriage: { reviewRecommended: true, triageLevel: 'equivocal_review', primaryFinding: 'Close Margin — Review Recommended' },
  },
];

const STORAGE_KEY = 'aiScreeningResults';

const load = (): AiScreeningResult[] => storageGet(STORAGE_KEY, SEED_AI_RESULTS);
const persist = (data: AiScreeningResult[]) => storageSet(STORAGE_KEY, data);
let _cache: AiScreeningResult[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

const setStatus = async (id: ID, changes: Partial<AiScreeningResult>): Promise<ServiceResult<AiScreeningResult>> => {
  await delay();
  const idx = _cache.findIndex(r => r.id === id);
  if (idx === -1) return err(`AiScreeningResult ${id} not found`);
  _cache = _cache.map(r => r.id === id ? { ...r, ...changes } : r);
  persist(_cache);
  return ok({ ..._cache.find(r => r.id === id)! });
};

export const mockAiScreeningResultService: IAiScreeningResultService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getByCaseId(caseId: string) {
    await delay();
    return ok(_cache.filter(r => r.caseId === caseId));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(r => r.id === id);
    return found ? ok({ ...found }) : err(`AiScreeningResult ${id} not found`);
  },

  async order(entry: NewAiScreeningResult) {
    await delay();
    const created: AiScreeningResult = { ...entry, id: crypto.randomUUID(), status: 'ordered', findings: [] };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async markCompleted(id: ID, findings: AiScreeningFinding[], slideTriage?: import('@/types/digitalPathology/AiScreeningResult').AiSlideTriageSummary) {
    return setStatus(id, { status: 'completed', findings, slideTriage, completedAt: new Date().toISOString() });
  },

  async markFailed(id: ID) {
    return setStatus(id, { status: 'failed', completedAt: new Date().toISOString() });
  },

  async markTimedOut(id: ID) {
    return setStatus(id, { status: 'timed_out', completedAt: new Date().toISOString() });
  },

  async recordHumanConcordance(id: ID, concordant: boolean) {
    return setStatus(id, { humanConcordant: concordant });
  },
};
