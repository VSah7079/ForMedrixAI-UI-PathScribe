// src/types/billing/CodeImportJob.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 (Batch 333): the permanent, append-only ledger of bulk code
// imports into the Billing Dictionary (BillingRuleVersion rows).
//
// Per Pete, an import is one approval unit: every row it creates is
// PENDING_APPROVAL under one job, and a second person approves or rejects
// the whole job (four-eyes at bulk scale). An approved job can later be
// rolled back: rows already used by a service charge are RETIRED (their
// audit trail matters), rows never used are removed, and the versions the
// import superseded are reopened.
//
// Status mapping to the PS-89 design: APPROVED is the design's
// COMPLETED; PENDING_APPROVAL and REJECTED were added for the approval
// workflow the design predates.
// ─────────────────────────────────────────────────────────────────────────────

import type { CodeVocabulary } from './BillingRuleVersion';

export type CodeImportJobStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ROLLED_BACK' | 'PARTIALLY_RETIRED';

export interface CodeImportTuple {
  billingCode: string;
  siteId?: string;
  version: number;
}

export interface CodeImportJob {
  jobId: string;
  fileName: string;
  uploadedBy: string;
  timestamp: string;
  status: CodeImportJobStatus;
  vocabulary: CodeVocabulary;
  country?: string;
  siteId?: string;
  /** Optional note the uploader gave; appended to each row's changeReason. */
  batchNote?: string;
  /** Every version this job created. */
  codesProcessed: CodeImportTuple[];
  approval?: { reviewedBy: string; reviewedAt: string };
  rejection?: { reviewedBy: string; reviewedAt: string; reason: string };
  /** Versions this job's approval closed (natural sunset), with the
   *  effectiveTo they had before, so a rollback can reopen them. */
  sunsetTuples?: Array<CodeImportTuple & { previousEffectiveTo: string | null; closedTo: string }>;
  rollbackMetadata?: {
    rolledBackBy: string;
    rolledBackAt: string;
    rollbackReason: string;
    /** = purgedTuples.length */
    purgedCount: number;
    retiredCount: number;
    /** The only record that a removed version ever existed. */
    purgedTuples: Array<CodeImportTuple & { deletedAt: string }>;
    reopenedTuples: CodeImportTuple[];
  };
}
