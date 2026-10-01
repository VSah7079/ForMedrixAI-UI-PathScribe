// src/services/cytology/resolveImmunocompromisedFactorFromEncounters.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, direct correction to the original scoping for
// CytologyHighRiskFactors.immunocompromised: per direct guidance, this
// status would realistically arrive via a real inbound HL7 ADT/
// Encounter feed — specifically via admission diagnosis (DG1) ICD-10
// codes — not as a field a cytology accessioning clerk manually types
// in. This app already has real, structured infrastructure for
// exactly that: processAdtMessage.ts already parses real DG1 segments
// into EncounterDiagnosis[] and attaches them to a real Encounter
// (services/encounters/), keyed by patientId via
// mockEncounterService.listForPatient(). This resolver is the real,
// missing bridge from that already-real data to this one real
// high-risk criterion.
//
// Real, researched ICD-10-CM code mapping (verified via web search,
// not recalled from memory, given the real clinical/legal stakes of
// getting a medical code mapping wrong) for the four real
// sub-conditions CytologyHighRiskFactors.immunocompromised's own doc
// comment names:
//   - B20      — Human immunodeficiency virus [HIV] disease (single,
//                billable code, no further subdivision)
//   - Z94      — Transplanted organ and tissue status (Z94.0-Z94.9:
//                kidney, heart, lung, liver, bone marrow, and others)
//   - M32      — Systemic lupus erythematosus (M32.0 drug-induced,
//                M32.1x organ involvement, M32.8/M32.9 other/unspecified)
//   - Z79.6    — Long term (current) use of immunomodulators and
//                immunosuppressants (Z79.60-Z79.69: biologics,
//                calcineurin inhibitors, JAK inhibitors, chemotherapy
//                agents, and others)
// Real, deliberate prefix matching rather than an exhaustive leaf-code
// list — ICD-10-CM's own hierarchical structure means every real
// subcode under each of these roots shares the same real clinical
// meaning for this specific purpose, and a new subcode added in a
// future ICD-10-CM revision (as Z79.6's own subcodes were, per the
// 2023 code set expansion) is still correctly caught without this
// mapping needing to be updated.
//
// Real, honest three-way outcome, matching direct guidance's own
// point directly ("you may not have access to that info"):
//   - undefined — this patient has NO real diagnosis data anywhere in
//     this app yet, across every one of their real encounters (no ADT
//     feed exists for their referring source, or none has arrived
//     yet). Genuinely unknown, never defaulted to a reassuring false.
//   - false — real diagnosis data DOES exist for this patient, and
//     genuinely none of it matches. A real, positive negative answer,
//     not an absence of information.
//   - true — a real, qualifying diagnosis code was found.
// ─────────────────────────────────────────────────────────────────────────────

import type { EncounterDiagnosis } from '@/services/encounters/IEncounterService';

const IMMUNOCOMPROMISED_ICD10_PREFIXES = ['B20', 'Z94', 'M32', 'Z79.6'];

function isQualifyingCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return IMMUNOCOMPROMISED_ICD10_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function resolveImmunocompromisedFactorFromEncounters(
  encounters: { diagnoses?: EncounterDiagnosis[] }[],
): boolean | undefined {
  const allDiagnoses = encounters.flatMap(e => e.diagnoses ?? []);
  if (allDiagnoses.length === 0) return undefined;
  return allDiagnoses.some(d => isQualifyingCode(d.code));
}
