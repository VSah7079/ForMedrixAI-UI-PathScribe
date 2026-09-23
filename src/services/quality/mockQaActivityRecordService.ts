// src/services/quality/mockQaActivityRecordService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-113. Real, localStorage-backed create/list for QaActivityRecord.
//
// Real, Stage 5 update: mockReconciliationService.ts/ReconciliationRecord.ts/
// IReconciliationService.ts are retired and deleted (first release, no
// real production history to preserve). The 175 real, migrated
// Frozen-to-Permanent records below are now frozen, static data -
// generated once via a real, throwaway script that ran the exact same
// mapReconciliationRecordToQaActivityRecord() transform Stage 3 already
// verified, capturing its real output at that moment. Confirmed
// byte-identical to Stage 3's own already-passing test assertions
// (175 total: 10 discordant, 165 concordant) before this file was
// written - never hand-transcribed, same discipline as every other
// stage of this migration, just captured once instead of computed
// live, since there's no longer a live old service to compute it from.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { mockSpecimenDeficiencyService } from '../deficiencies/mockSpecimenDeficiencyService';
import { mockQaActivityTypeService } from './mockQaActivityTypeService';
import type { IQaActivityRecordService } from './IQaActivityRecordService';
import type { QaActivityRecord, QaDiscordanceRootCause } from '@/types/quality/QaActivityRecord';

const STORAGE_KEY = 'qa_activity_records';

const ROOT_CAUSE_LABEL: Record<QaDiscordanceRootCause, string> = {
  sampling_error: 'Sampling error',
  interpretation_error: 'Interpretation error',
  technical_artifact: 'Technical artifact',
  other: 'Other',
};

/**
 * Real, per direct guidance (PS-119): formats a QaActivityRecord's own
 * rootCause/rootCauseNote for the free-text SpecimenDeficiency.rootCause
 * field it's being wired through to — not a raw enum value dropped in
 * unreadable, and not silently dropping the "Other" note that's the
 * whole reason that root cause exists. Undefined when the review
 * itself never captured one (a real, if rare, discordant record with
 * no root cause recorded), matching this app's own real "absence means
 * nothing to show" convention rather than inventing a placeholder string.
 */
function formatQaRootCauseForDeficiency(rootCause: QaDiscordanceRootCause | undefined, rootCauseNote: string | undefined): string | undefined {
  if (!rootCause) return undefined;
  if (rootCause === 'other' && rootCauseNote?.trim()) return rootCauseNote.trim();
  return ROOT_CAUSE_LABEL[rootCause];
}

// Real, frozen migration of the old ReconciliationRecord seed data -
// 175 records (10 discordant, 165 concordant), all under the real
// "Frozen vs Final Correlation" activity type. Generated once, not
// hand-copied - see this file's own header.
const MIGRATED_RECONCILIATION_RECORDS: QaActivityRecord[] = [
  {
    "id": "disc-001",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-1190",
    "specimenId": "legacy-1190",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "malignant",
      "frozenDx": "Atypical, favor benign",
      "finalDx": "DCIS, low grade"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "high",
    "rootCause": "sampling_error",
    "recordedAt": "2026-06-29T00:00:00.000Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "disc-002",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-1165",
    "specimenId": "legacy-1165",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "malignant",
      "frozenDx": "Follicular lesion",
      "finalDx": "Follicular carcinoma"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "medium",
    "rootCause": "interpretation_error",
    "recordedAt": "2026-06-25T00:00:00.000Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "disc-003",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-1142",
    "specimenId": "legacy-1142",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "malignant",
      "frozenDx": "Reactive",
      "finalDx": "Metastatic carcinoma"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "high",
    "rootCause": "sampling_error",
    "recordedAt": "2026-06-17T00:00:00.000Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "disc-004",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-1098",
    "specimenId": "legacy-1098",
    "caseType": "Soft Tissue Mass",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "malignant",
      "frozenDx": "Spindle cell neoplasm",
      "finalDx": "Low-grade sarcoma"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "medium",
    "rootCause": "interpretation_error",
    "recordedAt": "2026-05-23T00:00:00.000Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "disc-005",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-1071",
    "specimenId": "legacy-1071",
    "caseType": "Liver Wedge",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "malignant",
      "frozenDx": "Atypical hepatocytes",
      "finalDx": "Hepatocellular carcinoma"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "high",
    "rootCause": "technical_artifact",
    "recordedAt": "2026-05-05T00:00:00.000Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "disc-006",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-1034",
    "specimenId": "legacy-1034",
    "caseType": "Lung Wedge",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "malignant",
      "frozenDx": "Inflammatory change",
      "finalDx": "Adenocarcinoma"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "high",
    "rootCause": "sampling_error",
    "recordedAt": "2026-04-10T00:00:00.000Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "disc-007",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-0988",
    "specimenId": "legacy-0988",
    "caseType": "Prostate Bx",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "malignant",
      "frozenDx": "PIN, high grade",
      "finalDx": "Gleason 3+4 carcinoma"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "medium",
    "rootCause": "interpretation_error",
    "recordedAt": "2026-03-13T00:00:00.000Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-001",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2200",
    "specimenId": "legacy-conc-2200",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-25T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-002",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2201",
    "specimenId": "legacy-conc-2201",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-23T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-003",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2202",
    "specimenId": "legacy-conc-2202",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-21T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-004",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2203",
    "specimenId": "legacy-conc-2203",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-19T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-005",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2204",
    "specimenId": "legacy-conc-2204",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-17T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-006",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2205",
    "specimenId": "legacy-conc-2205",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-15T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-007",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2206",
    "specimenId": "legacy-conc-2206",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-13T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-008",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2207",
    "specimenId": "legacy-conc-2207",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-11T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-009",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2208",
    "specimenId": "legacy-conc-2208",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-09T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-010",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2209",
    "specimenId": "legacy-conc-2209",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-07T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-011",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2210",
    "specimenId": "legacy-conc-2210",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-05T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-012",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2211",
    "specimenId": "legacy-conc-2211",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-03T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-013",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2212",
    "specimenId": "legacy-conc-2212",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-08-01T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-014",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2213",
    "specimenId": "legacy-conc-2213",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-30T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-015",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2214",
    "specimenId": "legacy-conc-2214",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-28T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-016",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2215",
    "specimenId": "legacy-conc-2215",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-26T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-017",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2216",
    "specimenId": "legacy-conc-2216",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-24T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-018",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2217",
    "specimenId": "legacy-conc-2217",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-22T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-019",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2218",
    "specimenId": "legacy-conc-2218",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-20T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-020",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2219",
    "specimenId": "legacy-conc-2219",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-18T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-021",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2220",
    "specimenId": "legacy-conc-2220",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-16T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-022",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2221",
    "specimenId": "legacy-conc-2221",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-14T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-023",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2222",
    "specimenId": "legacy-conc-2222",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-12T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-024",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2223",
    "specimenId": "legacy-conc-2223",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-10T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-025",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2224",
    "specimenId": "legacy-conc-2224",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-08T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-026",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2225",
    "specimenId": "legacy-conc-2225",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-06T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-027",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2226",
    "specimenId": "legacy-conc-2226",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-04T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-028",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2227",
    "specimenId": "legacy-conc-2227",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-07-02T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-029",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2228",
    "specimenId": "legacy-conc-2228",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-30T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-030",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2229",
    "specimenId": "legacy-conc-2229",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-28T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-031",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2230",
    "specimenId": "legacy-conc-2230",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-26T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-032",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2231",
    "specimenId": "legacy-conc-2231",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-24T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-033",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2232",
    "specimenId": "legacy-conc-2232",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-22T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-034",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2233",
    "specimenId": "legacy-conc-2233",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-20T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-035",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2234",
    "specimenId": "legacy-conc-2234",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-18T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-036",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2235",
    "specimenId": "legacy-conc-2235",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-16T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-037",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2236",
    "specimenId": "legacy-conc-2236",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-14T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-038",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2237",
    "specimenId": "legacy-conc-2237",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-12T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-039",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2238",
    "specimenId": "legacy-conc-2238",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-10T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-040",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2239",
    "specimenId": "legacy-conc-2239",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-08T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-041",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2240",
    "specimenId": "legacy-conc-2240",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-06T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-042",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2241",
    "specimenId": "legacy-conc-2241",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-04T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-043",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2242",
    "specimenId": "legacy-conc-2242",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-06-02T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-044",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2243",
    "specimenId": "legacy-conc-2243",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-31T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-045",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2244",
    "specimenId": "legacy-conc-2244",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-29T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-046",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2245",
    "specimenId": "legacy-conc-2245",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-27T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-047",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2246",
    "specimenId": "legacy-conc-2246",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-25T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-048",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2247",
    "specimenId": "legacy-conc-2247",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-23T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-049",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2248",
    "specimenId": "legacy-conc-2248",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-21T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-050",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2249",
    "specimenId": "legacy-conc-2249",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-19T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-051",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2250",
    "specimenId": "legacy-conc-2250",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-17T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-052",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2251",
    "specimenId": "legacy-conc-2251",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-15T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-053",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2252",
    "specimenId": "legacy-conc-2252",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-13T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-054",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2253",
    "specimenId": "legacy-conc-2253",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-11T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-055",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2254",
    "specimenId": "legacy-conc-2254",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-09T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-056",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2255",
    "specimenId": "legacy-conc-2255",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-07T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-057",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2256",
    "specimenId": "legacy-conc-2256",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-05T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-058",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2257",
    "specimenId": "legacy-conc-2257",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-03T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-059",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2258",
    "specimenId": "legacy-conc-2258",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-05-01T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-060",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2259",
    "specimenId": "legacy-conc-2259",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-29T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-061",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2260",
    "specimenId": "legacy-conc-2260",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-27T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-062",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2261",
    "specimenId": "legacy-conc-2261",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-25T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-063",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2262",
    "specimenId": "legacy-conc-2262",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-23T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-064",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2263",
    "specimenId": "legacy-conc-2263",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-21T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-065",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2264",
    "specimenId": "legacy-conc-2264",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-19T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-066",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2265",
    "specimenId": "legacy-conc-2265",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-17T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-067",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2266",
    "specimenId": "legacy-conc-2266",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-15T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-068",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2267",
    "specimenId": "legacy-conc-2267",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-13T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-069",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2268",
    "specimenId": "legacy-conc-2268",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-11T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-070",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2269",
    "specimenId": "legacy-conc-2269",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-09T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-071",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2270",
    "specimenId": "legacy-conc-2270",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-07T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-072",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2271",
    "specimenId": "legacy-conc-2271",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-05T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-073",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2272",
    "specimenId": "legacy-conc-2272",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-03T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-074",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2273",
    "specimenId": "legacy-conc-2273",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-04-01T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-075",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2274",
    "specimenId": "legacy-conc-2274",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-30T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-076",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2275",
    "specimenId": "legacy-conc-2275",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-28T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-077",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2276",
    "specimenId": "legacy-conc-2276",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-26T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-078",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2277",
    "specimenId": "legacy-conc-2277",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-24T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-079",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2278",
    "specimenId": "legacy-conc-2278",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-22T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-080",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2279",
    "specimenId": "legacy-conc-2279",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-20T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-081",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2280",
    "specimenId": "legacy-conc-2280",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-18T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-082",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2281",
    "specimenId": "legacy-conc-2281",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-16T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-083",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2282",
    "specimenId": "legacy-conc-2282",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-14T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-084",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2283",
    "specimenId": "legacy-conc-2283",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-12T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-085",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2284",
    "specimenId": "legacy-conc-2284",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-10T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-086",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2285",
    "specimenId": "legacy-conc-2285",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-08T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-087",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2286",
    "specimenId": "legacy-conc-2286",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-06T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-088",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2287",
    "specimenId": "legacy-conc-2287",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-04T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-089",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2288",
    "specimenId": "legacy-conc-2288",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-03-02T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-090",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2289",
    "specimenId": "legacy-conc-2289",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-28T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-091",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2290",
    "specimenId": "legacy-conc-2290",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-26T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-092",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2291",
    "specimenId": "legacy-conc-2291",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-24T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-093",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2292",
    "specimenId": "legacy-conc-2292",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-22T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-094",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2293",
    "specimenId": "legacy-conc-2293",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-20T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-095",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2294",
    "specimenId": "legacy-conc-2294",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-18T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-096",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2295",
    "specimenId": "legacy-conc-2295",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-16T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-097",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2296",
    "specimenId": "legacy-conc-2296",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-14T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-098",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2297",
    "specimenId": "legacy-conc-2297",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-12T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-099",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2298",
    "specimenId": "legacy-conc-2298",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-10T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-100",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2299",
    "specimenId": "legacy-conc-2299",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-08T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-101",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2300",
    "specimenId": "legacy-conc-2300",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-06T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-102",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2301",
    "specimenId": "legacy-conc-2301",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-04T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-103",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2302",
    "specimenId": "legacy-conc-2302",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-02-02T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-104",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2303",
    "specimenId": "legacy-conc-2303",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-31T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-105",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2304",
    "specimenId": "legacy-conc-2304",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-29T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-106",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2305",
    "specimenId": "legacy-conc-2305",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-27T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-107",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2306",
    "specimenId": "legacy-conc-2306",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-25T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-108",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2307",
    "specimenId": "legacy-conc-2307",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-23T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-109",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2308",
    "specimenId": "legacy-conc-2308",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-21T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-110",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2309",
    "specimenId": "legacy-conc-2309",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-19T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-111",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2310",
    "specimenId": "legacy-conc-2310",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-17T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-112",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2311",
    "specimenId": "legacy-conc-2311",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-15T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-113",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2312",
    "specimenId": "legacy-conc-2312",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-13T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-114",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2313",
    "specimenId": "legacy-conc-2313",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-11T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-115",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2314",
    "specimenId": "legacy-conc-2314",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-09T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-116",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2315",
    "specimenId": "legacy-conc-2315",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-07T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-117",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2316",
    "specimenId": "legacy-conc-2316",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-05T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-118",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2317",
    "specimenId": "legacy-conc-2317",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-03T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-119",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2318",
    "specimenId": "legacy-conc-2318",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2026-01-01T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-120",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2319",
    "specimenId": "legacy-conc-2319",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-30T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-121",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2320",
    "specimenId": "legacy-conc-2320",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-28T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-122",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2321",
    "specimenId": "legacy-conc-2321",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-26T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-123",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2322",
    "specimenId": "legacy-conc-2322",
    "caseType": "Skin Shave",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-24T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-124",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2323",
    "specimenId": "legacy-conc-2323",
    "caseType": "Lymph Node",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-22T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-125",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2324",
    "specimenId": "legacy-conc-2324",
    "caseType": "Thyroid Lobe",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-20T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-126",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2325",
    "specimenId": "legacy-conc-2325",
    "caseType": "Gallbladder",
    "fieldValues": {
      "frozenCategory": "malignant",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-18T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-127",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2326",
    "specimenId": "legacy-conc-2326",
    "caseType": "Appendix",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-16T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "conc-128",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2327",
    "specimenId": "legacy-conc-2327",
    "caseType": "GI Biopsy",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-14T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-3",
      "userName": "Dr. Faulkner"
    }
  },
  {
    "id": "conc-129",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2328",
    "specimenId": "legacy-conc-2328",
    "caseType": "Breast Core Bx",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-12T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed",
      "userName": "Dr. Reyes"
    }
  },
  {
    "id": "conc-130",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "PSA-2024-2329",
    "specimenId": "legacy-conc-2329",
    "caseType": "Colon Polyp",
    "fieldValues": {
      "frozenCategory": "atypical_suspicious",
      "finalCategory": "atypical_suspicious",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "recordedAt": "2025-12-10T03:47:33.600Z",
    "recordedBy": {
      "userId": "user-seed-2",
      "userName": "Dr. Owusu"
    }
  },
  {
    "id": "teach-breast-1",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9100",
    "specimenId": "teach-breast-spec-1",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-29T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-2",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9101",
    "specimenId": "teach-breast-spec-2",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-26T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-3",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9102",
    "specimenId": "teach-breast-spec-3",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-23T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-4",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9103",
    "specimenId": "teach-breast-spec-4",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-20T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-5",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9104",
    "specimenId": "teach-breast-spec-5",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-17T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-6",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9105",
    "specimenId": "teach-breast-spec-6",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-14T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-7",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9106",
    "specimenId": "teach-breast-spec-7",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-11T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-8",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9107",
    "specimenId": "teach-breast-spec-8",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-08T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-9",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9108",
    "specimenId": "teach-breast-spec-9",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-05T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-10",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9109",
    "specimenId": "teach-breast-spec-10",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-02T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-11",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9110",
    "specimenId": "teach-breast-spec-11",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-29T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-12",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9111",
    "specimenId": "teach-breast-spec-12",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-26T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-13",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9112",
    "specimenId": "teach-breast-spec-13",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-23T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-14",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9113",
    "specimenId": "teach-breast-spec-14",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-20T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-15",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9114",
    "specimenId": "teach-breast-spec-15",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-17T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-16",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9115",
    "specimenId": "teach-breast-spec-16",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-14T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-17",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9116",
    "specimenId": "teach-breast-spec-17",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-11T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-18",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9117",
    "specimenId": "teach-breast-spec-18",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-08T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-19",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9118",
    "specimenId": "teach-breast-spec-19",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-05T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-20",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9119",
    "specimenId": "teach-breast-spec-20",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-02T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-21",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9120",
    "specimenId": "teach-breast-spec-21",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-05-30T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-breast-22",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9121",
    "specimenId": "teach-breast-spec-22",
    "caseType": "Breast Core Bx",
    "subspecialtyId": "breast",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Atypical ductal hyperplasia, upgraded from benign on permanent sections"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "medium",
    "rootCause": "sampling_error",
    "escalationRequired": false,
    "comments": "Permanent sections revealed a small focus of atypical ductal hyperplasia not represented in the frozen section tissue \u2014 sampling limitation, not a reading error.",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "reviewerFeedback": "Good frozen call given what was sampled \u2014 worth taking one extra level on borderline fibroepithelial lesions before signing out benign.",
    "recordedAt": "2026-05-27T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-1",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9300",
    "specimenId": "teach-gi-spec-1",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-08-08T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-2",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9301",
    "specimenId": "teach-gi-spec-2",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-08-04T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-3",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9302",
    "specimenId": "teach-gi-spec-3",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-31T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-4",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9303",
    "specimenId": "teach-gi-spec-4",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-27T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-5",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9304",
    "specimenId": "teach-gi-spec-5",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-23T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-6",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9305",
    "specimenId": "teach-gi-spec-6",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-19T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-7",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9306",
    "specimenId": "teach-gi-spec-7",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-15T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-8",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9307",
    "specimenId": "teach-gi-spec-8",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-11T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-9",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9308",
    "specimenId": "teach-gi-spec-9",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-07T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-10",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9309",
    "specimenId": "teach-gi-spec-10",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-07-03T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-11",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9310",
    "specimenId": "teach-gi-spec-11",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-29T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-12",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9311",
    "specimenId": "teach-gi-spec-12",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-25T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-13",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9312",
    "specimenId": "teach-gi-spec-13",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-21T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-14",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9313",
    "specimenId": "teach-gi-spec-14",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Invasive adenocarcinoma arising in tubulovillous adenoma, not appreciated on frozen section"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "high",
    "rootCause": "sampling_error",
    "escalationRequired": true,
    "comments": "Invasive component identified only on permanent deeper levels \u2014 frozen section tissue did not include the focus of invasion. Flagged for mandatory escalation given the staging implication.",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "reviewerFeedback": "This is a classic teaching point on polypectomy/frozen limitations \u2014 invasive foci in villous adenomas are often deep and easy to miss on a single frozen level. Take multiple levels on any adenoma with high-grade dysplasia on frozen.",
    "recordedAt": "2026-06-17T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-15",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9314",
    "specimenId": "teach-gi-spec-15",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "malignant",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Invasive adenocarcinoma arising in tubulovillous adenoma, not appreciated on frozen section"
    },
    "outcome": "discordant",
    "delta": "upgrade",
    "severity": "high",
    "rootCause": "sampling_error",
    "escalationRequired": true,
    "comments": "Invasive component identified only on permanent deeper levels \u2014 frozen section tissue did not include the focus of invasion. Flagged for mandatory escalation given the staging implication.",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "reviewerFeedback": "This is a classic teaching point on polypectomy/frozen limitations \u2014 invasive foci in villous adenomas are often deep and easy to miss on a single frozen level. Take multiple levels on any adenoma with high-grade dysplasia on frozen.",
    "recordedAt": "2026-06-13T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  },
  {
    "id": "teach-gi-16",
    "activityTypeId": "qa-activity-frozen-final",
    "caseId": "MFT26-9315",
    "specimenId": "teach-gi-spec-16",
    "caseType": "Colonic Polyp",
    "subspecialtyId": "gi",
    "fieldValues": {
      "frozenCategory": "benign",
      "finalCategory": "benign",
      "frozenDx": "Frozen impression confirmed on permanent sections",
      "finalDx": "Consistent with frozen section diagnosis"
    },
    "outcome": "concordant",
    "draftedBy": {
      "userId": "PATH-UK-002",
      "userName": "Oliver Pemberton"
    },
    "isTeachingOnboardingCase": true,
    "recordedAt": "2026-06-09T03:47:33.601Z",
    "recordedBy": {
      "userId": "PATH-UK-001",
      "userName": "Paul Carter"
    }
  }
];

const SEED_RECORDS: QaActivityRecord[] = [
  ...MIGRATED_RECONCILIATION_RECORDS,
  // Cytology-Histology — kept from the earlier illustrative seed,
  // deliberately not covered by the reconciliation migration above -
  // still the one real proof this service genuinely works across
  // more than one activity type, not just Frozen vs Final.
  {
    id: 'qa-rec-seed-cyto-histo-001', activityTypeId: 'qa-activity-cyto-histo',
    caseId: 'S26-4404', specimenId: 'S26-4404-SP-1', caseType: 'Prostate Bx', subspecialtyId: 'uro',
    fieldValues: {
      cytologyDx: 'Atypical cells, favor benign', histologyDx: 'Benign prostatic tissue',
    },
    outcome: 'concordant',
    recordedAt: '2026-08-23T00:00:00.000Z', recordedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
  },
];

const load    = (): QaActivityRecord[] => storageGet<QaActivityRecord[]>(STORAGE_KEY, SEED_RECORDS);
const persist = (data: QaActivityRecord[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

export const mockQaActivityRecordService: IQaActivityRecordService = {
  async getAll() {
    return ok([...load()]);
  },

  async create(record) {
    const newRecord: QaActivityRecord = {
      ...record,
      id: `qa-rec-${Date.now().toString(36)}`,
      recordedAt: new Date().toISOString(),
    };
    const records = load();
    persist([newRecord, ...records]);

    // Real, per direct guidance (PS-134): the real, generic
    // capaTriggerRule consumption this whole mechanism was designed
    // for (QaActivityType.ts's own doc comment) but never actually
    // built anywhere — confirmed directly before writing this, only
    // the type definition and the admin config UI referenced the
    // field. Every QaActivityType with a real capaTriggerRule
    // configured now genuinely benefits, not just the one new PS-134
    // activity this was built for. A concordant record never checks
    // this — there's nothing to grade — matching QaActivityRecord's
    // own "delta/severity/rootCause only present when discordant"
    // posture exactly. A raise failure is logged, never thrown — the
    // real QA record itself already persisted successfully above;
    // losing the CAPA side-effect shouldn't roll that back or block
    // the caller.
    if (newRecord.outcome === 'discordant' && newRecord.severity) {
      const typesRes = await mockQaActivityTypeService.getAll();
      const activityType = typesRes.ok ? typesRes.data.find(t => t.id === newRecord.activityTypeId) : undefined;
      const rule = activityType?.capaTriggerRule;
      if (rule?.triggerSeverities?.includes(newRecord.severity) && rule.deficiencyTypeId) {
        try {
          // Real, per direct guidance: never auto-raise a duplicate CAPA
          // for the same real, still-open issue. A second discordant QA
          // activity landing on a case that already has an unresolved
          // deficiency of this same type is real, useful evidence the
          // SAME problem is still open — not a second, separate problem
          // to track. Piling up duplicate open CAPA records for one real
          // issue is exactly the kind of administrative overhead a QA/
          // CAPA system must never create, especially once more than one
          // trigger (PS-144/PS-145/PS-146) can independently fire on the
          // same case.
          //
          // Deliberately scoped to THIS auto-raise call site only — every
          // other raise()/raiseAndResolve() caller (cold-chain telemetry,
          // AI/human concordance, batch processing) keeps its existing,
          // deliberate one-event-per-occurrence behavior; this file's own
          // header comment explains why a manually/system-detected
          // deficiency is usually a genuine, distinct workflow event each
          // time. An automated trigger re-firing on the same case is a
          // different situation: it can easily re-detect the exact same
          // still-unresolved condition, not a new one.
          //
          // Once the existing record is actually closed (resolved AND
          // verified effective), a fresh trigger firing again correctly
          // raises a new one — that's a genuinely new occurrence, not
          // overhead.
          const existingRes = await mockSpecimenDeficiencyService.getByCaseId(newRecord.caseId);
          const alreadyTracked = existingRes.ok && existingRes.data.some(d =>
            d.deficiencyTypeId === rule.deficiencyTypeId &&
            d.status !== 'closed' &&
            (d.specimenId ?? null) === (newRecord.specimenId ?? null)
          );
          if (alreadyTracked) {
            console.info(
              `[mockQaActivityRecordService] Skipped auto-raising a duplicate CAPA deficiency for case ${newRecord.caseId} — ` +
              `an open or pending-verification deficiency of type "${rule.deficiencyTypeId}" already exists for this case.`,
            );
          } else {
            await mockSpecimenDeficiencyService.raise({
              caseId: newRecord.caseId,
              specimenId: newRecord.specimenId,
              deficiencyTypeId: rule.deficiencyTypeId,
              raisedBy: newRecord.recordedBy.userId,
              comment: `Auto-raised from QA activity "${activityType?.name ?? newRecord.activityTypeId}" (${newRecord.severity} severity): ${newRecord.comments ?? ''}`.trim(),
              // Real, per direct guidance (PS-119): root cause captured
              // on the review itself is wired through onto the real CAPA
              // record at raise time, not left stranded on the review
              // alone (buried only in the free-text comment above). This
              // is a deliberate, additional real use of
              // SpecimenDeficiency.rootCause beyond its original
              // resolve()-time-only intent — see that field's own doc
              // comment for the full account of both real populating
              // paths it now has.
              rootCause: formatQaRootCauseForDeficiency(newRecord.rootCause, newRecord.rootCauseNote),
            });
          }
        } catch (e) {
          console.error('[mockQaActivityRecordService] Failed to auto-raise CAPA deficiency for a discordant, high-severity QA activity record:', e);
        }
      }
    }

    return ok(newRecord);
  },
};
