// src/services/delegations/delegationStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: this build's delegation records, kept in the browser under the
// key they always used ('ps_delegations_v1'), so existing demo delegations
// carry over and Demo Reset still clears them. Moved from mockCaseService.ts.
// Only the demo services use this file: mockDelegationService.ts for reads
// and completion, and mockCaseService.ts, which records a delegation when a
// case is delegated, a synoptic is assigned, or a pool case is accepted.
// ─────────────────────────────────────────────────────────────────────────────
import type { DelegationRecord } from './IDelegationService';

export const DELEGATION_STORE_KEY = 'ps_delegations_v1';

// Real fix: zero seed delegation data existed anywhere (loadDelegations
// fell back to an empty array) - meant CONSULTATION_RESPONSE/
// CONSULTATION_AWAITING (components/Contribution/qualityCalculations.ts)
// would show genuinely empty results for a fresh demo, same as every
// other TAT type before its own seed-data fix tonight. References real,
// existing case IDs (the same ten enriched earlier for lifecycle
// timestamps) and real seeded pathologist user IDs - not fabricated
// ones. Genuine mix: some completed late (real CONSULTATION_RESPONSE
// breaches), one completed on time (not a breach), some still pending
// past target (real CONSULTATION_AWAITING breaches).
const DELEGATION_SEED: DelegationRecord[] = [
  // Informal reviews asked OF PATH-001 (Pete) - CONSULTATION_RESPONSE
  { id: 'deleg-seed-1', caseId: 'S26-4401-BX-001', fromUserId: '1', toUserId: 'PATH-001',
    delegationType: 'CASUAL_REVIEW', note: 'Can you eyeball the margin call on this one?',
    timestamp: '2026-07-20T09:00:00.000Z', status: 'completed', completedAt: '2026-07-22T15:00:00.000Z' }, // 54h, real breach
  { id: 'deleg-seed-2', caseId: 'S26-4404', fromUserId: '6', toUserId: 'PATH-001',
    delegationType: 'CASUAL_REVIEW', note: 'Second set of eyes on the mitotic count?',
    timestamp: '2026-07-25T10:00:00.000Z', status: 'completed', completedAt: '2026-07-25T20:00:00.000Z' }, // 10h, on time
  { id: 'deleg-seed-3', caseId: 'S26-4407', fromUserId: '7', toUserId: 'PATH-001',
    delegationType: 'CASUAL_REVIEW', timestamp: '2026-07-18T08:00:00.000Z',
    status: 'completed', completedAt: '2026-07-21T08:00:00.000Z' }, // 72h, real breach
  // Informal reviews asked BY PATH-001 (Pete), still awaiting - CONSULTATION_AWAITING
  { id: 'deleg-seed-4', caseId: 'S26-4405', fromUserId: 'PATH-001', toUserId: '9',
    delegationType: 'CASUAL_REVIEW', note: 'Curious if you agree on the grade here.',
    timestamp: '2026-07-15T09:00:00.000Z', status: 'pending' }, // real, still-ongoing wait
  { id: 'deleg-seed-5', caseId: 'S26-4408', fromUserId: 'PATH-001', toUserId: '1',
    delegationType: 'CASUAL_REVIEW', timestamp: '2026-07-28T09:00:00.000Z', status: 'pending' },
];

export function loadDelegations(): DelegationRecord[] {
  try {
    const raw = localStorage.getItem(DELEGATION_STORE_KEY);
    return raw ? (JSON.parse(raw) as DelegationRecord[]) : DELEGATION_SEED.map(d => ({ ...d }));
  } catch { return DELEGATION_SEED.map(d => ({ ...d })); }
}

export function saveDelegations(records: DelegationRecord[]): void {
  try { localStorage.setItem(DELEGATION_STORE_KEY, JSON.stringify(records)); } catch { /* storage unavailable */ }
}

export function appendDelegation(record: DelegationRecord): void {
  saveDelegations([...loadDelegations(), record]);
}

/** A pool case was accepted: its first pending delegation becomes accepted. */
export function markPendingDelegationAccepted(caseId: string): void {
  const records = loadDelegations();
  const idx = records.findIndex(d => d.caseId === caseId && d.status === 'pending');
  if (idx < 0) return;
  records[idx] = { ...records[idx], status: 'accepted' };
  saveDelegations(records);
}
