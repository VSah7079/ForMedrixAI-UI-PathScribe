// src/services/duplication/duplicatePolicy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Which admin screens offer a "Duplicate" action, and why (PS-73).
//
// Pete's duplication framework (Sep 2026):
//
//   Duplicate makes sense for
//     1. complex-configuration: high setup cost or bulk configuration
//        (facility configs, stain/lab protocol templates, routing rulesets,
//        escalation paths);
//     2. template-entity: records that serve as templates (specimen
//        categories, test panels, document templates, alert profiles);
//     3. multi-site-variant: the same setup repeated per site or tenant with
//        small differences (printer profiles, workstation groups).
//
//   Duplicate does NOT make sense for
//     4. real-person-or-entity: unique real-world individuals or entities
//        (physicians, users, patients). A copy of a person is a wrong person;
//     5. flat-lookup: simple lists of 1–3 fields (cassette colours, container
//        types, delegation types, code-map rows). Typing the value is as fast
//        as copying it, and a copy only invites near-duplicates;
//     6. transactional-or-audit: immutable, transactional or audit-logged
//        records (cases, audit events, sign-outs, lot receipts).
//
// This registry is the single place that decision is recorded.
// duplicatePolicy.guard.test.ts enforces it against the source:
//   - every screen marked `duplicate: false` has no Duplicate action;
//   - every screen marked `duplicate: true` has one;
//   - every component anywhere under src/ that renders a Duplicate action
//     (t('common.duplicate')) is registered here as allowed. A new Duplicate
//     button cannot ship without a recorded reason;
//   - no source file stores a hard-coded English copy marker ("(Copy)",
//     "Copy of"). Copy names come from t('common.copyOfName').
//
// Entity-specific copy rules (what gets cleared, deep-copied, reset) live in
// duplicateEntities.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type DuplicateCategory =
  | 'complex-configuration'
  | 'template-entity'
  | 'multi-site-variant'
  | 'real-person-or-entity'
  | 'flat-lookup'
  | 'transactional-or-audit';

export const ALLOWED_CATEGORIES: readonly DuplicateCategory[] = ['complex-configuration', 'template-entity', 'multi-site-variant'];

export interface DuplicatePolicyEntry {
  /** Source file (relative to src/) that renders the screen's list. */
  file: string;
  duplicate: boolean;
  category: DuplicateCategory;
  /** One line: why, in the framework's terms. */
  reason: string;
}

export const DUPLICATE_POLICY: Record<string, DuplicatePolicyEntry> = {
  // ── Allowed: complex configuration ──────────────────────────────────────
  facilities:            { file: 'components/FacilityDictionary/FacilityTable.tsx',                 duplicate: true, category: 'complex-configuration', reason: 'Dozens of org-level settings; a new site usually mirrors an existing one.' },
  stainDictionary:       { file: 'components/Config/System/StainDictionarySection.tsx',             duplicate: true, category: 'complex-configuration', reason: 'Stain/test panels, sectioning protocols, order macros and molecular targets are lab protocol templates.' },
  processingProtocols:   { file: 'components/Config/System/ProtocolDictionarySection.tsx',          duplicate: true, category: 'complex-configuration', reason: 'Multi-track, multi-task workflows.' },
  // Row actions shared by All Protocols and Active Protocols.
  synopticProtocols:     { file: 'components/Config/Protocols/ProtocolCardParts.tsx',               duplicate: true, category: 'complex-configuration', reason: 'Synoptic protocols have many sections and coded fields.' },
  casePoolRouting:       { file: 'components/Config/System/CasePoolAssignmentSection.tsx',          duplicate: true, category: 'complex-configuration', reason: 'Routing ruleset: keyword lists and specimen-type mappings.' },
  routingRules:          { file: 'components/Config/System/RoutingRulesSection.tsx',                duplicate: true, category: 'complex-configuration', reason: 'Same routing ruleset as case-pool assignment.' },
  cassetteRouting:       { file: 'components/Config/System/CassetteRoutingRulesSection.tsx',        duplicate: true, category: 'complex-configuration', reason: 'Multi-condition routing ruleset.' },
  tatEscalation:         { file: 'components/Config/System/TATConfigSection.tsx',                   duplicate: true, category: 'complex-configuration', reason: 'Escalation/TAT targets scoped across six dimensions.' },
  abnormalTriggers:      { file: 'components/Config/System/AbnormalTriggerRulesSection.tsx',        duplicate: true, category: 'complex-configuration', reason: 'Alert rules with trigger values, severity and coding; lab-scoped variants are common.' },
  qaConfiguration:       { file: 'components/Config/System/QAConfigurationCenterSection.tsx',       duplicate: true, category: 'complex-configuration', reason: 'QA activity/supervision types with sampling and scope settings.' },
  cytologyQcRules:       { file: 'components/Config/System/CytologyQcRulesSection.tsx',             duplicate: true, category: 'complex-configuration', reason: 'Rescreen rules with multiple criteria.' },
  roleDictionary:        { file: 'components/Config/Staff/RoleDictionary.tsx',                      duplicate: true, category: 'complex-configuration', reason: 'Roles bundle many permissions; a custom role usually starts from a built-in one.' },
  billingDictionary:     { file: 'components/Config/System/BillingDictionarySection.tsx',           duplicate: true, category: 'complex-configuration', reason: 'Versioned billing rules (new version from an existing one).' },
  participationTypes:    { file: 'components/Config/System/ParticipationTypesSection.tsx',          duplicate: true, category: 'complex-configuration', reason: 'Capability flags plus per-country signing authority.' },

  // ── Allowed: template entities ───────────────────────────────────────────
  specimenCategories:    { file: 'components/Config/System/SpecimenCategoriesSection.tsx',          duplicate: true, category: 'template-entity', reason: 'Category defaults: grossing template, retention overrides, lab scope.' },
  specimenDictionary:    { file: 'components/Config/System/SpecimenDictionarySection.tsx',          duplicate: true, category: 'template-entity', reason: 'Specimen definitions with CPT, complexity, stains, protocol and cytology defaults.' },
  reportParts:           { file: 'components/TemplateBuilder/PartLibraryTab.tsx',                   duplicate: true, category: 'template-entity', reason: 'Document template parts.' },
  reportTemplates:       { file: 'components/TemplateBuilder/TemplateListTab.tsx',                  duplicate: true, category: 'template-entity', reason: 'Document templates.' },
  actionGroups:          { file: 'components/Config/System/ActionGroupsSection.tsx',                duplicate: true, category: 'template-entity', reason: 'Named bundles of workstation actions.' },

  // ── Allowed: multi-site variants ─────────────────────────────────────────
  printerProfiles:       { file: 'components/Config/System/PrinterProfilesSection.tsx',             duplicate: true, category: 'multi-site-variant', reason: 'Same printer model deployed at several benches or sites.' },
  workstationGroups:     { file: 'components/Config/System/WorkstationGroupsSection.tsx',           duplicate: true, category: 'multi-site-variant', reason: 'Same workstation setup per performing lab.' },

  // ── Not allowed ──────────────────────────────────────────────────────────
  physicians:            { file: 'components/Config/System/PhysiciansSection.tsx',                  duplicate: false, category: 'real-person-or-entity', reason: 'A physician is one real person; a copy is a wrong person.' },
  containerTypes:        { file: 'components/Config/System/ContainerTypesSection.tsx',              duplicate: false, category: 'flat-lookup', reason: 'A handful of fields.' },
  delegationTypes:       { file: 'components/Config/System/DelegationTypeSection.tsx',              duplicate: false, category: 'flat-lookup', reason: 'A handful of fields.' },
  rvuCodeMap:            { file: 'components/Config/System/RvuCodeMapSection.tsx',                  duplicate: false, category: 'flat-lookup', reason: 'One code-to-value row.' },
  cassetteColors:        { file: 'components/Config/System/CassetteColorsSection.tsx',              duplicate: false, category: 'flat-lookup', reason: 'Name + colour.' },
  // Batch 359
  grossingHardware:      { file: 'components/Config/System/GrossingHardwareSection.tsx',            duplicate: false, category: 'flat-lookup', reason: 'A handful of connection settings for one bench device.' },
  // Batch 358 (took over Batch 356's Instruments)
  equipment:             { file: 'components/Config/System/EquipmentSection.tsx',                   duplicate: false, category: 'real-person-or-entity', reason: 'Each item is one physical device with its own code, serial number and history.' },
};

/** True when the registry allows Duplicate for this screen. Unknown screens are NOT allowed. */
export function isDuplicateAllowed(screen: string): boolean {
  return DUPLICATE_POLICY[screen]?.duplicate === true;
}
