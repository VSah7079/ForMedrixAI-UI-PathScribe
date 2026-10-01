// src/services/supportAccess/supportAccessGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 372: where the support access policy is enforced on case data
// (CaseRouter calls these). "Support access" is a Superadmin session reaching
// an organisation the person isn't a member of; for anyone else these pass
// everything through untouched.
//
//   gateCaseOpen   opening or editing one case: refused unless the
//                  organisation's policy and approvals allow it; the open (or
//                  the refusal) is written to that organisation's stream
//   gateCaseList   lists and search results: cases from organisations
//                  support can't reach are left out; what is shown is
//                  written to each organisation's stream, with the case ids
//                  (list views and search results disclose data too)
//   recordSearch   the fields a support search used (never the values,
//                  which can be patient names)
// ─────────────────────────────────────────────────────────────────────────────

import type { Facility } from '../facilities/IFacilityService';
import { isCrossTenantSupportAccess, type SessionUser } from '../auth/caseAccessControl';
import { resolveTenantFacility } from '../auth/resolveTenantFacility';
import type { ISupportAccessService } from './supportAccessService';

type CaseLike = { id: string; originHospitalId?: string | null };
type Agent = SessionUser & { name?: string };

const agentName = (s: Agent) => s.name ?? ([s.firstName, s.lastName].filter(Boolean).join(' ') || s.id);

export async function gateCaseOpen(
  session: Agent | null,
  caseRecord: CaseLike,
  facilities: Facility[],
  action: 'open' | 'edit',
  support: Pick<ISupportAccessService, 'decisionFor' | 'record'>,
): Promise<{ allowed: boolean; ticketId: string | null }> {
  if (!session || !isCrossTenantSupportAccess(session, caseRecord, facilities)) return { allowed: true, ticketId: null };
  const tenantId = resolveTenantFacility(caseRecord.originHospitalId, facilities)?.id;
  // A case no organisation can be resolved for has no policy to apply and
  // no stream to record in. It stays under the Batch 371 check (the
  // audited platform:cross-tenant-cases:view in CaseRouter). The fix for
  // such a case is mapping its hospital id to its organisation.
  if (!tenantId) return { allowed: true, ticketId: null };
  const d = await support.decisionFor(tenantId, session.id);
  if (d.allowed === false) {
    await support.record({ tenantId, actorId: session.id, actorName: agentName(session), ticketId: null, action: 'accessRefused', caseIds: [caseRecord.id],
      detail: `Support ${action === 'edit' ? 'edit' : 'open'} refused: ${d.reason === 'policyDisabled' ? 'support access is disabled' : 'no approved support access'}.` });
    return { allowed: false, ticketId: null };
  }
  await support.record({ tenantId, actorId: session.id, actorName: agentName(session), ticketId: d.ticketId, action: action === 'edit' ? 'caseEdited' : 'caseOpened', caseIds: [caseRecord.id],
    detail: action === 'edit' ? 'Support saved a change to a case.' : 'Support opened a case.' });
  return { allowed: true, ticketId: d.ticketId };
}

export async function gateCaseList<T extends CaseLike>(
  session: Agent | null,
  cases: T[],
  facilities: Facility[],
  support: Pick<ISupportAccessService, 'decisionFor' | 'record'>,
): Promise<T[]> {
  if (!session || session.role !== 'superadmin') return cases;
  const byTenant = new Map<string, T[]>();
  const out: T[] = [];
  for (const c of cases) {
    if (!isCrossTenantSupportAccess(session, c, facilities)) { out.push(c); continue; }
    const tenantId = resolveTenantFacility(c.originHospitalId, facilities)?.id;
    if (!tenantId) { out.push(c); continue; } // no organisation to apply a policy for; see gateCaseOpen
    byTenant.set(tenantId, [...(byTenant.get(tenantId) ?? []), c]);
  }
  for (const [tenantId, list] of byTenant) {
    const d = await support.decisionFor(tenantId, session.id);
    if (!d.allowed) continue;
    out.push(...list);
    await support.record({ tenantId, actorId: session.id, actorName: agentName(session), ticketId: d.ticketId, action: 'casesListed', caseIds: list.map(c => c.id),
      detail: `Support loaded ${list.length} of this organisation's case(s) for a list, search or report.` });
  }
  return out;
}

export async function recordSearch(
  session: Agent | null,
  fieldsUsed: string[],
  facilities: Facility[],
  support: Pick<ISupportAccessService, 'decisionFor' | 'record'>,
): Promise<void> {
  if (!session || session.role !== 'superadmin') return;
  const own = session.organisationId ? resolveTenantFacility(session.organisationId, facilities)?.id : undefined;
  for (const f of facilities) {
    if (f.id === own) continue;
    const d = await support.decisionFor(f.id, session.id);
    if (!d.allowed) continue;
    await support.record({ tenantId: f.id, actorId: session.id, actorName: agentName(session), ticketId: d.ticketId, action: 'searchRun',
      detail: `Support ran a case search using: ${fieldsUsed.length ? fieldsUsed.join(', ') : 'no filters'}.` });
  }
}
