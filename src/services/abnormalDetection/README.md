# services/abnormalDetection/

PS-105 (Core Abnormal Detection Engine), PS-129 — a real, admin-configurable
dictionary mapping a specific synoptic field/value combination to a severity
flag, plus the pure evaluation logic that checks a specimen's resolved
synoptic answers against it.

**Pattern:** standard admin-curated dictionary, modeled directly on
`services/deficiencies/`'s `DeficiencyType`/`ResolutionType` pair — same
`getAll/add/update/deactivate/reactivate` CRUD shape, same Global/scoped
`performingLabFacilityId` convention.

## Files

- **`IAbnormalTriggerRuleService.ts`** — `AbnormalTriggerRule` (fieldLabel,
  triggerValues, severity, description, status, performingLabFacilityId) and
  the CRUD contract. `AbnormalSeverity` (`Abnormal` | `Critical` | `Malignant`)
  is exported from here and shared with `services/clinical/detectCriticalFindings.ts` —
  one real, unified severity vocabulary across both the discrete
  (this folder) and narrative-AI (`services/clinical/`) detection paths.
- **`mockAbnormalTriggerRuleService.ts`** — the real, currently-active
  implementation, seeded with the four rules PS-105's own spec named
  (Margin Status, Perineural Invasion, Lymph Node Status, Lymphovascular
  Invasion) — an admin can edit or deactivate any of these, and add their own.
- **`evaluateAbnormalTriggerRules.ts`** — pure, testable evaluation: matches a
  specimen's `ResolvedAnswer[]` (`orchestrator/contextBuilder.ts`) against the
  active rule set, case-insensitively, on `displayValue` components (never the
  raw `value` array, which holds opaque option IDs, not human-readable text).
  Splits a multi-select field's `displayValue` on comma and requires an exact
  match per component — never a bare substring check, which would wrongly
  match "Present" inside "Not Present." Returns real `AiFieldSuggestion`
  (`types/case/Case.ts`) results, confidence always 100 (a discrete rule match
  is deterministic, not a probabilistic guess) — never an auto-applied
  determination. Real, per direct guidance: "the case is considered abnormal
  or not, however the human makes the final call. We just offer the
  suggestion and why with a confidence factor."

- **`resolveAbnormalDetectionEnabled.ts`** — the real, per direct guidance: "If the
  enterprise level is disabled then the performing facility level is disabled
  and cannot be overridden." Deliberately NOT `SystemConfigContext.tsx`'s
  existing `isFeatureEnabled()` — that resolves facility-over-enterprise in
  *either* direction (correct for `reportingPlusEnabled`, wrong here, since it
  would let a facility silently re-enable something an enterprise admin
  explicitly turned off). Enterprise-disabled is an absolute floor; a facility
  can only ever further restrict a permissive enterprise default, never loosen
  it. Wired as the very first check in `useSignOutWorkflow.ts`'s
  `fetchCriticalFindings` — when disabled, nothing below it runs at all, not
  even the AI call. Enterprise toggle lives at the top of this folder's own
  admin section (`components/Config/System/AbnormalTriggerRulesSection.tsx`);
  facility toggle in `FacilityEditorModal.tsx`, gated to the `performing_lab`
  role. **6 real tests** across `resolveAbnormalDetectionEnabled.test.ts` and a
  dedicated governance-gate test in `useSignOutWorkflow.test.ts`.

- **`IAbnormalDetectionSignalService.ts` / `mockAbnormalDetectionSignalService.ts`** — PS-137, real
  "Level 1 AI learning" agreement tracking, per direct guidance: "How often was
  their agreement... an opportunity to feed that information back for
  learning, just like we do when we add or remove synoptic reports." That
  precedent is real, not assumed — mirrors `TemplateSuggestionSignal`
  (`services/templateSuggestions/`) and `NarrativeEditSignal`
  (`services/narrativeSignals/`), unified into one shape since PS-129/PS-131
  suggestions differ only in whether real clinical text is involved. A
  `'narrative'`-source signal's `reasonClean` is run through the real,
  exported `deidentifyText()` before storage; a `'discrete'`-source one needs
  no de-identification (a config-driven field/value label, never clinical
  text). Captured fire-and-forget from both `handleRecordCriticalNotification`
  ('confirmed') and `handleAcknowledgeCriticalFindings` ('dismissed') in
  `useSignOutWorkflow.ts`. **10 real tests** across both files.

- **`resolveSyntheticCoding.ts`** — real, per direct guidance: lets the "confirmed
  finding → attached coded term" architecture be exercised end to end before a
  real, verified terminology source exists (PS-130 stays genuinely blocked —
  this does not unblock it). Real, structural safety boundary: every code
  value is prefixed `TEST-` directly in the code string itself (never real
  SNOMED CT's bare-numeric or ICD-O-3's `\d{4}/\d` format), and every display
  string leads with `[SYNTHETIC — TEST ONLY]` — unmistakable as fake even read
  completely alone, never relying on a field name or comment as the only
  safeguard. Wired alongside `Case.abnormalDetectionStatus` at the same real
  confirm moment (`handleRecordCriticalNotification`), stored on
  `Case.syntheticAbnormalCoding`, surfaced in `WorklistTable.tsx`'s
  `AbnormalDot` tooltip for direct QC verification. **3 dedicated safety tests**
  in `resolveSyntheticCoding.test.ts` plus a direct integration test in
  `useSignOutWorkflow.test.ts`.

## Notes

- **Worklist visibility (PS-133)**: `Case.abnormalDetectionStatus` (`types/case/Case.ts`) is the real, persisted,
  pathologist-CONFIRMED status `WorklistTable.tsx`'s `AbnormalDot` renders from —
  set only by `handleRecordCriticalNotification` (`useSignOutWorkflow.ts`), to
  the single highest-severity finding among everything shown in that sign-out
  session. Never set from an unconfirmed suggestion — `handleAcknowledgeCriticalFindings`
  deliberately does not touch this field.

- Admin UI: `components/Config/System/AbnormalTriggerRulesSection.tsx`
  (Clinical Lookups group).
- **11 real tests** in `evaluateAbnormalTriggerRules.test.ts` — field-label
  matching, case-insensitivity, the "Not Present" vs. "Present" substring
  safety case, multi-select handling, inactive-rule exclusion, and the
  highest-severity reduction helper.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
