// src/services/staff/providerCredentialRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 331 (PS-327): rules for the jurisdiction-scoped credentials an
// administrator records on a staff member (Staff → edit → Jurisdictional
// credentials). They feed resolveNormalizedCredentialCapabilities.ts: the
// UK Advanced Specialist cytology sign-out and, since this batch, the
// forensic autopsy appointment.
//
// Pure: validation and the audit-log detail for a change.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProviderCredential } from '@/types/staff/ProviderCredential';

export type ProviderCredentialError = 'typeRequired' | 'issuingBodyRequired' | 'jurisdictionRequired' | 'effectiveDateRequired' | 'expiryBeforeEffective';

/** A new, empty row for the editor. */
export const blankProviderCredential = (): ProviderCredential => ({
  type: '', issuingBody: '', jurisdiction: '' as ProviderCredential['jurisdiction'], effectiveDate: '',
});

/** Errors per row, by index; rows without errors are omitted. */
export function validateProviderCredentials(list: readonly ProviderCredential[]): Record<number, ProviderCredentialError[]> {
  const out: Record<number, ProviderCredentialError[]> = {};
  list.forEach((c, i) => {
    const e: ProviderCredentialError[] = [];
    if (!c.type?.trim()) e.push('typeRequired');
    if (!c.issuingBody?.trim()) e.push('issuingBodyRequired');
    if (!c.jurisdiction) e.push('jurisdictionRequired');
    if (!c.effectiveDate) e.push('effectiveDateRequired');
    if (c.effectiveDate && c.expirationDate && c.expirationDate < c.effectiveDate) e.push('expiryBeforeEffective');
    if (e.length) out[i] = e;
  });
  return out;
}

/** Trims text, drops an empty expiry date. */
export function normalizeProviderCredentials(list: readonly ProviderCredential[]): ProviderCredential[] {
  return list.map(c => ({
    type: c.type.trim(),
    issuingBody: c.issuingBody.trim(),
    jurisdiction: c.jurisdiction,
    effectiveDate: c.effectiveDate,
    ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
  }));
}

const describe = (c: ProviderCredential) =>
  `${c.type} (${c.issuingBody}, ${c.jurisdiction}, ${c.effectiveDate}${c.expirationDate ? ` to ${c.expirationDate}` : ''})`;

/** Audit-log detail for a credential change, in literal English (audit
 *  records are compliance artifacts). Null when nothing changed. */
export function providerCredentialChangeDetail(
  staffName: string,
  previous: readonly ProviderCredential[] | undefined,
  next: readonly ProviderCredential[],
): string | null {
  const before = new Set((previous ?? []).map(describe));
  const after = new Set(next.map(describe));
  const added = [...after].filter(d => !before.has(d));
  const removed = [...before].filter(d => !after.has(d));
  if (!added.length && !removed.length) return null;
  const parts: string[] = [];
  if (added.length) parts.push(`added ${added.join('; ')}`);
  if (removed.length) parts.push(`removed ${removed.join('; ')}`);
  return `Jurisdictional credentials for ${staffName}: ${parts.join(' | ')}`;
}
