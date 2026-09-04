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
  | 'ai' | 'protocols' | 'staff' | 'voice' | 'system'
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
    synonyms: ['specimen dictionary', 'specimen types'] },
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
