import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useIsSuperAdmin } from '../../../contexts/AuthContext';
import '../../../pathscribe.css';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import type { Facility } from '../../../services';
import FlagConfigPage            from './FlagConfigPage';
import SpecimenDictionarySection from './SpecimenDictionarySection';
import StainDictionarySection from './StainDictionarySection';
import VendorIntegrationsSection from './VendorIntegrationsSection';
import CytologyQcRulesSection from './CytologyQcRulesSection';
import OrSuiteTerminalsSection from './OrSuiteTerminalsSection';
import DisplayProfilesSection from './DisplayProfilesSection';
import MigrationFieldMappingsSection from './MigrationFieldMappingsSection';
import CancerRegistrySettingsSection from './CancerRegistrySettingsSection';
import ProtocolDictionarySection from './ProtocolDictionarySection';
import PrinterProfilesSection from './PrinterProfilesSection';
import AssistLisPollingSection from './AssistLisPollingSection';
import GrossingRouteOverridesSection from './GrossingRouteOverridesSection';
import DepartmentsSection from './DepartmentsSection';
import AssetLocationDictionarySection from './AssetLocationDictionarySection';
import ContainerTypesSection from './ContainerTypesSection';
import ReagentLotsSection from './ReagentLotsSection';
import WorkstationGroupsSection from './WorkstationGroupsSection';
import ActionGroupsSection from './ActionGroupsSection';
import ScanStationsSection from './ScanStationsSection';
import EquipmentSection from './EquipmentSection';
import GrossingHardwareSection from './GrossingHardwareSection';
import CassetteRoutingRulesSection from './CassetteRoutingRulesSection';
import CassetteColorsSection from './CassetteColorsSection';
import PrintSettingsSection from './PrintSettingsSection';
import LabelDesignerPage from '../../../pages/LabelDesignerPage/LabelDesignerPage';
import SubspecialtiesSection     from './SubspecialtiesSection';
import FontsSection              from './FontsSection';
import DocumentStyleSection      from './DocumentStyleSection';
import RetentionSection          from './RetentionSection';
import GoverningBodiesSection    from './GoverningBodiesSection';
import DelegationTypeSection     from './DelegationTypeSection';
import RvuCodeMapSection         from './RvuCodeMapSection';
import NcciEditRulesSection      from './NcciEditRulesSection';
import MasterPaymentTypeDictionarySection from './MasterPaymentTypeDictionarySection';
import OutboundMessagePreviewSection from './OutboundMessagePreviewSection';
import JurisdictionPaymentMappingSection  from './JurisdictionPaymentMappingSection';
import DftExportPreviewSection   from './DftExportPreviewSection';
import BillingDictionarySection  from './BillingDictionarySection';
import PendingApprovalSection from './PendingApprovalSection';
import CodeImportSection from './CodeImportSection';
import ModifierDictionarySection from './ModifierDictionarySection';
import BillingTypeTriggerSection from './BillingTypeTriggerSection';
import ParticipationTypesSection from './ParticipationTypesSection';
import CountrySigningRulesSection from './CountrySigningRulesSection';
import SessionSecuritySection    from './SessionSecuritySection';
import SupportAccessSection      from './SupportAccessSection';
import FieldRequirementsSection  from './FieldRequirementsSection';
import ReleaseBufferSection      from './ReleaseBufferSection';
import ConcordanceReviewSettingsSection from './ConcordanceReviewSettingsSection';
import DeliveryRulesSection from './DeliveryRulesSection';
import PrintRoutingRuleSection from './PrintRoutingRuleSection';
import ContributionSettingsSection from './ContributionSettingsSection';
import ExternalResourcesSection  from './ExternalResourcesSection';
import ResearchFeedSection      from './ResearchFeedSection';
// Real, per direct request: the following 11 imports were previously
// registered in Integrations/index.tsx, which was its own top-level
// Configuration tab (a real, documented PS-85 reorg that moved them
// OUT of System). Per direct follow-up, moved back - but as a real,
// named group WITHIN System (matching this file's own existing
// group-tag pattern) rather than restoring the old, ungrouped flat
// list they lived in before PS-85. Integrations/index.tsx itself is
// now fully superseded and deleted - these are the exact same real
// components, imported from wherever each one actually lives, not
// duplicated.
import TerminologyServicesSection from '../Terminology/TerminologyServicesSection';
import CrosswalkSection from './CrosswalkSection';
import { FacilityDictionaryPage } from '../../../pages/system/FacilityDictionaryPage';
import CaseMaskConfigSection from './CaseMaskConfigSection';
import CasePoolAssignmentSection from './CasePoolAssignmentSection';
import RoutingRulesSection from './RoutingRulesSection';
import PhysiciansSection from './PhysiciansSection';
import DeficienciesSection from './DeficienciesSection';
import AbnormalTriggerRulesSection from './AbnormalTriggerRulesSection';
import QAConfigurationCenterSection from './QAConfigurationCenterSection';
import TemplateGovernanceSection from './TemplateGovernanceSection';
import { resetConfigScroll } from '../../../utils/resetConfigScroll';

// ── Section registry ──────────────────────────────────────────────────────────

type SystemSection =
  | 'flags'
  | 'subspecialties'
  | 'specimens'
  | 'stains'
  | 'vendor_integrations'
  | 'cytology_qc_rules'
  | 'or_suite_terminals'
  | 'display_profiles'
  | 'migration_field_mappings'
  | 'cancer_registry_settings'
  | 'departments'
  | 'asset_locations'
  | 'container_types'
  | 'reagent_lots'
  | 'workstation_groups'
  | 'action_groups'
  | 'scan_stations'
  | 'equipment'
  | 'grossing_hardware'
  | 'cassette_routing_rules'
  | 'cassette_colors'
  | 'fonts'
  | 'document_style'
  | 'retention'
  | 'session_security'
  | 'support_access'
  | 'field_requirements'
  | 'release_buffer'
  | 'concordance_review_settings'
  | 'template_governance'
  | 'delivery_rules'
  | 'print_routing_rules'
  | 'contribution_settings'
  | 'qa_config_center'
  | 'external_resources'
  | 'research_feed'
  | 'protocols'
  | 'grossing_route_overrides'
  | 'governing_bodies'
  | 'delegation_types'
  | 'rvu_code_map'
  | 'ncci_edit_rules'
  | 'master_payment_types'
  | 'jurisdiction_payment_mappings'
  | 'outbound_message_preview'
  | 'dft_export_preview'
  | 'billing_dictionary'
  | 'code_import'
  | 'billing_type_triggers'
  | 'pending_approvals'
  | 'modifier_dictionary'
  | 'participation_types'
  | 'country_signing_rules'
  | 'print_settings'
  | 'label_designer'
  | 'printer_profiles'
  | 'terminology'
  | 'crosswalk'
  | 'clients'
  | 'case_mask_config'
  | 'case_routing'
  | 'routing_rules'
  | 'physicians'
  | 'deficiencies'
  | 'abnormal_trigger_rules'
  | 'assist_lis_polling';

// Real, per PS-85 (Jira) — every item in this file belonged to
// exactly one of five real, named groups (Workstation & Hardware,
// Lab Materials & Workflows, Clinical Lookups, Financial & Revenue
// Lookups, Administration & Compliance); lis, identifiers,
// terminology, crosswalk, clients, facility_setup, case_mask_config,
// case_routing, routing_rules, physicians, and deficiencies moved OUT
// to their own top-level Integrations tab.
//
// Real, per direct follow-up, superseding PS-85's own top-level split:
// those 11 items are back here now, as a real sixth named group
// ("Integrations") rather than restored to the old, ungrouped flat
// list they lived in pre-PS-85. Integrations/index.tsx - which held
// only this same navigation wiring, no real content of its own - is
// deleted; nothing else referenced it.
// labelKey (not label) below — this array lives at module scope, outside
// any component's render, and can't call useTranslation() itself. Each
// key is resolved via t() at the one real render site (the sidebar nav
// button), same labelKey pattern established for GROSSING_TEMPLATES
// (SpecimenCategoriesSection.tsx, batch 70) and ROUTING_STEPS
// (CasePoolAssignmentSection.tsx, batch 67). `group` stays a literal,
// internal identifier (SystemTab's own group-equality checks and the
// GROUPS derivation below both key off it) — GROUP_LABEL_KEY, just
// below, maps each one to its own translated display text.
const SECTIONS: { id: SystemSection; emoji: string; labelKey: string; group: string }[] = [
  // ── Workstation & Hardware ──
  // Real, per direct follow-up ("Yes. It should be alpha within the
  // group"): every group below re-sorted alphabetically by label —
  // confirmed, via a real search through past sessions, that this was
  // always the deliberate, actively-maintained convention (one past
  // session explicitly repositioned an item to preserve alphabetical
  // order when its label changed; another explicitly built this
  // array as "15 sidebar items now alphabetical"). The live array had
  // genuinely drifted from that as new items were added over time
  // (mostly the newer Financial & Revenue Lookups and Integrations
  // groups) and simply appended rather than re-sorted. Group order
  // itself (Workstation & Hardware → ... → Integrations) is
  // unchanged — only the order of items within each group. (That
  // alphabetization was by the real English label; it's left as-is
  // per language rather than re-sorted per locale, same as every
  // other alphabetized list elsewhere in this app.)
  { id: 'print_settings',      emoji: '🖨️', labelKey: 'systemTab.sections.printSettings'        , group: 'Workstation & Hardware' },
  { id: 'label_designer',      emoji: '🏷️', labelKey: 'systemTab.sections.labelDesigner'        , group: 'Workstation & Hardware' },
  { id: 'printer_profiles',    emoji: '🖨️', labelKey: 'systemTab.sections.printerProfiles'      , group: 'Workstation & Hardware' },
  { id: 'scan_stations',       emoji: '📍', labelKey: 'systemTab.sections.scanStations'         , group: 'Workstation & Hardware' },
  // Batch 358: the equipment register (took over Batch 356's Instruments list).
  { id: 'equipment',           emoji: '🔬', labelKey: 'systemTab.sections.equipment'            , group: 'Workstation & Hardware' },
  // Batch 359: grossing cameras and scales (settings; the device is in the register).
  { id: 'grossing_hardware',   emoji: '📷', labelKey: 'systemTab.sections.grossingHardware'     , group: 'Workstation & Hardware' },

  // ── Lab Materials & Workflows ──
  { id: 'cassette_colors',     emoji: '🎨', labelKey: 'systemTab.sections.cassetteColors'       , group: 'Lab Materials & Workflows' },
  { id: 'cassette_routing_rules', emoji: '🧊', labelKey: 'systemTab.sections.cassetteRoutingRules', group: 'Lab Materials & Workflows' },
  { id: 'container_types',     emoji: '🧪', labelKey: 'systemTab.sections.containerTypes'       , group: 'Lab Materials & Workflows' },
  { id: 'reagent_lots',        emoji: '🧫', labelKey: 'systemTab.sections.reagentLots'          , group: 'Lab Materials & Workflows' },
  { id: 'workstation_groups',  emoji: '🗺️', labelKey: 'systemTab.sections.workstationGroups'    , group: 'Lab Materials & Workflows' },
  { id: 'action_groups',       emoji: '⚡', labelKey: 'systemTab.sections.actionGroups'          , group: 'Lab Materials & Workflows' },
  { id: 'stains',              emoji: '🧪', labelKey: 'systemTab.sections.stains'               , group: 'Lab Materials & Workflows' },
  // Real, per this module's own DP/AI vendor integration plan's final
  // remaining item. Placed in the same real group as the diagnostic
  // catalog above — this is shared, cross-module infrastructure
  // (surgical pathology + cytology both order AI screenings from it),
  // never a cytology-only setting.
  { id: 'vendor_integrations', emoji: '🔌', labelKey: 'systemTab.sections.vendorIntegrations', group: 'Lab Materials & Workflows' },
  { id: 'cytology_qc_rules', emoji: '🔬', labelKey: 'systemTab.sections.cytologyQcRules', group: 'Lab Materials & Workflows' },
  // Real, per direct design brief on the RFP-APLIS-2026-GLOBAL
  // Intraoperative/Frozen Section Dashboard — same real group as the
  // other lab-hardware/workflow registries.
  { id: 'or_suite_terminals',  emoji: '🏥', labelKey: 'systemTab.sections.orSuiteTerminals'     , group: 'Lab Materials & Workflows' },
  // PS-288 — data-only device registry for the five real Facility Ops
  // Dashboard wall displays. Same real group as OR Suite Terminals,
  // a genuinely analogous physical-display registry.
  { id: 'display_profiles',    emoji: '🖥️', labelKey: 'systemTab.sections.displayProfiles', group: 'Lab Materials & Workflows' },
  // Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration
  // Engine gap.
  { id: 'migration_field_mappings', emoji: '📦', labelKey: 'systemTab.sections.migrationFieldMappings', group: 'Lab Materials & Workflows' },
  // Real, per the RFP-APLIS-2026-GLOBAL Broader Cancer Registry
  // Exports gap — genuinely separate from Cytology's own Registry
  // Reporting subtab, per the RFP's own "Non-Cytology-Scoped" title.
  { id: 'cancer_registry_settings', emoji: '🏛️', labelKey: 'systemTab.sections.cancerRegistrySettings', group: 'Lab Materials & Workflows' },
  { id: 'flags',               emoji: '🚩', labelKey: 'systemTab.sections.flags'                 , group: 'Lab Materials & Workflows' },
  { id: 'grossing_route_overrides', emoji: '🔀', labelKey: 'systemTab.sections.grossingRouteOverrides', group: 'Lab Materials & Workflows' },
  { id: 'specimens',           emoji: '🔬', labelKey: 'systemTab.sections.specimens'   , group: 'Lab Materials & Workflows' },
  { id: 'asset_locations',     emoji: '📍', labelKey: 'systemTab.sections.assetLocations', group: 'Lab Materials & Workflows' },

  // ── Clinical Lookups ──
  { id: 'governing_bodies',    emoji: '📋', labelKey: 'systemTab.sections.governingBodies'      , group: 'Clinical Lookups' },
  { id: 'abnormal_trigger_rules', emoji: '🚩', labelKey: 'systemTab.sections.abnormalTriggerRules', group: 'Clinical Lookups' },
  { id: 'participation_types', emoji: '👥', labelKey: 'systemTab.sections.participationTypes'   , group: 'Clinical Lookups' },
  { id: 'country_signing_rules', emoji: '🌐', labelKey: 'systemTab.sections.countrySigningRules', group: 'Clinical Lookups' },
  { id: 'protocols',           emoji: '🧬', labelKey: 'systemTab.sections.protocols'   , group: 'Clinical Lookups' },
  { id: 'departments', emoji: '🗂️', labelKey: 'systemTab.sections.departments'   , group: 'Clinical Lookups' },
  { id: 'subspecialties',      emoji: '🩺', labelKey: 'systemTab.sections.subspecialties'        , group: 'Clinical Lookups' },

  // ── Financial & Revenue Lookups ──
  { id: 'billing_dictionary',  emoji: '💲', labelKey: 'systemTab.sections.billingDictionary', group: 'Financial & Revenue Lookups' },
  { id: 'dft_export_preview',  emoji: '📄', labelKey: 'systemTab.sections.dftExportPreview', group: 'Financial & Revenue Lookups' },
  { id: 'code_import',         emoji: '📥', labelKey: 'systemTab.sections.codeImport', group: 'Financial & Revenue Lookups' },
  { id: 'billing_type_triggers', emoji: '🚦', labelKey: 'systemTab.sections.billingTypeTriggers', group: 'Financial & Revenue Lookups' },
  { id: 'modifier_dictionary', emoji: '🏷️', labelKey: 'systemTab.sections.modifierDictionary', group: 'Financial & Revenue Lookups' },
  { id: 'jurisdiction_payment_mappings', emoji: '🌍', labelKey: 'systemTab.sections.jurisdictionPaymentMappings', group: 'Financial & Revenue Lookups' },
  { id: 'master_payment_types', emoji: '💳', labelKey: 'systemTab.sections.masterPaymentTypes', group: 'Financial & Revenue Lookups' },
  { id: 'ncci_edit_rules',     emoji: '🚫', labelKey: 'systemTab.sections.ncciEditRules', group: 'Financial & Revenue Lookups' },
  { id: 'pending_approvals', emoji: '✅', labelKey: 'systemTab.sections.pendingApprovals', group: 'Financial & Revenue Lookups' },
  { id: 'rvu_code_map',        emoji: '📈', labelKey: 'systemTab.sections.rvuCodeMap', group: 'Financial & Revenue Lookups' },

  // ── Administration & Compliance ──
  { id: 'fonts',               emoji: '🔤', labelKey: 'systemTab.sections.fonts'        , group: 'Administration & Compliance' },
  { id: 'contribution_settings', emoji: '📊', labelKey: 'systemTab.sections.contributionSettings' , group: 'Administration & Compliance' },
  { id: 'retention',           emoji: '🗄️', labelKey: 'systemTab.sections.retention'        , group: 'Administration & Compliance' },
  { id: 'delegation_types',    emoji: '🔀', labelKey: 'systemTab.sections.delegationTypes'      , group: 'Administration & Compliance' },
  { id: 'document_style',      emoji: '🖋', labelKey: 'systemTab.sections.documentStyle'        , group: 'Administration & Compliance' },
  { id: 'external_resources',  emoji: '🌐', labelKey: 'systemTab.sections.externalResources'    , group: 'Administration & Compliance' },
  // PS-359 (Batch 376): which fields each page requires before saving.
  { id: 'field_requirements',  emoji: '✳', labelKey: 'systemTab.sections.fieldRequirements'    , group: 'Administration & Compliance' },
  { id: 'release_buffer',      emoji: '⏳', labelKey: 'systemTab.sections.releaseBuffer', group: 'Administration & Compliance' },
  { id: 'concordance_review_settings', emoji: '⚖', labelKey: 'systemTab.sections.concordanceReviewSettings', group: 'Administration & Compliance' },
  { id: 'delivery_rules', emoji: '📬', labelKey: 'systemTab.sections.deliveryRules', group: 'Administration & Compliance' },
  { id: 'print_routing_rules', emoji: '🖨', labelKey: 'systemTab.sections.printRoutingRules', group: 'Administration & Compliance' },
  { id: 'qa_config_center',    emoji: '✅', labelKey: 'systemTab.sections.qaConfigCenter' , group: 'Administration & Compliance' },
  { id: 'research_feed',       emoji: '📰', labelKey: 'systemTab.sections.researchFeed'         , group: 'Administration & Compliance' },
  { id: 'session_security',    emoji: '🔒', labelKey: 'systemTab.sections.sessionSecurity'      , group: 'Administration & Compliance' },
  // Batch 372: whether ForMedrixAI support may reach this organisation's data, approvals, and the support audit.
  { id: 'support_access',      emoji: '🛡', labelKey: 'systemTab.sections.supportAccess'        , group: 'Administration & Compliance' },
  // PS-63: template self-approval and required reviewers.
  { id: 'template_governance', emoji: '🧾', labelKey: 'systemTab.sections.templateGovernance', group: 'Administration & Compliance' },

  // ── Integrations ──
  // PS-87: Assist-mode LIS polling (settings, Poll now, activity log).
  { id: 'assist_lis_polling', emoji: '🔄', labelKey: 'systemTab.sections.assistLisPolling', group: 'Integrations' },
  { id: 'case_mask_config', emoji: '🔢', labelKey: 'systemTab.sections.caseMaskConfig', group: 'Integrations' },
  { id: 'case_routing',     emoji: '🔀', labelKey: 'systemTab.sections.caseRouting'           , group: 'Integrations' },
  { id: 'clients',          emoji: '🏥', labelKey: 'systemTab.sections.clients' , group: 'Integrations' },
  { id: 'crosswalk',        emoji: '🧩', labelKey: 'systemTab.sections.crosswalk', group: 'Integrations' },
  { id: 'outbound_message_preview', emoji: '📤', labelKey: 'systemTab.sections.outboundMessagePreview', group: 'Integrations' },
  { id: 'physicians',       emoji: '🩻', labelKey: 'systemTab.sections.physicians'             , group: 'Integrations' },
  { id: 'routing_rules',    emoji: '📋', labelKey: 'systemTab.sections.routingRules'          , group: 'Integrations' },
  { id: 'deficiencies',     emoji: '⚠️', labelKey: 'systemTab.sections.deficiencies'  , group: 'Integrations' },
  { id: 'terminology',      emoji: '🔌', labelKey: 'systemTab.sections.terminology'   , group: 'Integrations' },
];

// Data-key-stays-English, label-is-translated: `group` above stays the
// literal internal identifier (SystemTab's own equality checks key off
// it directly); only the tab-button text shown for each group is
// translated, via this map.
const GROUP_LABEL_KEY: Record<string, string> = {
  'Workstation & Hardware': 'systemTab.groups.workstationHardware',
  'Lab Materials & Workflows': 'systemTab.groups.labMaterialsWorkflows',
  'Clinical Lookups': 'systemTab.groups.clinicalLookups',
  'Financial & Revenue Lookups': 'systemTab.groups.financialRevenueLookups',
  'Administration & Compliance': 'systemTab.groups.administrationCompliance',
  'Integrations': 'systemTab.groups.integrations',
};

// ── Main component ────────────────────────────────────────────────────────────

// Real, per direct guidance and a real, confirmed reference screenshot
// (Configuration → Validation Studies' own real Studies/Dashboard/Reports
// row) — the real, generic ps-sub-tab-group/ps-sub-tab-btn pattern
// already proven there, reused here rather than a new one invented.
// Derived, not hand-maintained — GROUPS is every real, distinct group
// in SECTIONS, in the same order groups first appear there, so adding
// a new section to an existing group never needs a second, parallel
// edit here.
const GROUPS: string[] = Array.from(new Set(SECTIONS.map(s => s.group)));

const SystemTab: React.FC = () => {
  const { t } = useTranslation();
  // Batch 371: the terminology endpoint details are shown to PathScribe
  // support (Superadmin) only; this used to be hard-coded true for everyone.
  const isSuperAdmin = useIsSuperAdmin();
  const location = useLocation();
  const [active, setActiveRaw] = useState<SystemSection>(() => {
    const section = new URLSearchParams(location.search).get('section') as SystemSection | null;
    return section && SECTIONS.some(s => s.id === section) ? section : SECTIONS[0].id;
  });
  // Real, per the group-tab redesign — the sidebar now shows only the
  // active group's own items, so a real, single source of truth for
  // "which section is selected" must always keep this in sync,
  // regardless of which of the four real entry points changed it
  // (deep-link, voice nav, a sidebar click, or a group-tab click) —
  // selectSection below is the one real place that ever happens, so
  // none of those four paths can drift out of sync with each other.
  const [activeGroup, setActiveGroup] = useState<string>(() => SECTIONS.find(s => s.id === active)?.group ?? GROUPS[0]);

  // Real, per direct guidance (Workstation & Hardware redesign): one
  // real facility choice, shared across Scan Stations/Printer
  // Profiles/Print Settings — picked once here, at the group level,
  // rather than three independent (or missing) per-screen filters an
  // admin would otherwise have to re-select on every tab. Lives at
  // this level (not inside any one section) specifically so it
  // survives switching between the three sibling sections within the
  // group — each section fully unmounts/remounts via renderSection()
  // below, so state that needs to persist across that has to live
  // above it. Deliberately NOT persisted to the URL/storage — a real,
  // session-scoped convenience, not a saved admin preference.
  const [workstationFacilityId, setWorkstationFacilityId] = useState('');
  const [workstationLabs, setWorkstationLabs] = useState<Facility[]>([]);
  useEffect(() => { getActivePerformingLabs().then(setWorkstationLabs); }, []);

  const selectSection = (id: SystemSection) => {
    setActiveRaw(id);
    const g = SECTIONS.find(s => s.id === id)?.group;
    if (g) setActiveGroup(g);
  };

  // Re-activate if URL changes (e.g. deep-link navigation)
  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section') as SystemSection | null;
    if (section && SECTIONS.some(s => s.id === section)) { selectSection(section); resetConfigScroll(); }
  }, [location.search]);

  const renderSection = () => {
    switch (active) {
      case 'flags':               return <FlagConfigPage />;
      case 'subspecialties':      return <SubspecialtiesSection />;
      case 'specimens':           return <SpecimenDictionarySection />;
      case 'stains':              return <StainDictionarySection />;
      case 'vendor_integrations': return <VendorIntegrationsSection />;
      case 'cytology_qc_rules': return <CytologyQcRulesSection />;
      case 'or_suite_terminals':  return <OrSuiteTerminalsSection />;
      case 'display_profiles':    return <DisplayProfilesSection />;
      case 'migration_field_mappings': return <MigrationFieldMappingsSection />;
      case 'cancer_registry_settings': return <CancerRegistrySettingsSection />;
      case 'protocols':           return <ProtocolDictionarySection />;
      case 'printer_profiles':    return <PrinterProfilesSection selectedFacilityId={workstationFacilityId || undefined} />;
      case 'grossing_route_overrides': return <GrossingRouteOverridesSection />;
      case 'departments': return <DepartmentsSection />;
      case 'asset_locations': return <AssetLocationDictionarySection />;
      case 'container_types': return <ContainerTypesSection />;
      case 'reagent_lots': return <ReagentLotsSection />;
      case 'workstation_groups': return <WorkstationGroupsSection />;
      case 'action_groups': return <ActionGroupsSection />;
      case 'scan_stations': return <ScanStationsSection selectedFacilityId={workstationFacilityId || undefined} />;
      case 'equipment': return <EquipmentSection selectedFacilityId={workstationFacilityId || undefined} />;
      case 'grossing_hardware': return <GrossingHardwareSection selectedFacilityId={workstationFacilityId || undefined} />;
      case 'cassette_routing_rules': return <CassetteRoutingRulesSection />;
      case 'cassette_colors': return <CassetteColorsSection />;
      case 'print_settings': return <PrintSettingsSection selectedFacilityId={workstationFacilityId || undefined} />;
      case 'label_designer': return <LabelDesignerPage />;
      case 'fonts':               return <FontsSection />;
      case 'document_style':      return <DocumentStyleSection />;
      case 'retention':           return <RetentionSection />;
      case 'governing_bodies':    return <GoverningBodiesSection />;
      case 'delegation_types':    return <DelegationTypeSection />;
      case 'billing_dictionary':  return <BillingDictionarySection />;
      case 'pending_approvals': return <PendingApprovalSection />;
      case 'code_import': return <CodeImportSection />;
      case 'modifier_dictionary': return <ModifierDictionarySection />;
      case 'billing_type_triggers': return <BillingTypeTriggerSection />;
      case 'rvu_code_map':        return <RvuCodeMapSection />;
      case 'ncci_edit_rules':     return <NcciEditRulesSection />;
      case 'master_payment_types': return <MasterPaymentTypeDictionarySection />;
      case 'jurisdiction_payment_mappings': return <JurisdictionPaymentMappingSection />;
      case 'outbound_message_preview': return <OutboundMessagePreviewSection />;
      case 'dft_export_preview':  return <DftExportPreviewSection />;
      case 'participation_types': return <ParticipationTypesSection />;
      case 'country_signing_rules': return <CountrySigningRulesSection />;
      case 'session_security':    return <SessionSecuritySection />;
      case 'support_access':      return <SupportAccessSection />;
      case 'field_requirements':  return <FieldRequirementsSection />;
      case 'release_buffer':      return <ReleaseBufferSection />;
      case 'concordance_review_settings': return <ConcordanceReviewSettingsSection />;
      case 'template_governance': return <TemplateGovernanceSection />;
      case 'delivery_rules': return <DeliveryRulesSection />;
      case 'print_routing_rules': return <PrintRoutingRuleSection />;
      case 'contribution_settings': return <ContributionSettingsSection />;
      case 'external_resources':  return <ExternalResourcesSection />;
      case 'research_feed':       return <ResearchFeedSection />;
      case 'terminology':      return <TerminologyServicesSection isSuperAdmin={isSuperAdmin} />;
      case 'clients':          return <FacilityDictionaryPage />;
      case 'crosswalk':        return <CrosswalkSection />;
      case 'case_mask_config': return <CaseMaskConfigSection />;
      case 'case_routing':     return <CasePoolAssignmentSection />;
      case 'routing_rules':    return <RoutingRulesSection />;
      case 'physicians':       return <PhysiciansSection />;
      case 'deficiencies':     return <DeficienciesSection />;
      case 'abnormal_trigger_rules': return <AbnormalTriggerRulesSection />;
      case 'assist_lis_polling': return <AssistLisPollingSection />;
      case 'qa_config_center': return <QAConfigurationCenterSection />;
      default:                    return null;
    }
  };

  // ── Voice sub-navigation ───────────────────────────────────────────────────
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      const section = e.detail?.section as SystemSection;
      if (section) { selectSection(section); resetConfigScroll(); }
    };
    window.addEventListener('PATHSCRIBE_SYSTEM_NAVIGATE', handler as EventListener);
    return () => window.removeEventListener('PATHSCRIBE_SYSTEM_NAVIGATE', handler as EventListener);
  }, []);

  return (
    <div>
      {/* ── Real, per the confirmed group-tab redesign — one tab per real
          group, selecting a tab jumps the sidebar+content to that
          group's own first real section. ── */}
      <div className="ps-sub-tab-group ps-sub-tab-group--gap-below">
        {GROUPS.map(g => (
          <button
            key={g}
            onClick={() => {
              setActiveGroup(g);
              const first = SECTIONS.find(s => s.group === g);
              if (first) setActiveRaw(first.id);
              resetConfigScroll();
            }}
            className={`ps-sub-tab-btn${activeGroup === g ? ' active' : ''}`}
          >
            {t(GROUP_LABEL_KEY[g])}
          </button>
        ))}
      </div>

      {/* Real, per direct guidance: one facility selector shared
          across the Workstation & Hardware sections (Equipment added in Batch 356/358) — placed
          above the sidebar+content shell (not inside it) so it spans
          the full width rather than becoming a third flex column.
          Never rendered for any other group, since no other group's
          sections have this same real, cross-cutting facility
          relationship. */}
      {activeGroup === 'Workstation & Hardware' && (
        <div className="ps-conf-callout-banner ps-confsys-facility-selector">
          <span className="ps-conf-callout-banner-text">{t('systemTab.facilityLabel')}</span>
          <select
            className="ps-conf-select"
            value={workstationFacilityId}
            onChange={e => setWorkstationFacilityId(e.target.value)}
          >
            <option value="">{t('systemTab.allFacilitiesOption')}</option>
            {workstationLabs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="ps-confsys-shell">

        {/* ── Sidebar nav — real, per the confirmed redesign: only the
            active group's own items, no more group-header dividers,
            since only one group is ever visible at a time now. ── */}
        <div className="ps-confsys-sidebar">
          {SECTIONS.filter(s => s.group === activeGroup).map(s => (
            <button
              key={s.id}
              onClick={() => { selectSection(s.id); resetConfigScroll(); }}
              className={`ps-confsys-nav-btn${active === s.id ? ' ps-confsys-nav-btn--active' : ''}`}
            >
              {s.emoji} {t(s.labelKey)}
            </button>
          ))}
        </div>

        {/* ── Section content ── */}
        <div className="ps-confsys-content">
          {renderSection()}
        </div>

      </div>
    </div>
  );
};

export default SystemTab;
