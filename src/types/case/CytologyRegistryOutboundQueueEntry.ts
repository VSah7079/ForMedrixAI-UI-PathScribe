// src/types/case/CytologyRegistryOutboundQueueEntry.ts
// Real, generic centralized-registry outbound queue entry — mirrors
// CytologyOutboundResultQueueEntry.ts's own established shape exactly,
// with `registryId` carried explicitly, since a facility's real
// registry destination is itself a real, configurable value
// (IRegistrySettingsService.ts), not a single fixed one the
// way the EHR/LIS ORU dispatch has.
export interface CytologyRegistryOutboundQueueEntry {
  id: string;
  caseId: string;
  signOutRecordId: string;
  registryId: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}
