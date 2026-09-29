// src/services/signatures/mockSignatureRecordService.ts
// Batch 345: browser-storage stand-in for the API server's signature table.
// Append-only, like the real one.

import { storageGet, storageSet } from '../mockStorage';
import type { ISignatureRecordService, SignatureRecord } from './ISignatureRecordService';

const KEY = 'pathscribe_signature_records';

export const mockSignatureRecordService: ISignatureRecordService = {
  async record(input) {
    const record: SignatureRecord = {
      ...input,
      id: `SIG-${globalThis.crypto.randomUUID()}`,
      recordedAt: new Date().toISOString(),
    };
    const all = storageGet<SignatureRecord[]>(KEY, []);
    storageSet(KEY, [...all, record]);
    return { ok: true, data: record };
  },
  async getByCaseId(caseId) {
    return { ok: true, data: storageGet<SignatureRecord[]>(KEY, []).filter(r => r.caseId === caseId) };
  },
};
