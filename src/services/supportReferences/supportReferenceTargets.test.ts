// Batch 364 (PS-350): what a support reference points to.
import { describe, expect, it } from 'vitest';
import { describeSupportTarget } from './supportReferenceTargets';

const data = {
  auditLogs: [{ id: 'al-1', timestamp: '2026-09-27 09:00:00', type: 'user', event: 'Field Updated', detail: 'Tumour size', user: 'Dr A', caseId: 'S26-4401', confidence: null }] as never[],
  errorLogs: [{ id: 'er-1', timestamp: '2026-09-27 10:00:00', severity: 'error', code: 'LIS_TIMEOUT', message: 'LIS did not answer', source: 'LIS', caseId: null, resolved: false }] as never[],
  interfaceExceptions: [{ id: 'ix-1', createdAt: '2026-09-27T11:00:00Z', eventType: 'ADT^A40', reason: 'No patient match' }] as never[],
};

describe('describeSupportTarget', () => {
  it('a case reference opens the case', () => {
    expect(describeSupportTarget({ kind: 'case', recordId: 'S26-4403' }, data)).toEqual({ kind: 'case', recordId: 'S26-4403', found: true, caseId: 'S26-4403' });
  });
  it('an audit, error or interface reference shows its entry, and the case it is about', () => {
    expect(describeSupportTarget({ kind: 'auditEntry', recordId: 'al-1' }, data)).toMatchObject({ found: true, title: 'Field Updated', caseId: 'S26-4401' });
    expect(describeSupportTarget({ kind: 'errorEntry', recordId: 'er-1' }, data)).toMatchObject({ found: true, title: 'LIS_TIMEOUT', detail: 'LIS did not answer' });
    expect(describeSupportTarget({ kind: 'interfaceException', recordId: 'ix-1' }, data)).toMatchObject({ found: true, title: 'ADT^A40' });
  });
  it('says so when the entry is no longer loaded', () => {
    expect(describeSupportTarget({ kind: 'auditEntry', recordId: 'gone' }, data)).toEqual({ kind: 'auditEntry', recordId: 'gone', found: false });
  });
});
