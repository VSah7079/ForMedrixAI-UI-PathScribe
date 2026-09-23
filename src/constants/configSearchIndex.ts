/**
 * configSearchIndex.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manually-maintained searchable index of Configuration settings, for the
 * search bar on ConfigurationPage. NOT auto-derived from the individual tab
 * components (AITab, SystemTab, etc.) — this needs to be kept in sync by hand
 * whenever a setting is added, renamed, or removed.
 *
 * Confidence levels, since this was built from documentation rather than the
 * actual tab component source:
 *   - 'ai', 'system', 'staff', 'actions', 'templates', 'demo' entries are
 *     grounded in the Admin Guide v0.9.1 and should be accurate as of that
 *     writing, but should be spot-checked against current code.
 *   - 'macros' and 'validation' entries are PLACEHOLDERS — neither tab is
 *     covered anywhere in the Admin Guide, so these are best-guess based on
 *     the tab label alone. Replace with real entries once those components
 *     are reviewed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ConfigTabId =
  | 'ai' | 'protocols' | 'staff' | 'voice' | 'system' | 'cytology'
  | 'actions' | 'macros' | 'templates' | 'validation' | 'demo';

export interface ConfigSearchEntry {
  id: string;
  /** i18n key for the on-screen label (either a new
   *  `configSearchIndex.entries.<id>.label` key, or the exact-text key of
   *  an existing translation elsewhere in the app for the same setting —
   *  see ConfigSearchBar.tsx's own i18n note). */
  labelKey: string;
  /** i18n key for the on-screen description, always
   *  `configSearchIndex.entries.<id>.description` — this index's own
   *  summary wording is never an exact-text match for any other on-screen
   *  string, so every entry gets its own new key. */
  descriptionKey: string;
  /** Real, internal search-matching data, deliberately left untranslated —
   *  see ConfigSearchBar.tsx's own i18n note. */
  synonyms: string[];
  tabId: ConfigTabId;
  confidence: 'verified' | 'placeholder';
  /** Real, per direct report ("the top level search in config found the
   *  entry, but when clicked on, it did not go to the setting"): v1
   *  scope (see ConfigSearchBar.tsx's own former header comment) only
   *  ever switched the top-level tab, never the specific sub-section
   *  within it — for a tab with many sections (System has 30+), that
   *  usually landed nowhere near the actual setting searched for.
   *  Optional, System-tab-only for now: the exact SystemSection id
   *  (Config/System/index.tsx's own type) this entry corresponds to,
   *  reusing the same real PATHSCRIBE_SYSTEM_NAVIGATE event
   *  AppShell.tsx's own config-link chat messages already dispatch —
   *  not a new mechanism. Left undefined for entries without a
   *  confirmed, unambiguous section (e.g. 'sys-jurisdiction'/'sys-info'
   *  aren't real SystemSection sidebar items at all) rather than
   *  guessed. */
  section?: string;
}

export const CONFIG_SEARCH_INDEX: ConfigSearchEntry[] = [
  // ── AI Behavior tab ────────────────────────────────────────────────────────
  { id: 'ai-provider', labelKey: 'aiProviderSettings.providerLabel', tabId: 'ai', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.ai-provider.description',
    synonyms: ['anthropic', 'gemini', 'claude', 'model provider'] },
  { id: 'ai-model', labelKey: 'aiProviderSettings.modelLabel', tabId: 'ai', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.ai-model.description',
    synonyms: ['claude sonnet', 'llm', 'ai model version'] },
  { id: 'ai-api-mode', labelKey: 'navBar.systemInfo.apiMode', tabId: 'ai', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.ai-api-mode.description',
    synonyms: ['proxy', 'direct mode'] },
  { id: 'ai-confidence-threshold', labelKey: 'aiTab.confidenceThreshold.title', tabId: 'ai', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.ai-confidence-threshold.description',
    synonyms: ['threshold', 'ai triage', 'not found'] },
  { id: 'ai-gross-driven', labelKey: 'aiTab.grossDriven.title', tabId: 'ai', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.ai-gross-driven.description',
    synonyms: ['gross description ai'] },
  { id: 'ai-microscopic-driven', labelKey: 'aiTab.microscopicDriven.title', tabId: 'ai', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.ai-microscopic-driven.description',
    synonyms: ['microscopic description ai', 'protocol re-evaluation'] },
  { id: 'ai-auto-insert', labelKey: 'configSearchIndex.entries.ai-auto-insert.label', tabId: 'ai', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.ai-auto-insert.description',
    synonyms: ['auto apply', 'auto accept'] },
  { id: 'ai-voice', labelKey: 'navBar.systemInfo.voiceAi', tabId: 'ai', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.ai-voice.description',
    synonyms: ['voice recognition', 'voice commands ai'] },

  // ── System tab ─────────────────────────────────────────────────────────────
  { id: 'sys-dp-vendors', labelKey: 'configSearchIndex.entries.sys-dp-vendors.label', tabId: 'system', confidence: 'verified', section: 'vendor_integrations',
    descriptionKey: 'configSearchIndex.entries.sys-dp-vendors.description',
    synonyms: ['ai vendor', 'digital pathology', 'computational pathology', 'paige', 'ibex', 'pathai', 'proscia', 'hologic', 'fda cleared'] },
  { id: 'sys-wsi-viewer-vendors', labelKey: 'configSearchIndex.entries.sys-wsi-viewer-vendors.label', tabId: 'system', confidence: 'verified', section: 'vendor_integrations',
    descriptionKey: 'configSearchIndex.entries.sys-wsi-viewer-vendors.description',
    synonyms: ['wsi viewer', 'whole slide imaging', 'scanner', 'leica', 'aperio', 'roche', 'upath', 'hamamatsu', 'philips', 'intellisite', 'launch url', 'dicom'] },
  { id: 'sys-ims-vendors', labelKey: 'configSearchIndex.entries.sys-ims-vendors.label', tabId: 'system', confidence: 'verified', section: 'vendor_integrations',
    descriptionKey: 'configSearchIndex.entries.sys-ims-vendors.description',
    synonyms: ['image management', 'vna', 'pacs', 'dam', 'on-prem', 'file server', 'image storage', 'pdf storage', 'fallback url'] },
  { id: 'sys-gross-imaging-vendors', labelKey: 'configSearchIndex.entries.sys-gross-imaging-vendors.label', tabId: 'system', confidence: 'verified', section: 'vendor_integrations',
    descriptionKey: 'configSearchIndex.entries.sys-gross-imaging-vendors.description',
    synonyms: ['gross imaging', 'macro imaging', 'telepathology', 'grossing camera', 'cut-up', 'paxit', 'paxcam', 'pathozoom', 'smart in media', 'macropath', 'milestone medical'] },
  { id: 'sys-cytology-qc-rules', labelKey: 'systemTab.sections.cytologyQcRules', tabId: 'system', confidence: 'verified', section: 'cytology_qc_rules',
    descriptionKey: 'configSearchIndex.entries.sys-cytology-qc-rules.description',
    synonyms: ['qc rules', 'quality control', 'rescreen', 'peer review', 'cytology qc', 'clia', 'rapid rescreen', 'assignment engine'] },
  { id: 'sys-or-suite-terminals', labelKey: 'systemTab.sections.orSuiteTerminals', tabId: 'system', confidence: 'verified', section: 'or_suite_terminals',
    descriptionKey: 'configSearchIndex.entries.sys-or-suite-terminals.description',
    synonyms: ['or dashboard', 'intraoperative dashboard', 'frozen section', 'or suite', 'station identity', 'operating room terminal'] },
  { id: 'sys-display-profiles', labelKey: 'systemTab.sections.displayProfiles', tabId: 'system', confidence: 'verified', section: 'display_profiles',
    descriptionKey: 'configSearchIndex.entries.sys-display-profiles.description',
    synonyms: ['facility ops dashboard', 'department dashboard', 'wall display', 'kiosk', 'display profile', 'grossing dashboard', 'staining dashboard', 'lab operations dashboard'] },
  { id: 'sys-migration-field-mappings', labelKey: 'systemTab.sections.migrationFieldMappings', tabId: 'system', confidence: 'verified', section: 'migration_field_mappings',
    descriptionKey: 'configSearchIndex.entries.sys-migration-field-mappings.description',
    synonyms: ['data migration', 'legacy import', 'field mapping', 'legacy lis', 'bulk import'] },
  { id: 'sys-cancer-registry-settings', labelKey: 'systemTab.sections.cancerRegistrySettings', tabId: 'system', confidence: 'verified', section: 'cancer_registry_settings',
    descriptionKey: 'configSearchIndex.entries.sys-cancer-registry-settings.description',
    synonyms: ['naaccr', 'cpac', 'cosd', 'inca', 'gekid', 'aihw', 'kccr', 'cancer registry', 'tumor registry', 'icd-o'] },
  // Real, per direct follow-up ("did we work on this yet? Per-facility
  // Specimen Deficiencies" → the config search bug this surfaced): five
  // entries removed here — LIS Integration Enabled/Endpoint/Owns Case
  // Statuses, Allow Post-Final Actions, and Identifier Formats — all
  // pointed at screens (LISSection.tsx, IdentifierFormatsSection.tsx)
  // confirmed to be genuinely dead: a prior session's own real
  // Facility-level migration had already replaced the global
  // SystemConfig fields these screens edited, but never finished
  // deleting the screens themselves. The real replacements now live
  // inside FacilityEditorModal.tsx's own "LIS Integration" tab and
  // Facility.identifierFormats — both edited per-facility from the
  // Facility Configuration screen, not indexed separately here (this
  // pass is deliberately scoped to the confirmed-stale removals plus
  // the one section directly asked about below, not a full rebuild of
  // this index against the current nav).
  // No `section` here — confirmed 'jurisdiction' isn't a real
  // SystemSection sidebar item (Config/System/index.tsx's own type
  // union has no such member); wherever this setting actually lives,
  // it wasn't traced as part of this pass. Tab-level navigation only,
  // same limitation this whole index used to have everywhere.
  { id: 'sys-jurisdiction', labelKey: 'clientEditorModal.general.jurisdiction', tabId: 'system', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.sys-jurisdiction.description',
    synonyms: ['snomed', 'icd', 'cap', 'rcpath', 'region'] },
  { id: 'sys-specimens', labelKey: 'accessionPage.tabs.specimens', tabId: 'system', confidence: 'verified', section: 'specimens',
    descriptionKey: 'configSearchIndex.entries.sys-specimens.description',
    synonyms: ['specimen dictionary', 'specimen types', 'autopsy specimen category'] },
  // Real, per direct follow-up: "it all needs to be wired" — neither
  // the Protocol Dictionary nor the (newly-built) Asset Location
  // Dictionary had any real entry here at all, meaning searching
  // "autopsy" or "mortuary" in Config found nothing, even though the
  // real configuration itself exists.
  { id: 'sys-protocols', labelKey: 'systemTab.sections.protocols', tabId: 'system', confidence: 'verified', section: 'protocols',
    descriptionKey: 'configSearchIndex.entries.sys-protocols.description',
    synonyms: ['protocol', 'pathway', 'processing workflow', 'autopsy cardiac sectioning'] },
  { id: 'sys-asset-locations', labelKey: 'systemTab.sections.assetLocations', tabId: 'system', confidence: 'verified', section: 'asset_locations',
    descriptionKey: 'configSearchIndex.entries.sys-asset-locations.description',
    synonyms: ['mortuary', 'storage slot', 'autopsy storage', 'tray utilization', 'occupancy'] },
  { id: 'sys-subspecialties', labelKey: 'systemTab.sections.subspecialties', tabId: 'system', confidence: 'verified', section: 'subspecialties',
    descriptionKey: 'configSearchIndex.entries.sys-subspecialties.description',
    synonyms: ['subspecialty pools', 'delegation routing'] },
  { id: 'sys-terminology', labelKey: 'systemTab.sections.terminology', tabId: 'system', confidence: 'verified', section: 'terminology',
    descriptionKey: 'configSearchIndex.entries.sys-terminology.description',
    synonyms: ['snomed ct', 'umls', 'terminology status'] },
  { id: 'sys-physicians', labelKey: 'configSearchIndex.entries.sys-physicians.label', tabId: 'system', confidence: 'verified', section: 'physicians',
    descriptionKey: 'configSearchIndex.entries.sys-physicians.description',
    synonyms: ['physicians', 'referring doctor', 'ordering physician'] },
  { id: 'sys-flags', labelKey: 'configSearchIndex.entries.sys-flags.label', tabId: 'system', confidence: 'verified', section: 'flags',
    descriptionKey: 'configSearchIndex.entries.sys-flags.description',
    synonyms: ['case flags', 'specimen flags', 'severity level'] },
  // Real, per direct follow-up ("did we work on this yet? Per-facility
  // Specimen Deficiencies"): this section was confirmed real, built,
  // and live (Config → System → Integrations group → Specimen
  // Deficiencies) but had zero index entry at all — added here now.
  // tabId 'system' since that's this section's own, real, confirmed
  // home (Config/Integrations/index.tsx, a genuine duplicate at the
  // time this was first written, has since been deleted entirely —
  // see components/Config/Integrations/README.md).
  { id: 'sys-deficiencies', labelKey: 'systemTab.sections.deficiencies', tabId: 'system', confidence: 'verified', section: 'deficiencies',
    descriptionKey: 'configSearchIndex.entries.sys-deficiencies.description',
    synonyms: ['deficiency type', 'resolution type', 'specimen deficiency', 'requisition deficiency', 'could not match specimen'] },
  { id: 'sys-delegation-types', labelKey: 'systemTab.sections.delegationTypes', tabId: 'system', confidence: 'verified', section: 'delegation_types',
    descriptionKey: 'configSearchIndex.entries.sys-delegation-types.description',
    synonyms: ['peer review', 'second opinion', 'mdt discussion'] },
  // No `section` here either, same reasoning as 'sys-jurisdiction'
  // above — 'info' isn't a real SystemSection sidebar item.
  { id: 'sys-info', labelKey: 'navBar.systemInfo.title', tabId: 'system', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.sys-info.description',
    synonyms: ['build version', 'support report', 'app version'] },

  // ── Cytology tab ───────────────────────────────────────────────────────────
  // Real, per direct report ("when I searched for Cytology, the
  // search did not return anything") — the three real, pre-existing
  // entries below were originally added under 'system' as a fix for
  // that report; relocated here (same real ids, section values, and
  // synonyms) now that Cytology has its own real, dedicated
  // Configuration tab (Config/Cytology/index.tsx). Six new entries
  // added alongside them for the real, previously-missing cascade
  // settings screens built in the same pass.
  { id: 'sys-cytology-categories', labelKey: 'configSearchIndex.entries.sys-cytology-categories.label', tabId: 'cytology', confidence: 'verified', section: 'cytology_categories',
    descriptionKey: 'configSearchIndex.entries.sys-cytology-categories.description',
    synonyms: ['cytology', 'bethesda', 'pap smear', 'cervical cytology', 'bscc', 'rcpath', 'sfcc', 'munchen', 'dyskaryosis'] },
  { id: 'sys-non-gyn-cytology-categories', labelKey: 'configSearchIndex.entries.sys-non-gyn-cytology-categories.label', tabId: 'cytology', confidence: 'verified', section: 'non_gyn_cytology_categories',
    descriptionKey: 'configSearchIndex.entries.sys-non-gyn-cytology-categories.description',
    synonyms: ['milan system', 'paris system', 'salivary gland cytology', 'urinary cytology', 'urine cytology', 'non-gyn', 'sump', 'hguc', 'nhguc'] },
  { id: 'sys-cytology-qc', labelKey: 'configSearchIndex.entries.sys-cytology-qc.label', tabId: 'cytology', confidence: 'verified', section: 'cytology_qc_settings',
    descriptionKey: 'configSearchIndex.entries.sys-cytology-qc.description',
    synonyms: ['cytology', 'rescreening', 'random selection', 'qc rate'] },
  { id: 'sys-cytology-histo-correlation', labelKey: 'configSearchIndex.entries.sys-cytology-histo-correlation.label', tabId: 'cytology', confidence: 'verified', section: 'snomed_histology_severity_mapping',
    descriptionKey: 'configSearchIndex.entries.sys-cytology-histo-correlation.description',
    synonyms: ['cytology', 'histology correlation', 'snomed mapping', 'cyto-histo'] },
  { id: 'cyt-nomenclature', labelKey: 'cytologyNomenclatureSettingsSection.title', tabId: 'cytology', confidence: 'verified', section: 'cytology_nomenclature',
    descriptionKey: 'configSearchIndex.entries.cyt-nomenclature.description',
    synonyms: ['cytology', 'nomenclature', 'bethesda', 'bscc', 'sfcc', 'palga', 'terminology system'] },
  { id: 'cyt-registry', labelKey: 'cytologyRegistrySettingsSection.title', tabId: 'cytology', confidence: 'verified', section: 'cytology_registry',
    descriptionKey: 'configSearchIndex.entries.cyt-registry.description',
    synonyms: ['cytology', 'registry', 'csms', 'cervicalcheck', 'palga', 'ncsr', 'kncsp'] },
  { id: 'cyt-routing', labelKey: 'cytologyRoutingSettingsSection.title', tabId: 'cytology', confidence: 'verified', section: 'cytology_routing',
    descriptionKey: 'configSearchIndex.entries.cyt-routing.description',
    synonyms: ['cytology', 'routing', 'non-gyn', 'fna', 'body fluid'] },
  { id: 'cyt-screening-strategy', labelKey: 'cytologyScreeningStrategySection.title', tabId: 'cytology', confidence: 'verified', section: 'cytology_screening_strategy',
    descriptionKey: 'configSearchIndex.entries.cyt-screening-strategy.description',
    synonyms: ['cytology', 'screening strategy', 'co-testing', 'primary hpv', 'reflex'] },
  { id: 'cyt-workload-cap', labelKey: 'cytologyWorkloadCapSettingsSection.title', tabId: 'cytology', confidence: 'verified', section: 'cytology_workload_cap',
    descriptionKey: 'configSearchIndex.entries.cyt-workload-cap.description',
    synonyms: ['cytology', 'workload cap', 'daily slide cap', 'clia', 'cytotechnologist'] },
  { id: 'cyt-instrumentation', labelKey: 'configSearchIndex.entries.cyt-instrumentation.label', tabId: 'cytology', confidence: 'verified', section: 'cytology_instrumentation',
    descriptionKey: 'configSearchIndex.entries.cyt-instrumentation.description',
    synonyms: ['cytology', 'instrumentation', 'wsi', 'whole slide imaging', 'traditional guided'] },

  // ── Staff tab ──────────────────────────────────────────────────────────────
  { id: 'staff-add', labelKey: 'staffTab.modal.addStaffMember', tabId: 'staff', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.staff-add.description',
    synonyms: ['new user', 'add user'] },
  { id: 'staff-roles', labelKey: 'configSearchIndex.entries.staff-roles.label', tabId: 'staff', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.staff-roles.description',
    synonyms: ['pathologist role', 'resident role', 'admin role', 'permissions'] },
  { id: 'staff-deactivate', labelKey: 'configSearchIndex.entries.staff-deactivate.label', tabId: 'staff', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.staff-deactivate.description',
    synonyms: ['disable user', 'block login'] },

  // ── Action Registry tab ───────────────────────────────────────────────────
  { id: 'actions-registry', labelKey: 'configuration.tabs.actions', tabId: 'actions', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.actions-registry.description',
    synonyms: ['voice triggers', 'keyboard shortcuts'] },

  // ── Report Templates tab ──────────────────────────────────────────────────
  { id: 'tpl-builder', labelKey: 'configSearchIndex.entries.tpl-builder.label', tabId: 'templates', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.tpl-builder.description',
    synonyms: ['parts', 'cap templates', 'template assembly', 'part library'] },
  { id: 'tpl-ai-generation', labelKey: 'configSearchIndex.entries.tpl-ai-generation.label', tabId: 'templates', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.tpl-ai-generation.description',
    synonyms: ['temperature', 'system instruction', 'max tokens'] },

  // ── Demo Reset tab ─────────────────────────────────────────────────────────
  { id: 'demo-reset', labelKey: 'configSearchIndex.entries.demo-reset.label', tabId: 'demo', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.demo-reset.description',
    synonyms: ['reset data', 'full reset', 'staging only'] },
  // Real, direct follow-up (Sep 2026): moved here from a flat top-level
  // Home tile, per direct guidance ("seems like a Testing tool") — see
  // DemoResetTab.tsx's own "Testing & Demo Tools" section.
  { id: 'demo-molecular-order-queue', labelKey: 'configSearchIndex.entries.demo-molecular-order-queue.label', tabId: 'demo', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.demo-molecular-order-queue.description',
    synonyms: ['molecular order queue', 'hpv simulation', 'reflex genotyping', 'outbound queue demo'] },

  // ── Voice tab ──────────────────────────────────────────────────────────────
  { id: 'voice-profile', labelKey: 'navBar.systemInfo.voiceProfile', tabId: 'voice', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.voice-profile.description',
    synonyms: ['en-us', 'en-gb', 'accent'] },

  // ── Synoptic Library tab ──────────────────────────────────────────────────
  { id: 'protocols-library', labelKey: 'configuration.tabs.protocols', tabId: 'protocols', confidence: 'verified',
    descriptionKey: 'configSearchIndex.entries.protocols-library.description',
    synonyms: ['cap protocols', 'rcpath', 'synoptic templates'] },

  // ── Macros tab — PLACEHOLDER, not documented anywhere yet ────────────────
  { id: 'macros-placeholder', labelKey: 'configuration.tabs.macros', tabId: 'macros', confidence: 'placeholder',
    descriptionKey: 'configSearchIndex.entries.macros-placeholder.description',
    synonyms: ['text expansion', 'shortcuts'] },

  // ── Validation Studies tab — PLACEHOLDER, not documented anywhere yet ────
  { id: 'validation-placeholder', labelKey: 'configuration.tabs.validation', tabId: 'validation', confidence: 'placeholder',
    descriptionKey: 'configSearchIndex.entries.validation-placeholder.description',
    synonyms: ['validation', 'studies'] },
];
