// src/services/auth/linkedAccounts.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 345 (PS-60 follow-up): the single-sign-on accounts linked to a staff
// record, for System → Staff, and unlinking one.
//
// Unlinking removes the (issuer, account id) link, so that account no longer
// signs in as this person. If linking by email is on and the account's email
// still matches exactly one active record, its next sign-in links again; to
// keep someone out, deactivate the record or change its email as well. The
// screen says so.
// ─────────────────────────────────────────────────────────────────────────────

import type { IUserService, StaffUser } from '../users/IUserService';
import type { IAuditService } from '../auditlog/IAuditService';
import type { ExternalIdentityLink } from './externalIdentity';
import { SSO_PROVIDER_AUDIT_NAMES } from './sso/resolveSsoProfile';

export interface LinkedAccountView {
  providerId: ExternalIdentityLink['providerId'];
  issuer: string;
  subject: string;
  /** The account id shortened for display (first 8 … last 4). */
  subjectShort: string;
  linkedAt: string;
  linkedBy: ExternalIdentityLink['linkedBy'];
}

export function describeLinkedAccounts(staff: Pick<StaffUser, 'externalIdentities'> | null | undefined): LinkedAccountView[] {
  return [...(staff?.externalIdentities ?? [])]
    .sort((a, b) => a.linkedAt.localeCompare(b.linkedAt))
    .map(l => ({
      providerId: l.providerId,
      issuer: l.issuer,
      subject: l.subject,
      subjectShort: l.subject.length > 14 ? `${l.subject.slice(0, 8)}…${l.subject.slice(-4)}` : l.subject,
      linkedAt: l.linkedAt,
      linkedBy: l.linkedBy,
    }));
}

export type UnlinkResult =
  | { ok: true; staff: StaffUser }
  | { ok: false; reason: 'not_found' | 'not_linked' | 'save_failed' };

export async function unlinkExternalIdentity(
  input: { staffId: string; issuer: string; subject: string; actorName: string },
  deps: { userService: Pick<IUserService, 'getById' | 'update'>; auditService: Pick<IAuditService, 'logEvent'> },
): Promise<UnlinkResult> {
  const found = await deps.userService.getById(input.staffId);
  if (found.ok === false) return { ok: false, reason: 'not_found' };
  const links = found.data.externalIdentities ?? [];
  const removed = links.find(l => l.issuer === input.issuer && l.subject === input.subject);
  if (!removed) return { ok: false, reason: 'not_linked' };
  const saved = await deps.userService.update(input.staffId, { externalIdentities: links.filter(l => l !== removed) });
  if (saved.ok === false) return { ok: false, reason: 'save_failed' };
  await deps.auditService.logEvent({
    type: 'user', event: 'SSO account unlinked',
    detail: `Account at ${SSO_PROVIDER_AUDIT_NAMES[removed.providerId] ?? removed.issuer} unlinked from staff record ${input.staffId}.`,
    user: input.actorName, caseId: null, confidence: null,
  }).catch(() => {});
  return { ok: true, staff: saved.data };
}
