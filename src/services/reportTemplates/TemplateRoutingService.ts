// src/services/reportTemplates/TemplateRoutingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Resolves the correct Case Report Template for an Outreach case.
//
// Priority:
//   1. Synoptic protocol template ID (most specific — encodes subspecialty + procedure)
//   2. Subspecialty ID fallback
//   3. Gold standard (universal fallback)
//
// Real, per direct guidance ("Report Template by facility, if none
// defined then it looks at the Enterprise definitions"): Pass 0 (Facility
// override) now has a real Enterprise-level fallback (Pass 0a) — an
// affiliate facility with no own override rolls up to its real
// Enterprise parent's own rule, one hop, same established pattern as
// resolveInterfaceEngineConnectionForFacility/resolveLisRoutingForFacility/
// resolveIdentifierFormatsForFacility (services/facilities/IFacilityService.ts).
// An Enterprise's own rule is just an ordinary 'client'-type RoutingRule
// keyed on its own facility id — no new admin UI or storage needed;
// RoutingRulesTab.tsx's existing client picker already lists every real
// facility, Enterprise or affiliate alike.
//
// If multiple synoptic protocols on a single case resolve to different report
// templates (multi-organ case), `ambiguous: true` is returned and `candidates`
// lists all qualifying template IDs.  The caller should surface the choice to
// the pathologist via the Sequencer or case header dropdown.
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateRoutingInput {
  /** Subspecialty ID from the case or order (e.g. 'breast', 'gi') */
  subspecialtyId?: string;
  /** Synoptic template IDs from synopticReports[].templateId */
  synopticTemplateIds?: string[];
  /** Performing/receiving facility ID — enables facility-specific template overrides */
  performingFacilityId?: string;
  /**
   * Real, per direct guidance ("Report Template by facility, if none
   * defined then it looks at the Enterprise definitions"): the real
   * Enterprise parent (Facility.parentId) that performingFacilityId
   * itself rolls up to, if any — resolved by the caller via the same,
   * already-established single-hop Facility hierarchy
   * resolveInterfaceEngineConnectionForFacility/
   * resolveLisRoutingForFacility/resolveIdentifierFormatsForFacility
   * already use (services/facilities/IFacilityService.ts), never
   * guessed or walked here. An Enterprise-type facility itself has no
   * further parent to roll up to — that case is expected to leave this
   * undefined, since Pass 0's own direct performingFacilityId lookup
   * already covers an Enterprise's own rule.
   */
  enterpriseFacilityId?: string;
  /** Ordering physician ID — enables physician-preference overrides */
  orderingPhysicianId?: string;
  /** Real, per direct follow-up ("TemplateRoutingService doesn't
   *  select Preliminary vs. Final templates by CaseStatus yet") — the
   *  case's own current, real CaseStatus (types/case/CaseStatus.ts).
   *  PS-292's own decision: stay strict, a report is Preliminary
   *  until the case is genuinely done — see resolveIsFinalStatus
   *  below for the exact, real definition of "genuinely done" this
   *  applies. Optional, and genuinely opt-in: an omitted value skips
   *  this pass entirely (this caller hasn't been updated to
   *  participate in Preliminary/Final routing yet) and resolution
   *  proceeds exactly as it did before this field existed — never a
   *  forced Preliminary default on missing data.
   */
  caseStatus?: import('../../types/case/CaseStatus').CaseStatus;
}

/**
 * Real, per PS-292's own "stay strict" decision: a report is
 * Preliminary until the case's real status is genuinely done — not a
 * literal string match against only 'finalized'. Checked the real
 * CaseStatus lifecycle directly (types/case/CaseStatus.ts) rather than
 * assuming: 'pending-release' comes AFTER 'finalized' in the real
 * sequence (the attending has genuinely completed sign-out — its own
 * doc comment confirms Case.finalizedAt is already stamped the moment
 * a case enters this status — it's held back only from EXTERNAL
 * dispatch for the recall window, not from being a genuinely final
 * report). Treating it as still-Preliminary would be wrong: the
 * content is done, only release is pending. 'closed' is the real
 * terminal state after that. Every earlier status in the real
 * lifecycle (including 'pending-countersign', per PS-292's own
 * explicit decision) stays Preliminary.
 */
export function resolveIsFinalStatus(status: import('../../types/case/CaseStatus').CaseStatus | undefined): boolean {
  return status === 'finalized' || status === 'pending-release' || status === 'closed';
}

export interface TemplateRoutingResult {
  /** Resolved Case Report Template ID */
  templateId: string;
  /** True when >1 distinct templates qualify — caller should prompt the pathologist */
  ambiguous: boolean;
  /** All qualifying template IDs in priority order */
  candidates: string[];
  /** How the template was resolved */
  resolvedBy: 'preliminary-status' | 'protocol' | 'client-override' | 'client-override-enterprise' | 'physician-preference' | 'subspecialty' | 'gold-standard';
}

// ── Synoptic protocol → Case Report Template ─────────────────────────────
// Key = synopticReports[].templateId value in real case data — these MUST
// match the IDs actually seeded in templateService.ts's editorStore
// (editorStore.set('breast_invasive', ...) etc.) — NOT an invented naming
// convention. Previously this map used fictitious 'cap-xxx-resection' style
// keys that didn't match any real protocol ID anywhere in the codebase,
// which meant Pass 1 (the most specific, highest-priority match) could
// never fire against real data. Re-keyed against the authoritative list
// in templateService.ts as of June 2026, and again in July 2026 when the
// former RCPath-derived templates were renamed as part of the CAP/RCPath
// content-licensing cleanup (e.g. rcpath_g148_breast_surgical_excision ->
// breast_surgical_excision, rcpath_colorectal_resection ->
// colorectal_resection_b) — see templateService.ts for the full mapping.
//
// MAINTENANCE: if a new protocol is added to templateService.ts's
// editorStore, it must also be added here (or routed to gold-standard by
// omission) — these two files are not otherwise kept in sync automatically.
// Value = Case Report Template ID (see mockReportTemplateService)

const PROTOCOL_TO_REPORT: Record<string, string> = {
  // Breast
  'breast_invasive':                          'tmpl-breast',
  'breast_dcis_resection':                    'tmpl-breast',
  'breast_surgical_excision':                  'tmpl-breast',

  // Gastrointestinal
  'colon_resection':                          'tmpl-gi',
  'colorectal_resection_b':                    'tmpl-gi',
  'colorectal_local_excision':                'tmpl-gi',
  'colorectal_further_investigations':        'tmpl-gi',

  // Thoracic / Pulmonary
  'lung_adeno':                                'tmpl-thoracic',
  'lung_resection':                            'tmpl-thoracic',

  // Urological (includes renal — no dedicated renal template exists)
  'prostate_needle_biopsy':                    'tmpl-uro',
  'prostate_resection':                        'tmpl-uro',
  'prostate_biopsy':                           'tmpl-uro',
  'prostate_radical_prostatectomy':            'tmpl-uro',
  'prostate_turp_enucleation':                 'tmpl-uro',
  'kidney_resection':                          'tmpl-uro',
  'kidney_biopsy':                             'tmpl-uro',
  'wilms_resection':                           'tmpl-uro',
  'wilms_biopsy':                              'tmpl-uro',

  // Dermatopathology — no dedicated derm template exists yet
  'skin_melanoma_bx':                          'tmpl-gold-standard',
  'skin_invasive_melanoma_biopsy':             'tmpl-gold-standard',
};

// ── Subspecialty → Case Report Template fallback ─────────────────────────────

const SUBSPECIALTY_TO_REPORT: Record<string, string> = {
  'breast':        'tmpl-breast',
  'gi':            'tmpl-gi',
  'thoracic':      'tmpl-thoracic',
  'uro':           'tmpl-uro',
  'derm':          'tmpl-gold-standard',
  'neuro':         'tmpl-gold-standard',
  'heme':          'tmpl-gold-standard',
  'gyn':           'tmpl-gold-standard',
  'oncology-pool': 'tmpl-gold-standard',
};

// ── Protocol → Subspecialty derivation (fallback only) ───────────────────────
// Case.subspecialtyId is the correct, durable source for Pass 2 once it's
// populated upstream (e.g. at case triage). Until then, this lets Pass 2
// still do something useful by deriving a subspecialty from whatever
// synoptic protocol the case already has — covering, in particular, the
// case where a protocol exists but isn't (yet) in PROTOCOL_TO_REPORT above, so
// it doesn't fall all the way through to Gold Standard unnecessarily.
// Keys are the real protocol IDs from templateService.ts's editorStore —
// same groupings as the Admin Guide's Appendix B.

const PROTOCOL_TO_SUBSPECIALTY: Record<string, string> = {
  'breast_invasive':                         'breast',
  'breast_dcis_resection':                   'breast',
  'breast_surgical_excision':                'breast',
  'colon_resection':                         'gi',
  'colorectal_resection_b':                  'gi',
  'colorectal_local_excision':               'gi',
  'colorectal_further_investigations':       'gi',
  'lung_adeno':                               'thoracic',
  'lung_resection':                           'thoracic',
  'prostate_needle_biopsy':                   'uro',
  'prostate_resection':                       'uro',
  'prostate_biopsy':                          'uro',
  'prostate_radical_prostatectomy':           'uro',
  'prostate_turp_enucleation':                'uro',
  'kidney_resection':                         'uro',
  'kidney_biopsy':                            'uro',
  'wilms_resection':                          'uro',
  'wilms_biopsy':                             'uro',
  'skin_melanoma_bx':                         'derm',
  'skin_invasive_melanoma_biopsy':            'derm',
};

/**
 * Best-effort subspecialty derivation from a case's synoptic protocol IDs,
 * used only when Case.subspecialtyId itself isn't set. Returns the first
 * recognized mapping, or undefined if none of the given IDs are recognized.
 */
export function deriveSubspecialtyFromProtocols(synopticTemplateIds: string[] | undefined): string | undefined {
  for (const id of (synopticTemplateIds ?? [])) {
    const sub = PROTOCOL_TO_SUBSPECIALTY[id];
    if (sub) return sub;
  }
  return undefined;
}

// ── Facility-specific template overrides ───────────────────────────────────────
// Key = facilityId from order.facilityId
// Value = Case Report Template ID
// Used when a specific facility always requires a particular template format
// regardless of specimen type (e.g. a paediatric hospital always uses a
// custom paediatric template).
// Admins manage this via System → Template Routing Rules (future Config screen).

const FACILITY_TO_REPORT: Record<string, string> = {
  // Example: 'FACILITY-PAED': 'tmpl-paediatric',
  // Add facility-specific overrides here or load from config
};

// ── Physician preference overrides ───────────────────────────────────────────
// Key = requestingProvider / physician ID
// Value = Case Report Template ID
// Rarely needed — most routing should be by protocol or subspecialty.

const PHYSICIAN_TO_REPORT: Record<string, string> = {
  // Example: 'PATH-UK-001': 'tmpl-breast',
};

// ── Trace types — full per-pass evaluation record ─────────────────────────────
// Used by the Routing Rules admin UI's Test panel to show what happened at
// every pass, not just which one won.

export interface TemplateRoutingPassTrace {
  pass: TemplateRoutingResult['resolvedBy'];
  /** False if a higher-priority pass already matched — this pass never ran */
  reached: boolean;
  /** False if there was no input value to check against this pass at all */
  inputProvided: boolean;
  matched: boolean;
  /** Human-readable explanation of what was checked and why it did/didn't match */
  detail: string;
}

export interface TemplateRoutingTrace {
  result: TemplateRoutingResult;
  passes: TemplateRoutingPassTrace[];
}

// ── Resolver ─────────────────────────────────────────────────────────────────
// Three versions, all delegating to the same trace logic so they can never
// drift apart:
//   resolveReportTemplate()        — sync, uses hardcoded maps (build-time default)
//   resolveReportTemplateAsync()   — async, loads admin rules from service first
//   traceReportTemplateResolution() — sync, returns the full per-pass trace

export function traceReportTemplateResolution(input: TemplateRoutingInput): TemplateRoutingTrace {
  const passes: TemplateRoutingPassTrace[] = [];
  let resolved: TemplateRoutingResult | null = null;

  // Pass -1 — Preliminary status gate. Real, per direct follow-up and
  // PS-292's own "stay strict" decision: reached before every other
  // pass, since Preliminary-vs-Final is a more fundamental distinction
  // than which specific subspecialty Final template applies — a case
  // that isn't done yet needs the group Preliminary template
  // regardless of what a facility/physician/protocol override would
  // otherwise have picked for its eventual Final report.
  //
  // Real, deliberate default: caseStatus is optional, and an omitted
  // value means "this caller hasn't been updated to participate in
  // Preliminary/Final routing yet" — same convention as every other
  // pass in this file skipping itself when its own input is absent
  // (Pass 0 on performingFacilityId, Pass 2 on subspecialtyId), not a
  // forced Preliminary default. Confirmed directly against this
  // file's own existing test suite: treating "omitted" as "assume
  // Preliminary" broke 6 of 9 pre-existing tests that call this
  // resolver without ever mentioning status at all — the correct
  // reading of "optional" here is "opts out of this pass," not "opts
  // into the safest-sounding outcome."
  //
  // Real, honest scope limit: resolves directly to the one, real Surg
  // Path Preliminary template (tmpl-prelim-surgpath) — this service is
  // only ever called from Surg Path's own contextBuilder.ts today
  // (confirmed directly: Cytology's own sign-out never calls this
  // service at all, a separate, already-flagged gap on PS-292), so
  // that's the only group template this routing can actually reach.
  // Does not yet support a facility-specific Preliminary override the
  // way Pass 0 does for Final templates — a real, separate enhancement
  // if a site ever needs its own, cloned Preliminary template routed
  // to automatically, not assumed solved by this fix.
  if (input.caseStatus !== undefined) {
    const isFinal = resolveIsFinalStatus(input.caseStatus);
    if (!isFinal) {
      resolved = { templateId: 'tmpl-prelim-surgpath', ambiguous: false, candidates: ['tmpl-prelim-surgpath'], resolvedBy: 'preliminary-status' };
      passes.push({ pass: 'preliminary-status', reached: true, inputProvided: true, matched: true,
        detail: `Case status '${input.caseStatus}' is not yet final — routed to Preliminary template` });
    } else {
      passes.push({ pass: 'preliminary-status', reached: true, inputProvided: true, matched: false,
        detail: `Case status '${input.caseStatus}' is genuinely final — proceeding to Final-report template resolution` });
    }
  } else {
    passes.push({ pass: 'preliminary-status', reached: true, inputProvided: false, matched: false,
      detail: 'No case status provided by this caller — Preliminary/Final routing not applicable, proceeding to Final-report template resolution as before' });
  }

  const facilityMap      = { ...FACILITY_TO_REPORT,    ...((input as any)._facilityOverrides      ?? {}) };
  const physicianMap   = { ...PHYSICIAN_TO_REPORT, ...((input as any)._physicianOverrides   ?? {}) };
  // Admin-defined protocol mappings take precedence over the hardcoded
  // fallback map — lets an admin self-service a new/changed protocol
  // mapping from Routing Rules without a code deploy.
  const protocolMap = { ...PROTOCOL_TO_REPORT, ...((input as any)._protocolOverrides ?? {}) };

  // Pass 0 — Facility override. Real fix: this pass never checked
  // `!resolved` before running — safe when it was the very first real
  // pass (nothing could have set `resolved` yet), but Pass -1 above
  // now genuinely can, and without this guard it would silently
  // overwrite a real Preliminary-status resolution with whatever this
  // pass found, defeating the whole point of Pass -1 running first.
  if (!resolved) {
    const provided = !!input.performingFacilityId;
    const mapped = provided ? facilityMap[input.performingFacilityId!] : undefined;
    if (mapped) {
      resolved = { templateId: mapped, ambiguous: false, candidates: [mapped], resolvedBy: 'client-override' };
      passes.push({ pass: 'client-override', reached: true, inputProvided: true, matched: true,
        detail: `${input.performingFacilityId} → ${mapped}` });
    } else {
      passes.push({ pass: 'client-override', reached: true, inputProvided: provided, matched: false,
        detail: provided ? `${input.performingFacilityId} — no override rule defined` : 'No performing facility specified' });
    }
  } else {
    passes.push({ pass: 'client-override', reached: false, inputProvided: false, matched: false, detail: 'Not reached — higher-priority pass already matched' });
  }

  // Pass 0a — Enterprise-level facility override. Real, per direct
  // guidance: only checked when the facility-specific lookup above
  // found nothing — an affiliate's own real override, once it has one,
  // always wins over its Enterprise's. enterpriseFacilityId is real,
  // resolved data the caller already looked up (see this file's own
  // resolveReportTemplateAsync below) — this pass only ever performs
  // the SAME facilityMap lookup a second time with a different id,
  // never invents a separate map or a different resolution rule.
  if (!resolved) {
    const provided = !!input.enterpriseFacilityId;
    const mapped = provided ? facilityMap[input.enterpriseFacilityId!] : undefined;
    if (mapped) {
      resolved = { templateId: mapped, ambiguous: false, candidates: [mapped], resolvedBy: 'client-override-enterprise' };
      passes.push({ pass: 'client-override-enterprise', reached: true, inputProvided: true, matched: true,
        detail: `${input.performingFacilityId} has no own override — its Enterprise ${input.enterpriseFacilityId} → ${mapped}` });
    } else {
      passes.push({ pass: 'client-override-enterprise', reached: true, inputProvided: provided, matched: false,
        detail: provided ? `Enterprise ${input.enterpriseFacilityId} — no override rule defined either` : 'No Enterprise parent to roll up to' });
    }
  } else {
    passes.push({ pass: 'client-override-enterprise', reached: false, inputProvided: false, matched: false, detail: 'Not reached — higher-priority pass already matched' });
  }

  // Pass 0b — Physician preference
  if (!resolved) {
    const provided = !!input.orderingPhysicianId;
    const mapped = provided ? physicianMap[input.orderingPhysicianId!] : undefined;
    if (mapped) {
      resolved = { templateId: mapped, ambiguous: false, candidates: [mapped], resolvedBy: 'physician-preference' };
      passes.push({ pass: 'physician-preference', reached: true, inputProvided: true, matched: true,
        detail: `${input.orderingPhysicianId} → ${mapped}` });
    } else {
      passes.push({ pass: 'physician-preference', reached: true, inputProvided: provided, matched: false,
        detail: provided ? `${input.orderingPhysicianId} — no preference rule defined` : 'No ordering physician specified' });
    }
  } else {
    passes.push({ pass: 'physician-preference', reached: false, inputProvided: false, matched: false, detail: 'Not reached — higher-priority pass already matched' });
  }

  // Pass 1 — synoptic protocol (most specific)
  if (!resolved) {
    const ids = input.synopticTemplateIds ?? [];
    const candidateSet = new Set<string>();
    ids.forEach(id => { const m = protocolMap[id]; if (m) candidateSet.add(m); });
    if (candidateSet.size > 0) {
      const list = Array.from(candidateSet);
      resolved = { templateId: list[0], ambiguous: list.length > 1, candidates: list, resolvedBy: 'protocol' };
      passes.push({ pass: 'protocol', reached: true, inputProvided: true, matched: true,
        detail: `${ids.join(', ')} → ${list.join(', ')}` });
    } else {
      passes.push({ pass: 'protocol', reached: true, inputProvided: ids.length > 0, matched: false,
        detail: ids.length > 0 ? `${ids.join(', ')} — no protocol mapping found` : 'No synoptic template ID specified' });
    }
  } else {
    passes.push({ pass: 'protocol', reached: false, inputProvided: false, matched: false, detail: 'Not reached — higher-priority pass already matched' });
  }

  // Pass 2 — Subspecialty fallback
  if (!resolved) {
    const provided = !!input.subspecialtyId;
    const mapped = provided ? SUBSPECIALTY_TO_REPORT[input.subspecialtyId!] : undefined;
    if (mapped) {
      resolved = { templateId: mapped, ambiguous: false, candidates: [mapped], resolvedBy: 'subspecialty' };
      passes.push({ pass: 'subspecialty', reached: true, inputProvided: true, matched: true,
        detail: `${input.subspecialtyId} → ${mapped}` });
    } else {
      passes.push({ pass: 'subspecialty', reached: true, inputProvided: provided, matched: false,
        detail: provided ? `${input.subspecialtyId} — no subspecialty mapping found` : 'No subspecialty specified' });
    }
  } else {
    passes.push({ pass: 'subspecialty', reached: false, inputProvided: false, matched: false, detail: 'Not reached — higher-priority pass already matched' });
  }

  // Pass 3 — Gold standard (universal fallback, always available)
  if (!resolved) {
    resolved = { templateId: 'tmpl-gold-standard', ambiguous: false, candidates: ['tmpl-gold-standard'], resolvedBy: 'gold-standard' };
    passes.push({ pass: 'gold-standard', reached: true, inputProvided: true, matched: true, detail: 'Universal fallback — always available' });
  } else {
    passes.push({ pass: 'gold-standard', reached: false, inputProvided: false, matched: false, detail: 'Not reached — higher-priority pass already matched' });
  }

  return { result: resolved, passes };
}

export function resolveReportTemplate(input: TemplateRoutingInput): TemplateRoutingResult {
  return traceReportTemplateResolution(input).result;
}

/**
 * Async version — loads admin-defined routing rules from the service,
 * merges them with the hardcoded maps, then resolves.
 * Use this in contextBuilder.ts for runtime resolution.
 */
export async function resolveReportTemplateAsync(
  input: TemplateRoutingInput
): Promise<TemplateRoutingResult> {
  try {
    // Real, per direct guidance: resolves the real Enterprise parent
    // (Pass 0a above) and the real performing lab (for Routing Rules'
    // own lab-scoping — "Routing Rules should also be tied to a
    // Performing Lab facility") from the SAME single facility lookup —
    // never two separate fetches for what's fundamentally one real
    // question, "which facility, and where does its work roll up to."
    let enterpriseFacilityId: string | undefined;
    let performingLabFacilityId: string | undefined;
    if (input.performingFacilityId) {
      const { mockFacilityService } = await import('../facilities/mockFacilityService');
      const { resolvePerformingLabFacilityId } = await import('../facilities/IFacilityService');
      const facilityRes = await mockFacilityService.getById(input.performingFacilityId);
      if (facilityRes.ok) {
        if (!facilityRes.data.isEnterprise && facilityRes.data.parentId) {
          enterpriseFacilityId = facilityRes.data.parentId;
        }
        performingLabFacilityId = resolvePerformingLabFacilityId(facilityRes.data);
      }
    }

    const { mockRoutingRuleService } = await import('../routingRules/mockRoutingRuleService');
    const [facilityMapResult, physicianMapResult, protocolMapResult] = await Promise.all([
      mockRoutingRuleService.getFacilityMap(performingLabFacilityId),
      mockRoutingRuleService.getPhysicianMap(performingLabFacilityId),
      mockRoutingRuleService.getProtocolMap(performingLabFacilityId),
    ]);
    const facilityOverrides      = (facilityMapResult as any).ok ? (facilityMapResult as any).data : {};
    const physicianOverrides   = (physicianMapResult as any).ok ? (physicianMapResult as any).data : {};
    const protocolOverrides    = (protocolMapResult as any).ok ? (protocolMapResult as any).data : {};

    // Merge admin rules into the hardcoded maps (admin rules take precedence)
    return resolveReportTemplate({
      ...input,
      enterpriseFacilityId,
      _facilityOverrides:      facilityOverrides,
      _physicianOverrides:   physicianOverrides,
      _protocolOverrides:    protocolOverrides,
    } as any);
  } catch {
    // Fall back to sync resolution if service unavailable
    return resolveReportTemplate(input);
  }
}
