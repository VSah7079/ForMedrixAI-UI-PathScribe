// src/services/supportAccess/supportAccessService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 372: the support access service (mock phase; the rules are in
// supportAccessRules.ts, the server contract in
// docs/architecture/AUTHORIZATION_API.md "Support access").
//
//   Hospital side (members of the organisation only)
//     getSettings / setSettings   policy and access window
//                                 (config:support-access:policy)
//     decide / revoke             approve or reject a request, end an approval
//                                 (config:support-access:approve)
//     listAudit / verifyAudit / exportAudit
//                                 the organisation's support audit stream
//                                 (config:support-audit:view)
//   Support side (Superadmin sessions)
//     requestAccess / endAccess   ask per ticket with a reason; end early
//   Enforcement
//     decisionFor                 may this agent reach this organisation now
//     record                      append to the organisation's audit stream
//
// Every change is written to the organisation's own hash-chained support
// audit stream. Approvers are told through an in-app message; email and
// webhooks are the API server's job (phase 4).
// ─────────────────────────────────────────────────────────────────────────────

import type { IAuthorizationService } from '../authorization/authorizationService';
import type { Facility } from '../facilities/IFacilityService';
import type { StaffUser } from '../users/IUserService';
import type { Role } from '../roles/IRoleService';
import { evaluateCapability } from '../authorization/evaluateCapability';
import { resolveTenantFacility } from '../auth/resolveTenantFacility';
import { toCsv } from '@/utils/csv';
import {
  SUPPORT_AUDIT_COLUMNS, SUPPORT_AUDIT_GENESIS, activeGrant, approvalExpiry, decisionProblem, expireRequests,
  normaliseSupportSettings, requestProblem, supportAccessDecision, supportAuditHashInput, supportAuditRows,
  verifySupportAuditChain,
  type ChainCheck, type DecisionProblem, type RequestProblem, type SupportAccessDecision, type SupportAccessRequest,
  type SupportAccessSettings, type SupportAuditAction, type SupportAuditEntry,
} from './supportAccessRules';

export const SUPPORT_SETTINGS_KEY = 'pathscribe_support_access_settings';
export const SUPPORT_REQUESTS_KEY = 'pathscribe_support_access_requests';
export const SUPPORT_AUDIT_KEY = 'pathscribe_support_audit';

export interface SupportSessionUser { id: string; name: string; role: string; organisationId?: string }

export interface SupportAccessDeps {
  authorization: Pick<IAuthorizationService, 'enforce' | 'evaluate'>;
  session: () => SupportSessionUser | null;
  enterpriseFacilities: () => Promise<Facility[]>;
  staff: () => Promise<StaffUser[]>;
  roles: () => Promise<Role[]>;
  notify: (msg: { recipientId: string; recipientName: string; senderId: string; senderName: string; tenantName: string; ticketId: string; reason: string }) => Promise<void>;
  store: { get<T>(key: string, fallback: T): T; set<T>(key: string, value: T): void };
  now?: () => Date;
  sha256?: (text: string) => Promise<string>;
  newId?: () => string;
  /** Starting settings per organisation, used until the organisation saves its own (demo seed data). */
  seedSettings?: Readonly<Record<string, Partial<SupportAccessSettings>>>;
}

export type Refusal<R extends string> = { ok: false; reason: R };

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function createSupportAccessService(deps: SupportAccessDeps) {
  const now = deps.now ?? (() => new Date());
  const sha = deps.sha256 ?? sha256Hex;
  const newId = deps.newId ?? (() => `sa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

  const readSettings = (): Record<string, Partial<SupportAccessSettings>> =>
    ({ ...(deps.seedSettings ?? {}), ...deps.store.get<Record<string, Partial<SupportAccessSettings>>>(SUPPORT_SETTINGS_KEY, {}) });
  const readRequests = () => {
    const list = deps.store.get<SupportAccessRequest[]>(SUPPORT_REQUESTS_KEY, []);
    return list;
  };
  const writeRequests = (list: SupportAccessRequest[]) => deps.store.set(SUPPORT_REQUESTS_KEY, list);
  const readAudit = () => deps.store.get<Record<string, SupportAuditEntry[]>>(SUPPORT_AUDIT_KEY, {});

  /** The organisation (enterprise facility) of the signed-in user, or null. */
  const sessionTenantId = async (): Promise<string | null> => {
    const s = deps.session();
    if (!s?.organisationId) return null;
    return resolveTenantFacility(s.organisationId, await deps.enterpriseFacilities())?.id ?? null;
  };

  const tenantName = async (tenantId: string) => (await deps.enterpriseFacilities()).find(f => f.id === tenantId)?.name ?? tenantId;

  /** Appends to an organisation's stream, chaining the hash to the previous entry. */
  const record = async (entry: { tenantId: string; actorId: string; actorName: string; ticketId: string | null; action: SupportAuditAction; caseIds?: string[]; detail: string }) => {
    const all = readAudit();
    const stream = all[entry.tenantId] ?? [];
    const last = stream[stream.length - 1];
    const base: Omit<SupportAuditEntry, 'hash'> = {
      id: newId(), seq: (last?.seq ?? 0) + 1, tenantId: entry.tenantId, at: now().toISOString(),
      actorId: entry.actorId, actorName: entry.actorName, ticketId: entry.ticketId, action: entry.action,
      caseIds: entry.caseIds ?? [], detail: entry.detail, originIp: null, originCountry: null,
      prevHash: last?.hash ?? SUPPORT_AUDIT_GENESIS,
    };
    const full: SupportAuditEntry = { ...base, hash: await sha(supportAuditHashInput(base)) };
    deps.store.set(SUPPORT_AUDIT_KEY, { ...all, [entry.tenantId]: [...stream, full] });
    return full;
  };

  /** Marks run-out approvals expired, recording each in its organisation's stream. */
  const expire = async () => {
    const list = readRequests();
    const changed = expireRequests(list, now());
    if (changed.length) {
      writeRequests(list);
      for (const r of changed) {
        await record({ tenantId: r.tenantId, actorId: 'system', actorName: 'PathScribe', ticketId: r.ticketId, action: 'accessExpired', detail: `Support access for ${r.agentName} (ticket ${r.ticketId}) expired.` });
      }
    }
    return list;
  };

  /** A hospital-side action: the person must hold the capability and belong to the organisation. */
  // The check is passed in with its literal key, so the capabilities guard
  // can see which capability each action enforces.
  const hospitalGate = async (tenantId: string, check: () => Promise<{ allowed: boolean }>): Promise<null | 'notPermitted' | 'otherOrganisation'> => {
    if ((await sessionTenantId()) !== tenantId) return 'otherOrganisation';
    return (await check()).allowed ? null : 'notPermitted';
  };

  return {
    record,
    sessionTenantId,

    /** Organisations support could ask to reach. */
    async organisations(): Promise<{ id: string; name: string }[]> {
      return (await deps.enterpriseFacilities()).map(f => ({ id: f.id, name: f.name }));
    },

    async getSettings(tenantId: string): Promise<SupportAccessSettings> {
      return normaliseSupportSettings(readSettings()[tenantId]);
    },

    async setSettings(tenantId: string, next: SupportAccessSettings): Promise<{ ok: true } | Refusal<'notPermitted' | 'otherOrganisation'>> {
      const gate = await hospitalGate(tenantId, () => deps.authorization.enforce('config:support-access:policy'));
      if (gate) return { ok: false, reason: gate };
      const s = deps.session()!;
      const before = normaliseSupportSettings(readSettings()[tenantId]);
      const after = normaliseSupportSettings(next);
      deps.store.set(SUPPORT_SETTINGS_KEY, { ...readSettings(), [tenantId]: after });
      if (before.policy !== after.policy || before.windowMinutes !== after.windowMinutes) {
        await record({ tenantId, actorId: s.id, actorName: s.name, ticketId: null, action: 'policyChanged', detail: `Support access policy ${before.policy} → ${after.policy}; access window ${before.windowMinutes} → ${after.windowMinutes} minutes.` });
      }
      return { ok: true };
    },

    async listRequests(filter: { tenantId?: string; agentId?: string } = {}): Promise<SupportAccessRequest[]> {
      const list = await expire();
      return list
        .filter(r => (!filter.tenantId || r.tenantId === filter.tenantId) && (!filter.agentId || r.agentId === filter.agentId))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    },

    async requestAccess(input: { tenantId: string; ticketId: string; reason: string }): Promise<{ ok: true; request: SupportAccessRequest } | Refusal<RequestProblem | 'notSupport'>> {
      const s = deps.session();
      if (!s || s.role !== 'superadmin') return { ok: false, reason: 'notSupport' };
      const list = await expire();
      const settings = normaliseSupportSettings(readSettings()[input.tenantId]);
      const problem = requestProblem(input, settings.policy, list, input.tenantId, s.id, now());
      if (problem) return { ok: false, reason: problem };
      const request: SupportAccessRequest = {
        id: newId(), tenantId: input.tenantId, agentId: s.id, agentName: s.name,
        ticketId: input.ticketId.trim(), reason: input.reason.trim(), requestedAt: now().toISOString(), status: 'pending',
      };
      writeRequests([...list, request]);
      await record({ tenantId: input.tenantId, actorId: s.id, actorName: s.name, ticketId: request.ticketId, action: 'accessRequested', detail: `Support access requested. Reason: ${request.reason}` });
      // Tell the organisation's approvers (staff there whose roles grant approval).
      const [facilities, staff, roles] = await Promise.all([deps.enterpriseFacilities(), deps.staff(), deps.roles()]);
      const name = facilities.find(f => f.id === input.tenantId)?.name ?? input.tenantId;
      for (const u of staff) {
        if (u.status !== 'Active' || u.id === s.id) continue;
        if (resolveTenantFacility(u.organisationId, facilities)?.id !== input.tenantId) continue;
        const d = evaluateCapability({ userId: u.id, userName: u.email, sessionRole: null, staffRoles: u.roles ?? [] }, 'config:support-access:approve', roles);
        if (!d.allowed) continue;
        await deps.notify({ recipientId: u.id, recipientName: [u.firstName, u.lastName].filter(Boolean).join(' '), senderId: s.id, senderName: s.name, tenantName: name, ticketId: request.ticketId, reason: request.reason }).catch(() => {});
      }
      return { ok: true, request };
    },

    async decide(requestId: string, decision: 'approve' | 'reject'): Promise<{ ok: true; request: SupportAccessRequest } | Refusal<DecisionProblem | 'notPermitted'>> {
      const s = deps.session();
      const list = await expire();
      const request = list.find(r => r.id === requestId);
      const problem = decisionProblem(request, { id: s?.id ?? '', tenantId: await sessionTenantId() });
      if (problem) return { ok: false, reason: problem };
      const d = await deps.authorization.enforce('config:support-access:approve');
      if (!d.allowed) return { ok: false, reason: 'notPermitted' };
      const r = request!;
      r.decidedById = s!.id; r.decidedByName = s!.name; r.decidedAt = now().toISOString();
      if (decision === 'approve') {
        const window = normaliseSupportSettings(readSettings()[r.tenantId]).windowMinutes;
        r.status = 'approved'; r.windowMinutes = window; r.expiresAt = approvalExpiry(now(), window);
      } else {
        r.status = 'rejected';
      }
      writeRequests(list);
      await record({
        tenantId: r.tenantId, actorId: s!.id, actorName: s!.name, ticketId: r.ticketId,
        action: decision === 'approve' ? 'accessApproved' : 'accessRejected',
        detail: decision === 'approve'
          ? `Support access for ${r.agentName} approved for ${r.windowMinutes} minutes, until ${r.expiresAt}.`
          : `Support access for ${r.agentName} rejected.`,
      });
      return { ok: true, request: r };
    },

    /** Support ends its own approval early. */
    async endAccess(requestId: string): Promise<{ ok: boolean }> {
      const s = deps.session();
      const list = await expire();
      const r = list.find(x => x.id === requestId);
      if (!r || !s || r.agentId !== s.id || r.status !== 'approved') return { ok: false };
      r.status = 'ended'; r.closedAt = now().toISOString();
      writeRequests(list);
      await record({ tenantId: r.tenantId, actorId: s.id, actorName: s.name, ticketId: r.ticketId, action: 'accessEnded', detail: 'Support ended its access.' });
      return { ok: true };
    },

    /** The hospital ends an approval early. */
    async revoke(requestId: string): Promise<{ ok: true } | Refusal<'notFound' | 'notPermitted' | 'otherOrganisation'>> {
      const list = await expire();
      const r = list.find(x => x.id === requestId && x.status === 'approved');
      if (!r) return { ok: false, reason: 'notFound' };
      const gate = await hospitalGate(r.tenantId, () => deps.authorization.enforce('config:support-access:approve'));
      if (gate) return { ok: false, reason: gate };
      const s = deps.session()!;
      r.status = 'revoked'; r.closedAt = now().toISOString();
      writeRequests(list);
      await record({ tenantId: r.tenantId, actorId: s.id, actorName: s.name, ticketId: r.ticketId, action: 'accessRevoked', detail: `Support access for ${r.agentName} revoked by the organisation.` });
      return { ok: true };
    },

    /** Whether this agent may reach this organisation now (policy and approvals). */
    async decisionFor(tenantId: string, agentId: string): Promise<SupportAccessDecision> {
      const list = await expire();
      return supportAccessDecision(normaliseSupportSettings(readSettings()[tenantId]).policy, list, tenantId, agentId, now());
    },

    /** The agent's active approval for an organisation, if any. */
    async activeFor(tenantId: string, agentId: string): Promise<SupportAccessRequest | null> {
      return activeGrant(await expire(), tenantId, agentId, now());
    },

    /** The organisation's support audit stream (newest first), for its own members with the capability. */
    async listAudit(tenantId: string): Promise<{ ok: true; entries: SupportAuditEntry[] } | Refusal<'notPermitted' | 'otherOrganisation'>> {
      if ((await sessionTenantId()) !== tenantId) return { ok: false, reason: 'otherOrganisation' };
      const d = await deps.authorization.evaluate('config:support-audit:view');
      if (!d.allowed) return { ok: false, reason: 'notPermitted' };
      await expire();
      return { ok: true, entries: [...(readAudit()[tenantId] ?? [])].reverse() };
    },

    async verifyAudit(tenantId: string): Promise<ChainCheck> {
      return verifySupportAuditChain(readAudit()[tenantId] ?? [], sha);
    },

    /** The compliance export (CSV or JSON), itself recorded in the stream. */
    async exportAudit(tenantId: string, format: 'csv' | 'json', columns?: Record<(typeof SUPPORT_AUDIT_COLUMNS)[number], string>):
      Promise<{ ok: true; content: string; filename: string; mime: string } | Refusal<'notPermitted' | 'otherOrganisation'>> {
      const gate = await hospitalGate(tenantId, () => deps.authorization.enforce('config:support-audit:view'));
      if (gate) return { ok: false, reason: gate };
      const entries = readAudit()[tenantId] ?? [];
      const chain = await verifySupportAuditChain(entries, sha);
      const s = deps.session()!;
      const stamp = now().toISOString().slice(0, 10);
      let content: string;
      if (format === 'json') {
        content = JSON.stringify({ tenantId, exportedAt: now().toISOString(), exportedBy: s.name, chain, entries }, null, 2);
      } else {
        const rows = supportAuditRows(entries).map(r => Object.fromEntries(SUPPORT_AUDIT_COLUMNS.map(c => [columns?.[c] ?? c, r[c]])));
        content = toCsv(rows, SUPPORT_AUDIT_COLUMNS.map(c => columns?.[c] ?? c));
      }
      await record({ tenantId, actorId: s.id, actorName: s.name, ticketId: null, action: 'auditExported', detail: `Support audit exported as ${format.toUpperCase()}: ${entries.length} entries; chain ${chain.intact === false ? `broken at entry ${chain.brokenAt}` : 'intact'}.` });
      return { ok: true, content, filename: `support-audit-${tenantId}-${stamp}.${format}`, mime: format === 'json' ? 'application/json' : 'text/csv' };
    },

    tenantName,
  };
}

export type ISupportAccessService = ReturnType<typeof createSupportAccessService>;
