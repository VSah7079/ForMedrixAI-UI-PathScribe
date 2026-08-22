// src/services/intraop/mockIntraoperativeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock service backing the "Unlinked Intraoperative Entries" queue. Real
// session/specimen create/list/merge operations and real matching logic —
// deterministic (MRN exact) checked before fuzzy (last name + surgeon +
// arrival-time proximity), same priority order the original spec called for.
//
// Session != specimen — see IntraoperativeEntry.ts's file header for why.
// createSession makes the shell (patient/OR/surgeon, no specimens yet);
// addSpecimen adds one; addMilestone and setFrozenSectionDiagnosis operate
// on a specific specimen within a session, not the session as a whole.
//
// candidateCases below stands in for "cases that have since arrived via
// formal LIS accession" — deliberately a small, separate mock list here
// rather than reaching into the full existing case services, so this
// stays clearly scoped as a demonstration of the matching logic itself,
// not a claim that it's wired to the real, full case list yet.
// ─────────────────────────────────────────────────────────────────────────────
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { IntraoperativeEntry, IntraopSpecimen, MilestoneEntry, MatchCandidate, MilestoneType, SkipReason, EntryMatch, FrozenCategory, MergeResolutionContext, PreparationType, PreparationOutput } from '@/types/intraop/IntraoperativeEntry';
import type { IIntraoperativeService } from './IIntraoperativeService';
import { caseRouter } from '../cases/CaseRouter';
import { mockAuditService } from '../auditlog/mockAuditService';
import { mockFacilityService } from '../facilities/mockFacilityService';
import { mockLocationService } from '../locations/mockLocationService';

const STORAGE_KEY = 'intraop_entries';
const INTRAOP_VERSION = '5'; // bumped: added MERGED_TAT_SEED batch for the linkage TAT trend chart
const VERSION_KEY = 'pathscribe_mock_intraop_version';
try {
  const storedVersion = localStorage.getItem(VERSION_KEY);
  if (storedVersion !== INTRAOP_VERSION) {
    localStorage.removeItem('pathscribe_mock_' + STORAGE_KEY);
    localStorage.setItem(VERSION_KEY, INTRAOP_VERSION);
  }
} catch { /* SSR / sandboxed env — ignore */ }

// Stands in for "cases that arrived via formal LIS accession" — see file
// header. Shape used by findMatchCandidates' real live query below (was
// previously also the shape of a hardcoded CANDIDATE_CASES array; that's
// gone now, replaced by an actual caseRouter query).
interface CandidateCase {
  caseId: string;
  patientName: string; // "Last, First"
  mrn: string;
  surgeon: string;
  accessionedAt: string;
}

// Stands in for a real ADT feed lookup — a site's hospital-wide patient
// registry, not this app's own data. Deliberately separate from real
// case data above (that's "cases already accessioned," this is
// "patients the hospital knows about at all," a different real system
// in a real deployment). '12345' included specifically so a demo
// without a real barcode to scan can type a short, memorable MRN and
// get a consistent, real-looking match every time — not left to
// Math.random() chance.
const ADT_RECORDS: Record<string, { patientName: string; dateOfBirth: string }> = {
  '12345':     { patientName: 'Bennett, Sarah',      dateOfBirth: '1979-03-22' },
  'MRN-88214': { patientName: 'Whitfield, Margaret', dateOfBirth: '1958-02-11' },
  'MRN-77002': { patientName: 'Delacroix, Henri',    dateOfBirth: '1971-09-30' },
};

const SEED_ENTRIES: IntraoperativeEntry[] = [
  {
    id: 'intraop-001',
    patientMatch: { source: 'barcode', patientName: 'Whitfield, Margaret', mrn: 'MRN-88214', dateOfBirth: '1958-02-11', confirmedAt: '2026-07-11T14:20:00.000Z' },
    performedBy: { userId: 'user-owusu', userName: 'Dr. Owusu' },
    orNumber: 'OR-4', surgeon: 'Dr. Owusu',
    specimens: [
      {
        id: 'spec-001-a',
        specimenLabel: 'Specimen A: Left breast, margins',
        arrivalTimestamp: '2026-07-11T14:18:00.000Z',
        milestones: [
          { id: 'm1', milestone: 'gross_logged',          timestamp: '2026-07-11T14:19:10.000Z' },
          { id: 'm2', milestone: 'touch_prep_performed',  timestamp: '2026-07-11T14:20:40.000Z' },
          { id: 'm3', milestone: 'frozen_section_cut',    timestamp: '2026-07-11T14:22:15.000Z' },
        ],
        // Real, itemized outputs matching the milestone narrative above —
        // one touch prep was actually performed, then one block frozen.
        preparations: [
          { id: 'p1', type: 'touch_prep', identifier: 'FS-A-TP1', timestamp: '2026-07-11T14:20:40.000Z' },
          { id: 'p2', type: 'frozen_block', identifier: 'FS-A1', timestamp: '2026-07-11T14:22:15.000Z' },
        ],
        preliminaryCytologyDictation: 'Touch prep shows cohesive clusters, mild atypia. Proceeding to freeze.',
        quickGrossDictation: 'Received fresh, labeled "left breast, margins." Irregular tan-white fibrofatty tissue, 4.2 x 3.1 x 1.8 cm. Sectioned to reveal firm, ill-defined white mass, 1.4 cm greatest dimension.',
      },
    ],
    verbalReportLog: { timestamp: '2026-07-11T14:26:00.000Z', note: 'Spoke with Dr. Owusu. Margins grossly clear, frozen pending.' },
    status: 'pending',
    createdAt: '2026-07-11T14:18:00.000Z',
  },
  {
    id: 'intraop-002',
    patientMatch: { source: 'adt_match', patientName: 'Delacroix, Henri', mrn: 'MRN-77002', dateOfBirth: '1971-09-30', confirmedAt: '2026-07-11T13:02:00.000Z' },
    performedBy: { userId: 'user-faulkner', userName: 'Dr. Faulkner' },
    orNumber: 'OR-2', surgeon: 'Dr. Faulkner',
    specimens: [
      {
        id: 'spec-002-a',
        specimenLabel: 'Specimen A: Right colon mass',
        arrivalTimestamp: '2026-07-11T13:00:00.000Z',
        milestones: [
          { id: 'm1', milestone: 'gross_logged',        timestamp: '2026-07-11T13:01:30.000Z' },
          { id: 'm2', milestone: 'touch_prep_skipped',  timestamp: '2026-07-11T13:02:05.000Z', skipReason: 'direct_to_frozen' },
          { id: 'm3', milestone: 'frozen_section_cut',  timestamp: '2026-07-11T13:03:40.000Z' },
        ],
        // Real example of why preparations != milestones: touch prep was
        // SKIPPED here (direct to frozen), so there's no real touch prep
        // output at all — only the one real frozen block that was
        // actually produced.
        preparations: [
          { id: 'p1', type: 'frozen_block', identifier: 'FS-A1', timestamp: '2026-07-11T13:03:40.000Z' },
        ],
        quickGrossDictation: 'Received fresh, right colon segment with attached mass, dense and fibrotic on palpation — proceeding direct to frozen, touch prep not expected to yield adequate cellularity.',
        frozenSectionDiagnosis: 'Invasive adenocarcinoma, moderately differentiated. Radial margin grossly uninvolved, pending permanent confirmation.',
      },
      {
        // A second specimen in the same session — same patient/OR/surgeon,
        // real example of what "Next Specimen" actually produces.
        id: 'spec-002-b',
        specimenLabel: 'Specimen B: Pericolic lymph node',
        arrivalTimestamp: '2026-07-11T13:05:00.000Z',
        milestones: [
          { id: 'm1', milestone: 'gross_logged', timestamp: '2026-07-11T13:06:00.000Z' },
        ],
        preparations: [], // real, honest state — only gross logged so far, nothing actually produced yet
        quickGrossDictation: 'Single lymph node, 0.8 cm, submitted entirely for frozen.',
      },
    ],
    verbalReportLog: { timestamp: '2026-07-11T13:07:00.000Z', note: 'Spoke with Dr. Faulkner. Invasive adenocarcinoma confirmed on frozen, margin appears clear.' },
    status: 'pending',
    createdAt: '2026-07-11T13:00:00.000Z',
  },
  {
    id: 'intraop-003',
    patientMatch: { source: 'barcode', patientName: 'Okafor, Chidi', mrn: 'MRN-60391', confirmedAt: '2026-07-11T09:44:00.000Z' },
    performedBy: { userId: 'user-patel', userName: 'Dr. Patel' },
    orNumber: 'OR-1', surgeon: 'Dr. Patel',
    specimens: [
      {
        id: 'spec-003-a',
        specimenLabel: 'Specimen A: Thyroid nodule, left lobe',
        arrivalTimestamp: '2026-07-11T09:42:00.000Z',
        milestones: [
          { id: 'm1', milestone: 'gross_logged', timestamp: '2026-07-11T09:43:20.000Z' },
        ],
        preparations: [], // real, honest state — only gross logged so far, nothing actually produced yet
        quickGrossDictation: 'Received a 1.8 cm firm tan nodule, left thyroid lobe. No sutures placed, no orientation given by surgeon.',
      },
    ],
    status: 'pending', // deliberately no real case candidate matches this one — a session genuinely awaiting a formal accession that hasn't arrived yet
    createdAt: '2026-07-11T09:42:00.000Z',
  },
  {
    id: 'intraop-004',
    // The only seed entry with status: 'merged' — the other three above
    // are deliberately left 'pending' to demo the queue itself. This one
    // demos the other half: what a completed merge looks like, and backs
    // O26-0027's CaseStatus 'intraoperative-complete' (real, wired in
    // SearchPage.tsx's status pills and HeaderBar.tsx's stage mapping,
    // but previously never produced by any seed case).
    patientMatch: { source: 'barcode', patientName: 'Higashi, Kenji', mrn: 'MRN-90144', dateOfBirth: '1965-05-14', confirmedAt: '2026-07-19T10:05:00.000Z' },
    performedBy: { userId: 'user-owusu', userName: 'Dr. Owusu' },
    orNumber: 'OR-3', surgeon: 'Dr. Owusu',
    specimens: [
      {
        id: 'spec-004-a',
        specimenLabel: 'Specimen A: Left thyroid lobe',
        arrivalTimestamp: '2026-07-19T10:03:00.000Z',
        milestones: [
          { id: 'm1', milestone: 'gross_logged',         timestamp: '2026-07-19T10:04:10.000Z' },
          { id: 'm2', milestone: 'touch_prep_performed', timestamp: '2026-07-19T10:05:35.000Z' },
          { id: 'm3', milestone: 'frozen_section_cut',   timestamp: '2026-07-19T10:07:20.000Z' },
        ],
        preparations: [
          { id: 'p1', type: 'touch_prep', identifier: 'FS-A-TP1', timestamp: '2026-07-19T10:05:35.000Z' },
          { id: 'p2', type: 'frozen_block', identifier: 'FS-A1', timestamp: '2026-07-19T10:07:20.000Z' },
        ],
        preliminaryCytologyDictation: 'Touch prep shows follicular cells without clear-cut nuclear features of papillary carcinoma.',
        quickGrossDictation: 'Received fresh, labeled "left thyroid lobe." Encapsulated tan-brown nodule, 1.9 cm greatest dimension, well-circumscribed.',
        frozenSectionDiagnosis: 'Follicular lesion, deferred to permanent sections for definitive classification.',
        frozenCategory: 'deferred',
        frozenDiagnosisRenderedAt: '2026-07-19T10:19:00.000Z',
      },
    ],
    verbalReportLog: { timestamp: '2026-07-19T10:09:00.000Z', note: 'Spoke with Dr. Owusu. Frozen deferred to permanent — capsular/vascular invasion cannot be reliably assessed on frozen section.' },
    status: 'merged',
    // Real fix: previously 'O26-0027', a case ID that doesn't exist
    // anywhere in mockCaseService.ts - meant this entry could never
    // actually cross-reference to a real Case, so
    // computeFrozenSectionOutliers (components/Contribution/
    // qualityCalculations.ts) would always find zero matches regardless
    // of any timestamp data here. Retargeted to a real, existing,
    // already-enriched seed case.
    mergedIntoCaseId: 'S26-4403',
    mergedAt: '2026-07-19T11:30:00.000Z',
    createdAt: '2026-07-19T10:03:00.000Z',
  },
];

// Additional merged entries specifically so the Intraoperative Linkage
// TAT trend (hours from frozen-section creation to actual merge) has
// real data to show — before this, only ONE seed entry had a real
// createdAt/mergedAt pair, nowhere near enough for a 6-month trend.
// TAT durations vary naturally (1.5-9 hours) rather than being
// engineered to show an artificially improving trend over time — that
// would be its own kind of misleading data, just in the other direction.
const MERGED_TAT_SEED: IntraoperativeEntry[] = Array.from({ length: 18 }, (_, i) => {
  const daysAgo = 5 + i * 9; // spreads across roughly the last 165 days (~5.5 months)
  const createdAt = new Date(Date.now() - daysAgo * 86400000);
  const tatHours = 1.5 + ((i * 37) % 90) / 10; // varies 1.5-10.5h, not a designed trend
  const mergedAt = new Date(createdAt.getTime() + tatHours * 3600000);
  const surgeons = ['Dr. Owusu', 'Dr. Faulkner', 'Dr. Reyes'];
  return {
    id: `intraop-tat-${i + 1}`,
    patientMatch: {
      source: i % 2 === 0 ? 'barcode' : 'adt_match',
      patientName: `Seed, Patient${i + 1}`,
      mrn: `MRN-TAT-${1000 + i}`,
      dateOfBirth: '1970-01-01',
      confirmedAt: createdAt.toISOString(),
    },
    performedBy: { userId: `user-tat-${i % 3}`, userName: surgeons[i % 3] },
    orNumber: `OR-${(i % 5) + 1}`,
    surgeon: surgeons[i % 3],
    specimens: [{
      id: `spec-tat-${i + 1}`,
      specimenLabel: `Specimen A`,
      arrivalTimestamp: createdAt.toISOString(),
      milestones: [],
      preparations: [],
    }],
    status: 'merged',
    mergedIntoCaseId: `O26-TAT-${9000 + i}`,
    mergedAt: mergedAt.toISOString(),
    createdAt: createdAt.toISOString(),
  } as IntraoperativeEntry;
});

const load    = (): IntraoperativeEntry[] => storageGet<IntraoperativeEntry[]>(STORAGE_KEY, [...SEED_ENTRIES, ...MERGED_TAT_SEED]);
const persist = (data: IntraoperativeEntry[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

/** Real, robust specimen-letter derivation for real preparation
 *  identifiers (FS-A1, FS-B1, etc.) — the specimen's own POSITION
 *  within the session's specimens[] array (0-indexed -> A, B, C...),
 *  never parsed out of the free-text specimenLabel. Labels are
 *  free-form clinical text ("Specimen A: Left breast, margins") and
 *  parsing them for an "A" would be fragile — this is the same real
 *  index already implied by the seed data's own A/B/C convention, just
 *  computed robustly instead of assumed from text. */
function specimenLetter(entry: IntraoperativeEntry, specimenId: string): string {
  const idx = entry.specimens.findIndex(s => s.id === specimenId);
  const safeIdx = idx === -1 ? 0 : idx;
  return String.fromCharCode(65 + (safeIdx % 26)); // A, B, C... wraps at Z, same as any real 26-letter scheme would need to eventually
}

/** Real, per-(specimen, PreparationType) sequence — the second real
 *  output of the same type on the same specimen is real, distinct
 *  output #2, never reusing #1's identifier. Per direct guidance's own
 *  example format: "FS-A1" for a frozen block (specimen letter +
 *  sequence, no type marker needed since frozen_block is the
 *  historically dominant/default case), "FS-A-TP1" for a touch prep
 *  (specimen letter + explicit type marker + sequence, since a touch
 *  prep needs to be told apart from a frozen block on the same
 *  specimen) — extends the given example's own asymmetry deliberately,
 *  flagged directly as a real, open question rather than assumed
 *  silently correct. */
function generatePreparationIdentifier(entry: IntraoperativeEntry, specimenId: string, type: PreparationType): string {
  const specimen = entry.specimens.find(s => s.id === specimenId);
  const letter = specimenLetter(entry, specimenId);
  const existingOfType = (specimen?.preparations ?? []).filter(p => p.type === type);
  const seq = existingOfType.length + 1;
  if (type === 'frozen_block') return `FS-${letter}${seq}`;
  if (type === 'touch_prep') return `FS-${letter}-TP${seq}`;
  if (type === 'squash_prep') return `FS-${letter}-SQ${seq}`;
  if (type === 'cytology_fluid') return `FS-${letter}-CY${seq}`;
  return `FS-${letter}-GO${seq}`; // gross_only
}

/** Last name only, case-insensitive — "Whitfield, Margaret" -> "whitfield". */
const lastName = (fullName: string) => fullName.split(',')[0].trim().toLowerCase();

/** A session's arrival, for matching purposes, is its earliest specimen's
 *  arrival — the moment the case genuinely started at the bench. */
const sessionArrival = (entry: IntraoperativeEntry): string =>
  entry.specimens.reduce((earliest, s) => s.arrivalTimestamp < earliest ? s.arrivalTimestamp : earliest, entry.specimens[0]?.arrivalTimestamp ?? entry.createdAt);

async function findMatchCandidates(entry: IntraoperativeEntry): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];

  // Real, live query — was CANDIDATE_CASES, a hardcoded 3-entry array
  // with zero connection to actual case data (confirmed during the
  // PHI-redaction/merge-trigger design pass: it could never match a
  // real newly-accessioned case, Assist or Orchestration, unless that
  // case happened to have one of three fabricated MRNs). Now searches
  // real cases across both reporting modes via caseRouter.
  // bypassAccessControl: true — this is an internal matching operation
  // finding which case to fold intraop data into, not data rendered
  // directly to a user; the case itself still goes through normal
  // PHI-redaction when actually displayed (see WorklistTable.tsx's
  // isPoolRestricted et al).
  const casesRes = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true });
  const realCases: CandidateCase[] = (casesRes.ok ? casesRes.data : [])
    .map((c: any) => {
      const mrn = c?.patient?.mrn as string | undefined;
      const familyNames = c?.patient?.familyNames as string | undefined;
      const givenNames  = c?.patient?.givenNames as string | undefined;
      const accessionedAt = c?.accession?.accessionedAt ?? c?.createdAt;
      // requestingProvider is who ORDERED the pathology consult, not
      // necessarily the surgeon who performed the procedure — a
      // reasonable proxy for fuzzy-matching purposes in a system that
      // doesn't separately capture "operating surgeon" on the case
      // record today, not a claim they're clinically the same role.
      const surgeon = c?.order?.requestingProvider as string | undefined;
      if (!mrn || !familyNames || !givenNames || !accessionedAt) return null;
      return {
        caseId: c.id as string,
        patientName: `${familyNames}, ${givenNames}`,
        mrn,
        surgeon: surgeon ?? '',
        accessionedAt,
      };
    })
    .filter((c: CandidateCase | null): c is CandidateCase => c !== null);

  const exact = realCases.find(c => c.mrn === entry.patientMatch.mrn);
  if (exact) {
    candidates.push({ caseId: exact.caseId, matchType: 'mrn_exact', matchReason: 'MRN exact match', confidence: 'high' });
    return candidates; // an exact MRN match is decisive — no need to also surface weaker fuzzy candidates
  }

  const arrival = sessionArrival(entry);
  const fuzzyCandidates: (MatchCandidate & { minutesApart: number })[] = [];
  for (const c of realCases) {
    const sameLastName = lastName(c.patientName) === lastName(entry.patientMatch.patientName);
    const sameSurgeon = !!c.surgeon && c.surgeon.toLowerCase() === entry.surgeon.toLowerCase();
    const minutesApart = Math.abs(new Date(c.accessionedAt).getTime() - new Date(arrival).getTime()) / 60000;
    if (sameLastName && sameSurgeon && minutesApart <= 90) {
      fuzzyCandidates.push({
        caseId: c.caseId,
        matchType: 'fuzzy',
        matchReason: `Last name + surgeon match, accessioned ${Math.round(minutesApart)} min after arrival`,
        confidence: minutesApart <= 30 ? 'high' : 'medium',
        minutesApart,
      });
    }
  }
  // Same real bug, same fix as findEntryMatchesForCase above: this used
  // to return candidates in arbitrary insertion order. Lower severity
  // here specifically — IntraopQueuePage.tsx's openMerge() presents this
  // as a human-reviewed list (MergeModal), not an auto-picked [0] the
  // way AccessionPage.tsx's post-submit check works — but a reviewer
  // should still see genuinely better matches first, not whatever order
  // caseRouter.getAll() happened to return cases in.
  fuzzyCandidates.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
    return a.minutesApart - b.minutesApart;
  });
  candidates.push(...fuzzyCandidates.map(({ minutesApart: _minutesApart, ...c }) => c));
  return candidates;
}

/** The inverse direction of findMatchCandidates — given a case that was
 *  just formally accessioned, find any pending intraop sessions that
 *  might belong to it. Same priority order: MRN exact short-circuits
 *  fuzzy, same 90-minute proximity window. This is what
 *  AccessionPage's post-submit check calls, since a newly-accessioned
 *  case is exactly the moment the original spec describes: "when the
 *  formal order finally arrives from the LIS." */
function findEntryMatchesForCase(caseInfo: { patientName: string; mrn: string; surgeon: string; accessionedAt: string }): EntryMatch[] {
  const pending = load().filter(e => e.status === 'pending');

  const exact = pending.find(e => e.patientMatch.mrn === caseInfo.mrn);
  if (exact) {
    return [{ entry: exact, matchType: 'mrn_exact', matchReason: 'MRN exact match', confidence: 'high' }];
  }

  const matches: (EntryMatch & { minutesApart: number })[] = [];
  for (const e of pending) {
    const sameLastName = lastName(e.patientMatch.patientName) === lastName(caseInfo.patientName);
    const sameSurgeon = e.surgeon.toLowerCase() === caseInfo.surgeon.toLowerCase();
    const minutesApart = Math.abs(new Date(caseInfo.accessionedAt).getTime() - new Date(sessionArrival(e)).getTime()) / 60000;
    if (sameLastName && sameSurgeon && minutesApart <= 90) {
      matches.push({
        entry: e,
        matchType: 'fuzzy',
        matchReason: `Last name + surgeon match, arrived ${Math.round(minutesApart)} min before accession`,
        confidence: minutesApart <= 30 ? 'high' : 'medium',
        minutesApart,
      });
    }
  }
  // Real bug fix: this used to return matches in whatever order pending
  // entries happened to iterate in, not by actual match quality. In a
  // busy OR, it's realistic for the same surgeon to have more than one
  // pending frozen section with the same surname within the same
  // 90-minute window - the caller (AccessionPage.tsx) takes matches[0]
  // as the auto-suggested merge target, so an unsorted array meant it
  // could silently suggest merging the wrong specimen record. Sorted by
  // confidence first, then by closeness in time within the same tier.
  matches.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
    return a.minutesApart - b.minutesApart;
  });
  return matches.map(({ minutesApart: _minutesApart, ...m }) => m);
}

export const mockIntraoperativeService: IIntraoperativeService = {
  async lookupAdtRecord(mrn: string): Promise<ServiceResult<{ patientName: string; dateOfBirth: string } | null>> {
    return ok(ADT_RECORDS[mrn.trim()] ?? null);
  },

  async getAll(): Promise<ServiceResult<IntraoperativeEntry[]>> {
    return ok([...load()]);
  },

  async getPending(): Promise<ServiceResult<IntraoperativeEntry[]>> {
    return ok(load().filter(e => e.status === 'pending'));
  },

  async createSession(input: {
    patientMatch: { source: 'barcode' | 'adt_match'; patientName: string; mrn: string; dateOfBirth?: string };
    performedBy: { userId: string; userName: string };
    orNumber: string;
    surgeon: string;
    clientId?: string;
    locationId?: string;
  }): Promise<ServiceResult<IntraoperativeEntry>> {
    if (!input.patientMatch.patientName.trim() || !input.patientMatch.mrn.trim()) {
      return err('Patient name and MRN are required to start an intraoperative session.');
    }
    const now = new Date().toISOString();
    // Real feature, per direct confirmation: "Let's wire in Facility
    // and Location (Room) for Intraop." Resolves the real display
    // strings once, at session creation, same "cached, avoid an async
    // lookup on every render" reasoning as Case.order.clientName/
    // locationDisplay.
    let clientName: string | undefined;
    let locationDisplay: string | undefined;
    if (input.clientId) {
      const clientRes = await mockFacilityService.getById(input.clientId);
      clientName = clientRes.ok ? clientRes.data.name : undefined;
    }
    if (input.locationId) {
      const locationRes = await mockLocationService.getById(input.locationId);
      locationDisplay = locationRes.ok
        ? [locationRes.data.pointOfCare, locationRes.data.room, locationRes.data.bed].filter(Boolean).join(' / ')
        : undefined;
    }
    const newEntry: IntraoperativeEntry = {
      id: `intraop-${Date.now().toString(36)}`,
      patientMatch: { ...input.patientMatch, confirmedAt: now },
      performedBy: input.performedBy,
      orNumber: input.orNumber.trim(),
      surgeon: input.surgeon.trim(),
      clientId: input.clientId,
      clientName,
      locationId: input.locationId,
      locationDisplay,
      specimens: [],
      status: 'pending',
      createdAt: now,
    };
    const entries = load();
    persist([...entries, newEntry]);
    return ok(newEntry);
  },

  async addSpecimen(sessionId: string, specimenLabel: string): Promise<ServiceResult<IntraoperativeEntry>> {
    if (!specimenLabel.trim()) return err('Specimen label is required.');
    const entries = load();
    const idx = entries.findIndex(e => e.id === sessionId);
    if (idx === -1) return err(`Intraoperative session ${sessionId} not found`);
    const newSpecimen: IntraopSpecimen = {
      id: `spec-${Date.now().toString(36)}`,
      specimenLabel: specimenLabel.trim(),
      arrivalTimestamp: new Date().toISOString(),
      milestones: [],
      preparations: [],
    };
    entries[idx] = { ...entries[idx], specimens: [...entries[idx].specimens, newSpecimen] };
    persist(entries);
    return ok({ ...entries[idx] });
  },

  async getMatchCandidates(entryId: string): Promise<ServiceResult<MatchCandidate[]>> {
    const entry = load().find(e => e.id === entryId);
    if (!entry) return err(`Intraoperative session ${entryId} not found`);
    return ok(await findMatchCandidates(entry));
  },

  async findMatchesForNewCase(caseInfo: { patientName: string; mrn: string; surgeon: string; accessionedAt: string }): Promise<ServiceResult<EntryMatch[]>> {
    return ok(findEntryMatchesForCase(caseInfo));
  },

  async addMilestone(sessionId: string, specimenId: string, milestone: MilestoneType, skipReason?: SkipReason, skipReasonNote?: string, quickGrossText?: string): Promise<ServiceResult<IntraoperativeEntry>> {
    const entries = load();
    const idx = entries.findIndex(e => e.id === sessionId);
    if (idx === -1) return err(`Intraoperative session ${sessionId} not found`);
    const specIdx = entries[idx].specimens.findIndex(s => s.id === specimenId);
    if (specIdx === -1) return err(`Specimen ${specimenId} not found in session ${sessionId}`);
    const specimen = entries[idx].specimens[specIdx];

    // Real, hard gate — unlike touch prep's deliberate "active override"
    // pattern, there's no clinical scenario where Quick Gross can be
    // legitimately skipped the way touch prep can be for dense, fibrotic
    // tissue. Every specimen has some macroscopic appearance that must
    // be recorded before anything else — it's what justifies why that
    // specific tissue got frozen in the first place. Per specimen, not
    // per session — one specimen being further along than another in the
    // same session is normal, not an error.
    const requiresQuickGrossFirst: MilestoneType[] = ['touch_prep_performed', 'touch_prep_skipped', 'frozen_section_cut'];
    if (requiresQuickGrossFirst.includes(milestone)) {
      const hasQuickGross = specimen.milestones.some(m => m.milestone === 'gross_logged') && !!specimen.quickGrossDictation?.trim();
      if (!hasQuickGross) {
        return err('Quick Gross must be logged for this specimen before Touch Prep or Frozen Section Cut — dictate basic dimensions, what was frozen, and orientation first.');
      }
    }
    if (milestone === 'gross_logged' && !quickGrossText?.trim()) {
      return err('Quick Gross requires actual dictation — a timestamp alone isn\u2019t enough to justify what gets frozen next.');
    }

    const newMilestone: MilestoneEntry = {
      id: `m-${Date.now().toString(36)}`, milestone, timestamp: new Date().toISOString(), skipReason, skipReasonNote,
    };
    const updatedSpecimen: IntraopSpecimen = {
      ...specimen,
      milestones: [...specimen.milestones, newMilestone],
      ...(quickGrossText ? { quickGrossDictation: quickGrossText } : {}),
    };
    const updatedSpecimens = [...entries[idx].specimens];
    updatedSpecimens[specIdx] = updatedSpecimen;
    entries[idx] = { ...entries[idx], specimens: updatedSpecimens };
    persist(entries);
    return ok({ ...entries[idx] });
  },

  /** Real, new method, per direct guidance — resolves PS-82's real,
   *  confirmed gap: the itemized, countable record of what was
   *  actually produced at the bench (a specific frozen block, a
   *  specific touch prep slide), distinct from milestones[]'s own
   *  workflow-sequence tracking (see this file's own header and
   *  PreparationOutput's own doc comment for the full reasoning).
   *  identifier is auto-generated (generatePreparationIdentifier
   *  above) when not explicitly given — never left to free-text entry,
   *  so real outputs can never collide. Does NOT require Quick Gross
   *  first the way touch_prep/frozen_section_cut milestones do — a
   *  real preparation output is itself downstream evidence that real
   *  bench work happened; forcing a redundant Quick Gross check here
   *  would just be friction, not a real safeguard. */
  async addPreparationOutput(sessionId: string, specimenId: string, type: PreparationType, identifier?: string): Promise<ServiceResult<IntraoperativeEntry>> {
    const entries = load();
    const idx = entries.findIndex(e => e.id === sessionId);
    if (idx === -1) return err(`Intraoperative session ${sessionId} not found`);
    const specIdx = entries[idx].specimens.findIndex(s => s.id === specimenId);
    if (specIdx === -1) return err(`Specimen ${specimenId} not found in session ${sessionId}`);
    const specimen = entries[idx].specimens[specIdx];

    const realIdentifier = identifier?.trim() || generatePreparationIdentifier(entries[idx], specimenId, type);
    const newOutput: PreparationOutput = {
      id: `p-${Date.now().toString(36)}`, type, identifier: realIdentifier, timestamp: new Date().toISOString(),
    };
    const updatedSpecimen: IntraopSpecimen = {
      ...specimen,
      preparations: [...specimen.preparations, newOutput],
    };
    const updatedSpecimens = [...entries[idx].specimens];
    updatedSpecimens[specIdx] = updatedSpecimen;
    entries[idx] = { ...entries[idx], specimens: updatedSpecimens };
    persist(entries);
    return ok({ ...entries[idx] });
  },

  async setFrozenSectionDiagnosis(sessionId: string, specimenId: string, diagnosis: string, category?: FrozenCategory): Promise<ServiceResult<IntraoperativeEntry>> {
    if (!diagnosis.trim()) return err('Frozen section diagnosis cannot be empty.');
    const entries = load();
    const idx = entries.findIndex(e => e.id === sessionId);
    if (idx === -1) return err(`Intraoperative session ${sessionId} not found`);
    const specIdx = entries[idx].specimens.findIndex(s => s.id === specimenId);
    if (specIdx === -1) return err(`Specimen ${specimenId} not found in session ${sessionId}`);
    const updatedSpecimens = [...entries[idx].specimens];
    updatedSpecimens[specIdx] = {
      ...updatedSpecimens[specIdx],
      frozenSectionDiagnosis: diagnosis.trim(),
      frozenDiagnosisRenderedAt: new Date().toISOString(),
      ...(category ? { frozenCategory: category } : {}),
    };
    entries[idx] = { ...entries[idx], specimens: updatedSpecimens };
    persist(entries);
    return ok({ ...entries[idx] });
  },

  async merge(entryId: string, caseId: string, resolution: MergeResolutionContext): Promise<ServiceResult<IntraoperativeEntry>> {
    const entries = load();
    const idx = entries.findIndex(e => e.id === entryId);
    if (idx === -1) return err(`Intraoperative session ${entryId} not found`);
    entries[idx] = { ...entries[idx], status: 'merged', mergedIntoCaseId: caseId, mergedAt: new Date().toISOString() };
    persist(entries);

    // Real audit trail for the merge decision itself — previously only
    // the entry's own mergedAt/mergedIntoCaseId fields recorded that a
    // merge happened, with no record of HOW the match was resolved
    // (exact vs fuzzy vs manual, confidence, whether a human overrode a
    // suggestion) and no entry in the app's actual audit log at all.
    // A merge links PHI across two records — that's exactly the kind of
    // decision that needs a defensible trail. detail stays PHI-safe per
    // AuditLog's own contract: entryId/caseId (an accession number, not
    // a direct patient identifier) and match metadata only, no patient
    // name/MRN/clinical content.
    const matchTypeLabel = resolution.matchType === 'mrn_exact' ? 'MRN exact match'
      : resolution.matchType === 'fuzzy' ? `fuzzy match (${resolution.confidence ?? 'unknown'} confidence)`
      : 'manual case ID entry';
    await mockAuditService.logEvent({
      type: 'user',
      event: 'Intraop Entry Merged',
      detail: `Entry ${entryId} merged into case ${caseId} — resolved via ${matchTypeLabel}` +
        (resolution.wasManualOverride ? ' (user overrode a system-suggested match)' : ''),
      user: resolution.performedBy,
      caseId,
      confidence: null, // AuditLog.confidence is specifically for AI confidence % — this is a deterministic match algorithm, not an AI model; the descriptive high/medium confidence lives in `detail` instead
    }).catch(() => {}); // never block the merge itself on an audit-log write failure

    return ok({ ...entries[idx] });
  },

  async recordVerbalReport(sessionId: string, note?: string): Promise<ServiceResult<IntraoperativeEntry>> {
    const entries = load();
    const idx = entries.findIndex(e => e.id === sessionId);
    if (idx === -1) return err(`Intraoperative session ${sessionId} not found`);
    entries[idx] = {
      ...entries[idx],
      verbalReportLog: { timestamp: new Date().toISOString(), note: note?.trim() || '(no note recorded)' },
    };
    persist(entries);
    return ok({ ...entries[idx] });
  },
};
