// src/services/lisIngestion/mockLisStagingQueueService.ts
// ─────────────────────────────────────────────────────────────────────────────
// The universal staging queue's storage (localStorage in the mock). In
// production this is a server-side table every adapter writes to and every
// worker reads from.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { StagedLisEvent } from './types';

export const LIS_STAGING_QUEUE_STORAGE_KEY = 'pathscribe_lis_staging_queue';

export interface ILisStagingQueueService {
  load(): Promise<StagedLisEvent[]>;
  save(queue: StagedLisEvent[]): Promise<void>;
}

export const mockLisStagingQueueService: ILisStagingQueueService = {
  async load() { return storageGet<StagedLisEvent[]>(LIS_STAGING_QUEUE_STORAGE_KEY, []); },
  async save(queue) { storageSet(LIS_STAGING_QUEUE_STORAGE_KEY, queue); },
};
