// src/services/patients/mockPatientIndexService.ts
import type {
  IPatientIndexService,
  MasterPatientRecord,
  PatientMatchCandidate,
  PatientMatchResult,
  PatientLink,
  PatientIdentifier,
} from './IPatientIndexService';
import { caseRouter } from '../cases/CaseRouter';
import { ConcurrencyConflictError } from '../cases/ConcurrencyConflictError';
import { mockAuditService } from '../auditlog/mockAuditService';
import { getSessionUser } from '../auth/caseAccessControl';
import { mockPatientEventBus } from '../events/mockPatientEventBus';
import { BREAK_GLASS_MIN_NOTE_LENGTH } from '../../types/patients/BreakGlassReasonCode';

const STORAGE_KEY = 'pathscribe_mpi_records';
const LINKS_STORAGE_KEY = 'pathscribe_mpi_links';
const IDENTIFIERS_STORAGE_KEY = 'pathscribe_mpi_identifiers';
const delay = (ms = 60) => new Promise(res => setTimeout(res, ms));

function loadRecords(): MasterPatientRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecords(records: MasterPatientRecord[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* non-critical */ }
}

function loadLinks(): PatientLink[] {
  try {
    const raw = localStorage.getItem(LINKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLinks(links: PatientLink[]): void {
  try { localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links)); } catch { /* non-critical */ }
}

function loadIdentifiers(): PatientIdentifier[] {
  try {
    const raw = localStorage.getItem(IDENTIFIERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveIdentifiers(identifiers: PatientIdentifier[]): void {
  try { localStorage.setItem(IDENTIFIERS_STORAGE_KEY, JSON.stringify(identifiers)); } catch { /* non-critical */ }
}

function normaliseName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesMatch(a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }): boolean {
  return normaliseName(a.firstName) === normaliseName(b.firstName)
    && normaliseName(a.lastName) === normaliseName(b.lastName);
}

let idCounter = 0;
function generatePatientId(): string {
  idCounter += 1;
  return `MPI-${Date.now().toString(36)}-${idCounter}`;
}

/** Real, independent bug fix: mergedInto was set by mergeIntoExistingPatient
 *  but never actually consulted by the matching logic itself - a future
 *  order arriving under a MRN that had been merged away would still
 *  match the old, deprecated record (kept, not deleted, for audit
 *  reasons) as if it were a normal, active identity, silently undoing
 *  the merge for that new case. Follows the real chain to whatever the
 *  record was actually, currently merged into - recursively, in case
 *  of more than one merge in sequence - rather than stopping at the
 *  first hop. */
function resolveToCanonicalRecord(records: MasterPatientRecord[], record: MasterPatientRecord): MasterPatientRecord {
  let current = record;
  const seen = new Set<string>(); // real guard against a corrupted, circular mergedInto chain
  while (current.mergedInto && !seen.has(current.id)) {
    seen.add(current.id);
    const next = records.find(r => r.id === current.mergedInto);
    if (!next) break; // target genuinely doesn't exist - stay on the last real record found
    current = next;
  }
  return current;
}

/** Real, shared core - extracted so createProvisional (below) can
 *  record a provisional record's own primary identifier too, not just
 *  the public addIdentifier() method. Real fix, per direct follow-up:
 *  a provisional/ambiguous record still gets a real, usable patientId
 *  immediately - it should still benefit from precise crosswalk
 *  matching on its next order while it's awaiting review, not just
 *  after a human resolves it. */
function recordIdentifierInternal(
  patientId: string,
  assigningAuthority: string,
  identifierValue: string,
  source: 'resolution' | 'manual'
): PatientIdentifier {
  const identifiers = loadIdentifiers();
  const existing = identifiers.find(
    i => i.assigningAuthority === assigningAuthority && i.identifierValue === identifierValue && i.patientId === patientId
  );
  if (existing) return existing;

  const record: PatientIdentifier = {
    id: `PID-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    patientId,
    assigningAuthority,
    identifierValue,
    source,
    recordedAt: new Date().toISOString(),
  };
  saveIdentifiers([...identifiers, record]);
  return record;
}

export const mockPatientIndexService: IPatientIndexService = {
  async resolveOrCreatePatient(candidate: PatientMatchCandidate): Promise<PatientMatchResult> {
    await delay();
    const records = loadRecords();

    // Scoped strictly to this organisation — see the interface's own
    // doc comment on why this is MPI, not EMPI. A record belonging to a
    // different organisationId is never a valid match, full stop,
    // regardless of how well anything else lines up.
    const inOrg = records.filter(r => r.organisationId === candidate.organisationId);

    // Real fix: when the caller knows WHICH system issued this MRN,
    // check the precise crosswalk first - this is the actual fix for
    // the collision risk the enterprise-wide scoping introduced (two
    // different real people at two different hospitals whose own MRN
    // schemes happen to produce the same string). A real, exact
    // (assigningAuthority, mrn) match here is more reliable than any
    // bare-MRN check below, since it already accounts for the source.
    if (candidate.assigningAuthority) {
      const knownPatientId = await this.resolveByIdentifier(candidate.assigningAuthority, candidate.mrn);
      if (knownPatientId) {
        const known = records.find(r => r.id === knownPatientId);
        if (known) {
          const canonical = resolveToCanonicalRecord(records, known);
          // Real, critical fix: an exact crosswalk hit alone is not
          // sufficient - the same real Joint Commission two-identifier
          // requirement the bare-MRN path already enforces below must
          // also apply here. A source system sending the same real
          // (authority, mrn) pair for what now looks like a genuinely
          // different real person (name/DOB disagree) is exactly the
          // kind of real data-quality problem this whole system exists
          // to catch, not silently trust.
          if (canonical.dateOfBirth === candidate.dateOfBirth && namesMatch(canonical, candidate)) {
            mockPatientEventBus.publish({ type: 'Patient.Matched', patient: canonical });
            return { outcome: 'matched', patientId: canonical.id };
          }
          return createProvisional(records, candidate, [canonical.id],
            `Assigning authority ${candidate.assigningAuthority} and MRN ${candidate.mrn} match an existing record, but ${canonical.dateOfBirth !== candidate.dateOfBirth ? 'date of birth' : 'name'} does not.`);
        }
      }
    }

    // Real fix: resolve every matched record to its real, current
    // canonical target before using it - see resolveToCanonicalRecord's
    // own doc comment for why.
    const mrnMatches = inOrg.filter(r => r.mrn === candidate.mrn).map(r => resolveToCanonicalRecord(records, r));

    if (mrnMatches.length === 1) {
      const r = mrnMatches[0];
      const dobMatches = r.dateOfBirth === candidate.dateOfBirth;
      const nameMatch = namesMatch(r, candidate);
      if (dobMatches && nameMatch) {
        // Real two-identifier confirmation (MRN + DOB, plus name lining
        // up too) — confidently the same person, reuse their real,
        // persistent id.
        if (candidate.assigningAuthority) {
          await this.addIdentifier(r.id, candidate.assigningAuthority, candidate.mrn, 'resolution');
        }
        mockPatientEventBus.publish({ type: 'Patient.Matched', patient: r });
        return { outcome: 'matched', patientId: r.id };
      }
      // MRN matches but the second identifier doesn't — exactly the
      // scenario the Joint Commission's two-identifier requirement
      // exists to catch: a typo'd or reused MRN pointing at the wrong
      // person's history. Never silently merge, never silently treat
      // as a new unrelated person either — create a real, flagged
      // provisional record instead.
      return createProvisional(records, candidate, [r.id],
        `MRN ${candidate.mrn} matches an existing record, but ${!dobMatches ? 'date of birth' : 'name'} does not.`);
    }

    if (mrnMatches.length > 1) {
      // Data-quality reality, not a hypothetical: the same MRN string
      // legitimately ends up on more than one record over time (re-used
      // numbers, merges gone wrong upstream in the LIS, etc.). Never
      // guess which one — flag with every candidate for a real review.
      return createProvisional(records, candidate, mrnMatches.map(r => r.id),
        `${mrnMatches.length} existing records share MRN ${candidate.mrn} — cannot determine which, if any, is this patient.`);
    }

    // No MRN match at all. Before assuming this is a genuinely new
    // person, check for a name+DOB match under a DIFFERENT MRN — a
    // real, common scenario (MRN re-issued, corrected, or the patient
    // registered under a different number at this same organisation).
    // Silently creating a second identity here would be exactly the
    // kind of duplicate a real MPI exists to prevent.
    const nameDobMatches = inOrg
      .filter(r => r.dateOfBirth === candidate.dateOfBirth && namesMatch(r, candidate))
      .map(r => resolveToCanonicalRecord(records, r));
    if (nameDobMatches.length > 0) {
      return createProvisional(records, candidate, nameDobMatches.map(r => r.id),
        `Name and date of birth match ${nameDobMatches.length} existing record(s) under a different MRN (${nameDobMatches.map(r => r.mrn).join(', ')}).`);
    }

    // Confidently nothing existing matches — a real new person in this
    // organisation's index.
    const now = new Date().toISOString();
    const created: MasterPatientRecord = {
      id: generatePatientId(),
      organisationId: candidate.organisationId,
      mrn: candidate.mrn,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      dateOfBirth: candidate.dateOfBirth,
      createdAt: now,
      updatedAt: now,
      establishedVia: 'created',
      sourceAccession: candidate.sourceAccession,
      isDowntimeRecord: candidate.isDowntimeRecord,
      downtimeReasonCode: candidate.downtimeReasonCode,
    };
    saveRecords([...records, created]);
    if (candidate.assigningAuthority) {
      await this.addIdentifier(created.id, candidate.assigningAuthority, candidate.mrn, 'resolution');
    }
    mockPatientEventBus.publish({ type: 'Patient.Created', patient: created });
    return { outcome: 'created', patientId: created.id };
  },

  async getById(patientId: string): Promise<MasterPatientRecord | null> {
    await delay();
    return loadRecords().find(r => r.id === patientId) ?? null;
  },

  async listPendingReview(organisationId: string): Promise<MasterPatientRecord[]> {
    await delay();
    return loadRecords().filter(r => r.organisationId === organisationId && r.needsReview === true);
  },

  async listDowntimeRecords(organisationId: string): Promise<MasterPatientRecord[]> {
    await delay();
    return loadRecords().filter(r => r.organisationId === organisationId && r.isDowntimeRecord === true && !r.mergedInto);
  },

  async searchPatients(organisationId: string, query: string): Promise<MasterPatientRecord[]> {
    await delay();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return loadRecords().filter(r =>
      r.organisationId === organisationId &&
      !r.mergedInto &&
      (r.mrn.toLowerCase().includes(q) || r.firstName.toLowerCase().includes(q) || r.lastName.toLowerCase().includes(q))
    );
  },

  async confirmAsNewPatient(patientId: string): Promise<void> {
    await delay();
    const records = loadRecords();
    const idx = records.findIndex(r => r.id === patientId);
    if (idx === -1) return;
    const priorCandidateCount = records[idx].reviewCandidateIds?.length ?? 0;
    records[idx] = { ...records[idx], needsReview: false, reviewReason: undefined, reviewCandidateIds: undefined, updatedAt: new Date().toISOString() };
    saveRecords(records);
    const session = getSessionUser();
    mockAuditService.logEvent({
      type: 'system',
      event: 'mpi.match.confirmed_new',
      detail: `Provisional patient record ${patientId} confirmed as a genuinely new patient by a real reviewer, dismissing ${priorCandidateCount} candidate match(es).`,
      user: session?.id ?? 'unknown',
      caseId: records[idx].sourceAccession ?? null,
      confidence: null,
    }).catch(() => {});
  },

  async flagForReview(patientId: string, reason: string): Promise<void> {
    await delay();
    const records = loadRecords();
    const idx = records.findIndex(r => r.id === patientId);
    if (idx === -1) return;
    records[idx] = { ...records[idx], needsReview: true, reviewReason: reason, updatedAt: new Date().toISOString() };
    saveRecords(records);
    const session = getSessionUser();
    mockAuditService.logEvent({
      type: 'system',
      event: 'mpi.match.flagged_for_review',
      detail: `Patient record ${patientId} flagged for review: ${reason}`,
      user: session?.id ?? 'system-adt',
      caseId: records[idx].sourceAccession ?? null,
      confidence: null,
    }).catch(() => {});
  },

  async mergeIntoExistingPatient(provisionalPatientId: string, confirmedPatientId: string): Promise<{ casesRepointed: number; caseIds: string[] }> {
    await delay();
    const records = loadRecords();
    const provIdx = records.findIndex(r => r.id === provisionalPatientId);
    if (provIdx === -1) throw new Error(`Cannot merge — provisional patient ${provisionalPatientId} not found`);
    const target = records.find(r => r.id === confirmedPatientId);
    if (!target) throw new Error(`Cannot merge — target patient ${confirmedPatientId} not found`);

    // The real, load-bearing part of a merge: every case already
    // created under the provisional identity needs to actually point at
    // the confirmed one, or the merge is cosmetic — the patient's own
    // history would still be split across two ids in every case view,
    // exactly the problem this whole service exists to prevent.
    const allCases = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true } as any);
    const toRepoint = allCases.ok ? (allCases.data as any[]).filter(c => c?.patient?.id === provisionalPatientId) : [];

    let casesRepointed = 0;
    const repointedCaseIds: string[] = [];
    for (const c of toRepoint) {
      const patch = { patient: { ...c.patient, id: confirmedPatientId } };
      try {
        await caseRouter.updateCase(c.id, patch as any, c.version);
        casesRepointed++;
        repointedCaseIds.push(c.id);
      } catch (e) {
        if (e instanceof ConcurrencyConflictError) {
          // Someone else saved this exact case between the fetch above
          // and this write — genuinely rare for a rarely-touched merge
          // operation, but real. Retry once against the fresh version
          // rather than silently skip this case out of the merge.
          try {
            await caseRouter.updateCase(c.id, patch as any, e.actualVersion);
            casesRepointed++;
            repointedCaseIds.push(c.id);
          } catch {
            // Still failed — leave this one case unrepointed rather than
            // fail the whole merge; surfaced via the return count so the
            // caller can see the merge was partial, not silently assume
            // completeness.
          }
        }
      }
    }

    records[provIdx] = {
      ...records[provIdx],
      needsReview: false,
      mergedInto: confirmedPatientId,
      mergedAt: new Date().toISOString(),
    };
    saveRecords(records);
    const session = getSessionUser();
    mockAuditService.logEvent({
      type: 'system',
      event: 'mpi.match.merged',
      detail: `Provisional patient record ${provisionalPatientId} merged into confirmed record ${confirmedPatientId} by a real reviewer — ${casesRepointed} case(s) repointed.`,
      user: session?.id ?? 'unknown',
      caseId: records[provIdx].sourceAccession ?? null,
      confidence: null,
    }).catch(() => {});
    mockPatientEventBus.publish({ type: 'Patient.Merged', sourcePatientId: provisionalPatientId, targetPatient: target, casesRepointed });
    return { casesRepointed, caseIds: repointedCaseIds };
  },

  async breakGlassRebind(input: {
    downtimePatientId: string;
    confirmedPatientId: string;
    reasonCode: string;
    notes: string;
    performedBy: string;
  }): Promise<{ rebound: boolean; reason?: string; casesRepointed?: number; caseIds?: string[] }> {
    await delay();

    // Real, load-bearing validation, per direct confirmation: a
    // mandatory reason code alone, without a real free-text
    // justification, is not a real justification. Enforced here, at
    // the service layer, not only in the UI — a real API/service
    // caller must satisfy the same rule a human operator does.
    if (!input.reasonCode) {
      return { rebound: false, reason: 'A reason code is required for a Break-Glass rebind.' };
    }
    if (!input.notes || input.notes.trim().length < BREAK_GLASS_MIN_NOTE_LENGTH) {
      return { rebound: false, reason: `A free-text justification of at least ${BREAK_GLASS_MIN_NOTE_LENGTH} characters is required for a Break-Glass rebind.` };
    }

    const records = loadRecords();
    const downtimeRecord = records.find(r => r.id === input.downtimePatientId);
    if (!downtimeRecord) {
      return { rebound: false, reason: `Downtime patient record ${input.downtimePatientId} not found.` };
    }
    // Real, load-bearing restriction: this is what makes the tool
    // genuinely "restricted," not a second, parallel way to run an
    // ordinary merge — only a record explicitly, deliberately flagged
    // as a real downtime placeholder can ever be rebound this way.
    if (!downtimeRecord.isDowntimeRecord) {
      return { rebound: false, reason: `Patient record ${input.downtimePatientId} is not flagged as a downtime/placeholder identity — Break-Glass rebind only applies to genuine downtime records.` };
    }
    const confirmedRecord = records.find(r => r.id === input.confirmedPatientId);
    if (!confirmedRecord) {
      return { rebound: false, reason: `Confirmed patient record ${input.confirmedPatientId} not found.` };
    }

    let mergeResult: { casesRepointed: number; caseIds: string[] };
    try {
      mergeResult = await this.mergeIntoExistingPatient(input.downtimePatientId, input.confirmedPatientId);
    } catch (e) {
      return { rebound: false, reason: e instanceof Error ? e.message : 'Break-Glass rebind failed for an unknown reason.' };
    }

    // Real, standard "Immutable Audit Payload," per direct
    // confirmation: {Original MRN, New MRN, Case ID(s), User ID,
    // Timestamp, Reason Code, Notes} — captured together in one real
    // audit entry, not reconstructed after the fact from separate,
    // unrelated ones. A dedicated event type ('mpi.breakglass.rebind')
    // keeps this clearly distinguishable from an ordinary
    // 'mpi.match.merged' in the real audit trail — a break-glass
    // action is a genuinely different, rarer category of event that a
    // real compliance review needs to be able to find on its own.
    const timestamp = new Date().toISOString();
    mockAuditService.logEvent({
      type: 'system',
      event: 'mpi.breakglass.rebind',
      detail: `BREAK-GLASS REBIND — Original MRN: ${downtimeRecord.mrn} (patient ${input.downtimePatientId}) → New MRN: ${confirmedRecord.mrn} (patient ${input.confirmedPatientId}). Case(s): ${mergeResult.caseIds.join(', ') || 'none'}. User: ${input.performedBy}. Timestamp: ${timestamp}. Reason: ${input.reasonCode}. Notes: ${input.notes}`,
      user: input.performedBy,
      caseId: mergeResult.caseIds[0] ?? null,
      confidence: null,
    }).catch(() => {});

    return { rebound: true, casesRepointed: mergeResult.casesRepointed, caseIds: mergeResult.caseIds };
  },

  async moveCaseToPatient(
    caseId: string,
    sourcePatientId: string,
    targetPatientId: string,
    eventTimestamp: string
  ): Promise<{ moved: boolean; reason?: string }> {
    await delay();
    const records = loadRecords();
    const source = records.find(r => r.id === sourcePatientId);
    const target = records.find(r => r.id === targetPatientId);
    if (!source) return { moved: false, reason: `Source patient ${sourcePatientId} not found` };
    if (!target) return { moved: false, reason: `Target patient ${targetPatientId} not found` };

    const allCases = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true } as any);
    const theCase = allCases.ok ? (allCases.data as any[]).find(c => c?.id === caseId) : undefined;
    if (!theCase) return { moved: false, reason: `Case ${caseId} not found` };

    // Real, load-bearing safety check: never blindly repoint a case
    // that doesn't actually belong to the claimed source — this also
    // naturally guards against double-moving an already-moved case
    // (its patient.id would no longer match sourcePatientId).
    if (theCase.patient?.id !== sourcePatientId) {
      return { moved: false, reason: `Case ${caseId} does not currently belong to patient ${sourcePatientId} — real, current owner is ${theCase.patient?.id ?? 'unknown'}` };
    }

    const patch = { patient: { ...theCase.patient, id: targetPatientId } };
    try {
      await caseRouter.updateCase(caseId, patch as any, theCase.version);
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        try {
          await caseRouter.updateCase(caseId, patch as any, e.actualVersion);
        } catch {
          return { moved: false, reason: `Case ${caseId} could not be updated — a real, concurrent write conflicted twice` };
        }
      } else {
        return { moved: false, reason: `Case ${caseId} could not be updated` };
      }
    }

    // Real, standard CAP/CLIA traceability requirement, per direct
    // confirmation: moving a diagnostic report across patient charts
    // needs clear, real audit traceability — source patient id, target
    // patient id, and the specific case id, all recorded together.
    const session = getSessionUser();
    mockAuditService.logEvent({
      type: 'system',
      event: 'mpi.case.moved',
      detail: `Case ${caseId} moved from patient ${sourcePatientId} to patient ${targetPatientId} (real ADT^A43, source event ${eventTimestamp}) — neither identity was merged or retired; both remain independently active.`,
      user: session?.id ?? 'system-adt',
      caseId: theCase.accessionNumber ?? theCase.id ?? null,
      confidence: null,
    }).catch(() => {});
    mockPatientEventBus.publish({ type: 'Patient.CaseMoved', caseId, sourcePatientId, targetPatientId });
    return { moved: true };
  },

  async linkPatients(patientIdA: string, patientIdB: string, linkedBy: string, reason?: string): Promise<PatientLink> {
    await delay();
    const records = loadRecords();
    const a = records.find(r => r.id === patientIdA);
    const b = records.find(r => r.id === patientIdB);
    if (!a) throw new Error(`Cannot link — patient ${patientIdA} not found`);
    if (!b) throw new Error(`Cannot link — patient ${patientIdB} not found`);

    // Real fix, distinct from merge: clears the review flag on whichever
    // side was provisional, same as the other two resolutions, but
    // never repoints cases and never sets mergedInto on either record —
    // both stay fully, independently active, since each is a real,
    // ongoing identity for its own source system.
    const now = new Date().toISOString();
    const updated = records.map(r => {
      if (r.id === patientIdA || r.id === patientIdB) {
        return { ...r, needsReview: false, reviewReason: undefined, reviewCandidateIds: undefined, updatedAt: now };
      }
      return r;
    });
    saveRecords(updated);

    const links = loadLinks();
    const link: PatientLink = {
      id: `LINK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      patientIdA,
      patientIdB,
      linkedBy,
      linkedAt: now,
      reason,
    };
    saveLinks([...links, link]);

    const session = getSessionUser();
    mockAuditService.logEvent({
      type: 'system',
      event: 'mpi.match.linked',
      detail: `Patient records ${patientIdA} and ${patientIdB} confirmed as the same real person and linked by a real reviewer — neither record merged or deprecated.`,
      user: session?.id ?? linkedBy,
      caseId: a.sourceAccession ?? b.sourceAccession ?? null,
      confidence: null,
    }).catch(() => {});

    mockPatientEventBus.publish({ type: 'Patient.Linked', patientIdA, patientIdB, linkedBy, reason });
    return link;
  },

  async getLinkedPatientIds(patientId: string): Promise<string[]> {
    await delay();
    const links = loadLinks();
    // Real fix: follows the full real link graph via breadth-first
    // traversal, not just one hop - if A-B and B-C are both real,
    // separately-confirmed links, a history query for A should still
    // surface C's cases too, not stop at B.
    const result = new Set<string>([patientId]);
    let frontier = [patientId];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const link of links) {
          const other = link.patientIdA === id ? link.patientIdB : link.patientIdB === id ? link.patientIdA : null;
          if (other && !result.has(other)) {
            result.add(other);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
    return Array.from(result);
  },

  async listLinks(organisationId: string): Promise<PatientLink[]> {
    await delay();
    const records = loadRecords();
    const orgPatientIds = new Set(records.filter(r => r.organisationId === organisationId).map(r => r.id));
    return loadLinks().filter(l => orgPatientIds.has(l.patientIdA) || orgPatientIds.has(l.patientIdB));
  },

  async resolveByIdentifier(assigningAuthority: string, identifierValue: string): Promise<string | null> {
    await delay();
    const match = loadIdentifiers().find(
      i => i.assigningAuthority === assigningAuthority && i.identifierValue === identifierValue
    );
    return match?.patientId ?? null;
  },

  async listIdentifiersForPatient(patientId: string): Promise<PatientIdentifier[]> {
    await delay();
    return loadIdentifiers().filter(i => i.patientId === patientId);
  },

  async addIdentifier(patientId: string, assigningAuthority: string, identifierValue: string, source: 'resolution' | 'manual' = 'manual'): Promise<PatientIdentifier> {
    await delay();
    return recordIdentifierInternal(patientId, assigningAuthority, identifierValue, source);
  },

  async updateDemographics(
    patientId: string,
    demographics: {
      firstName?: string; lastName?: string; dateOfBirth?: string;
      address?: { street?: string; city?: string; state?: string; zip?: string; country?: string };
      phone?: string; maritalStatus?: string; aliases?: string[];
      deceased?: boolean; deathDateTime?: string;
    },
    eventTimestamp: string
  ): Promise<{ record: MasterPatientRecord; applied: boolean }> {
    await delay();
    const records = loadRecords();
    const idx = records.findIndex(r => r.id === patientId);
    if (idx === -1) throw new Error(`Cannot update demographics — patient ${patientId} not found`);

    const current = records[idx];

    // Real, critical sequence-control check: a real event strictly
    // older than (or equal to - a genuine re-delivery of the exact
    // same event carries no new information) the record's own
    // lastEventAt is honestly rejected, never silently applied. No
    // real lastEventAt yet means this is the first real ADT event to
    // touch this record's demographics - always genuinely newer than
    // "never."
    if (current.lastEventAt && eventTimestamp <= current.lastEventAt) {
      const session = getSessionUser();
      mockAuditService.logEvent({
        type: 'system',
        event: 'mpi.demographics.stale_event_rejected',
        detail: `Real, stale ADT event (${eventTimestamp}) for patient ${patientId} rejected — a genuinely newer event (${current.lastEventAt}) was already applied. Demographics NOT overwritten.`,
        user: session?.id ?? 'system-adt',
        caseId: current.sourceAccession ?? null,
        confidence: null,
      }).catch(() => {});
      return { record: current, applied: false };
    }

    const updated: MasterPatientRecord = {
      ...current,
      firstName: demographics.firstName ?? current.firstName,
      lastName: demographics.lastName ?? current.lastName,
      dateOfBirth: demographics.dateOfBirth ?? current.dateOfBirth,
      address: demographics.address ?? current.address,
      phone: demographics.phone ?? current.phone,
      maritalStatus: demographics.maritalStatus ?? current.maritalStatus,
      aliases: demographics.aliases ?? current.aliases,
      deceased: demographics.deceased ?? current.deceased,
      deathDateTime: demographics.deathDateTime ?? current.deathDateTime,
      lastEventAt: eventTimestamp,
      updatedAt: new Date().toISOString(),
    };
    records[idx] = updated;
    saveRecords(records);
    mockPatientEventBus.publish({ type: 'Patient.Updated', patient: updated });
    return { record: updated, applied: true };
  },
};

function createProvisional(
  existing: MasterPatientRecord[],
  candidate: PatientMatchCandidate,
  candidateIds: string[],
  reason: string,
): PatientMatchResult {
  const now = new Date().toISOString();
  const provisional: MasterPatientRecord = {
    id: generatePatientId(),
    organisationId: candidate.organisationId,
    mrn: candidate.mrn,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    dateOfBirth: candidate.dateOfBirth,
    createdAt: now,
    updatedAt: now,
    establishedVia: 'ambiguous',
    needsReview: true,
    reviewReason: reason,
    reviewCandidateIds: candidateIds,
    sourceAccession: candidate.sourceAccession,
  };
  saveRecords([...existing, provisional]);
  if (candidate.assigningAuthority) {
    recordIdentifierInternal(provisional.id, candidate.assigningAuthority, candidate.mrn, 'resolution');
  }
  // Real audit event for the DETECTION itself, distinct from whatever
  // resolution eventually follows — a complete trail needs both "this
  // was flagged" and "this was resolved," the same reasoning already
  // applied to case.write.conflict in services/cases/AuditLogger.ts.
  // PHI-safe per AuditLog.detail's own documented constraint: references
  // the opaque provisional/candidate ids and candidate count only, never
  // the actual name/MRN/DOB that's fine to show an authorized reviewer
  // on screen but not fine to write into a shared audit log.
  //
  // caseId is genuinely populated here, not null — found via a direct
  // question about whether these events actually show up on System
  // Audit: AuditLogPage.tsx's role-based filter only shows a
  // pathologist-role user events with a real caseId, or ones whose user
  // field exactly matches their own stored name/email. A null caseId
  // plus a session id (not a name/email) would have made every one of
  // these events silently invisible to the exact people accessioning
  // the cases that triggered them.
  const session = getSessionUser();
  mockAuditService.logEvent({
    type: 'system',
    event: 'mpi.match.ambiguous',
    detail: `Ambiguous patient match flagged for review — provisional record ${provisional.id}, ${candidateIds.length} candidate record(s) in organisation ${candidate.organisationId}.`,
    user: session?.id ?? 'system',
    caseId: candidate.sourceAccession ?? null,
    confidence: null,
  }).catch(() => {});
  return { outcome: 'ambiguous', patientId: provisional.id, candidatePatientIds: candidateIds, reason };
}
