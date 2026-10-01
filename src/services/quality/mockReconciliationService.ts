// src/services/quality/mockReconciliationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Renamed from mockDiscordanceService — real create/list for Frozen-to-
// Permanent reconciliation records, concordant and discordant alike (see
// ReconciliationRecord.ts's header for why the rename happened).
//
// Seed data: the original 7 discordant records are unchanged in content,
// just tagged outcome: 'discordant'. Alongside them, a generated batch of
// concordant records — real reconciliations genuinely did happen for
// every one of those cases before this fix, there was just nowhere to
// record the ones that didn't find a problem. 130 concordant + 7
// discordant puts the computed concordance rate in the same clinically
// plausible ~95% range the old hardcoded 94.2% in QualityTab.tsx claimed
// — except this number is now actually computed from real records
// instead of being a bare literal.
// ─────────────────────────────────────────────────────────────────────────────
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ReconciliationRecord } from '@/types/quality/ReconciliationRecord';
import type { IReconciliationService } from './IReconciliationService';

const STORAGE_KEY = 'reconciliation_records';
const RECONCILIATION_VERSION = '3'; // bumped: added real teaching-case seed data (Oliver Pemberton / Paul Carter)
const VERSION_KEY = 'pathscribe_mock_discordance_version';
try {
  const storedVersion = localStorage.getItem(VERSION_KEY);
  if (storedVersion !== RECONCILIATION_VERSION) {
    localStorage.removeItem('pathscribe_mock_' + STORAGE_KEY);
    localStorage.removeItem('pathscribe_mock_discordance_records'); // old key from before the rename
    localStorage.setItem(VERSION_KEY, RECONCILIATION_VERSION);
  }
} catch { /* SSR / sandboxed env — ignore */ }

const DISCORDANT_SEED: ReconciliationRecord[] = [
  { id: 'disc-001', caseId: 'PSA-2024-1190', specimenId: 'legacy-1190', caseType: 'Breast Core Bx',
    frozenCategory: 'atypical_suspicious', finalCategory: 'malignant',
    frozenDx: 'Atypical, favor benign', finalDx: 'DCIS, low grade',
    outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'sampling_error',
    recordedAt: '2026-06-29T00:00:00.000Z', recordedBy: { userId: 'user-seed', userName: 'Dr. Reyes' } },
  { id: 'disc-002', caseId: 'PSA-2024-1165', specimenId: 'legacy-1165', caseType: 'Thyroid Lobe',
    frozenCategory: 'atypical_suspicious', finalCategory: 'malignant',
    frozenDx: 'Follicular lesion', finalDx: 'Follicular carcinoma',
    outcome: 'discordant', delta: 'upgrade', severity: 'medium', rootCause: 'interpretation_error',
    recordedAt: '2026-06-25T00:00:00.000Z', recordedBy: { userId: 'user-seed', userName: 'Dr. Reyes' } },
  { id: 'disc-003', caseId: 'PSA-2024-1142', specimenId: 'legacy-1142', caseType: 'Lymph Node',
    frozenCategory: 'benign', finalCategory: 'malignant',
    frozenDx: 'Reactive', finalDx: 'Metastatic carcinoma',
    outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'sampling_error',
    recordedAt: '2026-06-17T00:00:00.000Z', recordedBy: { userId: 'user-seed', userName: 'Dr. Reyes' } },
  { id: 'disc-004', caseId: 'PSA-2024-1098', specimenId: 'legacy-1098', caseType: 'Soft Tissue Mass',
    frozenCategory: 'atypical_suspicious', finalCategory: 'malignant',
    frozenDx: 'Spindle cell neoplasm', finalDx: 'Low-grade sarcoma',
    outcome: 'discordant', delta: 'upgrade', severity: 'medium', rootCause: 'interpretation_error',
    recordedAt: '2026-05-23T00:00:00.000Z', recordedBy: { userId: 'user-seed', userName: 'Dr. Reyes' } },
  { id: 'disc-005', caseId: 'PSA-2024-1071', specimenId: 'legacy-1071', caseType: 'Liver Wedge',
    frozenCategory: 'atypical_suspicious', finalCategory: 'malignant',
    frozenDx: 'Atypical hepatocytes', finalDx: 'Hepatocellular carcinoma',
    outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'technical_artifact',
    recordedAt: '2026-05-05T00:00:00.000Z', recordedBy: { userId: 'user-seed', userName: 'Dr. Reyes' } },
  { id: 'disc-006', caseId: 'PSA-2024-1034', specimenId: 'legacy-1034', caseType: 'Lung Wedge',
    frozenCategory: 'benign', finalCategory: 'malignant',
    frozenDx: 'Inflammatory change', finalDx: 'Adenocarcinoma',
    outcome: 'discordant', delta: 'upgrade', severity: 'high', rootCause: 'sampling_error',
    recordedAt: '2026-04-10T00:00:00.000Z', recordedBy: { userId: 'user-seed', userName: 'Dr. Reyes' } },
  { id: 'disc-007', caseId: 'PSA-2024-0988', specimenId: 'legacy-0988', caseType: 'Prostate Bx',
    frozenCategory: 'atypical_suspicious', finalCategory: 'malignant',
    frozenDx: 'PIN, high grade', finalDx: 'Gleason 3+4 carcinoma',
    outcome: 'discordant', delta: 'upgrade', severity: 'medium', rootCause: 'interpretation_error',
    recordedAt: '2026-03-13T00:00:00.000Z', recordedBy: { userId: 'user-seed', userName: 'Dr. Reyes' } },
];

const CONCORDANT_CASE_TYPES = ['Breast Core Bx', 'Colon Polyp', 'Skin Shave', 'Lymph Node', 'Thyroid Lobe', 'Gallbladder', 'Appendix', 'GI Biopsy'];
const CONCORDANT_RECORDERS = [
  { userId: 'user-seed-2', userName: 'Dr. Owusu' }, { userId: 'user-seed-3', userName: 'Dr. Faulkner' }, { userId: 'user-seed', userName: 'Dr. Reyes' },
];
const CONCORDANT_SEED: ReconciliationRecord[] = Array.from({ length: 130 }, (_, i) => {
  const category = i % 5 === 0 ? 'malignant' : i % 3 === 0 ? 'atypical_suspicious' : 'benign';
  const daysAgo = 3 + (i * 2); // spreads seed dates back across roughly the last 9 months, oldest first isn't required here
  return {
    id: `conc-${String(i + 1).padStart(3, '0')}`,
    caseId: `PSA-2024-${2200 + i}`,
    specimenId: `legacy-conc-${2200 + i}`,
    caseType: CONCORDANT_CASE_TYPES[i % CONCORDANT_CASE_TYPES.length],
    frozenCategory: category, finalCategory: category,
    frozenDx: 'Frozen impression confirmed on permanent sections',
    finalDx: 'Consistent with frozen section diagnosis',
    outcome: 'concordant',
    recordedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    recordedBy: CONCORDANT_RECORDERS[i % CONCORDANT_RECORDERS.length],
  } as ReconciliationRecord;
});

// Teaching-case seed — Oliver Pemberton (resident, PATH-UK-002) drafting,
// Paul Carter (attending, PATH-UK-001) reconciling. Real Subspecialty ids
// ('breast', 'gi' — see services/subspecialties/mockSubspecialtyService.ts),
// deliberately different concordance rates per subspecialty so the
// per-subspecialty breakdown in My Contribution's teaching panel has a
// genuine gap to surface, not a flat number across every category.
const TEACHING_SEED: ReconciliationRecord[] = [
  ...Array.from({ length: 22 }, (_, i) => ({
    id: `teach-breast-${i + 1}`,
    caseId: `MFT26-${9100 + i}`,
    specimenId: `teach-breast-spec-${i + 1}`,
    caseType: 'Breast Core Bx',
    subspecialtyId: 'breast',
    frozenCategory: 'benign' as const, finalCategory: 'benign' as const,
    frozenDx: 'Frozen impression confirmed on permanent sections',
    finalDx: i === 21 ? 'Atypical ductal hyperplasia, upgraded from benign on permanent sections' : 'Consistent with frozen section diagnosis',
    outcome: i === 21 ? 'discordant' : 'concordant',
    ...(i === 21 ? {
      delta: 'upgrade' as const, severity: 'medium' as const, rootCause: 'sampling_error' as const,
      escalationRequired: false,
      comments: 'Permanent sections revealed a small focus of atypical ductal hyperplasia not represented in the frozen section tissue — sampling limitation, not a reading error.',
    } : {}),
    recordedAt: new Date(Date.now() - (30 + i * 3) * 86400000).toISOString(),
    recordedBy: { userId: 'PATH-UK-001', userName: 'Paul Carter' },
    draftedBy: { userId: 'PATH-UK-002', userName: 'Oliver Pemberton' },
    isTeachingCase: true,
    attendingFeedback: i === 21 ? 'Good frozen call given what was sampled — worth taking one extra level on borderline fibroepithelial lesions before signing out benign.' : undefined,
  })) as ReconciliationRecord[],
  ...Array.from({ length: 16 }, (_, i) => ({
    id: `teach-gi-${i + 1}`,
    caseId: `MFT26-${9300 + i}`,
    specimenId: `teach-gi-spec-${i + 1}`,
    caseType: 'Colonic Polyp',
    subspecialtyId: 'gi',
    frozenCategory: 'benign' as const, finalCategory: (i === 13 || i === 14) ? 'malignant' as const : 'benign' as const,
    frozenDx: 'Frozen impression confirmed on permanent sections',
    finalDx: (i === 13 || i === 14) ? 'Invasive adenocarcinoma arising in tubulovillous adenoma, not appreciated on frozen section' : 'Consistent with frozen section diagnosis',
    outcome: (i === 13 || i === 14) ? 'discordant' : 'concordant',
    ...((i === 13 || i === 14) ? {
      delta: 'upgrade' as const, severity: 'high' as const, rootCause: 'sampling_error' as const,
      escalationRequired: true,
      comments: 'Invasive component identified only on permanent deeper levels — frozen section tissue did not include the focus of invasion. Flagged for mandatory escalation given the staging implication.',
    } : {}),
    recordedAt: new Date(Date.now() - (20 + i * 4) * 86400000).toISOString(),
    recordedBy: { userId: 'PATH-UK-001', userName: 'Paul Carter' },
    draftedBy: { userId: 'PATH-UK-002', userName: 'Oliver Pemberton' },
    isTeachingCase: true,
    attendingFeedback: (i === 13 || i === 14) ? 'This is a classic teaching point on polypectomy/frozen limitations — invasive foci in villous adenomas are often deep and easy to miss on a single frozen level. Take multiple levels on any adenoma with high-grade dysplasia on frozen.' : undefined,
  })) as ReconciliationRecord[],
];

// Real, per direct guidance ahead of PS-113's Stage 3 migration:
// exported (was module-private) so reconciliationRecordMapping.ts's
// real, tested migration can map over the exact same real seed data
// this service itself uses - never a hand-copied, potentially-drifting
// duplicate.
export const SEED_RECORDS: ReconciliationRecord[] = [...DISCORDANT_SEED, ...CONCORDANT_SEED, ...TEACHING_SEED];

const load    = (): ReconciliationRecord[] => storageGet<ReconciliationRecord[]>(STORAGE_KEY, SEED_RECORDS);
const persist = (data: ReconciliationRecord[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });

export const mockReconciliationService: IReconciliationService = {
  async getAll() {
    return ok([...load()]);
  },

  async create(record) {
    const newRecord: ReconciliationRecord = {
      ...record,
      id: `rec-${Date.now().toString(36)}`,
      recordedAt: new Date().toISOString(),
    };
    const records = load();
    persist([newRecord, ...records]);
    return ok(newRecord);
  },
};
