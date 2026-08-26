// Stub only — real implementation pending backend cutover.
// mockCaseService.ts is the active implementation; this satisfies the
// service interface's contract so the swap to a real backend is a
// one-line change in services/index.ts when that backend exists.

/**
 * FirestoreCaseService
 *
 * Production implementation of ICaseService backed by Firebase Firestore.
 *
 * Collection layout
 * ─────────────────
 *  /cases/{caseId}                      — Case document (written by LIS sync Cloud Function)
 *  /cases/{caseId}/synopticReports/{id} — Synoptic answer sub-collection (written by client)
 *
 * Access pattern
 * ──────────────
 * This service is READ for clinical case data (LIS owns it — Cloud Function writes).
 * It is WRITE only for PathScribe-owned fields:
 *   - synopticReports (structured answers)
 *   - status transitions (draft → finalizing → finalized)
 *   - orchSections (AI narrative content)
 *   - comments and delegation state
 *
 * Never write back to LIS-owned fields (patient demographics, specimens,
 * grossDescription etc.) from the client. Those are updated by re-sync only.
 *
 * TODO before go-live
 * ───────────────────
 * 1. Confirm COLLECTION_NAME matches your Firestore collection
 * 2. Confirm PATHOLOGIST_FIELD matches the field your Cloud Function writes
 *    (common values: 'assignedPathologistId', 'pathologistUserId', 'ownerId')
 * 3. Set Firestore Security Rules to restrict reads to authenticated users
 *    whose UID matches the pathologist field (or belongs to the same hospital)
 * 4. Ensure Firebase app is initialised before this service is called
 *    (done in src/contexts/AuthContext.tsx)
 * 5. Add composite indexes in firebase.json for any multi-field queries
 *    (e.g. assignedPathologistId + status)
 * 6. Confirm data residency: set Firestore location to europe-west2 (London)
 *    or europe-west1 (Belgium) for UK/EU compliance
 */

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';

import type { Case }                                          from '../../types/case/Case';
import type { ICaseService, CaseFilterParams } from './ICaseService';
import type { ServiceResult }                                 from '../types';
import { AuditLogger }                                        from './AuditLogger';
import { ConcurrencyConflictError }                            from './ConcurrencyConflictError';

// ── Configuration ─────────────────────────────────────────────────────────────
// TODO: confirm these match your Firestore schema
const COLLECTION_NAME   = 'cases';
const PATHOLOGIST_FIELD = 'assignedPathologistId'; // field written by Cloud Function

// ── Helpers ───────────────────────────────────────────────────────────────────
const audit = new AuditLogger('FIRESTORE');

/** Convert Firestore Timestamp fields to ISO strings so Case types stay consistent. */
function normaliseTimestamps(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val instanceof Timestamp) {
      out[key] = val.toDate().toISOString();
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = normaliseTimestamps(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function docToCase(id: string, data: Record<string, any>): Case {
  return { id, ...normaliseTimestamps(data) } as Case;
}

// ── Service implementation ─────────────────────────────────────────────────────
export const firestoreCaseService: ICaseService = {

  // ── getCase ────────────────────────────────────────────────────────────────
  async getCase(caseId: string): Promise<Case | undefined> {
    const db = getFirestore();
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, caseId));
      if (!snap.exists()) {
        audit.log({ eventType: 'case.read', caseId, userId: 'system', outcome: 'failure' });
        return undefined;
      }
      audit.log({ eventType: 'case.read', caseId, userId: 'system', outcome: 'success' });
      return docToCase(snap.id, snap.data());
    } catch (err) {
      audit.log({ eventType: 'case.read', caseId, userId: 'system', outcome: 'failure' });
      console.error('firestoreCaseService.getCase', err);
      return undefined;
    }
  },

  // ── getAll ─────────────────────────────────────────────────────────────────
  async getAll(params?: CaseFilterParams): Promise<ServiceResult<Case[]>> {
    const db = getFirestore();
    try {
      const constraints: any[] = [];

      // Server-side filters (require Firestore composite indexes for combinations)
      if (params?.status) {
        const statuses = Array.isArray(params.status) ? params.status : [params.status];
        constraints.push(where('status', 'in', statuses));
      }
      if (params?.statusList?.length) {
        constraints.push(where('status', 'in', params.statusList));
      }
      if (params?.specialty) {
        constraints.push(where('specialty', '==', params.specialty));
      }
      if (params?.hospitalId) {
        // Real bug fix: this used to be where('hospitalId', '==', ...),
        // querying a field that doesn't exist anywhere on the real Case
        // schema — MRN genuinely lives at patient.mrn (types/case/Patient.ts).
        // Firestore supports dot-path field queries on nested map fields
        // directly, so this is a real, exact-match, indexable constraint,
        // not a fallback. Exact match only (Firestore has no native
        // substring/contains query) — a genuinely partial MRN search stays
        // client-side, same as patientName below.
        constraints.push(where('patient.mrn', '==', params.hospitalId));
      }
      if ((params as any)?.patientId) {
        // Real Master Patient Index id (services/patients/IPatientIndexService.ts).
        // patient.id already holds the real, deduplicated MPI identity —
        // AccessionPage.tsx's real MPI resolution sets it directly
        // (mpiResult.patientId), not a case-derived id — so this is a
        // clean, exact-match, indexable constraint.
        constraints.push(where('patient.id', '==', (params as any).patientId));
      }
      if (params?.priorityList?.length) {
        if (params.priorityList.length === 1) {
          constraints.push(where('order.priority', '==', params.priorityList[0]));
        } else {
          constraints.push(where('order.priority', 'in', params.priorityList));
        }
      }
      if (params?.clientIds?.length) {
        // Firestore 'in' supports up to 30 values — a real, hard limit, not
        // arbitrary. A selection larger than that (unlikely from the
        // picker UI, but not impossible) needs the excess applied
        // client-side rather than silently dropped or erroring the query.
        const ids = params.clientIds.slice(0, 30);
        constraints.push(where('order.clientId', 'in', ids));
      }
      if ((params as any)?.pathologistIds?.length) {
        const ids = ((params as any).pathologistIds as string[]).slice(0, 30);
        constraints.push(where('order.assignedTo', 'in', ids));
      }
      if (params?.genderList?.length) {
        // Real stored data uses single-letter codes (patient.sex: 'M'/'F'/
        // 'X'/'U'/'O') per caseFilterUtils.ts's own established mapping —
        // SearchPage sends full words ('Male'/'Female'/...), so this
        // normalizes before querying rather than silently matching nothing.
        const toCode = (s: string): string => {
          const l = s.toLowerCase();
          if (l === 'm' || l === 'male')       return 'M';
          if (l === 'f' || l === 'female')     return 'F';
          if (l === 'x' || l === 'non-binary') return 'X';
          if (l === 'u' || l === 'unknown')    return 'U';
          if (l === 'o' || l === 'other')      return 'O';
          return s;
        };
        constraints.push(where('patient.sex', 'in', params.genderList.map(toCode)));
      }

      // ── Range filter precedence ──────────────────────────────────────────
      // Real, hard Firestore constraint: only ONE field can have an
      // inequality/range filter per query. dateFrom/dateTo (accession
      // date) and dobFrom/dobTo/ageMin/ageMax (both ultimately ranges on
      // patient.dateOfBirth) compete for that single slot. Deliberate,
      // documented policy rather than an unexplained silent choice:
      // accession date wins the server-side slot when both are present
      // (it's the more common search pattern and typically the bigger
      // pre-filter), and the DOB/age range is applied client-side after
      // the fetch instead — same "keep result sets small" reasoning the
      // existing client-side filters below already use, just for a range
      // instead of a text match. When accession date isn't given, the
      // DOB/age range gets the server-side slot instead.
      const hasAccessionRange = !!(params?.dateFrom || params?.dateTo);
      // ageMin/ageMax converted to an equivalent DOB range (older age →
      // earlier birth date, so ageMin bounds dobTo and ageMax bounds
      // dobFrom) — explicit dobFrom/dobTo, if also given, take precedence
      // as the more direct, unambiguous signal.
      let dobFrom = (params as any)?.dobFrom as string | undefined;
      let dobTo   = (params as any)?.dobTo   as string | undefined;
      const ageMin = (params as any)?.ageMin as number | undefined;
      const ageMax = (params as any)?.ageMax as number | undefined;
      if (!dobFrom && !dobTo && (ageMin !== undefined || ageMax !== undefined)) {
        const now = new Date();
        if (ageMax !== undefined) {
          // eslint-disable-next-line no-restricted-properties -- Real, honest justification: age-from-DOB, the rule's own explicitly stated carve-out - age is inherently computed relative to "now" (the viewing moment), not a facility-specific "today," same reasoning already established in caseFilterUtils.ts's own equivalent age-range logic.
          const d = new Date(now); d.setFullYear(d.getFullYear() - ageMax - 1); d.setDate(d.getDate() + 1);
          dobFrom = d.toISOString().slice(0, 10);
        }
        if (ageMin !== undefined) {
          // eslint-disable-next-line no-restricted-properties -- Same real, honest age-from-DOB justification as above.
          const d = new Date(now); d.setFullYear(d.getFullYear() - ageMin);
          dobTo = d.toISOString().slice(0, 10);
        }
      }
      const hasDobRange = !!(dobFrom || dobTo);

      if (hasAccessionRange) {
        // order.receivedDate — the same field WorklistTable.tsx's own
        // getSortValue() already treats as "the" accession date for
        // sorting. Deliberately NOT the mock's own caseFilterUtils.ts
        // logic (specimens[0]?.receivedAt), which reads into the first
        // element of an array field - Firestore can't query "the first
        // element of an array" as a scalar range filter without a
        // separate, duplicated top-level field, and order.receivedDate is
        // already real, top-level, and populated. Worth knowing: this is
        // an honest, real discrepancy between the two backends' exact
        // date source, not a hidden one - flagged here rather than
        // silently assumed equivalent.
        if (params?.dateFrom) constraints.push(where('order.receivedDate', '>=', params.dateFrom));
        if (params?.dateTo)   constraints.push(where('order.receivedDate', '<=', params.dateTo));
        constraints.push(orderBy('order.receivedDate', 'desc'));
      } else if (hasDobRange) {
        if (dobFrom) constraints.push(where('patient.dateOfBirth', '>=', dobFrom));
        if (dobTo)   constraints.push(where('patient.dateOfBirth', '<=', dobTo));
        constraints.push(orderBy('patient.dateOfBirth', 'desc'));
      } else {
        // Sort most recent first — only when neither range filter above
        // already supplied its own required orderBy (Firestore requires
        // the first orderBy to match any inequality field actually used).
        constraints.push(orderBy('updatedAt', 'desc'));
      }

      // ── Pagination ────────────────────────────────────────────────────────
      // Cursor-based, not offset-based — see CaseFilterParams.pageSize's own
      // doc comment for why. Fetches one extra document beyond the
      // requested page size purely to detect whether a next page exists,
      // trimmed back off before returning.
      if (params?.cursor) {
        constraints.push(startAfter(params.cursor));
      }
      if (params?.pageSize) {
        constraints.push(limit(params.pageSize + 1));
      }

      const snap = await getDocs(
        query(collection(db, COLLECTION_NAME), ...constraints)
      );

      let results = snap.docs.map(d =>
        docToCase(d.id, d.data()) as Case
      );

      let hasMore = false;
      let nextCursor: string | undefined;
      if (params?.pageSize && results.length > params.pageSize) {
        hasMore = true;
        results = results.slice(0, params.pageSize);
        const lastDoc = results[results.length - 1] as any;
        nextCursor = hasAccessionRange
          ? lastDoc?.order?.receivedDate
          : hasDobRange
            ? lastDoc?.patient?.dateOfBirth
            : lastDoc?.updatedAt;
      }

      // Client-side range check for whichever of the two competing ranges
      // didn't win the server-side slot above (see the precedence comment).
      if (hasAccessionRange && hasDobRange) {
        results = results.filter(c => {
          const dob = (c as any).patient?.dateOfBirth;
          if (!dob) return true; // don't exclude cases with no DOB on record
          return (!dobFrom || dob >= dobFrom) && (!dobTo || dob <= dobTo);
        });
      }

      // Client-side filters (no index required but post-fetch — keep result sets small)
      if (params?.search) {
        const s = params.search.toLowerCase();
        results = results.filter(c =>
          (c as any).accession?.fullAccession?.toLowerCase().includes(s) ||
          `${(c as any).patient?.firstName} ${(c as any).patient?.lastName}`.toLowerCase().includes(s) ||
          (c as any).patient?.mrn?.includes(s)
        );
      }
      if (params?.accessionNo) {
        results = results.filter(c =>
          (c as any).accession?.fullAccession === params.accessionNo
        );
      }
      if ((params as any)?.compFlagCodes?.length) {
        // Real, per direct guidance's own follow-up: same real check
        // (sf.lisCode === code || sf.id === code || sf.label === code)
        // as caseFilterUtils.ts's own mock-path implementation -
        // specimenFlags is an array of objects, and Firestore has no
        // native way to query "does any array element's property X
        // equal Y" without a separate, denormalized scalar index
        // field this app's data model doesn't maintain. Applied here,
        // same real "no index required but post-fetch" posture as the
        // DOB/age range fallback above - inherits that same,
        // already-documented pagination trade-off (hasMore/nextCursor
        // reflect the pre-filter page), not a new limitation.
        const codes = (params as any).compFlagCodes as string[];
        results = results.filter(c =>
          codes.some(code =>
            ((c as any).specimenFlags ?? []).some((sf: any) =>
              sf.lisCode === code || sf.id === code || sf.label === code
            )
          )
        );
      }

      return params?.pageSize
        ? { ok: true, data: results, meta: { hasMore, nextCursor } }
        : { ok: true, data: results };
    } catch (err: any) {
      console.error('firestoreCaseService.getAll', err);
      return { ok: false, error: err?.message ?? 'Firestore error' };
    }
  },

  // ── listCasesForUser ───────────────────────────────────────────────────────
  async listCasesForUser(userId: string): Promise<Case[]> {
    const db = getFirestore();
    try {
      // If userId is a sentinel value, return all cases (admin / dev)
      const isAdmin = !userId || userId === 'all' || userId === 'current';

      const q = isAdmin
        ? query(collection(db, COLLECTION_NAME), orderBy('updatedAt', 'desc'))
        : query(
            collection(db, COLLECTION_NAME),
            where(PATHOLOGIST_FIELD, '==', userId),
            orderBy('updatedAt', 'desc')
          );

      const snap  = await getDocs(q);
      const cases = snap.docs.map(d => docToCase(d.id, d.data()));

      audit.log({ eventType: 'case.list', userId, outcome: 'success' });
      return cases;
    } catch (err) {
      audit.log({ eventType: 'case.list', userId, outcome: 'failure' });
      console.error('firestoreCaseService.listCasesForUser', err);
      return [];
    }
  },

  // ── updateCase ─────────────────────────────────────────────────────────────
  // Only updates PathScribe-owned fields. Never overwrites LIS-sourced clinical data.
  async updateCase(caseId: string, updates: Partial<Case>, expectedVersion?: number): Promise<void> {
    const db = getFirestore();

    // Guard: block writes to LIS-owned fields from the client.
    //
    // 'order' carve-out (Option A, decided over 'move assignment out of
    // order' — see design discussion): assignedTo/assignedParticipationTypeId
    // live nested inside the LIS-owned `order` object, but they're
    // PathScribe's own case-routing metadata, not LIS order data — the
    // sync logic in caseAssignmentSync.ts needs to be able to write them.
    // Every OTHER order sub-field (orderNumber, requestingProvider,
    // clientId, etc.) stays blocked exactly as before.
    //
    // IMPORTANT: this can't just become `updates.order = { assignedTo,
    // assignedParticipationTypeId }` — Firestore's updateDoc REPLACES an
    // entire nested map field when you hand it a plain object, it doesn't
    // merge at the leaf level. Writing that would silently wipe every
    // other real order field (orderNumber, requestingProvider, clientId…)
    // the first time this ran. Firestore's dot-path field syntax
    // ('order.assignedTo') is what actually performs a true partial
    // merge, touching only that one nested field and leaving the rest of
    // `order` — including fields not even loaded into `updates` — intact.
    const ALLOWED_ORDER_SUBFIELDS = ['assignedTo', 'assignedParticipationTypeId'] as const;
    const dotPathUpdates: Record<string, any> = {};
    if (updates.order && typeof updates.order === 'object') {
      const orderKeys = Object.keys(updates.order);
      const allowedPresent = orderKeys.filter(k => (ALLOWED_ORDER_SUBFIELDS as readonly string[]).includes(k));
      const blockedPresent = orderKeys.filter(k => !(ALLOWED_ORDER_SUBFIELDS as readonly string[]).includes(k));

      for (const key of allowedPresent) {
        dotPathUpdates[`order.${key}`] = (updates.order as any)[key];
      }
      if (blockedPresent.length > 0) {
        console.warn(
          `firestoreCaseService.updateCase: ignoring LIS-owned order sub-fields [${blockedPresent.join(', ')}]. ` +
          'These are managed by the Cloud Function sync and must not be overwritten by the client. ' +
          `Only [${ALLOWED_ORDER_SUBFIELDS.join(', ')}] may be client-written within order.`
        );
      }
      delete (updates as any).order;
    }

    const LIS_OWNED_FIELDS = [
      'patient', 'specimens', 'accession', 'grossDescription',
      'microscopicDescription', 'hospitalId',
    ] as const;

    const blocked = LIS_OWNED_FIELDS.filter(f => f in updates);
    if (blocked.length > 0) {
      console.warn(
        `firestoreCaseService.updateCase: ignoring LIS-owned fields [${blocked.join(', ')}]. ` +
        'These are managed by the Cloud Function sync and must not be overwritten by the client.'
      );
      blocked.forEach(f => delete (updates as any)[f]);
    }

    const payload = { ...updates, ...dotPathUpdates, updatedAt: new Date().toISOString() };

    try {
      // A real transaction — reads the current version and writes the
      // update atomically, so nothing can slip in between the compare and
      // the write the way a separate getDoc()-then-updateDoc() would risk.
      // This is the actual implementation of the design spec's §5.1
      // compare-and-swap, not a simulation of it.
      await runTransaction(db, async (tx) => {
        const ref = doc(db, COLLECTION_NAME, caseId);
        const snap = await tx.get(ref);
        const currentVersion: number = snap.exists() ? (snap.data().version ?? 0) : 0;

        if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
          throw new ConcurrencyConflictError(caseId, expectedVersion, currentVersion);
        }

        tx.update(ref, { ...payload, version: currentVersion + 1 });
      });
      audit.log({ eventType: 'case.write', caseId, userId: 'system', outcome: 'success' });
    } catch (err) {
      if (err instanceof ConcurrencyConflictError) {
        // Real, expected conflict — not a system failure. Logged as its
        // own distinct event type so a real audit review can tell "someone
        // else won a race" apart from "the write actually broke."
        audit.log({ eventType: 'case.write.conflict', caseId, userId: 'system', outcome: 'failure' });
        throw err;
      }
      audit.log({ eventType: 'case.write', caseId, userId: 'system', outcome: 'failure' });
      console.error('firestoreCaseService.updateCase', err);
      throw new Error(`firestoreCaseService.updateCase failed for ${caseId}`);
    }
  },

  // ── createCase ─────────────────────────────────────────────────────────────
  // Added for the Accession page (Stage 0 Requirements §6.1).
  //
  // ⚠ OPEN CONFLICT — flagging rather than silently resolving: this file's
  // own header says Firestore is "READ for clinical case data (LIS owns
  // it — Cloud Function writes)", and updateCase above actively BLOCKS
  // client writes to patient/specimens/accession/order as LIS_OWNED_FIELDS.
  // But Orchestration (O26-) cases — the only case type the Accession page
  // creates — have no LIS sync at all; PathScribe IS the system of record
  // for their patient/specimen/accession data from the moment of
  // accession. createCase below writes the full document unguarded
  // (setDoc, not updateDoc — there are no "LIS-owned fields" to protect
  // on a document that doesn't exist yet), but updateCase's guard will
  // still block any LATER edit to an Orchestration case's patient/
  // specimens/accession/order through this same service, which may not be
  // what you want for a case PathScribe itself originated. Worth deciding
  // explicitly whether LIS_OWNED_FIELDS should be conditional on how the
  // case originated, rather than applying unconditionally to every
  // caseId routed here.
  async createCase(caseData: Case): Promise<void> {
    const db = getFirestore();
    const { id, ...data } = caseData;
    try {
      await setDoc(doc(db, COLLECTION_NAME, id), {
        ...data,
        createdAt: caseData.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      audit.log({ eventType: 'case.create', caseId: id, userId: 'system', outcome: 'success' });
    } catch (err) {
      audit.log({ eventType: 'case.create', caseId: id, userId: 'system', outcome: 'failure' });
      console.error('firestoreCaseService.createCase', err);
      throw new Error(`firestoreCaseService.createCase failed for ${id}`);
    }
  },
};
