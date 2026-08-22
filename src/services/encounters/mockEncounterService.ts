// src/services/encounters/mockEncounterService.ts
import type { IEncounterService, Encounter, EncounterStatus, AttendingProviderInput } from './IEncounterService';
import type { ServiceResult } from '../types';
import { mockPatientEventBus } from '../events/mockPatientEventBus';
import { resolveProviderName } from '../physicians/resolveProviderName';

const STORAGE_KEY = 'pathscribe_encounters';
const delay = (ms = 60) => new Promise(res => setTimeout(res, ms));

function loadEncounters(): Encounter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveEncounters(encounters: Encounter[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(encounters)); } catch { /* non-critical */ }
}

let idCounter = 0;
function generateEncounterId(): string {
  idCounter += 1;
  return `ENC-${Date.now().toString(36)}-${idCounter}`;
}

/** Real, backward-compatible display string, derived from PV1-7's own
 *  real, structured shape — per PS-81 (Jira). Encounter.attendingProvider
 *  itself stays a real string (confirmed directly: 4 real consumers
 *  read it as one — mockReportVersionService.ts's own permanent
 *  snapshot, AccessionPage.tsx's copy-forward into requestingProvider
 *  AND its own display, VersionHistoryModal.tsx's display), so this
 *  produces the exact same "LastName, FirstName" format the old,
 *  in-line flattening logic used to, from the now-structured input,
 *  rather than changing what those four real consumers see. */
function formatAttendingProviderDisplay(provider: AttendingProviderInput | undefined): string | undefined {
  if (!provider?.lastName) return undefined;
  return provider.firstName ? `${provider.lastName}, ${provider.firstName}` : provider.lastName;
}

export const mockEncounterService: IEncounterService = {
  async getById(encounterId: string): Promise<ServiceResult<Encounter | null>> {
    await delay();
    return { ok: true, data: loadEncounters().find(e => e.id === encounterId) ?? null };
  },

  async listForPatient(patientId: string): Promise<ServiceResult<Encounter[]>> {
    await delay();
    const results = loadEncounters()
      .filter(e => e.patientId === patientId)
      .sort((a, b) => (b.admitTime ?? b.createdAt).localeCompare(a.admitTime ?? a.createdAt));
    return { ok: true, data: results };
  },

  async getByEncounterNumber(organisationId: string, encounterNumber: string): Promise<ServiceResult<Encounter | null>> {
    await delay();
    const match = loadEncounters().find(
      e => e.organisationId === organisationId && e.encounterNumber === encounterNumber
    );
    return { ok: true, data: match ?? null };
  },

  async resolveOrCreateEncounter(input): Promise<ServiceResult<Encounter>> {
    await delay();
    const encounters = loadEncounters();

    // Real fix: never a silent duplicate for a repeat reference to the
    // same real visit - the same (organisationId, encounterNumber)
    // pair always resolves to the one, real, existing encounter.
    const existing = encounters.find(
      e => e.organisationId === input.organisationId && e.encounterNumber === input.encounterNumber
    );
    if (existing) return { ok: true, data: existing };

    // Real, per PS-81 (Jira) — resolves the ADT pipeline's own real
    // gap: attendingProvider used to just flow through as a free-text
    // string with nothing resolving it to a real, internal Physician
    // record. Never blocks encounter creation on a resolution failure
    // or an unrecognized name — same fail-open posture as every other
    // real fallback in this app; attendingProviderPhysicianId simply
    // stays undefined if resolution didn't produce a real match.
    //
    // Real, deliberate transform: PV1-7's own real ID component
    // (XCN.1) is carried through as a real, LOCAL-typed identifier —
    // ADT messages don't reliably tag XCN.13 (Identifier Type Code)
    // for an attending physician's own local system id, so it's never
    // assumed to be an NPI without real confirmation.
    const resolved = input.attendingProvider?.lastName
      ? await resolveProviderName(
          {
            familyNames: input.attendingProvider.lastName,
            givenNames: input.attendingProvider.firstName,
            identifiers: input.attendingProvider.id ? [{ value: input.attendingProvider.id, type: 'LOCAL' }] : undefined,
          },
          'attending_of_record'
        )
      : { ok: true as const, data: null };
    const attendingProviderPhysicianId = resolved.ok && resolved.data ? resolved.data.physician.id : undefined;

    const now = new Date().toISOString();
    const created: Encounter = {
      id: generateEncounterId(),
      organisationId: input.organisationId,
      patientId: input.patientId,
      encounterNumber: input.encounterNumber,
      encounterClass: input.encounterClass,
      status: input.status ?? 'Planned',
      admitTime: input.admitTime,
      facility: input.facility,
      department: input.department,
      ward: input.ward,
      room: input.room,
      bed: input.bed,
      locationId: input.locationId,
      attendingProvider: formatAttendingProviderDisplay(input.attendingProvider),
      attendingProviderPhysicianId,
      diagnoses: input.diagnoses,
      sourceAccession: input.sourceAccession,
      createdAt: now,
      updatedAt: now,
      lastEventAt: input.eventTimestamp,
    };
    saveEncounters([...encounters, created]);
    mockPatientEventBus.publish({ type: 'Encounter.Created', encounter: created });
    return { ok: true, data: created };
  },

  async updateStatus(
    encounterId: string,
    status: EncounterStatus,
    eventTimestamp: string,
    dischargeTime?: string,
    dischargeDisposition?: string
  ): Promise<ServiceResult<{ encounter: Encounter; applied: boolean }>> {
    await delay();
    const encounters = loadEncounters();
    const idx = encounters.findIndex(e => e.id === encounterId);
    if (idx === -1) return { ok: false, error: `Encounter ${encounterId} not found` };

    const current = encounters[idx];

    // Real, critical sequence-control check - same real reasoning as
    // mockPatientIndexService.updateDemographics: a genuinely stale
    // event (older than, or a re-delivery of, the one already
    // applied) is honestly rejected, never silently applied over
    // newer state.
    if (current.lastEventAt && eventTimestamp <= current.lastEventAt) {
      return { ok: true, data: { encounter: current, applied: false } };
    }

    const updated: Encounter = {
      ...current,
      status,
      dischargeTime: dischargeTime ?? current.dischargeTime,
      dischargeDisposition: dischargeDisposition ?? current.dischargeDisposition,
      lastEventAt: eventTimestamp,
      updatedAt: new Date().toISOString(),
    };
    encounters[idx] = updated;
    saveEncounters(encounters);
    mockPatientEventBus.publish({ type: 'Encounter.StatusChanged', encounter: updated, previousStatus: current.status });
    return { ok: true, data: { encounter: updated, applied: true } };
  },

  // Real feature, per direct confirmation: working through the full
  // list of ADT trigger events — A02 (Transfer), A09/A10 (Patient
  // Tracking). Same real sequence-control discipline as updateStatus.
  // Automatically captures the current locationId as
  // previousLocationId before applying the new one — see
  // Encounter.previousLocationId's own doc comment.
  async updateLocation(encounterId, locationId, eventTimestamp) {
    await delay();
    const encounters = loadEncounters();
    const idx = encounters.findIndex(e => e.id === encounterId);
    if (idx === -1) return { ok: false, error: `Encounter ${encounterId} not found` };

    const current = encounters[idx];
    if (current.lastEventAt && eventTimestamp <= current.lastEventAt) {
      return { ok: true, data: { encounter: current, applied: false } };
    }

    const updated: Encounter = {
      ...current,
      previousLocationId: current.locationId,
      locationId,
      lastEventAt: eventTimestamp,
      updatedAt: new Date().toISOString(),
    };
    encounters[idx] = updated;
    saveEncounters(encounters);
    return { ok: true, data: { encounter: updated, applied: true } };
  },

  // Real feature, per direct confirmation — A06/A07 (patient class
  // change). Same real sequence-control discipline as updateStatus.
  async updateClass(encounterId, encounterClass, eventTimestamp) {
    await delay();
    const encounters = loadEncounters();
    const idx = encounters.findIndex(e => e.id === encounterId);
    if (idx === -1) return { ok: false, error: `Encounter ${encounterId} not found` };

    const current = encounters[idx];
    if (current.lastEventAt && eventTimestamp <= current.lastEventAt) {
      return { ok: true, data: { encounter: current, applied: false } };
    }

    const updated: Encounter = {
      ...current,
      encounterClass,
      lastEventAt: eventTimestamp,
      updatedAt: new Date().toISOString(),
    };
    encounters[idx] = updated;
    saveEncounters(encounters);
    return { ok: true, data: { encounter: updated, applied: true } };
  },

  // Real feature, per direct confirmation — A08's real, previously-
  // missing metadata effect (PV1-7/10/14/20). Only the fields
  // genuinely present in `changes` are applied; an A08 carrying only
  // a new attending shouldn't blank out an existing hospital service.
  async updateMetadata(encounterId, changes, eventTimestamp) {
    await delay();
    const encounters = loadEncounters();
    const idx = encounters.findIndex(e => e.id === encounterId);
    if (idx === -1) return { ok: false, error: `Encounter ${encounterId} not found` };

    const current = encounters[idx];
    if (current.lastEventAt && eventTimestamp <= current.lastEventAt) {
      return { ok: true, data: { encounter: current, applied: false } };
    }

    // Real, per PS-81 (Jira) — same real resolution as
    // resolveOrCreateEncounter above, but for the real A08 (update)
    // path specifically: an A08 changing the attending physician on an
    // already-open visit previously updated the free-text string with
    // nothing re-resolving attendingProviderPhysicianId — a real,
    // separate gap from the create-path one, now closed the same way.
    // Only re-resolves when this update actually carries a real
    // attendingProvider change — matches this method's own "only
    // fields genuinely present in the update are changed" contract.
    let attendingProviderPhysicianId = current.attendingProviderPhysicianId;
    if (changes.attendingProvider?.lastName) {
      const resolved = await resolveProviderName(
        {
          familyNames: changes.attendingProvider.lastName,
          givenNames: changes.attendingProvider.firstName,
          identifiers: changes.attendingProvider.id ? [{ value: changes.attendingProvider.id, type: 'LOCAL' }] : undefined,
        },
        'attending_of_record'
      );
      if (resolved.ok && resolved.data) attendingProviderPhysicianId = resolved.data.physician.id;
    }

    const updated: Encounter = {
      ...current,
      attendingProvider: changes.attendingProvider ? formatAttendingProviderDisplay(changes.attendingProvider) : current.attendingProvider,
      attendingProviderPhysicianId,
      hospitalService: changes.hospitalService ?? current.hospitalService,
      admitSource: changes.admitSource ?? current.admitSource,
      financialClass: changes.financialClass ?? current.financialClass,
      lastEventAt: eventTimestamp,
      updatedAt: new Date().toISOString(),
    };
    encounters[idx] = updated;
    saveEncounters(encounters);
    return { ok: true, data: { encounter: updated, applied: true } };
  },

  // Real feature, per direct, detailed correction: DG1 legitimately
  // rides with A08 too — an updated/corrected diagnosis on an
  // already-open visit. Same sequence-control discipline as every
  // other update method here, with one real, deliberate difference:
  // strict `<` (not `<=`). A single real A08 can carry both PV1
  // metadata AND a DG1 — processAdtMessage.ts calls updateMetadata
  // first, which already advances lastEventAt to this exact message's
  // own timestamp; a `<=` comparison here would then honestly, but
  // wrongly, reject this method's own application of the SAME
  // message's diagnosis data as "stale," since it'd equal (not
  // exceed) what updateMetadata just set. `<` still correctly rejects
  // a genuinely OLDER, separate message (see this method's own test
  // for that case) — it only stops rejecting a second, real effect of
  // the identical message that produced the current lastEventAt.
  // Replaces the full diagnoses list rather than merging — see this
  // method's own interface doc comment for why.
  async updateDiagnoses(encounterId, diagnoses, eventTimestamp) {
    await delay();
    const encounters = loadEncounters();
    const idx = encounters.findIndex(e => e.id === encounterId);
    if (idx === -1) return { ok: false, error: `Encounter ${encounterId} not found` };

    const current = encounters[idx];
    if (current.lastEventAt && eventTimestamp < current.lastEventAt) {
      return { ok: true, data: { encounter: current, applied: false } };
    }

    const updated: Encounter = {
      ...current,
      diagnoses,
      lastEventAt: eventTimestamp,
      updatedAt: new Date().toISOString(),
    };
    encounters[idx] = updated;
    saveEncounters(encounters);
    return { ok: true, data: { encounter: updated, applied: true } };
  },

  // Real feature, per direct confirmation — A12 (Cancel Transfer):
  // restores locationId from the real, captured previousLocationId.
  // Genuinely a no-op (applied: false, not an error) when there's
  // nothing to restore — never transferred, or already restored once.
  async cancelTransfer(encounterId, eventTimestamp) {
    await delay();
    const encounters = loadEncounters();
    const idx = encounters.findIndex(e => e.id === encounterId);
    if (idx === -1) return { ok: false, error: `Encounter ${encounterId} not found` };

    const current = encounters[idx];
    if (!current.previousLocationId) {
      return { ok: true, data: { encounter: current, applied: false } };
    }
    if (current.lastEventAt && eventTimestamp <= current.lastEventAt) {
      return { ok: true, data: { encounter: current, applied: false } };
    }

    const updated: Encounter = {
      ...current,
      locationId: current.previousLocationId,
      previousLocationId: undefined,
      lastEventAt: eventTimestamp,
      updatedAt: new Date().toISOString(),
    };
    encounters[idx] = updated;
    saveEncounters(encounters);
    return { ok: true, data: { encounter: updated, applied: true } };
  },
};
