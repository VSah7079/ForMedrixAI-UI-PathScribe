// src/services/assistPolling/mockLisStatusSource.ts
// Moved in Batch 323 to services/lisIngestion/adapters/mockPollAdapter.ts,
// the poll adapter of the LIS ingestion layer. Nothing imports this file any
// more; it only keeps a Batch 322 install consistent and can be deleted.
export { mockPollAdapter as mockLisStatusSource } from '../lisIngestion/adapters/mockPollAdapter';
