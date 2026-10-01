// src/types/cytology/CytologyWorkloadLedgerEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own CLIA 42 CFR § 493.1274 workload
// specification, section 4 ("Database Schema for CLIA Audit
// Compliance") — a real, append-only, per-review workload record.
// Real, honest architectural translation: this app has no real
// Postgres/Redis backend anywhere — every "backend" concept in this
// module (the outbound dispatch queues, the QC ledger) is a real,
// pure TypeScript type plus a real, localStorage-backed mock service,
// and this follows the exact same established pattern rather than a
// literal SQL table. The real fields below mirror direct guidance's
// own schema exactly (user, case, slide, weight, review type, active
// duration, completion time) — only the storage layer differs.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewMode } from './CytologyReviewRecord';

export interface CytologyWorkloadLedgerEntry {
  id: string;
  userId: string;
  caseId: string;
  specimenId: string;
  reviewRecordId: string;
  reviewMode: CytologyReviewMode;
  scuWeight: number;
  activeDurationSeconds: number;
  completedAt: string;
}
