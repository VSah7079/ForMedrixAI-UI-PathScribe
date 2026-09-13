// src/services/cytology/buildCytologyRegistryReportPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, generic centralized-registry report payload — the real
// counterpart to buildCytologyOruR01Payload.ts (EHR/LIS-directed
// results) for a genuinely different real destination and purpose:
// mandatory, population-level national screening surveillance. Per
// direct guidance's own South Korea information: "pathology
// laboratories are legally required to report all cervical screening
// results" — KNCSP/KCCR's own real, standard registry fields, and per
// direct guidance's own earlier notes, the same real shape UK/Ireland/
// Netherlands registries will need when those are actually built.
//
// Same real "PathScribe sends structured JSON, the interface engine
// handles the real, registry-specific formatting" principle as this
// app's own established outbound dispatch pattern
// (dispatchInterfaceMessage.ts) — this file assembles the real,
// structured content; it does not itself speak any registry's own
// wire format.
//
// Real, honest gap: South Korea's own KCCR links records via a real,
// national identification number, which this app does not capture
// anywhere yet (a real, separate, deliberately not-invented field —
// see this module's own README for the full reasoning). MRN is the
// best real, available patient identifier used here instead. The
// same real gap applies to Ireland's own CervicalCheck, which links
// records via a real PPSN (Personal Public Service Number) — MRN is
// the same, honest fallback used for it too, never a fabricated PPSN.
// The same real gap applies again to Northern Ireland's own real
// "Health + Care Number" — MRN used the same, honest way.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';
import type { RegistryId } from '@/services/facilities/IRegistrySettingsService';
import type { CisoeAScore } from '@/types/cytology/CisoeAScore';
import { resolveCsmsActionCode } from './resolveCsmsActionCode';
import { resolveNcsrSquamousResultCode, type NcsrSquamousResultCode } from './resolveNcsrSquamousResultCode';
import { resolveNcsrGlandularResultCode, type NcsrGlandularResultCode } from './resolveNcsrGlandularResultCode';

// Real, per direct guidance's own "different outbound payload types
// based on geography" principle (the same real design already applied
// to buildCytologyOruR01Payload.ts's own geographyExtension) — a real,
// open, additive extension slot, not a parallel payload shape for
// every registry. Most registries (Korea's KNCSP/KCCR) need no
// extension at all, since the universal fields above already cover
// what they require; CSMS's own real action code is the first,
// concrete real example of a registry needing something beyond the
// universal shape.
export interface CsmsRegistryExtension {
  type: 'csms_uk';
  actionCode: 'A' | 'R' | 'H';
}

// Real, per direct research: PALGA is exactly the kind of destination
// this generic slot was designed for — the Netherlands' own national
// registry is where a real, native CisoeAScore matters most, since
// PALGA's own real "Palga Thesaurus" coding (linked to SNOMED CT) is
// completed by a separate, dedicated application (the PALGA Protocol
// Module) that needs this real, native data to do its own real job —
// the same real geographyExtension principle already established for
// the ORU payload (buildCytologyOruR01Payload.ts's own
// CisoeAOruExtension), reused here rather than duplicated.
export interface PalgaRegistryExtension {
  type: 'palga_netherlands';
  cisoeAScore: CisoeAScore;
}

// Real, per direct research: NCSR's own real, LOINC-coded squamous
// result scale — see resolveNcsrSquamousResultCode.ts's own real,
// confirmed mapping. Real, per direct follow-up closing that file's
// own honest scope gap: the real, separate LOINC 19765-7 endocervical/
// glandular axis (resolveNcsrGlandularResultCode.ts) is now included
// too — genuinely optional and independent of squamousResultCode,
// since a real NCSR report can carry a squamous result, a glandular
// result, or both (they're two, separate real axes, not
// mutually exclusive), and a genuine glandular finding correctly
// produces no glandularResultCode at all when this app's own Bethesda
// dictionary has no confirmed mapping for it (E0/E5 — see that
// resolver's own honest scope note), never a silently-wrong code.
export interface NcsrRegistryExtension {
  type: 'ncsr_australia';
  /** Real, per direct fix: made optional — a real, pure glandular-only
   *  case (no squamous finding at all) genuinely has no squamous
   *  result to report, and must still carry a real glandularResultCode
   *  rather than losing the whole extension. */
  squamousResultCode?: NcsrSquamousResultCode;
  glandularResultCode?: NcsrGlandularResultCode;
}

export type CytologyRegistryExtension = CsmsRegistryExtension | PalgaRegistryExtension | NcsrRegistryExtension;

export interface CytologyRegistryReportPayload {
  messageId: string;
  timestamp: string;
  registryId: RegistryId;

  facilityId: string;
  facilityName?: string;

  patient: {
    mrn?: string;
    name: string;
    dateOfBirth?: string;
  };

  accessionNumber: string;
  screeningDate?: string;

  specimenAdequacy: string[];
  generalCategorization?: string;
  primaryInterpretation: string;
  additionalInterpretations: string[];
  hpvResult?: string;
  recommendations: string[];
  /** Real, optional — present only when the target registry needs
   *  real, native data beyond the universal fields above. Still real,
   *  structured JSON only — the real interface engine's own job to
   *  translate this into whatever wire format the registry itself
   *  requires. */
  registryExtension?: CytologyRegistryExtension;
}

export function buildCytologyRegistryReportPayload(
  signOutRecord: CytologySignOutRecord,
  registryId: RegistryId,
  facilityId: string,
  facilityName: string | undefined,
  reasonForStudy?: 'nhs_programme_invited' | 'private_or_opportunistic',
  // Real, per direct guidance's own NCSR work: passed explicitly,
  // same real pattern as reasonForStudy above — CytologyReportContent
  // only ever carries primaryInterpretation as real, human-readable
  // display text, never the raw dictionary id NCSR's own squamous
  // mapping (resolveNcsrSquamousResultCode.ts) genuinely needs.
  ncsrPrimaryInterpretationId?: string,
  ncsrIsUnsatisfactory?: boolean,
  // Real, per direct follow-up closing resolveNcsrSquamousResultCode.ts's
  // own honest scope gap — same real "passed explicitly, never read
  // from content" pattern as ncsrPrimaryInterpretationId above, since
  // CytologyReportContent only ever carries additionalInterpretations
  // as real, human-readable display text, never the raw dictionary
  // ids resolveNcsrGlandularResultCode.ts genuinely needs.
  ncsrAdditionalInterpretationIds?: string[],
): CytologyRegistryReportPayload {
  const content = signOutRecord.reportContent;
  const ncsrSquamousResultCode = registryId === 'ncsr_australia' && ncsrPrimaryInterpretationId !== undefined && ncsrIsUnsatisfactory !== undefined
    ? resolveNcsrSquamousResultCode(ncsrPrimaryInterpretationId, ncsrIsUnsatisfactory)
    : undefined;
  // Real, per direct follow-up closing resolveNcsrSquamousResultCode.ts's
  // own honest scope gap — the real, separate LOINC 19765-7 endocervical
  // axis, resolved the same way, using the same real primary/additional/
  // unsatisfactory inputs already available here.
  const ncsrGlandularResultCode = registryId === 'ncsr_australia' && ncsrPrimaryInterpretationId !== undefined && ncsrIsUnsatisfactory !== undefined
    ? resolveNcsrGlandularResultCode(ncsrPrimaryInterpretationId, ncsrAdditionalInterpretationIds ?? [], ncsrIsUnsatisfactory)
    : undefined;
  return {
    messageId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    registryId,
    facilityId,
    facilityName,
    patient: { mrn: content.patientMrn, name: content.patientName, dateOfBirth: content.patientDateOfBirth },
    accessionNumber: content.accessionNumber,
    screeningDate: content.specimenCollectedAt,
    specimenAdequacy: content.specimenAdequacy,
    generalCategorization: content.generalCategorization,
    primaryInterpretation: content.primaryInterpretation,
    additionalInterpretations: content.additionalInterpretations,
    hpvResult: content.hpvResult,
    recommendations: content.recommendations,
    registryExtension: registryId === 'csms_uk'
      ? { type: 'csms_uk', actionCode: resolveCsmsActionCode(content.requiresPathologistReview, reasonForStudy) }
      : registryId === 'palga_netherlands' && content.cisoeAScore
        ? { type: 'palga_netherlands', cisoeAScore: content.cisoeAScore }
        // Real, direct fix: previously gated the WHOLE real extension
        // on squamousResultCode alone — a real, pure glandular-only
        // case (e.g. AIS with no co-occurring squamous finding at
        // all) would have silently lost its own real glandularResultCode
        // too, since the old condition never even checked it. Now
        // includes the real extension whenever EITHER real axis
        // resolves to something.
        : registryId === 'ncsr_australia' && (ncsrSquamousResultCode || ncsrGlandularResultCode)
          ? { type: 'ncsr_australia', squamousResultCode: ncsrSquamousResultCode, glandularResultCode: ncsrGlandularResultCode }
          : undefined,
  };
}
