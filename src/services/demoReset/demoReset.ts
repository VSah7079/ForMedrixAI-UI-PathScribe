// src/services/demoReset/demoReset.ts
// ─────────────────────────────────────────────────────────────────────────────
// Demo data reset (mock backend only). Moved out of
// components/Config/System/DemoResetTab.tsx in Batch 370 (PS-356), so the
// screen no longer touches browser storage (standing rule 4) and the
// decision to reset is made here:
//
//   resetAllDemoData(deps)  every tester's demo data. Needs the capability
//                           config:demo-data:reset (checked and audited).
//   executeUserReset(id)    only the signed-in user's own hospital's data;
//                           no capability, since it touches nothing of
//                           anyone else's.
//
// Both refuse to run unless IS_MOCK_BACKEND: a real database is never reset
// from the browser. The key lists are what DemoResetTab.auditTest.ts
// checks against every storage key in src/.
// ─────────────────────────────────────────────────────────────────────────────

import { IS_MOCK_BACKEND } from '../index';
import type { IAuthorizationService } from '../authorization/authorizationService';

export const DEMO_RESET_CAPABILITY = 'config:demo-data:reset';

// ─── Reset utilities ──────────────────────────────────────────────────────────

export const MOCK_PREFIX   = 'pathscribe_mock_';
export const SESSION_KEY   = 'pathscribe-user';
// Real fix, per direct report: "reset the demo data, logged back in,
// got an 'Already signed in elsewhere' message." That marker
// (services/session/sessionSupersedeService.ts) is deliberately its
// own key namespace, not under MOCK_PREFIX and not in SESSION_KEY —
// so neither existing cleanup path ever touched it. A reset cleared
// the user's own session but left the stale active-session marker
// from before the reset sitting in localStorage; the very next login
// found that stale marker and incorrectly concluded the account was
// already signed in elsewhere. clearActiveSessionId()'s own doc
// comment already warned about exactly this failure mode ("without
// this, a perfectly normal future login would incorrectly detect a
// conflict against a stale marker nobody ever cleared") — this reset
// flow was the gap that comment was warning about.
export const ACTIVE_SESSION_KEY_PREFIX = 'pathscribe_active_session_';

// Real, per direct follow-up: "review the whole system, you may
// likely find other gaps." A real, exported single source of truth
// for every key confirmed to exist but deliberately left out of every
// list below — so the audit test (DemoResetTab.auditTest.ts) checks
// against this real, documented list directly, rather than a second,
// separate list in the test file that could silently drift out of
// sync with this one's own reasoning.
export const DELIBERATELY_NOT_RESET: Record<string, string> = {
  pathscribe_audit_logs: 'a genuine, immutable compliance audit trail — surviving a demo reset is the correct behavior, not a gap.',
  pathscribe_error_logs: 'same real reasoning as pathscribe_audit_logs above.',
  ps_ai_audit_log_v1: 'a genuine AI-decision audit trail, not demo state.',
  pathscribe_support_audit: "each organisation's hash-chained support audit stream (Batch 372) — a compliance audit trail the hospital owns; clearing it would read as tampering.",
  billing_rule_versions_v1: "the admin-configured Billing Dictionary itself (RVU values, coding rules) — long-lived configuration, not per-case demo data. Resetting it would wipe a real customer's own billing setup, not restore a clean baseline.",
  modifier_dictionary_versions_v1: 'same real reasoning as billing_rule_versions_v1 above — an admin-configured billing dictionary.',
  rvu_code_map_versions_v1: 'same real reasoning as billing_rule_versions_v1 above — an admin-configured billing dictionary.',
  billing_code_import_jobs_v1: 'the import-job ledger for billing_rule_versions_v1 (PS-89) — it must stay in step with the rules it created and supports their rollback, so it is kept with them.',
};

/** A key that survives a Full Reset: named in DELIBERATELY_NOT_RESET, bare or under MOCK_PREFIX. */
export function keptThroughReset(storageKey: string): boolean {
  const bare = storageKey.startsWith(MOCK_PREFIX) ? storageKey.slice(MOCK_PREFIX.length) : storageKey;
  return Object.prototype.hasOwnProperty.call(DELIBERATELY_NOT_RESET, bare);
}

export const VERSIONED_KEYS = [
  'pathscribe_users_version',
  'pathscribe_messages_version',
  'pathscribe_mock_cases_version',
  'pathscribe_flags_version',
  // Real fix, per direct follow-up: "make sure the demo reset is
  // covering everything." Found via a full, systematic audit of
  // every real localStorage key literal used anywhere in src/ (both
  // via mockStorage.ts's storageGet/storageSet — already covered by
  // the MOCK_PREFIX sweep below, regardless of this list — and every
  // raw localStorage.getItem/setItem call with its own, independent
  // key), cross-referenced against this file's own reset lists.
  // pathscribe_orders_seed_version is this app's own, newest example
  // of the exact failure mode this audit was looking for: a real key
  // added alongside a real feature, genuinely missed here until
  // checked directly.
  'pathscribe_orders_seed_version',
  // Real, per direct follow-up: "review the whole system, you may
  // likely find other gaps" — a full, programmatic audit (every real
  // storageGet/storageSet key literal plus every raw
  // localStorage.getItem/setItem/removeItem call, cross-referenced
  // against every list/prefix sweep in this file) found these ten
  // real seed/version sentinels with no existing coverage. Same exact
  // real shape as pathscribe_orders_seed_version above — the version
  // marker for a real, already-covered data key, missed independently
  // of that key because the two are separate real localStorage
  // entries.
  'pathscribe_actions_version', 'pathscribe_facilities_seed_version', 'pathscribe_flags_seed_version',
  'pathscribe_cytology_categories_seed_version', 'cytology_review_records_seed_version',
  'cytologyQcSettings_seed_version', 'facilityRegistryOverrides_seed_version',
  'facilityCytologyNomenclatureOverrides_seed_version', 'facilityCytologyRegistryOverrides_seed_version',
  'facilityCytologyScreeningStrategyOverrides_seed_version',
];

export const SETTINGS_KEYS = [
  'specimen_dictionary',
  'container_types',
  'reagent_lots',
  'workstation_groups',
  'action_groups',
  'pathscribe_delegation_types_v2',
  'pathscribe_internal_notes_v2',
  'pathscribe_subspecialties',
  'pathscribe_report_templates',
  'pathscribe_participation_types_v2', // the real, canonical key (services/participationTypes/mockParticipationTypeService.ts)
  'pathscribe_participation_types',    // orphaned old key from ParticipationTypesSection.tsx's now-removed separate local list -- included so any stale leftover data gets cleared too
  // Added after a full audit of every storageGet/storageSet key across
  // services/ against this list -- these 16 real service storage keys
  // were previously missing entirely, meaning this data silently
  // survived a "Demo Reset". Deliberately NOT included:
  // pathscribe_audit_logs / pathscribe_error_logs (shouldn't reset with
  // demo data -- an audit trail and error log surviving a demo reset is
  // the correct behavior, not a gap). Same real reasoning, found and
  // deliberately excluded during the later, full audit below:
  // ps_ai_audit_log_v1 (a genuine AI-decision audit trail, not demo
  // state).
  'pathscribe_roles',
  'pathscribe_users',
  'pathscribe_facilities',
  'pathscribe_physicians',
  'pathscribe_protocols',
  'pathscribe_macros',
  'pathscribe_fonts',
  'pathscribe_models',          // pre-PS-58 unscoped list; migrated on first load, kept here for old installs
  'pathscribe_model_adoptions', // PS-58: per-organisation adoption records
  'pathscribe_assist_lis_polling', // PS-87: Assist LIS polling settings, cursor and run log
  'pathscribe_lis_staging_queue',  // PS-87: universal LIS staging queue (Batch 323)
  'pathscribe_template_governance', // PS-63: template self-approval / required reviewers (Batch 328)
  'pathscribe_deficiency_types',
  'pathscribe_resolution_types',
  'pathscribe_departments',
  'pathscribe_specimen_crosswalk',
  'pathscribe_specimen_deficiencies',
  'pathscribe_grossing_routing_overrides',
  'pathscribe_incoming_orders',
  'pathscribe_management_reviews',

  // ── Real fix, per direct follow-up: "make sure the demo reset is
  //    covering everything." Every key below was found via the same
  //    full, systematic audit as VERSIONED_KEYS's own new entry —
  //    real, live, mutable app/admin/demo state with no existing
  //    reset coverage at all until now. Grouped by real feature area
  //    for readability, not because the reset logic treats them any
  //    differently — remove() runs the exact same way for all of
  //    them. ──
  // AI config/learning
  'pathscribe_ai_org_config', 'pathscribe_ai_user_config',
  'pathscribe_narrative_signals_v2', 'pathscribe_template_suggestion_signals_v1',
  'ps_ai_behavior_config_v1', 'ps_dictation_corrections',
  // Scan station selection/prompt state — real, per-device demo state
  // (which physical bench a tester is "at" right now), not a genuine
  // user preference worth surviving a reset.
  'pathscribe_current_scan_station_id', 'pathscribe_scan_station_prompted',
  // MPI (Master Patient Index) demo records
  'pathscribe_mpi_identifiers', 'pathscribe_mpi_links', 'pathscribe_mpi_records',
  // Template/case routing config
  'pathscribe_routing_rules_v1', 'pathscribe_routing_config', 'pathscribe_routing_rules', 'delivery_rules_v1',
  // Real, per PS-278 (Print Destination Routing Engine)
  'print_routing_rules_v1',
  'ps_registry_overrides_v1', 'ps_case_registries_v1', 'ps_case_number_series_v1',
  // Validation studies, research feed
  'pathscribe_validation_studies_v1',
  'pathscribe_pubmed_ticker_backoff', 'pathscribe_pubmed_ticker_cache', 'pathscribe_research_feed_config', 'pathscribe_research_feed_health',
  // Org-level config toggles/settings
  'pathscribe_orchestrator_mode', 'pathscribe_idle_timeout_minutes',
  'pathscribe_release_buffer_org_config',
  'pathscribe_org_document_style_footer', 'pathscribe_org_document_style_header', 'pathscribe_org_document_style_body',
  'pathscribe_governing_bodies', 'pathscribe_tat_entries_v2', 'pathscribe_retention_policy',
  'pathscribe_external_resources', 'pathscribe_encounters',
  // Real feature, per direct follow-up: dispatched-event log for the
  // Interface Engine STUB (no real engine wired yet, per that
  // module's own header) — simulated dispatch history, not a genuine
  // compliance audit trail, so it resets like any other demo data.
  'pathscribe_interface_engine_dispatched_events',
  'pathscribe_ai_feedback',
  // Action registry, claims, delegation
  'ps_action_registry', 'ps_claims_v1', 'ps_delegations_v1', 'ps_enhancement_config_v1', 'ps_editor_store_v1',
  // Biometric demo credentials/policy/session — same real "clears
  // like SESSION_KEY" reasoning, not real production auth data.
  'ps_biometric_credentials', 'ps_biometric_policy', 'ps_biometric_session', 'ps_biometric_wizard_dismissed',
  'pathscribe_own_session_id',
  // Real, system-wide config (jurisdiction and related settings —
  // RetentionPolicy.ts's own getCurrentJurisdiction()) and a second,
  // separate current-user cache (Config/AI/index.tsx) distinct from
  // the real SESSION_KEY this file already clears below.
  'pathscribe_system_config_v2', 'pathscribe_current_user',

  // Real, per direct follow-up: "review the whole system, you may
  // likely find other gaps" — a second full, systematic audit of
  // every real storageGet/storageSet key literal in services/ (this
  // time programmatic: extracted every key, cross-referenced against
  // every list/prefix sweep in this file, then checked each
  // uncovered key's own real seed-data fallback before adding it
  // here — see DELIBERATELY_NOT_RESET below for the one case that
  // check correctly excluded). Grouped below by real feature
  // area; all are genuinely admin-configured dictionaries/settings/
  // overrides — the same real category as pathscribe_protocols/
  // specimen_dictionary above, confirmed one at a time, not per-case
  // or per-tester demo state.
  // Billing dictionaries — this closes the exact gap this file's own
  // CASE_KEYS comment already anticipated ("Deliberately NOT
  // resetting 'billing_rule_versions_v1' here... not per-case data")
  // but never actually followed through on adding anywhere.
  'billing_rule_versions_v1', 'modifier_dictionary_versions_v1', 'rvu_code_map_versions_v1',
  'pathscribe_jurisdiction_payment_mappings', 'pathscribe_master_payment_types',
  'pathscribe_billing_type_trigger_override',
  // Cytology settings/dictionaries (services/cytology/) — genuinely
  // numerous because this module has the most real, distinct
  // jurisdiction-specific configuration surfaces in the app.
  'cytologyNomenclatureSettings', 'cytologyQcSettings', 'cytologyRegistrySettings',
  'cytologyRoutingSettings', 'cytologyScreeningStrategy', 'cytologyWorkloadCapSettings',
  'cytologyInstrumentation', 'nonGynCytologyCategories',
  'facilityCytologyNomenclatureOverrides', 'facilityCytologyQcOverrides',
  'facilityCytologyRegistryOverrides', 'facilityCytologyRoutingOverrides',
  'facilityCytologyScreeningStrategyOverrides', 'facilityCytologyWorkloadCapOverrides',
  // Real, per direct follow-up on Cytology Assisted Instrumentation
  // ("each performing facility could identify their own mode... high
  // priority given multi-facility support") — the new Tier 2 override
  // key, same real category as its siblings just above.
  'facilityCytologyInstrumentationOverrides',
  'staffCytologyQcOverrides', 'staffCytologyWorkloadCapOverrides', 'staffConcordanceReviewOverrides',
  // Cancer registry settings + facility overrides.
  'cancerRegistrySettings', 'facilityCancerRegistryOverrides', 'registrySettings', 'facilityRegistryOverrides',
  // Equipment/hardware dictionaries — real seed data confirmed for
  // each; a lab's own configured scan stations, cassette colors, and
  // grossing hardware profiles, same real category as the Stain/
  // Protocol Dictionary already above.
  'scan_stations', 'cassette_colors', 'cassette_routing_rules', 'pathscribe_grossing_hardware_profiles',
  // Batch 358: the equipment register (services/equipment/), and Batch 356's
  // instrument list it reads once when migrating.
  'equipment', 'instruments',
  // Batch 360: the equipment service log (reseeded relative to the reset day).
  'equipment_log',
  // Batch 364: support references (services/supportReferences/).
  'support_references',
  'report_change_log',     // Batch 368 (PS-353): report change log
  'storageUnits', 'storageConditionTypes', 'hardware_containers', 'pathscribe_printer_profiles',
  'printSettings', 'facilityPrintSettings',
  // Other real, standalone dictionaries.
  'clinicalHistoryDictionary', 'dpVendorDictionary', 'molecular_targets_v1',
  'reason_dictionary_entries_v1', 'pathscribe_specimen_categories', 'pathscribe_abnormal_trigger_rules',
  'pathscribe_aiBehavior', 'pathscribe_locations', 'pathscribe_systemConfig',
  'qa_activity_types', 'qa_supervision_assignment_types', 'migrationFieldMappings',
  // PS-324. mockSurgicalPeerReviewRiskWeightService.ts's own admin-
  // configured subspecialty risk-weight dictionary — same real
  // "admin config, not per-case data" bucket as qa_activity_types
  // immediately above.
  'surgical_peer_review_risk_weights_v1',

  // Real, per the same "review the whole system" follow-up — six more
  // real, verified-safe admin dictionaries/settings found by the same
  // programmatic audit. Each one's own seed-data fallback was checked
  // directly before adding it here (see DELIBERATELY_NOT_RESET above
  // for the one real case that check disqualified).
  'label_designer_layouts', 'mock_interface_engine_settings',
  'molecular_assay_control_rules', 'molecular_extraction_racks',
  'ncci_ptp_edit_imports_v2', 'pathscribe_billing_type_trigger_site_overrides',
  'pathscribe_cytology_categories_v1',
  // Real, per direct follow-up: "shouldn't we have seed data?" —
  // mockOrSuiteTerminalService.ts now has a real SEED_TERMINALS
  // fallback (one real OR-type Location already in this app's own
  // seed data), closing the exact gap that previously disqualified
  // this key from joining the reset. Moved here from
  // DELIBERATELY_NOT_RESET now that the real, underlying cause is
  // fixed, not just documented around.
  'orSuiteTerminals',
  // PS-288 — same real reasoning as orSuiteTerminals just above:
  // mockDisplayProfileService.ts has a real SEED_PROFILES fallback
  // from the start, so a Full Reset restores a ready-to-bind display
  // profile rather than leaving zero profiles to bind to.
  'displayProfiles',
  // Real, per direct follow-up ("why not a synthetic SNOMED... it's
  // fake and just there to show customers"). Now has real,
  // structurally-safe synthetic seed data (mockSnomedCervicalHistology
  // SeverityMappingService.ts's own SEED — every code prefixed
  // "TEST-SNOMED-", never a real licensed SNOMED CT code) — moved
  // here from DELIBERATELY_NOT_RESET now that the real, underlying
  // "nothing safe to fall back to" concern is resolved.
  'snomed_cervical_histology_severity_mapping',
  // Real, per direct follow-up ("Why not a main Vendor Integration...")
  // — three more real dictionaries introduced after the last full
  // audit of this file, each with real seed data confirmed safe
  // before adding: WSI viewer vendors, Image Management System
  // vendors, and Gross/Macro Imaging & Telepathology vendors.
  'wsiViewerVendorDictionary', 'imageManagementSystemVendorDictionary', 'grossImagingVendorDictionary',
  // Real, per the Automated Cytopathology QC Assignment Engine — the
  // admin-configurable rule set itself. Has real, international seed
  // data (7 real rules) — confirmed safe to reset, same pattern as
  // every other real, seeded dictionary in this file.
  // Real, per direct guidance's own confirmed vitest alias-resolution
  // fix — DemoResetTab.coverage.test.ts couldn't even run before that
  // fix (blocked on an unrelated @/ import failure), so this real gap
  // was invisible until the test suite could finally execute. Real,
  // admin-configured dictionary (Asset Location Dictionary, used by
  // the Autopsy mortuary-storage-occupancy work), with a real,
  // confirmed-safe seed fallback (SEED_ASSET_LOCATIONS in
  // mockAssetLocationDictionaryService.ts) before adding it here,
  // same discipline as every other entry in this list.
  'cytologyQcRules',
  'pathscribe_asset_locations',
];

export const CASE_KEYS = [
  'cases', // CRITICAL FIX: was 'ps_cases', which mockCaseService.ts never actually wrote to — Demo Reset had never actually been clearing primary case data
  'orch_cases_v3',
  // Batch 345: signature records belong to the cases they sign, so they
  // reset with them (services/signatures/).
  'pathscribe_signature_records',
  // Found via a full storageGet/storageSet audit across services/ that
  // wasn't limited to the pathscribe_ prefix (that earlier, narrower
  // search is exactly how 'cases' and everything below was missed):
  'discordance_records',
  'amendment_records',
  'report_version_records',
  'lis_amendment_notices',
  'intraop_entries',
  'pathscribe_drafts',
  // Real fix, found ahead of a live demo: the Charge Capture ledger
  // (mockServiceChargeService.ts) is real, per-case transactional data
  // - confirmed billing codes generate real charges here, and deleted
  // codes generate real credits - exactly the same "accumulates during
  // demo usage, must reset with the case" shape as discordance_records/
  // amendment_records above. Was missing entirely: a second demo run
  // on the same seed case would have shown stale charges/credits left
  // over from the first. Deliberately NOT resetting
  // 'billing_rule_versions_v1' here - that's the admin-configured
  // Billing Dictionary itself (RVU values, coding rules), the same
  // kind of long-lived configuration as the Stain Dictionary, not
  // per-case data that should be wiped on every reset.
  // Real, per direct follow-up: "check that reset puts everything back
  // to a ready state" after the OR Suite Live Board's dismissal
  // workflow was built. Confirmed directly: mockOrEventLogService.ts's
  // own STORAGE_KEY is 'orEventLog' — genuinely missed here, same
  // exact failure mode as 'cases'/'intraop_entries' above (a bare,
  // non-pathscribe_-prefixed key no sweep below would ever catch).
  // Without this, a demo dismissal survives every reset and orphan-
  // references an intraopEntryId that intraop_entries above just
  // deleted.
  'orEventLog',
  'pathscribe_service_charges',

  // Real, per the same follow-up as orEventLog above ("review the
  // whole system") — every real outbound queue in the entire app,
  // confirmed one at a time. Every single one shares the exact same
  // real shape as orEventLog: accumulates during demo/test usage,
  // and (for several) would orphan-reference a caseId/intraopEntryId
  // that CASE_KEYS' own earlier entries just deleted, if left
  // uncleared.
  'accession_outbound_queue_v1', 'cancer_registry_outbound_queue_v1',
  'cytology_outbound_result_queue_v1', 'cytology_registry_outbound_queue_v1',
  'molecular_order_outbound_queue_v1', 'outbound_charge_queue_v1', 'outbound_lis_sync_queue_v1',
  'outbound_patient_adt_queue_v1', 'outbound_result_queue_v1', 'referral_outbound_queue_v1', 'print_queue_v1', 'reportReleasedEventLog',
  // Real, per-case/per-tester records, requests, and assignments —
  // all genuinely accumulate during demo/test usage; none of these
  // are admin-configured dictionaries.
  'access_requests', 'aiScreeningResults', 'batches', 'billing_deficiency_records_v1',
  'code_review_pool_v1', 'countersign_records', 'critical_result_notifications_v1',
  'critical_alert_dispatches_v1',
  'cytology_review_records', 'cytology_sign_out_records', 'cytology_workload_ledger_v1',
  'fppe_assignments', 'informal_review_requests', 'migrationJobs', 'migrationRecordResults',
  'molecular_batches', 'pathscribe_abnormal_detection_signals', 'pathscribe_interface_exceptions',
  'pathscribe_messages', 'ps_case_masks_v1', 'qa_activity_records', 'qa_supervision_assignments',
  'reconciliation_records', 'referral_tracking_v1', 'telemetryReadings',
  // Real, per the same "review the whole system" follow-up — two
  // more real, per-run accumulating records the same programmatic
  // audit found: WSI scanner batches and molecular QC run records,
  // same real shape as molecular_batches/batches above.
  'wsi_scan_batches', 'molecular_qc_run_records',
  // Real, per direct guidance's own lifecycle for this exact cache —
  // a real, per-active-case entry, genuinely correct to reset to
  // empty (the same "no history fetched yet" state a fresh case
  // starts in), introduced after the last full audit of this file.
  'patientHistoryCache',
  // Real, per the Automated Cytopathology QC Assignment Engine — real,
  // per-case assignment records, genuinely correct to reset to empty
  // (a fresh case starts with no QC assignment history at all).
  'cytologyQcCaseAssignments',
  // Real, per the same follow-up — this app's own real, systematic
  // audit test (DemoResetTab.auditTest.ts) found this one on its
  // first real run, beyond what the earlier manual pass caught. Real,
  // per-run accumulating data with a real SEED fallback confirmed —
  // same shape as intraop_entries above.
  'cytology_proficiency_test_results',
];

export const FLAG_KEYS = [
  'pathscribe_flags',
  'pathscribe_flags_v2',
];

export const STATE_KEYS = [
  'pathscribe_ped_requested',
  'pathscribe_orch_requested',
  'ps_learned_triggers',
  // Real fix, per direct follow-up: "make sure the demo reset is
  // covering everything." Minor, UI-level preference/state keys —
  // included anyway for a genuinely clean, predictable baseline
  // (per direct follow-up's own "returns everything to a test ready
  // position"), not because any one of these is high-stakes on its
  // own.
  'pathscribe-tab-width', 'pathscribe_header_compact_manual', 'pathscribe_voice_accent',
  // Batch 381: the report page's display preferences moved to utils/uiPreferences.
  'ps_ui_reportHeaderCompact', 'ps_ui_reportSidebarCollapsed', 'ps_ui_reportTabWidth',
  'pathscribe:desktopViewOverride', 'ps_sidebar_collapsed', 'ps_preview_margins', 'ps_preview_page_size',
  'pathscribe:savedSearches', 'pathscribe:lastSearch', 'ps_post_signout_pref',
  'pathscribe_show_superseded_notice', 'pathscribe_footpedal_bindings', 'ps_voice_ai_available',
  // Real, per the same follow-up as orEventLog above — the OR Suite
  // Live Board's own terminal binding (useCurrentOrTerminal.ts).
  // Exact same real reasoning already established for
  // pathscribe_current_scan_station_id two lines up: which physical
  // OR wall display a tester's browser is bound to right now, not a
  // genuine preference worth surviving a reset. Missed here only
  // because it postdates this file's own last full audit.
  'pathscribe_current_or_terminal_id',
  // PS-288 — same real reasoning immediately above, for the Facility
  // Ops Dashboard's own analogous kiosk binding
  // (useCurrentDisplayProfile.ts): which wall display a tester's
  // browser is bound to right now, not a genuine preference worth
  // surviving a reset.
  'pathscribe_current_display_profile_id',
  // Real, per the same follow-up as SETTINGS_KEYS/CASE_KEYS above.
  // Matches the exact real "_requested" pattern already several lines
  // up (pathscribe_ped_requested/pathscribe_orch_requested) — real,
  // per-user pool-claim state (components/Worklist/PoolClaimModal.tsx),
  // set via raw localStorage rather than the storageGet/storageSet
  // wrapper, which is exactly how the earlier systematic audits
  // missed it (they only ever swept storageGet/storageSet call
  // sites).
  'pathscribe_pool_access_requested',
  // Real, per the same follow-up — services/savedSearches/
  // mockSavedSearchService.ts's own real STORAGE_KEY is
  // 'pathscribe_savedSearches' (underscore), genuinely distinct from
  // 'pathscribe:savedSearches' (colon) already listed above. Kept as
  // a second, separate entry rather than assumed to be the same key
  // mistyped — not confirmed which one (if either) is a dead,
  // orphaned leftover, so both are cleared, same real "clear it
  // either way" posture as the pathscribe_participation_types/
  // pathscribe_participation_types_v2 pair in SETTINGS_KEYS above.
  'pathscribe_savedSearches',
  // Real, per the same "review the whole system" follow-up — a
  // comment-modal position preference (pages/Synoptic/Comments/
  // CommentModalShell.tsx) and the UI language selection (i18n/
  // config.ts). Same real "returns everything to a test ready
  // position" reasoning as the rest of this array — a fresh tester/
  // demo session should start from the same default language and
  // modal layout every time, not whatever a previous round left it at.
  'ps-cmnt-modal-pos', 'pathscribe_language',
  // Real, found by this same audit test's first real run — four more
  // real UI preference/state keys with no prior coverage, same real
  // "test ready position" reasoning as the rest of this array.
  'pathscribe:savedBillingLogQueries', 'ps-editor-theme-preference',
  'ps_preview_window_geometry', 'worklistSort',
];

// Hospital → user mapping (mirrors mockCaseService USER_HOSPITAL_MAP)
export const HOSPITAL_MAP: Record<string, string> = {
  'PATH-001':    'HOSP-001',   // Pete Nimmo — US demo
  'PATH-UK-001': 'HOSP-MFT',  // Paul Carter   — UK
  'PATH-UK-002': 'HOSP-MFT',
  'PATH-US-001': 'HOSP-MPA',  // Amber Fehrs-Battey — US
  'PATH-US-002': 'HOSP-HFHS',  // J. Mark Tuthill
  'PATH-RB-001': 'HOSP-RB',    // Rossana Babakhani
};

/** Read current user id from localStorage session */
export function getCurrentUserId(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id ?? parsed?.userId ?? null;
  } catch {
    return null;
  }
}

/** Full reset — clears all mock data for all users */
function executeFullReset(): string[] {
  // Real, critical, defense-in-depth safety check — per direct
  // follow-up: "The system cannot ever delete/reset a customer's
  // actual database entries." Never trust the UI's own disabled-button
  // state alone (a real, separate future entry point — a dev console
  // call, a different, unguarded UI surface — could bypass that);
  // this function itself refuses outright the moment this app is ever
  // cut over to a real, production backend. See services/index.ts's
  // own IS_MOCK_BACKEND doc comment for the full reasoning.
  if (!IS_MOCK_BACKEND) {
    throw new Error('Demo Reset is disabled — this app is connected to a real, non-mock backend. Refusing to risk deleting real customer data.');
  }
  const cleared: string[] = [];
  const remove = (k: string) => {
    if (localStorage.getItem(k) !== null) {
      localStorage.removeItem(k);
      cleared.push(k);
    }
  };

  VERSIONED_KEYS.forEach(remove);
  SETTINGS_KEYS.forEach(remove);
  CASE_KEYS.forEach(remove);
  FLAG_KEYS.forEach(remove);
  STATE_KEYS.forEach(remove);
  remove(SESSION_KEY);

  // Batch 372: the mock services store through mockStorage.ts, which puts
  // every key under MOCK_PREFIX, so the audit trails and billing
  // dictionaries in DELIBERATELY_NOT_RESET really live at
  // `pathscribe_mock_<key>`. This sweep used to clear them regardless,
  // contradicting that list; it now keeps them.
  Object.keys(localStorage)
    .filter(k => k.startsWith(MOCK_PREFIX) && !keptThroughReset(k))
    .forEach(k => { localStorage.removeItem(k); cleared.push(k); });

  // Real fix — see ACTIVE_SESSION_KEY_PREFIX's own comment above for
  // why this needs its own sweep, separate from the MOCK_PREFIX one.
  Object.keys(localStorage)
    .filter(k => k.startsWith(ACTIVE_SESSION_KEY_PREFIX))
    .forEach(k => { localStorage.removeItem(k); cleared.push(k); });

  // Real fix, per direct follow-up: "make sure the demo reset is
  // covering everything." Same real reasoning as the
  // ACTIVE_SESSION_KEY_PREFIX sweep immediately above — these two
  // real key families are built per-case/per-report at runtime
  // (ps_rpart_ — Report Part Builder's own per-part draft storage;
  // ps_orch_sections_ — Orchestrator draft sections, keyed by real
  // caseId), never a single, fixed key name a literal list could
  // ever fully enumerate.
  Object.keys(localStorage)
    .filter(k => k.startsWith('ps_rpart_') || k.startsWith('ps_orch_sections_'))
    .forEach(k => { localStorage.removeItem(k); cleared.push(k); });

  sessionStorage.clear();
  return cleared;
}

/**
 * Partial reset — removes only the current user's cases from the mock case
 * store, then forces a version bump so their cases re-seed from defaults.
 * Other users' work is preserved.
 */
export function executeUserReset(userId: string): string[] {
  // Same real, critical, defense-in-depth guard as executeFullReset —
  // see that function's own comment for the full reasoning.
  if (!IS_MOCK_BACKEND) {
    throw new Error('Demo Reset is disabled — this app is connected to a real, non-mock backend. Refusing to risk deleting real customer data.');
  }
  const cleared: string[] = [];
  const hospitalId = HOSPITAL_MAP[userId];

  // Load and filter the cases store
  const casesKey = `${MOCK_PREFIX}cases`;
  const raw = localStorage.getItem(casesKey);
  if (raw) {
    try {
      const cases = JSON.parse(raw);
      const filtered = cases.filter(
        (c: any) => c.originHospitalId !== hospitalId && c.hospitalId !== hospitalId
      );
      if (filtered.length !== cases.length) {
        localStorage.setItem(casesKey, JSON.stringify(filtered));
        cleared.push(`${casesKey} (removed ${cases.length - filtered.length} cases)`);
      }
    } catch {
      // If corrupt, remove the whole store — it will re-seed
      localStorage.removeItem(casesKey);
      cleared.push(casesKey);
    }
  }

  // Clear the cases version so the full seed re-runs on next load
  // (seed data is additive — it won't duplicate cases already present)
  localStorage.removeItem('pathscribe_mock_cases_version');
  cleared.push('pathscribe_mock_cases_version (version reset)');

  // Real fix — same gap as executeFullReset above, scoped correctly
  // here: only this user's own marker, since other testers' sessions
  // must survive a "my data only" reset.
  const ownActiveSessionKey = `${ACTIVE_SESSION_KEY_PREFIX}${userId}`;
  if (localStorage.getItem(ownActiveSessionKey) !== null) {
    localStorage.removeItem(ownActiveSessionKey);
    cleared.push(ownActiveSessionKey);
  }

  // Clear any user-specific session state
  sessionStorage.clear();
  cleared.push('sessionStorage');

  return cleared;
}

export type FullResetResult = { ok: true; cleared: string[] } | { ok: false; reason: 'notPermitted' };

/** Every tester's demo data, after checking config:demo-data:reset. */
export async function resetAllDemoData(deps: { authorization: Pick<IAuthorizationService, 'enforce'> }): Promise<FullResetResult> {
  const decision = await deps.authorization.enforce('config:demo-data:reset');
  if (!decision.allowed) return { ok: false, reason: 'notPermitted' };
  return { ok: true, cleared: executeFullReset() };
}
