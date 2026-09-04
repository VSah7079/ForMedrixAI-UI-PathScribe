// src/services/physicians/applyPhysicianMasterFileUpdate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Applies one PhysicianMasterFileRecord (see that file's own header for
// the full contract/architecture-boundary reasoning) — the proactive,
// bulk-roster-sync sibling to resolveProviderName.ts's reactive,
// one-physician-at-a-time resolution. Deliberately a standalone
// function here rather than a new method on IPhysicianService, same
// organizational choice resolveProviderName.ts already made for the
// same reason: this is resolution/orchestration logic sitting on top
// of the real CRUD service, not itself a CRUD operation.
//
// Real, per direct guidance: NPI-or-name matching (via
// findOrCreateByNpi/findOrCreateByStructuredName) only ever resolves
// the FIRST sync of a physician never seen before — every sync after
// that matches on sourceSystem+sourceRecordId instead, which is
// unambiguous regardless of whether the physician has an NPI. Two
// UK physicians can share a name; a periodic authoritative feed
// re-syncing an international roster on name alone risks silently
// merging two different people, or forking one person into two
// records on a spelling variance. sourceSystem/sourceRecordId doesn't
// have that problem — it's guaranteed stable and unique within the
// sending system regardless of what numbered scheme (or none) that
// physician is under.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { Physician } from './IPhysicianService';
import { mockPhysicianService, generateAutoPhysicianCode } from './mockPhysicianService';
import { mockFacilityService } from '../facilities/mockFacilityService';
import type { PhysicianMasterFileRecord } from './PhysicianMasterFileRecord';

export type PhysicianMasterFileOutcome = 'created' | 'updated' | 'deactivated' | 'reactivated';

export interface PhysicianMasterFileResult {
  physician: Physician;
  outcome: PhysicianMasterFileOutcome;
  /** Real, per direct guidance: a facilityAssigningAuthorities entry
   *  with no matching real Facility is reported here rather than used
   *  to auto-create one — a physician feed doesn't carry enough real
   *  facility data (address, roles, jurisdiction) to responsibly
   *  create a Facility record from. Never blocks the sync — the
   *  physician itself still resolves; this is a real, admin-reviewable
   *  gap, same "never block, surface for review" posture as every
   *  other resolution in this app. */
  unmatchedFacilityAssigningAuthorities?: string[];
}

const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

/** The real, primary match — sourceSystem+sourceRecordId, checked
 *  before any NPI/name resolution. See this file's own header for why
 *  this pair, not NPI or name, is the durable re-match key. */
async function findBySource(sourceSystem: string, sourceRecordId: string): Promise<Physician | undefined> {
  const res = await mockPhysicianService.getAll();
  if (!res.ok) return undefined;
  return res.data.find(p => p.sourceSystem === sourceSystem && p.sourceRecordId === sourceRecordId);
}

/** Real, read-only lookup — never auto-creates a Facility from a
 *  physician record (see PhysicianMasterFileResult's own doc comment
 *  on unmatchedFacilityAssigningAuthorities for why). */
async function resolveFacilityIds(assigningAuthorities: string[] | undefined): Promise<{ clientIds: string[]; unmatched: string[] }> {
  if (!assigningAuthorities || assigningAuthorities.length === 0) return { clientIds: [], unmatched: [] };
  const res = await mockFacilityService.getAll();
  const facilities = res.ok ? res.data : [];
  const clientIds: string[] = [];
  const unmatched: string[] = [];
  for (const aa of assigningAuthorities) {
    const match = facilities.find(f => f.assigningAuthority.toLowerCase() === aa.toLowerCase());
    if (match) clientIds.push(match.id); else unmatched.push(aa);
  }
  return { clientIds, unmatched };
}

/** Field set a Master File record can carry beyond bare name/identity —
 *  applied on every ADD/UPDATE, never on DEACTIVATE/REACTIVATE alone
 *  (a lifecycle-only event shouldn't silently overwrite demographic
 *  data the sender didn't actually re-send). Only fields the record
 *  actually set are included — never overwrites an existing value with
 *  an absent one. */
function syncableFields(record: PhysicianMasterFileRecord): Partial<Physician> {
  const fields: Partial<Physician> = {};
  if (record.namePrefix !== undefined) fields.namePrefix = record.namePrefix;
  if (record.nameSuffix !== undefined) fields.nameSuffix = record.nameSuffix;
  if (record.specialty !== undefined) fields.specialty = record.specialty;
  if (record.phone !== undefined) fields.phone = record.phone;
  if (record.fax !== undefined) fields.fax = record.fax;
  if (record.email !== undefined) fields.email = record.email;
  if (record.preferredContact !== undefined) fields.preferredContact = record.preferredContact;
  return fields;
}

export async function applyPhysicianMasterFileUpdate(record: PhysicianMasterFileRecord): Promise<ServiceResult<PhysicianMasterFileResult>> {
  if (!record.sourceSystem || !record.sourceRecordId) {
    return err('sourceSystem and sourceRecordId are both required — without them, every sync of a no-NPI physician would fall back to name-only matching indefinitely.');
  }

  const existing = await findBySource(record.sourceSystem, record.sourceRecordId);

  if (record.action === 'DEACTIVATE' || record.action === 'REACTIVATE') {
    if (!existing) {
      return err(`No physician previously synced from ${record.sourceSystem}/${record.sourceRecordId} — has this physician ever been synced before?`);
    }
    const res = record.action === 'DEACTIVATE'
      ? await mockPhysicianService.deactivate(existing.id)
      : await mockPhysicianService.update(existing.id, { status: 'Active' });
    if (res.ok === false) return err(res.error);
    return ok({ physician: res.data, outcome: record.action === 'DEACTIVATE' ? 'deactivated' : 'reactivated' });
  }

  // ADD / UPDATE
  const { clientIds: resolvedClientIds, unmatched } = await resolveFacilityIds(record.facilityAssigningAuthorities);

  if (existing) {
    // Already known via sourceSystem/sourceRecordId — a direct update,
    // no need to re-run NPI/name resolution at all.
    const mergedClientIds = Array.from(new Set([...existing.clientIds, ...resolvedClientIds]));
    const res = await mockPhysicianService.update(existing.id, { ...syncableFields(record), clientIds: mergedClientIds });
    if (res.ok === false) return err(res.error);
    return ok({ physician: res.data, outcome: 'updated', unmatchedFacilityAssigningAuthorities: unmatched.length ? unmatched : undefined });
  }

  // Never synced before under this sourceSystem/sourceRecordId. NPI
  // makes it safe to reuse findOrCreateByStructuredName's own real
  // "match an existing physician entered some other way, or create a
  // new Unverified one" logic — an NPI match is unambiguous regardless
  // of which pipeline is asking.
  //
  // Real, deliberate divergence when there's NO NPI: findOrCreateBy
  // StructuredName's own name-only fallback is fine for ITS actual use
  // case (a one-off, best-effort guess at who's named on a single
  // inbound message) but not safe to reuse here — a bulk, authoritative
  // roster sync will genuinely encounter two different real physicians
  // who share a name (confirmed directly: two seeded UK physicians in
  // this very app already do), and silently merging them onto one
  // record is a real clinical-data-integrity risk a signed pathology
  // report's attribution shouldn't ever be exposed to. With no NPI to
  // safely key on, a Master File first encounter always creates a
  // fresh physician rather than gambling on a name match — the real
  // durable identity for this person going forward is sourceSystem/
  // sourceRecordId anyway, not the name.
  const hasNpiIdentifier = record.identifiers?.some(i => i.type === 'NPI');
  let resolvedId: string;
  let wasNew: boolean;

  if (hasNpiIdentifier) {
    const beforeRes = await mockPhysicianService.getAll();
    const idsBefore = new Set(beforeRes.ok ? beforeRes.data.map(p => p.id) : []);
    const foundOrCreated = await mockPhysicianService.findOrCreateByStructuredName(
      { namePrefix: record.namePrefix, givenNames: record.givenNames, familyNames: record.familyNames, nameSuffix: record.nameSuffix, identifiers: record.identifiers },
    );
    if (foundOrCreated.ok === false) return err(foundOrCreated.error);
    resolvedId = foundOrCreated.data.id;
    wasNew = !idsBefore.has(resolvedId);
  } else {
    const created = await mockPhysicianService.add({
      namePrefix: record.namePrefix, givenNames: record.givenNames, familyNames: record.familyNames, nameSuffix: record.nameSuffix,
      firstName: record.givenNames, lastName: record.familyNames,
      physicianCode: generateAutoPhysicianCode(), npi: '',
      specialty: record.specialty ?? 'General', phone: record.phone ?? '', fax: record.fax ?? '', email: record.email ?? '',
      preferredContact: record.preferredContact ?? 'Fax', clientIds: [], status: 'Unverified',
      autoCreated: true, autoCreatedAt: new Date().toISOString().split('T')[0],
    });
    if (created.ok === false) return err(created.error);
    resolvedId = created.data.id;
    wasNew = true;
  }

  const current = await mockPhysicianService.getAll();
  const currentPhysician = current.ok ? current.data.find(p => p.id === resolvedId) : undefined;
  const mergedClientIds = Array.from(new Set([...(currentPhysician?.clientIds ?? []), ...resolvedClientIds]));
  const stamped = await mockPhysicianService.update(resolvedId, {
    ...syncableFields(record), clientIds: mergedClientIds,
    sourceSystem: record.sourceSystem, sourceRecordId: record.sourceRecordId,
  });
  if (stamped.ok === false) return err(stamped.error);

  return ok({ physician: stamped.data, outcome: wasNew ? 'created' : 'updated', unmatchedFacilityAssigningAuthorities: unmatched.length ? unmatched : undefined });
}
