// src/services/cytology/resolveAdvancedCytologySignOutJurisdictionPolicy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own explicit architectural validation:
// "By decoupling Jurisdiction Rules from Provider Credentials, your
// 3-part design naturally scales... without edge-case hardcoding."
// This is real, deliberate defense-in-depth, genuinely separate from
// resolveHasAdvancedSignOutCertification.ts: a credential record
// existing for a jurisdiction is not, by itself, sufficient — this
// function is the independent, real check that the jurisdiction
// itself actually permits non-pathologist abnormal sign-out at all,
// so a data-entry error (a credential mistakenly issued for a
// jurisdiction that doesn't support this exception) can never grant
// real sign-out authority it shouldn't.
//
// Real, per direct guidance's own explicit, confirmed matrix: true
// for UK/NL/DE, false for US/CA/FR/AU/NZ/KR. Real, honest scope: IE
// and BE are NOT in that explicit list — defaulted to false (the
// real, conservative baseline — most jurisdictions require
// pathologist sign-out for abnormal cytology) rather than guessed
// either way.
//
// Real, updated (Sep 2026) per direct guidance's own confirmed
// normalization correction: every permitted jurisdiction's own
// acceptedCredentialTypes now uniformly names the one, canonical
// system capability ("CYTO_ADVANCED_SPECIALIST") — never a raw,
// jurisdiction-specific credential string. The real, raw credential
// names (IBMS_ASD for the UK, NL_KCA_ADVANCED for the Netherlands,
// DE_ZYTO_ASSISTENT_ADV for Germany) are mapped to this one canonical
// capability entirely within resolveNormalizedCredentialCapabilities.ts,
// which resolveHasAdvancedSignOutCertification.ts calls internally —
// this file's own job is only ever "is this jurisdiction permitted,
// and which canonical capability does it require," never the raw
// credential taxonomy itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

export interface AdvancedCytologySignOutJurisdictionPolicy {
  permitted: boolean;
  /** Real, per direct guidance's own named examples. Empty when
   *  `permitted` is false — there is no real credential that could
   *  grant an exception nowhere permitted at all. */
  acceptedCredentialTypes: string[];
}

const POLICY: Partial<Record<Jurisdiction, AdvancedCytologySignOutJurisdictionPolicy>> = {
  // Real, updated (Sep 2026) per direct guidance's own confirmed
  // normalization correction: every real, permitted jurisdiction now
  // uniformly checks for the one, canonical system capability
  // ("CYTO_ADVANCED_SPECIALIST") — the real, raw, jurisdiction-
  // specific credential names (IBMS_ASD, NL_KCA_ADVANCED,
  // DE_ZYTO_ASSISTENT_ADV) are handled entirely by
  // resolveNormalizedCredentialCapabilities.ts's own real mapping,
  // never referenced here directly. This also resolves Germany's own
  // earlier, honest placeholder (an empty accepted-credential list,
  // pending a real German credential name) — that real name is now
  // known and mapped to this same canonical capability.
  GB_EW: { permitted: true, acceptedCredentialTypes: ['CYTO_ADVANCED_SPECIALIST'] },
  GB_SCT: { permitted: true, acceptedCredentialTypes: ['CYTO_ADVANCED_SPECIALIST'] },
  GB_NIR: { permitted: true, acceptedCredentialTypes: ['CYTO_ADVANCED_SPECIALIST'] },
  NL: { permitted: true, acceptedCredentialTypes: ['CYTO_ADVANCED_SPECIALIST'] },
  DE: { permitted: true, acceptedCredentialTypes: ['CYTO_ADVANCED_SPECIALIST'] },
  US: { permitted: false, acceptedCredentialTypes: [] },
  CA: { permitted: false, acceptedCredentialTypes: [] },
  FR: { permitted: false, acceptedCredentialTypes: [] },
  AU: { permitted: false, acceptedCredentialTypes: [] },
  NZ: { permitted: false, acceptedCredentialTypes: [] },
  KR: { permitted: false, acceptedCredentialTypes: [] },
};

const DEFAULT_POLICY: AdvancedCytologySignOutJurisdictionPolicy = { permitted: false, acceptedCredentialTypes: [] };

export function resolveAdvancedCytologySignOutJurisdictionPolicy(jurisdiction: Jurisdiction): AdvancedCytologySignOutJurisdictionPolicy {
  return POLICY[jurisdiction] ?? DEFAULT_POLICY;
}
