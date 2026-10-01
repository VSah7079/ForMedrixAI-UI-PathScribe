// src/services/hl7/processPatientManagementMessage.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, the actual point of Phase 2: wires a real, parsed A40/A24/
// A47 message into the SAME real merge/link/crosswalk operations
// PatientMatchReviewSection.tsx's human-driven review already uses -
// not a separate, parallel resolution path. A real inbound merge
// event repoints real cases the exact same way a human clicking
// "Merge into this patient" already does.
//
// Real, per-event-type processing, matching patientManagementParser.ts's
// own header comment on the real, verified semantics:
// - A40 (merge): two genuinely separate identities, source folded
//   into target. Calls the real mergeIntoExistingPatient().
// - A24 (link): two genuinely separate, real identities, both stay
//   independently active - calls the real linkPatients().
// - A47 (change identifier): the SAME real person, a corrected
//   identifier - calls the real addIdentifier(), recording the new
//   identifier against the same, already-known patientId (resolved
//   via the OLD identifier from MRG, since that's the real, already-
//   established identity).
// - A43 (move patient information), per direct architecture
//   confirmation: two genuinely separate, real identities, but
//   NEITHER is merged or retired — a specific, misattributed Case
//   moves from source to target.
//
// Real feature, per direct architecture confirmation, building the
// "Interface Exception & Case-Binding Module" (Phase A — generalizing
// the exception queue beyond A43): a real, confirmed bug found while
// scoping this — resolvePatientId() below NEVER failed. If an A40's
// MRG segment referenced an identifier this LIS didn't recognize, it
// silently fell through to resolveOrCreatePatient(), which FABRICATED
// a brand-new patient record and immediately merged it away — worse
// than doing nothing, since it invents an identity that never
// existed. A40/A24/A47/A43 all deal with identities the sending
// system claims are ALREADY known (confirmed directly: "you cannot
// rely solely on automated HL7 feeds... EHR should maintain absolute
// authority over the Patient Master Index" — PathScribe must never
// silently create a new identity on behalf of one of these events).
// resolvePatientId() now reports the real, honest outcome
// ('matched'/'created'/'ambiguous') rather than only ever returning a
// patientId — every one of A40/A24/A47/A43 routes to the real
// Interface Exception Queue (services/interfaceExceptions/) the
// moment EITHER side isn't a genuine 'matched' hit, rather than
// silently fabricating or guessing an identity.
// ─────────────────────────────────────────────────────────────────────────────

import { parsePatientManagementMessage, type ParsedPatientManagementMessage, type ParsedPatientRef } from './patientManagementParser';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { mockEncounterService } from '../encounters/mockEncounterService';
import { mockInterfaceExceptionService } from '../interfaceExceptions/mockInterfaceExceptionService';
import { caseRouter } from '../cases/CaseRouter';
import { mockUserService } from '../users/mockUserService';
import { mockRoleService } from '../roles/mockRoleService';
import { mockMessageService } from '../messages/mockMessageService';
import { getClinicalAdmins } from '../../utils/clinicalAdmins';

/** Real, honest actor tag for the audit trail - distinct from a real
 *  human admin id (session.id, used by the review UI), so a future
 *  audit review can genuinely tell "a human resolved this" from "an
 *  inbound ADT event resolved this automatically" apart. */
const SYSTEM_ACTOR = 'system-adt';

export interface ProcessPatientManagementResult {
  eventType: 'A40' | 'A24' | 'A47' | 'A43';
  /** The real, resulting canonical patientId for the target/surviving
   *  identity - for A47, this is the same patientId the source
   *  identifier already belonged to (only its crosswalk grew). For
   *  A43, this is the real target patient the case moved TO (both
   *  source and target patientId remain independently valid).
   *  Genuinely absent when this message was routed to the exception
   *  queue instead — never fabricated just to fill this field. */
  patientId?: string;
  casesRepointed?: number; // only meaningful for A40
  /** Only meaningful for A43: whether a real Case was actually moved. */
  caseMoved?: boolean;
  /** Only meaningful for A43: the real, specific Case id moved, when
   *  one was. */
  movedCaseId?: string;
  /** Real feature, per direct confirmation, working through the full
   *  Interface Exception & Case-Binding Module: set when this message
   *  was routed to the real Interface Exception Queue instead of
   *  being auto-processed — the real, honest reason it couldn't be
   *  safely resolved. No longer A43-specific — a real A40/A24/A47 can
   *  route here too now (an unrecognized identifier on either side). */
  routedToExceptionQueue?: string;
}

/** Real, more precise resolution for a merge/link/change-identifier
 *  event's participants: by definition, both PID and MRG here refer
 *  to identities the sending system already considers established -
 *  this is fundamentally different from a new order's "might be new,
 *  might be existing" candidate. Tries the exact crosswalk lookup
 *  first (real, precise - no DOB verification needed for an exact
 *  (authority, identifier) hit), falling back to the full
 *  resolveOrCreatePatient only to determine the real, honest outcome —
 *  the caller decides what to do with a non-'matched' result, this
 *  function itself never silently treats 'created'/'ambiguous' as
 *  success.
 *
 *  Real, structural reason this matters beyond precision: MRG never
 *  carries a real DOB field at all (confirmed directly against the
 *  real HL7 standard - MRG-1 is the identifier, MRG-7 is a name, no
 *  DOB field exists). Passing an empty DOB through the full
 *  resolution flow would incorrectly trip the real DOB-verification
 *  safety check (services/patients/) for a reason that has nothing to
 *  do with a genuine identity conflict - simply missing data, not
 *  disagreeing data. */
async function resolvePatientId(ref: ParsedPatientRef, organisationId: string): Promise<{ patientId: string; outcome: 'matched' | 'created' | 'ambiguous' }> {
  if (ref.assigningAuthority && ref.identifierValue) {
    const known = await mockPatientIndexService.resolveByIdentifier(ref.assigningAuthority, ref.identifierValue);
    if (known) return { patientId: known, outcome: 'matched' };
  }

  const result = await mockPatientIndexService.resolveOrCreatePatient({
    organisationId,
    mrn: ref.identifierValue,
    assigningAuthority: ref.assigningAuthority,
    firstName: ref.firstName ?? '',
    lastName: ref.lastName ?? '',
    dateOfBirth: ref.dateOfBirth ?? '',
  });

  // Real feature, per direct architecture confirmation: 'ambiguous'
  // already sets needsReview via mockPatientIndexService's own
  // createProvisional() — but 'created' produces an ordinary, entirely
  // UNFLAGGED record, since resolveOrCreatePatient() has no way to
  // know this particular call exists only to check whether a match
  // exists for an event (A40/A24/A47/A43) that should never have
  // created anything at all. Flagged here rather than silently left
  // as an orphaned, un-reviewable record — matching this app's own
  // "kept, not deleted; a real, traceable fact" posture, not a
  // silent side effect a human would have no way to find.
  if (result.outcome === 'created') {
    await mockPatientIndexService.flagForReview(
      result.patientId,
      `Created as a byproduct of resolving an inbound ADT patient-management message (identifier "${ref.identifierValue}" / authority "${ref.assigningAuthority}") that referenced no real, known patient — this event never should have created a new identity. Review before treating this as a real, new patient.`
    );
  }

  return { patientId: result.patientId, outcome: result.outcome };
}

/** Real, shared exception-queue routing, per direct architecture
 *  confirmation, working through the full Interface Exception &
 *  Case-Binding Module: generalized beyond A43's own original
 *  MRG-5-only failure modes — ANY of A40/A24/A47/A43 that can't be
 *  safely, confidently auto-processed routes through this SAME real
 *  path (creates the real InterfaceException record, notifies every
 *  real Clinical Admin), not a second, A43-only implementation. */
async function routeToExceptionQueue(
  eventType: 'A40' | 'A24' | 'A47' | 'A43',
  reason: string,
  raw: string,
  parsed: ParsedPatientManagementMessage,
  sourcePatientId?: string,
  targetPatientId?: string
): Promise<ProcessPatientManagementResult> {
  const created = await mockInterfaceExceptionService.create({
    eventType,
    reason,
    rawMessage: raw,
    sourcePatientIdentifier: parsed.source.identifierValue || undefined,
    targetPatientIdentifier: parsed.target.identifierValue || undefined,
    // Real feature, per direct confirmation: "Show both patients and
    // their active cases." Genuinely absent when that side's own
    // identity resolution is exactly what failed — never fabricated.
    sourcePatientId, targetPatientId,
  });

  // Real feature, per direct confirmation: "Users should be able to
  // see interface error log under Audit, a new pill Interfaces" +
  // "Send them a high priority message." Every real Clinical Admin
  // (utils/clinicalAdmins.ts — a user holding Admin alongside a real,
  // case-access clinical role, not every raw Admin regardless of
  // clinical standing, since resolving this means judging an identity
  // or case-binding call) gets a real, urgent message the moment a
  // message can't be safely auto-processed — not left to be
  // discovered next time someone happens to open the Audit page.
  // Deep-links straight to the Interfaces pill via a real query
  // param, so acting on an urgent message takes one click, not three.
  if (created.ok) {
    const [usersRes, rolesRes] = await Promise.all([mockUserService.getAll(), mockRoleService.getAll()]);
    if (usersRes.ok && rolesRes.ok) {
      const clinicalAdmins = getClinicalAdmins(usersRes.data, rolesRes.data);
      await Promise.all(clinicalAdmins.map(admin => mockMessageService.send({
        senderId: 'u3',
        senderName: 'System Admin',
        recipientId: admin.id,
        recipientName: `${admin.firstName} ${admin.lastName}`,
        subject: `High Priority: Interface Exception — ADT^${eventType} could not be auto-processed`,
        body: `A real inbound ADT^${eventType} message could not be safely auto-processed and needs review.\n\nReason: ${reason}\n\nSource patient: ${parsed.source.identifierValue || 'unknown'}\nTarget patient: ${parsed.target.identifierValue || 'unknown'}\n\nReview under Audit → Error Log → Interfaces.`,
        isUrgent: true,
        configLink: '/audit?tab=errors&pill=interfaces',
        timestamp: new Date(),
      })));
    }
  }

  return { eventType, patientId: undefined, caseMoved: eventType === 'A43' ? false : undefined, routedToExceptionQueue: reason };
}

export async function processPatientManagementMessage(raw: string, organisationId: string): Promise<ProcessPatientManagementResult> {
  const parsed = parsePatientManagementMessage(raw);

  // Real, load-bearing routing: A43 has a genuinely different real
  // shape (a specific Case moves, neither identity is merged/retired)
  // from A40/A24/A47 below — handled entirely by processMoveMessage.
  // Without this check, an A43 would otherwise fall through this
  // function's own A40/A24 branches below and be incorrectly treated
  // as a link event.
  if (parsed.eventType === 'A43') {
    return processMoveMessage(raw, organisationId);
  }

  if (parsed.eventType === 'A47') {
    // Real, confirmed semantics: same real person, a corrected
    // identifier. Resolve via the OLD (MRG/source) identifier first -
    // that's the real, already-established identity a real A47 is
    // correcting - then record the new one against that same patientId.
    const existing = await resolvePatientId(parsed.source, organisationId);
    // Real feature, per direct confirmation, working through the full
    // Interface Exception & Case-Binding Module: a real A47 whose OLD
    // identifier this LIS doesn't recognize at all means we genuinely
    // don't know who this correction refers to — routes to the
    // exception queue rather than silently fabricating a new record
    // just to attach the corrected identifier to it.
    if (existing.outcome !== 'matched') {
      return routeToExceptionQueue('A47', `The OLD identifier (MRG-1) on this A47 does not match any known, existing patient — cannot determine whose identifier to correct.`, raw, parsed);
    }
    if (parsed.target.assigningAuthority && parsed.target.identifierValue) {
      await mockPatientIndexService.addIdentifier(
        existing.patientId,
        parsed.target.assigningAuthority,
        parsed.target.identifierValue,
        'resolution'
      );
    }
    return { eventType: 'A47', patientId: existing.patientId };
  }

  // A40 and A24 both genuinely involve two, real, separate identities
  // the sending system already considers established.
  const target = await resolvePatientId(parsed.target, organisationId);
  const source = await resolvePatientId(parsed.source, organisationId);

  // Real feature, per direct confirmation, working through the full
  // Interface Exception & Case-Binding Module: a real, confirmed bug
  // found while scoping this work — this check used to not exist at
  // all, meaning an A40 referencing a local id this LIS didn't
  // recognize would silently FABRICATE a brand-new patient record and
  // immediately merge it away. Routes to the exception queue instead,
  // for either side, for both A40 and A24 — neither should ever
  // silently create a new identity.
  if (target.outcome !== 'matched' || source.outcome !== 'matched') {
    const reason = target.outcome !== 'matched' && source.outcome !== 'matched'
      ? `Neither the target (PID) nor source (MRG-1) identifier on this ${parsed.eventType} matches any known, existing patient.`
      : target.outcome !== 'matched'
        ? `The target (PID) identifier on this ${parsed.eventType} does not match any known, existing patient.`
        : `The source (MRG-1) identifier on this ${parsed.eventType} does not match any known, existing patient.`;
    return routeToExceptionQueue(
      parsed.eventType,
      reason,
      raw,
      parsed,
      source.outcome === 'matched' ? source.patientId : undefined,
      target.outcome === 'matched' ? target.patientId : undefined
    );
  }

  if (parsed.eventType === 'A40') {
    const { casesRepointed } = await mockPatientIndexService.mergeIntoExistingPatient(source.patientId, target.patientId);
    return { eventType: 'A40', patientId: target.patientId, casesRepointed };
  }

  // A24 — link, never merge; both real identities stay independently
  // active. Real, per direct guidance: HL7 A24 (Link Patient
  // Information) is specifically the "these two real, separate MRN
  // records are the same real person" event — 'same_person' is the
  // correct, real semantic here, never 'family_relation' (no real
  // ADT event type represents "this newborn belongs to this mother"
  // the way A24 represents identity linkage).
  await mockPatientIndexService.linkPatients(source.patientId, target.patientId, 'same_person', SYSTEM_ACTOR, 'Real, inbound ADT^A24 link event');
  return { eventType: 'A24', patientId: target.patientId };
}

/** Real feature, per direct architecture confirmation: ADT^A43 (Move
 *  Patient Information). Genuinely separate from processPatientManagementMessage's
 *  A40/A24/A47 handling above — A43 never resolves via the simple
 *  target/source pattern those three share, since it needs a real,
 *  specific Case to move, not just two identities to relate.
 *
 *  Confirmed architecture:
 *    Incoming ADT^A43 → parse MRG-5 (Prior Visit/Accession ID) →
 *    locate the specific Case(s) where Encounter.encounterNumber ==
 *    MRG-5 → repoint ONLY those Case(s) to the target patient (PID-3),
 *    keeping the source patient active. A message lacking a usable
 *    MRG-5, or whose MRG-5 doesn't match any real, known Encounter or
 *    Case, routes to the real Interface Exception Queue rather than
 *    auto-moving anything on a guess. */
export async function processMoveMessage(raw: string, organisationId: string): Promise<ProcessPatientManagementResult> {
  const parsed = parsePatientManagementMessage(raw);
  if (parsed.eventType !== 'A43') {
    throw new Error(`processMoveMessage only handles A43 — received "${parsed.eventType}".`);
  }

  const target = await resolvePatientId(parsed.target, organisationId);
  const source = await resolvePatientId(parsed.source, organisationId);

  // Real feature, per direct confirmation, working through the full
  // Interface Exception & Case-Binding Module: the same real
  // "never fabricate an identity for an already-known-identity event"
  // check A40/A24/A47 now apply, extended to A43 — a real gap this
  // file's own MRG-5-only checks below didn't previously cover.
  if (target.outcome !== 'matched' || source.outcome !== 'matched') {
    const reason = target.outcome !== 'matched' && source.outcome !== 'matched'
      ? `Neither the target (PID) nor source (MRG-1) identifier on this A43 matches any known, existing patient.`
      : target.outcome !== 'matched'
        ? `The target (PID) identifier on this A43 does not match any known, existing patient.`
        : `The source (MRG-1) identifier on this A43 does not match any known, existing patient.`;
    return routeToExceptionQueue(
      'A43', reason, raw, parsed,
      source.outcome === 'matched' ? source.patientId : undefined,
      target.outcome === 'matched' ? target.patientId : undefined
    );
  }
  const targetPatientId = target.patientId;
  const sourcePatientId = source.patientId;

  // Real, load-bearing fallback: no usable MRG-5 means this app has no
  // reliable way to know WHICH case is misattributed — never guess by
  // moving every case for the source patient (that would silently
  // reintroduce the exact wrong-chart risk A43 exists to fix safely).
  if (!parsed.priorVisitNumber) {
    return routeToExceptionQueue('A43', 'No MRG-5 (Prior Visit Number) present on this A43 message — cannot determine which specific Case to move.', raw, parsed, sourcePatientId, targetPatientId);
  }

  const encounterRes = await mockEncounterService.getByEncounterNumber(organisationId, parsed.priorVisitNumber);
  if (!encounterRes.ok || !encounterRes.data) {
    return routeToExceptionQueue('A43', `MRG-5 "${parsed.priorVisitNumber}" does not match any known Encounter for this organisation.`, raw, parsed, sourcePatientId, targetPatientId);
  }

  const allCases = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true } as any);
  const matchingCases = allCases.ok ? (allCases.data as any[]).filter(c => c?.encounterId === encounterRes.data!.id) : [];
  if (matchingCases.length === 0) {
    return routeToExceptionQueue('A43', `MRG-5 "${parsed.priorVisitNumber}" matched a real Encounter (${encounterRes.data.id}), but no Case is linked to it.`, raw, parsed, sourcePatientId, targetPatientId);
  }

  // Real, deliberate scope: every Case tied to this specific,
  // misattributed Encounter moves together — they're all real
  // artifacts of the same wrongly-attributed visit, not independent
  // decisions. A source patient's OTHER, unrelated cases (different
  // encounters) are never touched.
  let movedCaseId: string | undefined;
  let anyMoved = false;
  for (const c of matchingCases) {
    const result = await mockPatientIndexService.moveCaseToPatient(c.id, sourcePatientId, targetPatientId, parsed.recordedAt);
    if (result.moved) { anyMoved = true; movedCaseId = c.id; }
  }

  if (!anyMoved) {
    return routeToExceptionQueue('A43', `MRG-5 "${parsed.priorVisitNumber}" matched real Case(s), but none could be moved (see audit log for the specific reason per case).`, raw, parsed, sourcePatientId, targetPatientId);
  }

  return { eventType: 'A43', patientId: targetPatientId, caseMoved: true, movedCaseId };
}
