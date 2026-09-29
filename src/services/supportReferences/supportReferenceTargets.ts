// src/services/supportReferences/supportReferenceTargets.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 364 (PS-350): what a resolved support reference points to, for the
// Audit Log's lookup, pure. The page passes the records it has loaded.
// ─────────────────────────────────────────────────────────────────────────────
import type { AuditLog, ErrorLog } from '../auditlog/IAuditService';
import type { InterfaceException } from '../interfaceExceptions/IInterfaceExceptionService';
import type { SupportReference, SupportReferenceKind } from './ISupportReferenceService';

export interface SupportTarget {
  kind: SupportReferenceKind;
  recordId: string;
  /** False when the record is no longer among those loaded (e.g. an entry outside the page's range). */
  found: boolean;
  time?: string;
  title?: string;
  detail?: string;
  /** The case to open, when the reference names a case or a record about one. */
  caseId?: string;
}

export function describeSupportTarget(
  ref: Pick<SupportReference, 'kind' | 'recordId'>,
  data: { auditLogs: readonly AuditLog[]; errorLogs: readonly ErrorLog[]; interfaceExceptions: readonly InterfaceException[] },
): SupportTarget {
  const base = { kind: ref.kind, recordId: ref.recordId };
  switch (ref.kind) {
    case 'case':
      return { ...base, found: true, caseId: ref.recordId };
    case 'auditEntry': {
      const e = data.auditLogs.find(l => l.id === ref.recordId);
      return e ? { ...base, found: true, time: e.timestamp, title: e.event, detail: e.detail, caseId: e.caseId ?? undefined } : { ...base, found: false };
    }
    case 'errorEntry': {
      const e = data.errorLogs.find(l => l.id === ref.recordId);
      return e ? { ...base, found: true, time: e.timestamp, title: e.code, detail: e.message, caseId: e.caseId ?? undefined } : { ...base, found: false };
    }
    case 'interfaceException': {
      const e = data.interfaceExceptions.find(x => x.id === ref.recordId);
      return e ? { ...base, found: true, time: e.createdAt, title: e.eventType, detail: e.reason } : { ...base, found: false };
    }
  }
}
