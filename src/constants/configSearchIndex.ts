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
  label: string;
  description: string;
  synonyms: string[];
  tabId: ConfigTabId;
  tabLabel: string;
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
  { id: 'ai-provider', label: 'AI Provider', tabId: 'ai', tabLabel: 'AI Behavior', confidence: 'verified',
    description: 'Select Anthropic Claude or Google Gemini as the active AI provider.',
    synonyms: ['anthropic', 'gemini', 'claude', 'model provider'] },
  { id: 'ai-model', label: 'Model', tabId: 'ai', tabLabel: 'AI Behavior', confidence: 'verified',
    description: 'The specific AI model version used for clinical AI generation.',
    synonyms: ['claude sonnet', 'llm', 'ai model version'] },
  { id: 'ai-api-mode', label: 'API Mode', tabId: 'ai', tabLabel: 'AI Behavior', confidence: 'verified',
    description: 'Proxy routes calls through the backend for production; Direct is development only.',
    synonyms: ['proxy', 'direct mode'] },
  { id: 'ai-confidence-threshold', label: 'Confidence Threshold', tabId: 'ai', tabLabel: 'AI Behavior', confidence: 'verified',
    description: "Fields below this threshold show \"AI: not found\" instead of a suggestion. Controls the AI Triage modal at finalisation.",
    synonyms: ['threshold', 'ai triage', 'not found'] },
  { id: 'ai-gross-driven', label: 'Gross-Driven AI', tabId: 'ai', tabLabel: 'AI Behavior', confidence: 'verified',
    description: 'AI analyses the gross description and pre-populates synoptic fields automatically.',
    synonyms: ['gross description ai'] },
  { id: 'ai-microscopic-driven', label: 'Microscopic-Driven AI', tabId: 'ai', tabLabel: 'AI Behavior', confidence: 'verified',
    description: 'AI re-analyses after microscopic text is entered, refining suggestions and evaluating protocol assignments.',
    synonyms: ['microscopic description ai', 'protocol re-evaluation'] },
  { id: 'ai-auto-insert', label: 'Auto-insert suggestions', tabId: 'ai', tabLabel: 'AI Behavior', confidence: 'verified',
    description: 'If on, AI suggestions are applied to fields without requiring pathologist confirmation.',
    synonyms: ['auto apply', 'auto accept'] },
  { id: 'ai-voice', label: 'Voice AI', tabId: 'ai', tabLabel: 'AI Behavior', confidence: 'verified',
    description: 'Enable Gemini-powered voice command recognition.',
    synonyms: ['voice recognition', 'voice commands ai'] },

  // ── System tab ─────────────────────────────────────────────────────────────
  { id: 'sys-dp-vendors', label: 'Vendor Integrations — Digital Pathology / AI', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'vendor_integrations',
    description: 'Real, named computational-pathology AI vendors (Paige, Ibex, PathAI, Proscia, Hologic) this lab may order screening results from — shared across cytology and surgical pathology. One category within the consolidated Vendor Integrations screen.',
    synonyms: ['ai vendor', 'digital pathology', 'computational pathology', 'paige', 'ibex', 'pathai', 'proscia', 'hologic', 'fda cleared'] },
  { id: 'sys-wsi-viewer-vendors', label: 'Vendor Integrations — WSI Viewers', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'vendor_integrations',
    description: 'Real, launchable whole-slide-image viewer platforms and their real launch URL templates — configure a vendor\'s real viewer URL here so "Launch in Viewer" can route to a specific slide. One category within the consolidated Vendor Integrations screen.',
    synonyms: ['wsi viewer', 'whole slide imaging', 'scanner', 'leica', 'aperio', 'roche', 'upath', 'hamamatsu', 'philips', 'intellisite', 'launch url', 'dicom'] },
  { id: 'sys-ims-vendors', label: 'Vendor Integrations — Image Management Systems', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'vendor_integrations',
    description: 'Real, reference-only image/PDF storage endpoints — an enterprise VNA/PACS/DAM or a smaller site\'s own on-prem file server. PathScribe never stores the binary payload itself, only a URL pointing here. One category within the consolidated Vendor Integrations screen.',
    synonyms: ['image management', 'vna', 'pacs', 'dam', 'on-prem', 'file server', 'image storage', 'pdf storage', 'fallback url'] },
  { id: 'sys-gross-imaging-vendors', label: 'Vendor Integrations — Gross / Macro Imaging & Telepathology', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'vendor_integrations',
    description: 'Real, point-of-capture gross/macro imaging and telepathology vendors for the cut-up bench (PAX-it!/PAXcam, Smart In Media PathoZoom®, Milestone Medical MacroPATH) — annotation, measurement, and live streaming, distinct from a WSI viewer or passive image store. One category within the consolidated Vendor Integrations screen.',
    synonyms: ['gross imaging', 'macro imaging', 'telepathology', 'grossing camera', 'cut-up', 'paxit', 'paxcam', 'pathozoom', 'smart in media', 'macropath', 'milestone medical'] },
  { id: 'sys-cytology-qc-rules', label: 'Cytology QC Rules', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'cytology_qc_rules',
    description: 'Real, admin-configurable rules that sample, assign, and route cytology cases for QC peer review — criteria, sampling logic (percentage/interval/fixed-volume), priority tier, and SLA. Seeded with real, international default rules (US CLIA, UK NHS, EU ISO 15189, Australia NATA).',
    synonyms: ['qc rules', 'quality control', 'rescreen', 'peer review', 'cytology qc', 'clia', 'rapid rescreen', 'assignment engine'] },
  { id: 'sys-or-suite-terminals', label: 'OR Suite Terminals', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'or_suite_terminals',
    description: 'Real, per-OR "Station Identity" wall-display terminals for the Intraoperative/Frozen Section Dashboard, each bound to one specific Location.',
    synonyms: ['or dashboard', 'intraoperative dashboard', 'frozen section', 'or suite', 'station identity', 'operating room terminal'] },
  { id: 'sys-display-profiles', label: 'Display Profiles (Facility Ops Dashboards)', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'display_profiles',
    description: 'Real, data-only device registry for the five Facility Ops Dashboard wall displays (Grossing & Intake, Embedding & Microtomy, Staining & IHC, Send-Out & Reference, Diagnostic Sign-Out/Scanner) — each profile bound to one performing lab and one or more views.',
    synonyms: ['facility ops dashboard', 'department dashboard', 'wall display', 'kiosk', 'display profile', 'grossing dashboard', 'staining dashboard', 'lab operations dashboard'] },
  { id: 'sys-migration-field-mappings', label: 'Migration Field Mappings', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'migration_field_mappings',
    description: 'Real, admin-editable mapping from a legacy LIS\'s own source field names to this app\'s migration target fields, for the Historical Data Migration Engine.',
    synonyms: ['data migration', 'legacy import', 'field mapping', 'legacy lis', 'bulk import'] },
  { id: 'sys-cancer-registry-settings', label: 'Cancer Registry Reporting', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'cancer_registry_settings',
    description: 'Real, facility-scoped central cancer registry setting (NAACCR, CPAC, COSD, INCa, ADT/GEKID, AIHW, NZ Cancer Registry, KCCR) for surgical pathology sign-out reporting — genuinely separate from Cytology Registry Reporting.',
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
  { id: 'sys-jurisdiction', label: 'Jurisdiction', tabId: 'system', tabLabel: 'System', confidence: 'verified',
    description: 'Sets the SNOMED CT release and ICD variant for the lab\'s region (US, CA, GB, IE).',
    synonyms: ['snomed', 'icd', 'cap', 'rcpath', 'region'] },
  { id: 'sys-specimens', label: 'Specimens', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'specimens',
    description: 'The specimen dictionary that drives autocomplete in Case Search and case creation.',
    synonyms: ['specimen dictionary', 'specimen types', 'autopsy specimen category'] },
  // Real, per direct follow-up: "it all needs to be wired" — neither
  // the Protocol Dictionary nor the (newly-built) Asset Location
  // Dictionary had any real entry here at all, meaning searching
  // "autopsy" or "mortuary" in Config found nothing, even though the
  // real configuration itself exists.
  { id: 'sys-protocols', label: 'Protocol Dictionary', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'protocols',
    description: 'The standalone processing-workflow dictionary (fixative, pathways, block/decant counts) referenced by Specimen Dictionary entries, including the Autopsy Cardiac Sectioning protocol.',
    synonyms: ['protocol', 'pathway', 'processing workflow', 'autopsy cardiac sectioning'] },
  { id: 'sys-asset-locations', label: 'Asset Location Dictionary', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'asset_locations',
    description: 'The governed reference list for physical/asset locations, including mortuary storage slots and their real-time occupancy.',
    synonyms: ['mortuary', 'storage slot', 'autopsy storage', 'tray utilization', 'occupancy'] },
  { id: 'sys-subspecialties', label: 'Subspecialties', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'subspecialties',
    description: 'Subspecialty pools for the delegation workflow.',
    synonyms: ['subspecialty pools', 'delegation routing'] },
  { id: 'sys-terminology', label: 'Terminology Services', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'terminology',
    description: 'Connection status for SNOMED CT, UMLS, and other terminology services (Connected/Degraded/Offline).',
    synonyms: ['snomed ct', 'umls', 'terminology status'] },
  { id: 'sys-physicians', label: 'Physician Directory', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'physicians',
    description: 'External referring/ordering physician records used for report routing.',
    synonyms: ['physicians', 'referring doctor', 'ordering physician'] },
  { id: 'sys-flags', label: 'Flag Management', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'flags',
    description: 'Case and specimen flags — visual markers for clinical context or required actions.',
    synonyms: ['case flags', 'specimen flags', 'severity level'] },
  // Real, per direct follow-up ("did we work on this yet? Per-facility
  // Specimen Deficiencies"): this section was confirmed real, built,
  // and live (Config → System → Integrations group → Specimen
  // Deficiencies) but had zero index entry at all — added here now.
  // tabId 'system' since that's this section's own, real, confirmed
  // home (Config/Integrations/index.tsx, a genuine duplicate at the
  // time this was first written, has since been deleted entirely —
  // see components/Config/Integrations/README.md).
  { id: 'sys-deficiencies', label: 'Specimen Deficiencies', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'deficiencies',
    description: 'Deficiency Type and Resolution Type dictionaries for the Specimen/Requisition Deficiency workflow, with real per-performing-lab scoping.',
    synonyms: ['deficiency type', 'resolution type', 'specimen deficiency', 'requisition deficiency', 'could not match specimen'] },
  { id: 'sys-delegation-types', label: 'Delegation Types', tabId: 'system', tabLabel: 'System', confidence: 'verified', section: 'delegation_types',
    description: 'Labels for case delegation (Peer Review, Second Opinion, Subspecialty Referral, MDT Discussion).',
    synonyms: ['peer review', 'second opinion', 'mdt discussion'] },
  // No `section` here either, same reasoning as 'sys-jurisdiction'
  // above — 'info' isn't a real SystemSection sidebar item.
  { id: 'sys-info', label: 'System Information', tabId: 'system', tabLabel: 'System', confidence: 'verified',
    description: 'Application version, AI provider/model, and API connectivity status for support diagnostics.',
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
  { id: 'sys-cytology-categories', label: 'Interpretation and Recommendations (Cytology)', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'cytology_categories',
    description: 'Standardized specimen adequacy, general categorization, interpretation/result, and clinical recommendation vocabulary for GYN cytology — Bethesda, BSCC/RCPath (UK), München III (Germany), and SFCC (France, French-labeled Bethesda).',
    synonyms: ['cytology', 'bethesda', 'pap smear', 'cervical cytology', 'bscc', 'rcpath', 'sfcc', 'munchen', 'dyskaryosis'] },
  { id: 'sys-non-gyn-cytology-categories', label: 'Non-GYN Classification (Milan/Paris)', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'non_gyn_cytology_categories',
    description: 'Real, admin-editable diagnostic category dictionaries for the Milan System (salivary gland FNA) and the Paris System (urinary tract cytology, TPS 2.0) — separate from GYN cervical cytology.',
    synonyms: ['milan system', 'paris system', 'salivary gland cytology', 'urinary cytology', 'urine cytology', 'non-gyn', 'sump', 'hguc', 'nhguc'] },
  { id: 'sys-cytology-qc', label: 'Cytology QC Random Selection Rate', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'cytology_qc_settings',
    description: 'The real, configured rate at which negative GYN cytology screens are randomly selected for 10% rescreening QC.',
    synonyms: ['cytology', 'rescreening', 'random selection', 'qc rate'] },
  { id: 'sys-cytology-histo-correlation', label: 'Cyto-Histologic Correlation (SNOMED Mapping)', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'snomed_histology_severity_mapping',
    description: 'Maps SNOMED-coded histology diagnoses to a real severity rank, for automated cytology-histology correlation QA.',
    synonyms: ['cytology', 'histology correlation', 'snomed mapping', 'cyto-histo'] },
  { id: 'cyt-nomenclature', label: 'Cytology Nomenclature System', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'cytology_nomenclature',
    description: 'Two-tier cascade (Enterprise + Facility) controlling which real reporting terminology a lab\'s interpretation dropdowns use.',
    synonyms: ['cytology', 'nomenclature', 'bethesda', 'bscc', 'sfcc', 'palga', 'terminology system'] },
  { id: 'cyt-registry', label: 'Cytology Registry Reporting', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'cytology_registry',
    description: 'Two-tier cascade controlling which real, national centralized registry a lab\'s signed-out GYN cytology results report to.',
    synonyms: ['cytology', 'registry', 'csms', 'cervicalcheck', 'palga', 'ncsr', 'kncsp'] },
  { id: 'cyt-routing', label: 'Non-GYN Cytology Routing', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'cytology_routing',
    description: 'Two-tier cascade controlling which real worklist a non-GYN cytology specimen lands on for review.',
    synonyms: ['cytology', 'routing', 'non-gyn', 'fna', 'body fluid'] },
  { id: 'cyt-screening-strategy', label: 'Cytology Screening Strategy', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'cytology_screening_strategy',
    description: 'Two-tier cascade controlling the base cervical screening strategy a lab follows — co-testing, primary HPV reflex, or cytology only.',
    synonyms: ['cytology', 'screening strategy', 'co-testing', 'primary hpv', 'reflex'] },
  { id: 'cyt-workload-cap', label: 'Cytology Daily Workload Cap', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'cytology_workload_cap',
    description: 'Three-tier cascade (Enterprise + Facility + Staff) controlling the maximum real number of GYN cytology slides a cytotechnologist may screen in one day (CLIA workload limit).',
    synonyms: ['cytology', 'workload cap', 'daily slide cap', 'clia', 'cytotechnologist'] },
  { id: 'cyt-instrumentation', label: 'Cytology Assisted Instrumentation', tabId: 'cytology', tabLabel: 'Cytology', confidence: 'verified', section: 'cytology_instrumentation',
    description: 'Global setting for whether a lab digitizes cervical cytology slides (WSI) or uses a traditional, physical-guided scope.',
    synonyms: ['cytology', 'instrumentation', 'wsi', 'whole slide imaging', 'traditional guided'] },

  // ── Staff tab ──────────────────────────────────────────────────────────────
  { id: 'staff-add', label: 'Add Staff Member', tabId: 'staff', tabLabel: 'Staff', confidence: 'verified',
    description: 'Add a new Pathologist, Resident, or Admin user.',
    synonyms: ['new user', 'add user'] },
  { id: 'staff-roles', label: 'Roles and Permissions', tabId: 'staff', tabLabel: 'Staff', confidence: 'verified',
    description: 'Built-in and custom roles, with granular per-action permissions.',
    synonyms: ['pathologist role', 'resident role', 'admin role', 'permissions'] },
  { id: 'staff-deactivate', label: 'Deactivate / Reactivate Users', tabId: 'staff', tabLabel: 'Staff', confidence: 'verified',
    description: 'Block or restore a user\'s login access without deleting their record.',
    synonyms: ['disable user', 'block login'] },

  // ── Action Registry tab ───────────────────────────────────────────────────
  { id: 'actions-registry', label: 'Action Registry', tabId: 'actions', tabLabel: 'Action Registry', confidence: 'verified',
    description: 'Edit keyboard shortcuts and voice triggers for the 139 registered actions.',
    synonyms: ['voice triggers', 'keyboard shortcuts'] },

  // ── Report Templates tab ──────────────────────────────────────────────────
  { id: 'tpl-builder', label: 'Report Template Builder', tabId: 'templates', tabLabel: 'Report Templates', confidence: 'verified',
    description: 'Build and assemble CAP/RCPath-compliant report Parts into Templates.',
    synonyms: ['parts', 'cap templates', 'template assembly', 'part library'] },
  { id: 'tpl-ai-generation', label: 'AI Generation Configuration', tabId: 'templates', tabLabel: 'Report Templates', confidence: 'verified',
    description: 'Per-section AI narrative generation settings — system instruction, max tokens, temperature.',
    synonyms: ['temperature', 'system instruction', 'max tokens'] },

  // ── Demo Reset tab ─────────────────────────────────────────────────────────
  { id: 'demo-reset', label: 'Demo Reset', tabId: 'demo', tabLabel: 'Demo Reset', confidence: 'verified',
    description: 'Reset mock data for your hospital only, or a full reset across all testers (development/staging only).',
    synonyms: ['reset data', 'full reset', 'staging only'] },
  // Real, direct follow-up (Sep 2026): moved here from a flat top-level
  // Home tile, per direct guidance ("seems like a Testing tool") — see
  // DemoResetTab.tsx's own "Testing & Demo Tools" section.
  { id: 'demo-molecular-order-queue', label: 'Molecular Order Queue (Demo)', tabId: 'demo', tabLabel: 'Demo Reset', confidence: 'verified',
    description: 'Simulate outbound molecular assay/instrument orders and inbound results, including HPV reflex genotyping, against a fixed demo seed case.',
    synonyms: ['molecular order queue', 'hpv simulation', 'reflex genotyping', 'outbound queue demo'] },

  // ── Voice tab ──────────────────────────────────────────────────────────────
  { id: 'voice-profile', label: 'Voice Profile', tabId: 'voice', tabLabel: 'Voice', confidence: 'verified',
    description: 'EN-US or EN-GB — drives voice command recognition accuracy.',
    synonyms: ['en-us', 'en-gb', 'accent'] },

  // ── Synoptic Library tab ──────────────────────────────────────────────────
  { id: 'protocols-library', label: 'Synoptic Library', tabId: 'protocols', tabLabel: 'Synoptic Library', confidence: 'verified',
    description: 'CAP-compliant and RCPath synoptic protocol library used in case reporting.',
    synonyms: ['cap protocols', 'rcpath', 'synoptic templates'] },

  // ── Macros tab — PLACEHOLDER, not documented anywhere yet ────────────────
  { id: 'macros-placeholder', label: 'Macros', tabId: 'macros', tabLabel: 'Macros', confidence: 'placeholder',
    description: '(Undocumented) Likely text-expansion or voice macro shortcuts — needs review against actual component.',
    synonyms: ['text expansion', 'shortcuts'] },

  // ── Validation Studies tab — PLACEHOLDER, not documented anywhere yet ────
  { id: 'validation-placeholder', label: 'Validation Studies', tabId: 'validation', tabLabel: 'Validation Studies', confidence: 'placeholder',
    description: '(Undocumented) Admin/superadmin-only section — needs review against actual component.',
    synonyms: ['validation', 'studies'] },
];
