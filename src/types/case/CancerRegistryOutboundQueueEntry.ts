// src/types/case/CancerRegistryOutboundQueueEntry.ts
// Real, generic cancer-registry outbound queue entry — mirrors
// CytologyRegistryOutboundQueueEntry.ts's own established shape
// exactly, for the genuinely distinct real cancer-registry class
// (services/cancerRegistry/).
export interface CancerRegistryOutboundQueueEntry {
  id: string;
  caseId: string;
  registryId: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}
