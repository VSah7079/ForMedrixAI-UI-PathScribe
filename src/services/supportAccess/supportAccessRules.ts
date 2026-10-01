// src/services/supportAccess/supportAccessRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 372: ForMedrixAI support access to a hospital's data, per Pete's
// specification (Sep 28, 2026). The hospital, as data controller, decides
// whether support may reach its data at all:
//
//   disabled          support can't open, list or search the hospital's data
//   approvalRequired  (the default) support asks per ticket, with a reason;
//                     a hospital approver approves or rejects; an approval
//                     lasts the organisation's window (default 2 hours,
//                     configurable), or less if either side ends it
//   alwaysAllowed     standard support access, still recorded
//
// "Support access" means a Superadmin session reaching an organisation the
// person isn't a staff member of (caseAccessControl.isCrossTenantSupportAccess).
// ForMedrixAI people working in their own organisation aren't affected.
//
// Everything support does under this is written to the hospital's own
// support audit stream, which is hash-chained so a changed or removed entry
// shows (verifySupportAuditChain).
//
// Pure: no storage, no clock (callers pass `now`).
// ─────────────────────────────────────────────────────────────────────────────

export type SupportAccessPolicy = 'disabled' | 'approvalRequired' | 'alwaysAllowed';

export const SUPPORT_ACCESS_POLICIES: readonly SupportAccessPolicy[] = ['disabled', 'approvalRequired', 'alwaysAllowed'];

/** Pete's default for every organisation: support must ask. */
export const DEFAULT_SUPPORT_ACCESS_POLICY: SupportAccessPolicy = 'approvalRequired';

/** How long an approval lasts. Pete: configurable per organisation,
 *  default 2 hours. The hospital picks one of these. */
export const DEFAULT_SUPPORT_WINDOW_MINUTES = 120;
export const SUPPORT_WINDOW_OPTIONS: readonly number[] = [30, 60, 120, 240, 480];

/** An organisation's support access settings. */
export interface SupportAccessSettings {
  policy: SupportAccessPolicy;
  windowMinutes: number;
}

export const DEFAULT_SUPPORT_ACCESS_SETTINGS: SupportAccessSettings = {
  policy: 'approvalRequired',
  windowMinutes: DEFAULT_SUPPORT_WINDOW_MINUTES,
};

/** Stored settings made valid: an unknown policy or window falls back to the default. */
export function normaliseSupportSettings(s: Partial<SupportAccessSettings> | undefined): SupportAccessSettings {
  return {
    policy: s?.policy && SUPPORT_ACCESS_POLICIES.includes(s.policy) ? s.policy : DEFAULT_SUPPORT_ACCESS_SETTINGS.policy,
    windowMinutes: s?.windowMinutes && SUPPORT_WINDOW_OPTIONS.includes(s.windowMinutes) ? s.windowMinutes : DEFAULT_SUPPORT_WINDOW_MINUTES,
  };
}

export type SupportRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'ended' | 'revoked';

export interface SupportAccessRequest {
  id: string;
  /** The organisation (enterprise facility id) support wants to reach. */
  tenantId: string;
  agentId: string;
  agentName: string;
  ticketId: string;
  reason: string;
  requestedAt: string;
  status: SupportRequestStatus;
  decidedById?: string;
  decidedByName?: string;
  decidedAt?: string;
  /** Set on approval, from the organisation's window at that moment. */
  expiresAt?: string;
  windowMinutes?: number;
  /** When it ended early (ended by support, or revoked by the hospital). */
  closedAt?: string;
}

export type SupportAccessDecision =
  | { allowed: true; ticketId: string | null; requestId: string | null }
  | { allowed: false; reason: 'policyDisabled' | 'noApproval' };

/** Whether support may reach this organisation now. */
export function supportAccessDecision(
  policy: SupportAccessPolicy,
  requests: readonly SupportAccessRequest[],
  tenantId: string,
  agentId: string,
  now: Date,
): SupportAccessDecision {
  if (policy === 'disabled') return { allowed: false, reason: 'policyDisabled' };
  if (policy === 'alwaysAllowed') {
    // A ticket is still recorded if support has an approved one open.
    const g = activeGrant(requests, tenantId, agentId, now);
    return { allowed: true, ticketId: g?.ticketId ?? null, requestId: g?.id ?? null };
  }
  const g = activeGrant(requests, tenantId, agentId, now);
  return g ? { allowed: true, ticketId: g.ticketId, requestId: g.id } : { allowed: false, reason: 'noApproval' };
}

/** The agent's approved, unexpired request for this organisation, if any. */
export function activeGrant(requests: readonly SupportAccessRequest[], tenantId: string, agentId: string, now: Date): SupportAccessRequest | null {
  return requests.find(r =>
    r.tenantId === tenantId && r.agentId === agentId && r.status === 'approved'
    && !!r.expiresAt && new Date(r.expiresAt).getTime() > now.getTime()) ?? null;
}

/** Requests whose approval has run out, marked expired. Returns the ones it changed. */
export function expireRequests(requests: SupportAccessRequest[], now: Date): SupportAccessRequest[] {
  const changed: SupportAccessRequest[] = [];
  for (const r of requests) {
    if (r.status === 'approved' && r.expiresAt && new Date(r.expiresAt).getTime() <= now.getTime()) {
      r.status = 'expired';
      changed.push(r);
    }
  }
  return changed;
}

export type RequestProblem = 'ticketRequired' | 'reasonRequired' | 'policyDisabled' | 'notNeeded' | 'alreadyPending' | 'alreadyActive';

/** Why a new request can't be made, or null. */
export function requestProblem(
  input: { ticketId: string; reason: string },
  policy: SupportAccessPolicy,
  requests: readonly SupportAccessRequest[],
  tenantId: string,
  agentId: string,
  now: Date,
): RequestProblem | null {
  if (!input.ticketId.trim()) return 'ticketRequired';
  if (input.reason.trim().length < 10) return 'reasonRequired';
  if (policy === 'disabled') return 'policyDisabled';
  if (policy === 'alwaysAllowed') return 'notNeeded';
  if (activeGrant(requests, tenantId, agentId, now)) return 'alreadyActive';
  if (requests.some(r => r.tenantId === tenantId && r.agentId === agentId && r.status === 'pending')) return 'alreadyPending';
  return null;
}

export type DecisionProblem = 'notFound' | 'notPending' | 'otherOrganisation' | 'ownRequest';

/**
 * Who may approve or reject: a member of the organisation the request is
 * for, never the person who asked (a ForMedrixAI person holds every
 * capability through Superadmin, so the capability alone isn't enough).
 */
export function decisionProblem(
  request: SupportAccessRequest | undefined,
  approver: { id: string; tenantId: string | null },
): DecisionProblem | null {
  if (!request) return 'notFound';
  if (request.status !== 'pending') return 'notPending';
  if (approver.tenantId !== request.tenantId) return 'otherOrganisation';
  if (approver.id === request.agentId) return 'ownRequest';
  return null;
}

/** When an approval given at `now` ends. */
export function approvalExpiry(now: Date, minutes = DEFAULT_SUPPORT_WINDOW_MINUTES): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

// ── The hospital's support audit stream ──────────────────────────────────────

export type SupportAuditAction =
  | 'policyChanged' | 'accessRequested' | 'accessApproved' | 'accessRejected' | 'accessExpired' | 'accessEnded' | 'accessRevoked'
  | 'caseOpened' | 'casesListed' | 'searchRun' | 'caseEdited' | 'accessRefused' | 'auditExported';

export interface SupportAuditEntry {
  id: string;
  /** Position in this organisation's stream, from 1. */
  seq: number;
  tenantId: string;
  at: string;
  /** Who did it: the support agent, or the hospital person for decisions and policy changes. */
  actorId: string;
  actorName: string;
  ticketId: string | null;
  action: SupportAuditAction;
  /** Case ids disclosed or touched. Case ids, not patient identifiers. */
  caseIds: string[];
  /** Literal English, PHI-free (audit records are compliance artifacts, not UI). */
  detail: string;
  /** Recorded by the API server from the request (phase 4); the browser can't know them truthfully. */
  originIp: string | null;
  originCountry: string | null;
  prevHash: string;
  hash: string;
}

export const SUPPORT_AUDIT_GENESIS = '0'.repeat(64);

/** The exact text an entry's hash covers: every field except the hash itself, in a fixed order. */
export function supportAuditHashInput(e: Omit<SupportAuditEntry, 'hash'>): string {
  return JSON.stringify([e.id, e.seq, e.tenantId, e.at, e.actorId, e.actorName, e.ticketId, e.action, e.caseIds, e.detail, e.originIp, e.originCountry, e.prevHash]);
}

export type ChainCheck = { intact: true; entries: number } | { intact: false; brokenAt: number; entries: number };

/** Checks one organisation's stream: sequence, links and hashes. */
export async function verifySupportAuditChain(
  entries: readonly SupportAuditEntry[],
  sha256: (text: string) => Promise<string>,
): Promise<ChainCheck> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = SUPPORT_AUDIT_GENESIS;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const { hash, ...rest } = e;
    if (e.seq !== i + 1 || e.prevHash !== prev || (await sha256(supportAuditHashInput(rest))) !== hash) {
      return { intact: false, brokenAt: e.seq, entries: sorted.length };
    }
    prev = hash;
  }
  return { intact: true, entries: sorted.length };
}

export const SUPPORT_AUDIT_COLUMNS = ['timestamp', 'agent', 'originIp', 'originCountry', 'ticketId', 'action', 'caseIds', 'detail'] as const;

/** Rows for the compliance export, formula-like cells neutralised. */
export function supportAuditRows(entries: readonly SupportAuditEntry[]): Record<(typeof SUPPORT_AUDIT_COLUMNS)[number], string>[] {
  const safe = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
  return [...entries].sort((a, b) => a.seq - b.seq).map(e => ({
    timestamp: e.at,
    agent: safe(e.actorName),
    originIp: e.originIp ?? '',
    originCountry: e.originCountry ?? '',
    ticketId: safe(e.ticketId ?? ''),
    action: e.action,
    caseIds: e.caseIds.join(' '),
    detail: safe(e.detail),
  }));
}

/** Whole minutes left on an approval (0 when it has run out). */
export function minutesLeft(expiresAt: string | undefined, now: Date): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60_000));
}

/** Whether an approval is in force now (approved and time left). */
export function isLiveGrant(r: SupportAccessRequest, now: Date): boolean {
  return r.status === 'approved' && minutesLeft(r.expiresAt, now) > 0;
}

/** The hospital's two working lists: requests awaiting a decision, and approvals in force. */
export function supportRequestQueues(requests: readonly SupportAccessRequest[], now: Date): { pending: SupportAccessRequest[]; active: SupportAccessRequest[] } {
  return {
    pending: requests.filter(r => r.status === 'pending'),
    active: requests.filter(r => isLiveGrant(r, now)),
  };
}

/** How a window option is shown: whole hours where it divides, minutes otherwise. */
export function supportWindowParts(minutes: number): { unit: 'minutes' | 'hours'; count: number } {
  return minutes >= 60 && minutes % 60 === 0 ? { unit: 'hours', count: minutes / 60 } : { unit: 'minutes', count: minutes };
}
