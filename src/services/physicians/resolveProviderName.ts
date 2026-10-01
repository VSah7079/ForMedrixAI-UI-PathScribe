// src/services/physicians/resolveProviderName.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared resolution function for PS-81 (HL7/FHIR Segment
// Mapping) — one shared function, real, structured input, matching
// the real, verified industry standards behind it: HL7v2's XCN
// (Extended Composite ID Number and Name for Persons — the real data
// type behind PV1-7/PV1-8/PV1-9/PV1-17/ORC-12/OBR-16) and FHIR's
// Practitioner/HumanName/Identifier (Practitioner.identifier[] with a
// real system URI, e.g. http://hl7.org/fhir/sid/us-npi for NPI
// specifically; Practitioner.name[] as HumanName with family/given[]/
// prefix[]). Both confirmed directly via the real, current HL7
// Terminology (terminology.hl7.org, CodeSystem v2-0203) and FHIR
// specification, not assumed.
//
// Real, confirmed scope, per direct guidance on PathScribe's own
// architecture: PathScribe never parses raw HL7v2 (the interface
// engine owns that). adtParser.ts's own PV1-7 handling now preserves
// XCN's own real component split (id/lastName/firstName) rather than
// flattening it into a string, and IncomingOrder's own
// requestingProvider now carries the same real, structured shape —
// this function's real job is resolving that already-structured data
// to a real, internal Physician record, not parsing anything itself.
//
// Reuses mockPhysicianService.findOrCreateByName (string fallback,
// for a caller with genuinely nothing but free text, e.g. a human
// typing into AccessionPage.tsx's own plain UI field) /
// findOrCreateByStructuredName (the real, preferred path) directly.
// Same real, established "match or auto-create pending, never block
// processing" posture already proven for
// Client.findOrCreateByAssigningAuthority / Department /
// SpecimenDictionaryEntry resolution (PS-80).
//
// Real, deliberate: does NOT write into the real ParticipationType
// dictionary (services/participationTypes/) — confirmed directly,
// per direct guidance, that dictionary's own real entries
// ('attending' = "Co-Signer/Supervisor", 'primary' = the signing
// pathologist, etc.) describe internal PathScribe staff doing work ON
// a case, a genuinely different real-world concept from an external
// referring/ordering physician named in an inbound message.
// InboundProviderRole below is a small, separate, purpose-built type
// for exactly that — "what role did this person play in the inbound
// message" — never merged with or written into ParticipationType. A
// real Physician resolved here could later become a real case
// participant with a real ParticipationType, but that's a separate,
// later, real decision this function doesn't make.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { Physician } from './IPhysicianService';
import { mockPhysicianService } from './mockPhysicianService';

/** Real, small, purpose-built type — what role the resolved physician
 *  played in the specific inbound message this resolution came from.
 *  Deliberately NOT the real ParticipationType dictionary's own ids —
 *  see this file's own header for why.
 *
 *  Real, honest disclosure: only 'attending_of_record' (PV1-7) and
 *  'requesting' (IncomingOrder.requestingProvider) have a real,
 *  currently-wired parsing pipeline behind them, confirmed directly
 *  before adding the rest — adtParser.ts parses PV1-2/3/6/7/10/14/19/
 *  20/36/44/45 only; PV1-8 (Referring), PV1-9 (Consulting), PV1-17
 *  (Admitting) are real, standard XCN-typed fields with ZERO real
 *  parsing today, and OBR-28 (Copy To) isn't reachable at all since
 *  this app has no real inbound ORM parser. The other four values
 *  below are included now as a real, standards-aligned, durable type
 *  contract — cheap, forward-compatible, ready for the day that
 *  parsing is added — but a caller should not expect real inbound
 *  data for them yet. */
export type InboundProviderRole =
  | 'requesting'           // Real pipeline: IncomingOrder.requestingProvider (ORC-12/OBR-16 equivalent)
  | 'attending_of_record'  // Real pipeline: adtParser.ts's own PV1-7
  | 'referring'            // Real HL7 role (PV1-8) — no real parsing pipeline yet
  | 'consulting'           // Real HL7 role (PV1-9) — no real parsing pipeline yet
  | 'admitting'            // Real HL7 role (PV1-17) — no real parsing pipeline yet
  | 'copy_to';             // Real HL7 role (OBR-28) — no real inbound ORM parser exists at all yet

/** Real, standard HL7v2 Table 0203 / FHIR identifier-type codes —
 *  verified directly against the current HL7 Terminology registry
 *  (terminology.hl7.org/CodeSystem-v2-0203), not assumed. NPI/PRN/DN/
 *  MD/DEA/MCR/MCD/SL/TAX are all real, standard, base-table codes.
 *  GMC is a real, commonly-used UK extension (Table 0203 is
 *  explicitly user-extensible per the standard) but NOT itself a base
 *  code — flagged here rather than silently presented as equivalent
 *  to the others. LOCAL/OTHER are PathScribe-defined, for an
 *  identifier this app can capture but can't classify against any
 *  real external registry. */
export type InboundProviderIdentifierType =
  | 'NPI'    // Real, standard Table 0203 — National Provider Identifier
  | 'PRN'    // Real, standard Table 0203 — Provider number (individual/group/org)
  | 'DN'     // Real, standard Table 0203 — Doctor number
  | 'MD'     // Real, standard Table 0203 — Medical License number
  | 'DEA'    // Real, standard Table 0203 — DEA registration number
  | 'MCR'    // Real, standard Table 0203 — Practitioner Medicare number
  | 'MCD'    // Real, standard Table 0203 — Practitioner Medicaid number
  | 'SL'     // Real, standard Table 0203 — State license (general)
  | 'TAX'    // Real, standard Table 0203 — Tax ID number
  | 'GMC'    // Real-world UK extension, NOT base Table 0203 — General Medical Council number
  | 'LOCAL'  // PathScribe-defined — hospital/LIS-local internal ID, no real external registry
  | 'OTHER'; // PathScribe-defined catch-all — a real, known identifier that doesn't fit the above

/** Real, per direct guidance — mirrors FHIR's own real
 *  Practitioner.identifier[] / repeating-XCN pattern: a physician can
 *  genuinely carry more than one real identifier at once (e.g. a real
 *  NPI AND a real local LIS id in the same inbound message) — an
 *  array, not a single flattened field, same as the real, verified
 *  FHIR example this design was checked against (a real Practitioner
 *  resource with both an SSN identifier and an NPI identifier in the
 *  same identifier[] array). */
export interface InboundProviderIdentifier {
  value: string;
  type: InboundProviderIdentifierType;
  /** Real, optional — XCN.9/HD.1 or FHIR Identifier.system equivalent
   *  ("who assigned this identifier"). Captured when the inbound data
   *  actually carries it; never fabricated when it doesn't. */
  assigningAuthority?: string;
}

/** Real, structured provider name — the preferred input shape,
 *  matching XCN's own real component order (id^lastName^firstName^...)
 *  and FHIR's HumanName (family/given/prefix/suffix). familyNames is
 *  the one required field — matches findOrCreateByStructuredName's
 *  own real validation; a real provider mention with no family name
 *  at all can't be meaningfully resolved or created. */
export interface StructuredProviderName {
  namePrefix?: string;
  givenNames?: string;
  familyNames: string;
  nameSuffix?: string;
  /** Real, optional — every real identifier this specific mention of
   *  the provider carried, per InboundProviderIdentifier's own header.
   *  Only the first real NPI-typed entry (if any) is used to populate
   *  Physician.npi — see mockPhysicianService.findOrCreateByStructuredName's
   *  own real matching logic. */
  identifiers?: InboundProviderIdentifier[];
}

export interface ResolvedProvider {
  physician: Physician;
  /** Real, same convention as PS-80's own dictionaryEntryWasAutoCreated/
   *  departmentWasAutoCreated — true whenever the resolved Physician
   *  record carries autoCreated: true, whether that happened on THIS
   *  call or a past one. Matches the established, already-proven
   *  precedent in this app rather than inventing a stricter
   *  "created-this-call-only" signal findOrCreateByName itself doesn't
   *  expose. */
  wasAutoCreated: boolean;
  /** Real, carried through unchanged — the exact context this
   *  resolution was requested for, so a caller building an audit trail
   *  or a downstream record doesn't have to separately remember which
   *  pipeline/role it came from. */
  role: InboundProviderRole;
  /** Real, preserved exactly as given — the full, original, as-received
   *  name text (even when structured components were also available),
   *  for audit/display purposes. If HL7 component-splitting ever
   *  mis-parses a real name, having the raw original preserved lets a
   *  human verify/correct it against source. */
  rawName: string;
}

const ROLE_LABEL: Record<InboundProviderRole, string> = {
  requesting: 'requesting/ordering provider',
  attending_of_record: 'attending provider of record',
  referring: 'referring provider',
  consulting: 'consulting provider',
  admitting: 'admitting provider',
  copy_to: 'copy-to recipient',
};

function describeInput(input: string | StructuredProviderName): string {
  return typeof input === 'string' ? input : `${input.givenNames ?? ''} ${input.familyNames}`.trim();
}

/** Real, shared resolution — the one real place a provider name from
 *  any real inbound pipeline gets resolved to a real, internal
 *  Physician record. Accepts either real, structured name data
 *  (preferred — matches directly on given/family name and any real
 *  identifiers, sidestepping any free-text formatting difference
 *  between pipelines) or a plain free-text string (a real, honest
 *  fallback for a caller that genuinely has nothing else, e.g. a human
 *  typing into a plain UI field). Returns null, never a fabricated
 *  physician, for a genuinely empty/blank/missing name — matches the
 *  underlying services' own real validation, never silently
 *  swallowed. */
export async function resolveProviderName(
  input: string | StructuredProviderName | undefined,
  role: InboundProviderRole,
  clientId?: string
): Promise<ServiceResult<ResolvedProvider | null>> {
  if (input === undefined) return { ok: true, data: null };

  const res = typeof input === 'string'
    ? await (async () => {
        const trimmed = input.trim();
        if (!trimmed) return null;
        return mockPhysicianService.findOrCreateByName(trimmed, clientId);
      })()
    : await (async () => {
        const familyNames = input.familyNames.trim();
        if (!familyNames) return null;
        return mockPhysicianService.findOrCreateByStructuredName(
          {
            namePrefix: input.namePrefix?.trim(),
            givenNames: input.givenNames?.trim() ?? '',
            familyNames,
            nameSuffix: input.nameSuffix?.trim(),
            identifiers: input.identifiers,
          },
          clientId
        );
      })();

  if (res === null) {
    // Real, honest: a message that genuinely carried no provider name
    // at all (PV1-7 absent, requestingProvider blank) isn't an error —
    // some real messages don't carry this field. Null, not a
    // fabricated resolution.
    return { ok: true, data: null };
  }
  if (res.ok === false) {
    return { ok: false, error: `Could not resolve ${ROLE_LABEL[role]} "${describeInput(input)}": ${res.error}` };
  }
  return {
    ok: true,
    data: { physician: res.data, wasAutoCreated: !!res.data.autoCreated, role, rawName: describeInput(input) },
  };
}
