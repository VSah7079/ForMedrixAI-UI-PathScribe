// src/services/supportReferences/mockSupportReferenceService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 364 (PS-350): this build's support references, kept in the browser
// (key 'support_references', cleared by Demo Reset). A reference is created
// the first time a record's is asked for; resolving one writes an audit entry.
// ─────────────────────────────────────────────────────────────────────────────
import { storageGet, storageSet } from '../mockStorage';
import { mockAuditService } from '../auditlog/mockAuditService';
import type { ISupportReferenceService, SupportReference } from './ISupportReferenceService';
import { SUPPORT_REFERENCE_INVALID, SUPPORT_REFERENCE_NOT_FOUND } from './ISupportReferenceService';
import { generateSupportReference, normaliseSupportReference } from './supportReferenceRules';

export const SUPPORT_REFERENCE_STORAGE_KEY = 'support_references';

const load = () => storageGet<SupportReference[]>(SUPPORT_REFERENCE_STORAGE_KEY, []);
const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const mockSupportReferenceService: ISupportReferenceService = {
  async forRecord(kind, recordId) {
    const all = load();
    const existing = all.find(r => r.kind === kind && r.recordId === recordId);
    if (existing) return { ok: true, data: existing };
    const taken = new Set(all.map(r => r.ref));
    let ref = generateSupportReference(randomBytes);
    while (taken.has(ref)) ref = generateSupportReference(randomBytes);
    const created: SupportReference = { ref, kind, recordId, createdAt: new Date().toISOString() };
    storageSet(SUPPORT_REFERENCE_STORAGE_KEY, [...all, created]);
    return { ok: true, data: created };
  },

  async resolve(text, actor) {
    const ref = normaliseSupportReference(text);
    if (!ref) return { ok: false, error: SUPPORT_REFERENCE_INVALID };
    const found = load().find(r => r.ref === ref);
    if (!found) return { ok: false, error: SUPPORT_REFERENCE_NOT_FOUND };
    await mockAuditService.logEvent({
      type: 'user',
      event: 'support_reference.resolved',
      detail: `Support reference ${found.ref} looked up (${found.kind})`,
      user: actor.name || actor.id,
      caseId: found.kind === 'case' ? found.recordId : null,
      confidence: null,
    }).catch(() => undefined);
    return { ok: true, data: found };
  },
};
