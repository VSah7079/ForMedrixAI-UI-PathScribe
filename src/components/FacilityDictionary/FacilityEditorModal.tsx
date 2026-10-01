/**
 * FacilityEditorModal.tsx
 * Located at: src/components/FacilityDictionary/FacilityEditorModal.tsx
 *
 * Add / Edit modal for a single facility.
 * Props:
 *   isOpen  -- boolean
 *   onClose -- () => void
 *   mode    -- 'add' | 'edit' — real fix (PS-73, Sep 2026): the save decision
 *              (add() vs. update()) and every id-dependent effect below now
 *              key off THIS, never off whether `facility` is present. Once
 *              Duplicate (below) started passing a prefilled `facility`
 *              object into 'add' mode, presence-of-`facility` alone stopped
 *              meaning "this is a real, existing record" — exactly the
 *              class of bug PS-73 itself found and fixed elsewhere
 *              (PhysicianModal's own `mode` prop, same reasoning).
 *   facility -- Facility | undefined. undefined = blank add. In 'edit' mode,
 *              the real record being edited. In 'add' mode, either
 *              undefined (blank form) or a Duplicate prefill template (see
 *              FacilityDictionaryPage.tsx's handleDuplicateFacility) — never
 *              a real, existing id, so every effect keyed on facility.id
 *              below is additionally gated on isEdit.
 *   onSave  -- (input: FacilityInput) => void — parent owns the actual
 *              facilityService.add/update call, same convention as
 *              PhysiciansSection.tsx / DepartmentsSection.tsx
 *   allFacilities -- also used for the real assigningAuthority uniqueness
 *              check now (PS-73) — see validate() below.
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { Facility, FacilityInput, FacilityRole } from "../../services/facilities/IFacilityService";
import { FACILITY_ROLE_LABELS, FACILITY_ROLE_TOOLTIPS } from "../../services/facilities/IFacilityService";
import { findDuplicate } from "../../utils/validateUnique";
import { placeOfServiceCodeService } from "@/services";
import IdentifierFormatsTab from "./IdentifierFormatsTab";
import type { PlaceOfServiceCode } from "../../types/billing/PlaceOfServiceCode";
import { JURISDICTION_LABELS, type Jurisdiction } from "../../types/systemConfig";
import { SUFFIX_PRESETS, isPresetSuffix } from "../../utils/personName";
import { getEligibleModelIdsForClient } from "../Config/AI/resolveClientAiModel";
import { modelService, locationService } from "../../services";
import type { AIModel } from "../../services/models/IModelService";
import type { Location } from "../../services/locations/ILocationService";
import { HL7_LOCATION_STATUS_OPTIONS, HL7_PERSON_LOCATION_TYPE_OPTIONS } from "../../services/locations/ILocationService";

interface FacilityEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Real fix (PS-73, Sep 2026): the save decision and every id-dependent
   *  effect key off this, not off whether `facility` is present — see the
   *  file header comment above for why. */
  mode: 'add' | 'edit';
  /** Existing facility to edit ('edit' mode), a Duplicate prefill template
   *  ('add' mode), or undefined for a blank add. Passed directly rather
   *  than a facilityId + internal lookup — matches PhysiciansSection/
   *  DepartmentsSection's convention. */
  facility?: Facility;
  onSave: (input: FacilityInput) => void;
  /** Full facility list, used to populate the Parent Enterprise
   *  dropdown — e.g. picking which NHS Trust a hospital is an
   *  affiliate of. */
  allFacilities: Facility[];
}

// ─── Static data (extracted to avoid inline type assertions in JSX) ───────────

type ReportingOption = [keyof Facility['reporting'], string];

type EscalationTarget = 'pathGroup' | 'admin' | 'referrer';

// Real feature, per direct confirmation: "One record per facility.
// Multiple roles attached to that record." Display order for the role
// checkboxes — performing_lab first since it's the role that unlocks
// the most additional config (AI & Performance tab).
const FACILITY_ROLE_ORDER: FacilityRole[] = [
  'performing_lab',
  'internal_submitting_location',
  'internal_ordering_client',
  'external_ordering_client',
  'specimen_acquisition',
  'reference_lab',
];

// ─── Blank form state ─────────────────────────────────────────────────────────

const blank = (): FacilityInput => ({
  name: "",
  roles: ["external_ordering_client"],
  jurisdiction: "US",
  specimenLabelStyle: "alpha-specimen",
  assigningAuthority: "",
  contactNamePrefix: "",
  contactGivenNames: "",
  contactFamilyNames: "",
  contactPreferredName: "",
  contactNameSuffix: "",
  email: "",
  phone: "",
  fax: "",
  address: "",
  status: "Active",
  reporting: {
    reportFormat: "PDF",
    deliveryMethod: "Portal",
    autoRelease: false,
    copyToReferring: false,
  },
  pediatricAgeThreshold: null,
  authorizedPediatricPathologistIds: [],
  tatFirstTouchHours: null,
  tatTotalHours:      null,
  escalationTargets:  [],
  escalationPriority: 'high',
  internalAiOrchestratorEnabled: null,
  internalAiModelId: null,
  idleTimeoutMinutesOverride: null,
  codeReviewSamplingRatePercent: null,
  releaseBufferOverride: null,
});

// ─── Sub-components ───────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode; span?: boolean }> = ({
  label, children, span,
}) => (
  <div className={span ? "cem-field--span" : undefined}>
    <label className="cem-label">{label}</label>
    {children}
  </div>
);

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "general" | "lis_integration" | "identifier_formats" | "reporting" | "tat" | "ai" | "locations";

// ─── Component ────────────────────────────────────────────────────────────────

export const FacilityEditorModal: React.FC<FacilityEditorModalProps> = ({
  isOpen,
  onClose,
  mode,
  facility,
  onSave,
  allFacilities,
}) => {
  const { t } = useTranslation();
  // Real fix (PS-73): was `!!facility` — broke the moment Duplicate started
  // passing a prefilled `facility` object into 'add' mode. `mode` is the
  // single source of truth now; see file header comment.
  const isEdit = mode === 'edit';

  const REPORTING_OPTIONS: ReportingOption[] = [
    ['autoRelease',     t('facilityEditorModal.reporting.autoRelease')],
    ['copyToReferring', t('facilityEditorModal.reporting.copyToReferring')],
  ];

  type EscalationOption = [EscalationTarget, string];
  const ESCALATION_TARGETS: EscalationOption[] = [
    ['pathGroup', t('facilityEditorModal.tat.escalationPathGroup')],
    ['admin',     t('facilityEditorModal.tat.escalationAdmin')],
    ['referrer',  t('facilityEditorModal.tat.escalationReferrer')],
  ];

  const [form, setForm] = useState<FacilityInput>(blank);
  const [tab,  setTab]  = useState<Tab>("general");
  const [errors, setErrors] = useState<Partial<Record<keyof FacilityInput, string>>>({});
  const [saved, setSaved]   = useState(false);
  const [contactSuffixCustom, setContactSuffixCustom] = useState(!isPresetSuffix(form.contactNameSuffix));

  useEffect(() => {
    if (!isOpen) return;
    if (facility) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = facility;
      setForm(input);
      setContactSuffixCustom(!isPresetSuffix(facility.contactNameSuffix));
    } else {
      setForm(blank());
      setContactSuffixCustom(false);
    }
    setTab("general");
    setErrors({});
    setSaved(false);
  }, [isOpen, facility]);

  if (!isOpen) return null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const set = (key: keyof FacilityInput, val: unknown) =>
    setForm((f) => ({ ...f, [key]: val }));

  // Real, per direct guidance: replaces the old setHL7 helper -
  // FacilityHL7Settings (and hl7_routing_endpoint) are retired
  // entirely, consolidated into FacilityInterfaceEngineConnection
  // (Enterprise-only) and FacilityLisRouting (any facility, real
  // override capability) - see IFacilityService.ts's own doc
  // comments for the full account. Both fields are optional/nullable
  // (undefined until an admin first configures them), unlike hl7/
  // reporting above which were always-present objects - each helper
  // seeds a real, sensible blank shape on first edit rather than
  // spreading undefined.
  const setInterfaceEngineConnection = (key: keyof Facility["interfaceEngineConnection"], val: unknown) =>
    setForm((f) => ({
      ...f,
      interfaceEngineConnection: {
        endpoint: "", lisOwnsStatuses: true, allowPathScribePostFinalActions: true,
        ...(f.interfaceEngineConnection ?? {}),
        [key]: val,
      },
    }));

  const setLisRouting = (key: keyof Facility["lisRouting"], val: unknown) =>
    setForm((f) => ({
      ...f,
      lisRouting: {
        sendingFacilityId: "",
        ...(f.lisRouting ?? {}),
        [key]: val,
      },
    }));

  const setReporting = (key: keyof Facility["reporting"], val: unknown) =>
    setForm((f) => ({ ...f, reporting: { ...f.reporting, [key]: val } }));

  // Real feature, per direct confirmation: "One record per facility.
  // Multiple roles attached to that record." Toggles a single role in
  // the roles array — the single source of truth for which config
  // sections (HL7, Reporting/TAT, AI & Performance) are relevant to
  // this facility.
  const toggleRole = (role: FacilityRole, checked: boolean) => {
    setForm(f => ({
      ...f,
      roles: checked ? [...f.roles, role] : f.roles.filter(r => r !== role),
    }));
  };

  const hasRole = (role: FacilityRole) => form.roles.includes(role);

  // Safety: if the active tab's role gets unchecked (e.g. viewing "AI &
  // Performance" then unchecking performing_lab), fall back to General
  // rather than leaving the body showing nothing for a tab that no
  // longer appears in the tab bar. Reporting/TAT & Escalation are not
  // role-gated (see the tab bar below) so they need no reset here —
  // TAT is a real concern for any facility that handles cases, not
  // just ordering-client roles (confirmed against real data: a
  // performing-lab-only facility can carry real TAT targets).
  useEffect(() => {
    // Real, per direct guidance: LIS Integration is no longer
    // role-gated (matches Reporting/TAT below - real for any
    // facility, not just ones holding a specific role), so no reset
    // is needed for that tab anymore.
    if (tab === 'ai' && !hasRole('performing_lab')) setTab('general');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.roles]);

  // Real feature, per direct confirmation: "AI configuration should be
  // gated exclusively by the performing_lab role." Model eligibility —
  // which models THIS facility has a passing validation study for —
  // only meaningful once performing_lab is checked and the facility
  // has a real id to check against (i.e. edit mode; a brand-new
  // facility can't have a validation study yet).
  const [eligibleModels, setEligibleModels] = useState<AIModel[]>([]);
  useEffect(() => {
    // Real fix (PS-73): added `!isEdit` to the guard — `facility?.id` alone
    // isn't "this is a real, existing facility" anymore now that Duplicate
    // passes a prefilled `facility` object (with no real id of its own)
    // into 'add' mode. Without this, a Duplicate template's own leftover
    // eligibility state from a *previous* real facility view could survive
    // into the new one, or this would fire a bogus lookup — same bug class
    // as the isEdit/mode fix above.
    if (!isOpen || !isEdit || !facility?.id || !hasRole('performing_lab')) { setEligibleModels([]); return; }
    let cancelled = false;
    (async () => {
      const [eligibleIds, allModelsRes] = await Promise.all([
        getEligibleModelIdsForClient(facility.id),
        modelService.getAll(),
      ]);
      if (cancelled) return;
      const all = allModelsRes.ok ? allModelsRes.data : [];
      setEligibleModels(all.filter(m => eligibleIds.includes(m.id)));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEdit, facility?.id, form.roles.includes('performing_lab')]);

  // Real, new: the real, versioned CMS Place of Service dictionary
  // (services/billing/placeOfServiceCodeService.ts). Deliberately
  // NOT gated to hasRole('specimen_acquisition') the way eligibleModels
  // above is gated to performing_lab - this is a small (52-entry),
  // global reference list with no per-facility scoping, so there's no
  // real cost to loading it whenever the modal is open, and it's ready
  // immediately if the admin checks Specimen Acquisition after opening.
  const [posCodes, setPosCodes] = useState<PlaceOfServiceCode[]>([]);
  useEffect(() => {
    if (!isOpen) { setPosCodes([]); return; }
    let cancelled = false;
    (async () => {
      const res = await placeOfServiceCodeService.getActiveCodes();
      if (cancelled) return;
      setPosCodes(res.ok ? res.data : []);
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Real feature, per direct confirmation: "we will need to accept
  // PV1 HL7 data... Location / Rooms... naturally associated to the
  // Facility." Real fix, per direct confirmation: never gated to any
  // specific role — a facility can want locations configured purely
  // for manual accessioning (AccessionPage.tsx's own Location
  // dropdown), independent of whether LIS integration is configured
  // at all. Only meaningful once the facility has a real id (edit
  // mode) — a brand-new, unsaved facility can't have locations
  // attached to it yet.
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const reloadLocations = async () => {
    // Real fix (PS-73): `!isEdit` added — see eligibleModels' own comment
    // above for why `facility?.id` alone no longer means "a real facility."
    // The Locations tab button is already gated to `isEdit` further down,
    // so this is defense in depth, not the only guard.
    if (!isEdit || !facility?.id) { setLocations([]); return; }
    setLocationsLoading(true);
    const res = await locationService.listForFacility(facility.id);
    if (res.ok) setLocations(res.data);
    setLocationsLoading(false);
  };
  useEffect(() => {
    if (!isOpen || !isEdit || !facility?.id) { setLocations([]); return; }
    reloadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEdit, facility?.id]);

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({
    pointOfCare: '', room: '', bed: '', building: '', floor: '',
    locationStatus: '', personLocationType: '',
  });
  const resetNewLocationForm = () => setNewLocation({ pointOfCare: '', room: '', bed: '', building: '', floor: '', locationStatus: '', personLocationType: '' });

  const handleAddLocation = async () => {
    if (!isEdit || !facility?.id || !newLocation.pointOfCare.trim()) return;
    await locationService.create({
      facilityId: facility.id,
      pointOfCare: newLocation.pointOfCare.trim(),
      room: newLocation.room.trim() || undefined,
      bed: newLocation.bed.trim() || undefined,
      building: newLocation.building.trim() || undefined,
      floor: newLocation.floor.trim() || undefined,
      locationStatus: newLocation.locationStatus || undefined,
      personLocationType: newLocation.personLocationType || undefined,
      status: 'Active',
    });
    resetNewLocationForm();
    setShowAddLocation(false);
    await reloadLocations();
  };

  const handleVerifyLocation = async (id: string) => { await locationService.verify(id); await reloadLocations(); };
  const handleToggleLocationActive = async (loc: Location) => {
    if (loc.status === 'Active') await locationService.deactivate(loc.id);
    else await locationService.reactivate(loc.id);
    await reloadLocations();
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = t('facilityEditorModal.errors.nameRequired');
    // Real fix (PS-73, Sep 2026): assigningAuthority was required-only —
    // no uniqueness check — despite mockOrderIntakeService.ts's own real
    // Facility-resolution lookup keying directly off it
    // (`facilities.find(c => c.assigningAuthority.toLowerCase() === ...)`).
    // Two facilities sharing one would let that real lookup silently
    // resolve an inbound HL7 order to the wrong facility — same failure
    // mode this pattern already protects Physicians' npi/physicianCode
    // against. excludeId only applies in real 'edit' mode — in 'add' mode
    // (including a Duplicate template, whose assigningAuthority is cleared
    // before this modal ever opens — see FacilityDictionaryPage.tsx's
    // handleDuplicateFacility) nothing is excluded, so saving a clone
    // without giving it its own value is correctly caught.
    if (!form.assigningAuthority.trim()) {
      e.assigningAuthority = t('facilityEditorModal.errors.assigningAuthorityRequired');
    } else {
      const excludeId = isEdit ? facility?.id : undefined;
      const collision = findDuplicate(allFacilities, { assigningAuthority: form.assigningAuthority.trim() }, ['assigningAuthority'], excludeId);
      if (collision) {
        e.assigningAuthority = t('facilityEditorModal.errors.assigningAuthorityCollision', {
          code: collision.assigningAuthority,
          name: collision.name,
        });
      }
    }
    if (!form.email.trim() || !form.email.includes("@"))
      e.email = t('facilityEditorModal.errors.emailRequired');
    // Real, per direct guidance: replaces the old hl7.enabled-based
    // check — presence of a real, configured object is the enabled
    // signal now, not a separate boolean. interfaceEngineConnection
    // is only ever set here when isEnterprise, so endpoint is the
    // one real required field once an admin starts configuring it.
    if (form.isEnterprise && form.interfaceEngineConnection && !form.interfaceEngineConnection.endpoint.trim())
      (e as Record<string, string>).interfaceEngineConnection = t('facilityEditorModal.errors.endpointRequired');
    if (form.lisRouting && !form.lisRouting.sendingFacilityId.trim())
      (e as Record<string, string>).lisRouting = t('facilityEditorModal.errors.sendingFacilityIdRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (!validate()) return;
    onSave(form);
    setSaved(true);
    setTimeout(() => { onClose(); }, 800);
  };

  // ── Tab styling ─────────────────────────────────────────────────────────────

  const tabClass = (t: Tab) => `ps-fem-tab${tab === t ? ' ps-fem-tab--active' : ''}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="ps-overlay ps-overlay--facility-editor" onClick={onClose}>
      <div className="ps-client-editor-shell" onClick={(e) => e.stopPropagation()}>
        {/* ── Header + tab bar ── */}
        <div className="ps-client-editor-header">
          <div className="ps-client-editor-header-row">
            <h2 className="ps-client-editor-title">
              {isEdit ? t('facilityEditorModal.editTitle') : t('facilityEditorModal.addTitle')}
            </h2>
            <button onClick={onClose} className="ps-modal-close">&#x2715;</button>
          </div>
          <div className="ps-client-editor-tabs">
            <button className={tabClass("general")}   onClick={() => setTab("general")}>{t('facilityEditorModal.tabs.general')}</button>
            {/* Real, per direct guidance: never role-gated — LIS
                routing metadata is real, potentially-relevant data
                for any facility that sends messages toward the
                shared Interface Engine connection, not just ones
                holding a specific role. Interface Engine Connection
                fields within this tab are still gated to isEnterprise
                internally, since that half is deliberately
                Enterprise-only. */}
            <button className={tabClass("lis_integration")} onClick={() => setTab("lis_integration")}>{t('facilityEditorModal.tabs.lisIntegration')}</button>
            {/* Real, per direct guidance: same real move as LIS
                Integration above - never role-gated, real for any
                facility. */}
            <button className={tabClass("identifier_formats")} onClick={() => setTab("identifier_formats")}>{t('facilityEditorModal.tabs.identifierFormats')}</button>
            {/* Real fix, per direct confirmation: not role-gated —
                TAT/reporting apply to any facility that handles
                cases, not just ordering-client roles. Confirmed
                against real seed data: Fenwick General Hospital is
                performing_lab-only but has real, configured TAT
                targets (8h/48h) that were invisible under the old
                isOrderingClient gate. */}
            <button className={tabClass("reporting")}  onClick={() => setTab("reporting")}>{t('facilityEditorModal.tabs.reporting')}</button>
            <button className={tabClass("tat")}        onClick={() => setTab("tat")}>{t('facilityEditorModal.tabs.tat')}</button>
            {hasRole('performing_lab') && (
              <button className={tabClass("ai")}         onClick={() => setTab("ai")}>{t('facilityEditorModal.tabs.ai')}</button>
            )}
            {/* Real fix, per direct confirmation: never gated to any
                specific role — a facility can want its
                locations configured purely for manual accessioning
                (AccessionPage.tsx's own Location dropdown), with no
                HL7 integration involved at all. Still edit-mode only —
                a brand-new, unsaved facility can't have locations
                attached to it yet. */}
            {isEdit && (
              <button className={tabClass("locations")}  onClick={() => setTab("locations")}>{t('facilityEditorModal.tabs.locations')}</button>
            )}
          </div>
        </div>

        {/* ── Body — all four tabs live inside this scrollable div ── */}
        <div className="ps-client-editor-body">

          {/* General */}
          {tab === "general" && (
            <div className="ps-client-editor-form">
              <div className="cem-section">{t('facilityEditorModal.general.facilityDetails')}</div>
              <div className="ps-client-editor-grid-2">
                <Field label={t('facilityEditorModal.general.facilityName')} span>
                  <input
                    className={`ps-modal-dark-input${errors.name ? " ps-modal-dark-input--error" : ""}`}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder={t('facilityEditorModal.general.facilityNamePlaceholder')}
                  />
                  {errors.name && <div className="ps-client-editor-field-error">{errors.name}</div>}
                </Field>
                <Field label={t('facilityEditorModal.general.assigningAuthority')}>
                  <input
                    className={`ps-modal-dark-input cem-input--mono-upper${errors.assigningAuthority ? " ps-modal-dark-input--error" : ""}`}
                    value={form.assigningAuthority}
                    onChange={(e) => set("assigningAuthority", e.target.value.toUpperCase())}
                    placeholder={t('facilityEditorModal.general.assigningAuthorityPlaceholder')}
                    maxLength={10}
                  />
                  {errors.assigningAuthority && <div className="ps-client-editor-field-error">{errors.assigningAuthority}</div>}
                </Field>
                <Field label={t('facilityEditorModal.general.status')}>
                  <select className="cem-input" value={form.status} onChange={(e) => set("status", e.target.value)}>
                    <option value="Active">{t('facilityEditorModal.general.statusActive')}</option>
                    <option value="Inactive">{t('facilityEditorModal.general.statusInactive')}</option>
                    {/* Unverified is only ever set by order-intake auto-creation,
                        not a state an admin manually assigns — so it's shown
                        here (read-only-ish, via disabled) only when already set,
                        rather than offered as a normal choice. */}
                    {form.status === 'Unverified' && <option value="Unverified" disabled>{t('facilityEditorModal.general.statusUnverified')}</option>}
                  </select>
                </Field>
                <Field label={t('facilityEditorModal.general.roles')} span>
                  <div className="cem-roles-wrap">
                    {FACILITY_ROLE_ORDER.map(role => (
                      <label
                        key={role}
                        htmlFor={`role-${role}`}
                        title={FACILITY_ROLE_TOOLTIPS[role]}
                        className={`cem-chip-label${hasRole(role) ? ' cem-chip-label--active' : ''}`}
                      >
                        <input
                          type="checkbox"
                          id={`role-${role}`}
                          checked={hasRole(role)}
                          onChange={e => toggleRole(role, e.target.checked)}
                          className="cem-checkbox"
                        />
                        <span className="cem-chip-text">{FACILITY_ROLE_LABELS[role]}</span>
                      </label>
                    ))}
                  </div>
                  <div className="cem-hint">
                    {t('facilityEditorModal.general.rolesHint')}
                  </div>
                </Field>
                {hasRole('specimen_acquisition') && (
                  <Field label={t('facilityEditorModal.general.placeOfServiceCode')}>
                    <select className="cem-input" value={form.placeOfServiceCodeId ?? ''} onChange={(e) => set("placeOfServiceCodeId", e.target.value || undefined)}>
                      <option value="">{t('facilityEditorModal.general.notSet')}</option>
                      {posCodes.map(c => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                    <div className="cem-hint">
                      {t('facilityEditorModal.general.placeOfServiceCodeHint')}
                    </div>
                  </Field>
                )}
                {/* Real, per PS-277 §1.2.2 gap-closing — these three
                    fields feed resolveFacilityPrintBranding.ts's own
                    Facility → Department → Enterprise resolution at
                    TWO of its three real tiers, not just the
                    performing-lab one: an Enterprise-tagged facility
                    (isEnterprise) is the real fallback tier every one
                    of its affiliates reads from when they haven't set
                    their own value. Before this fix, an Enterprise
                    facility that didn't ALSO happen to hold the
                    performing_lab role (architecturally independent
                    fields — isEnterprise is deliberately its own flag,
                    never a FacilityRole value) had no way to configure
                    these at all — a real, latent gap even though every
                    real seed Enterprise record in this app happens to
                    also carry performing_lab today. */}
                {(hasRole('performing_lab') || form.isEnterprise) && (
                  <Field label={t('facilityEditorModal.general.cliaIsoNumber')}>
                    <input
                      className="cem-input"
                      value={form.cliaOrIsoNumber ?? ''}
                      onChange={(e) => set("cliaOrIsoNumber", e.target.value || undefined)}
                      placeholder={t('facilityEditorModal.general.cliaIsoNumberPlaceholder')}
                    />
                    <div className="cem-hint">
                      {t('facilityEditorModal.general.cliaIsoNumberHint')}
                    </div>
                  </Field>
                )}
                {(hasRole('performing_lab') || form.isEnterprise) && (
                  <Field label={t('facilityEditorModal.general.directorName')}>
                    <input
                      className="cem-input"
                      value={form.directorName ?? ''}
                      onChange={(e) => set("directorName", e.target.value || undefined)}
                      placeholder={t('facilityEditorModal.general.directorNamePlaceholder')}
                    />
                    <div className="cem-hint">
                      {t('facilityEditorModal.general.directorNameHint')}
                    </div>
                  </Field>
                )}
                {(hasRole('performing_lab') || form.isEnterprise) && (
                  <Field label={t('facilityEditorModal.general.headerLogoUrl')}>
                    <input
                      className="cem-input"
                      value={form.headerLogoUrl ?? ''}
                      onChange={(e) => set("headerLogoUrl", e.target.value || undefined)}
                      placeholder={t('facilityEditorModal.general.headerLogoUrlPlaceholder')}
                    />
                    <div className="cem-hint">
                      {t('facilityEditorModal.general.headerLogoUrlHint')}
                    </div>
                  </Field>
                )}
                {hasRole('performing_lab') && (
                  <Field label={t('facilityEditorModal.general.forceAddendumOnDedicatedPage')}>
                    <label htmlFor="forceAddendumOnDedicatedPagePrintPolicy" className={`cem-chip-label cem-chip-label--fit${form.forceAddendumOnDedicatedPagePrintPolicy ? ' cem-chip-label--active' : ''}`}>
                      <input
                        type="checkbox"
                        id="forceAddendumOnDedicatedPagePrintPolicy"
                        checked={form.forceAddendumOnDedicatedPagePrintPolicy ?? false}
                        onChange={(e) => set("forceAddendumOnDedicatedPagePrintPolicy", e.target.checked || undefined)}
                        className="cem-checkbox"
                      />
                      <span className="cem-chip-text">{t('facilityEditorModal.general.forceAddendumOnDedicatedPageCheckbox')}</span>
                    </label>
                    <div className="cem-hint">
                      {t('facilityEditorModal.general.forceAddendumOnDedicatedPageHint')}
                    </div>
                  </Field>
                )}
                {hasRole('performing_lab') && (
                  <Field label={t('facilityEditorModal.general.abnormalDetection')}>
                    <label htmlFor="abnormalDetectionEnabled" className={`cem-chip-label cem-chip-label--fit${form.abnormalDetectionEnabled !== false ? ' cem-chip-label--active' : ''}`}>
                      <input
                        type="checkbox"
                        id="abnormalDetectionEnabled"
                        checked={form.abnormalDetectionEnabled !== false}
                        onChange={(e) => set("abnormalDetectionEnabled", e.target.checked ? undefined : false)}
                        className="cem-checkbox"
                      />
                      <span className="cem-chip-text">{t('facilityEditorModal.general.abnormalDetectionCheckbox')}</span>
                    </label>
                    <div className="cem-hint">
                      {t('facilityEditorModal.general.abnormalDetectionHint')}
                    </div>
                  </Field>
                )}
                <Field label={t('facilityEditorModal.general.jurisdiction')}>
                  <select className="cem-input" value={form.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)}>
                    {(Object.entries(JURISDICTION_LABELS) as [Jurisdiction, string][]).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('facilityEditorModal.general.specimenLabeling')}>
                  <select className="cem-input" value={form.specimenLabelStyle ?? 'alpha-specimen'} onChange={(e) => set("specimenLabelStyle", e.target.value)}>
                    <option value="alpha-specimen">{t('facilityEditorModal.general.specimenLabelingAlpha')}</option>
                    <option value="numeric-specimen">{t('facilityEditorModal.general.specimenLabelingNumeric')}</option>
                  </select>
                </Field>
                <Field label={t('facilityEditorModal.general.enterprise')}>
                  <label htmlFor="isEnterprise" className={`cem-chip-label cem-chip-label--fit${form.isEnterprise ? ' cem-chip-label--active' : ''}`}>
                    <input
                      type="checkbox"
                      id="isEnterprise"
                      checked={!!form.isEnterprise}
                      onChange={e => set("isEnterprise", e.target.checked || undefined)}
                      className="cem-checkbox"
                    />
                    <span className="cem-chip-text">{t('facilityEditorModal.general.enterpriseCheckbox')}</span>
                  </label>
                  <div className="cem-hint">
                    {t('facilityEditorModal.general.enterpriseHint')}
                  </div>
                </Field>
                <Field label={t('facilityEditorModal.general.parentEnterprise')}>
                  <select className="cem-input" value={form.parentId ?? ''} onChange={(e) => set("parentId", e.target.value || undefined)}>
                    <option value="">{t('facilityEditorModal.general.parentEnterpriseNone')}</option>
                    {allFacilities
                      .filter(c => c.id !== facility?.id && c.isEnterprise)
                      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>

              <div className="cem-section">{t('facilityEditorModal.general.contact')}</div>
              <div className="ps-client-editor-grid-2">
                <Field label={t('facilityEditorModal.general.contactPrefix')}>
                  <select className="cem-input" value={form.contactNamePrefix ?? ''} onChange={(e) => set("contactNamePrefix", e.target.value)}>
                    <option value="">{t('facilityEditorModal.general.none')}</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Mx.">Mx.</option>
                    <option value="Dr.">Dr.</option>
                  </select>
                </Field>
                <Field label={t('facilityEditorModal.general.contactSuffix')}>
                  {contactSuffixCustom ? (
                    <div className="cem-suffix-custom-row">
                      <input className="cem-input" value={form.contactNameSuffix ?? ''} onChange={(e) => set("contactNameSuffix", e.target.value)} placeholder={t('facilityEditorModal.general.contactSuffixPlaceholder')} />
                      <button type="button" onClick={() => { setContactSuffixCustom(false); set("contactNameSuffix", ""); }} className="cem-btn-text cem-btn-text--link">
                        {t('facilityEditorModal.general.useList')}
                      </button>
                    </div>
                  ) : (
                    <select className="cem-input" value={form.contactNameSuffix ?? ''} onChange={(e) => {
                      if (e.target.value === "__other__") { setContactSuffixCustom(true); set("contactNameSuffix", ""); }
                      else set("contactNameSuffix", e.target.value);
                    }}>
                      <option value="">{t('facilityEditorModal.general.none')}</option>
                      {SUFFIX_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="__other__">{t('facilityEditorModal.general.other')}</option>
                    </select>
                  )}
                </Field>
                <Field label={t('facilityEditorModal.general.contactGivenNames')}>
                  <input className="cem-input" value={form.contactGivenNames ?? ''} onChange={(e) => set("contactGivenNames", e.target.value)} placeholder={t('facilityEditorModal.general.contactGivenNamesPlaceholder')} />
                </Field>
                <Field label={t('facilityEditorModal.general.contactFamilyNames')}>
                  <input className="cem-input" value={form.contactFamilyNames ?? ''} onChange={(e) => set("contactFamilyNames", e.target.value)} placeholder={t('facilityEditorModal.general.contactFamilyNamesPlaceholder')} />
                </Field>
                <Field label={t('facilityEditorModal.general.contactPreferredName')} span>
                  <input className="cem-input" value={form.contactPreferredName ?? ''} onChange={(e) => set("contactPreferredName", e.target.value)} placeholder={t('facilityEditorModal.general.contactPreferredNamePlaceholder')} />
                </Field>
                <Field label={t('facilityEditorModal.general.email')}>
                  <input
                    className={`ps-modal-dark-input${errors.email ? " ps-modal-dark-input--error" : ""}`}
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="contact@facility.com"
                    type="email"
                  />
                  {errors.email && <div className="ps-client-editor-field-error">{errors.email}</div>}
                </Field>
                <Field label={t('facilityEditorModal.general.phone')}>
                  <input className="cem-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="555-000-0000" />
                </Field>
                <Field label={t('facilityEditorModal.general.address')} span>
                  <input className="cem-input" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder={t('facilityEditorModal.general.addressPlaceholder')} />
                </Field>
              </div>
            </div>
          )}

          {/* LIS Integration */}
          {tab === "lis_integration" && (
            <div className="ps-client-editor-form">
              <div className="cem-section">{t('facilityEditorModal.lis.interfaceEngineConnection')}</div>
              {form.isEnterprise ? (
                <>
                  <p className="cem-note">
                    {t('facilityEditorModal.lis.interfaceEngineNote')}
                  </p>
                  <div className="ps-client-editor-grid-2 cem-grid-spaced">
                    <Field label={t('facilityEditorModal.lis.endpoint')}>
                      <input
                        className={`cem-input${(errors as Record<string, string>).interfaceEngineConnection ? ' cem-input--error' : ''}`}
                        value={form.interfaceEngineConnection?.endpoint ?? ""}
                        onChange={(e) => setInterfaceEngineConnection("endpoint", e.target.value)}
                        placeholder="hl7://interface-engine.example.org:2575"
                      />
                      {(errors as Record<string, string>).interfaceEngineConnection && (
                        <div className="ps-client-editor-field-error">
                          {(errors as Record<string, string>).interfaceEngineConnection}
                        </div>
                      )}
                    </Field>
                    <Field label={t('facilityEditorModal.lis.hl7Version')}>
                      <select className="cem-input" value={form.interfaceEngineConnection?.hl7Version ?? "2.5.1"} onChange={(e) => setInterfaceEngineConnection("hl7Version", e.target.value)}>
                        <option value="2.3">2.3</option>
                        <option value="2.4">2.4</option>
                        <option value="2.5">2.5</option>
                        <option value="2.5.1">2.5.1</option>
                        <option value="2.6">2.6</option>
                      </select>
                    </Field>
                    <Field label={t('facilityEditorModal.lis.authType')}>
                      <select className="cem-input" value={form.interfaceEngineConnection?.authType ?? "none"} onChange={(e) => setInterfaceEngineConnection("authType", e.target.value)}>
                        <option value="none">{t('facilityEditorModal.lis.authTypeNone')}</option>
                        <option value="basic">{t('facilityEditorModal.lis.authTypeBasic')}</option>
                        <option value="oauth2">OAuth2</option>
                        <option value="api_key">{t('facilityEditorModal.lis.authTypeApiKey')}</option>
                      </select>
                    </Field>
                    <Field label={t('facilityEditorModal.lis.credentialConfigured')}>
                      <div className="cem-credential-row">
                        <input
                          type="checkbox"
                          id="credential-configured"
                          checked={!!form.interfaceEngineConnection?.credentialConfigured}
                          onChange={(e) => setInterfaceEngineConnection("credentialConfigured", e.target.checked)}
                          className="cem-checkbox-toggle"
                        />
                        <label htmlFor="credential-configured" className="cem-toggle-label">
                          {t('facilityEditorModal.lis.credentialConfiguredLabel')}
                        </label>
                      </div>
                    </Field>
                  </div>
                  <div className="cem-toggle-row cem-toggle-row--spaced">
                    <input
                      type="checkbox"
                      id="lis-owns-statuses"
                      checked={!!form.interfaceEngineConnection?.lisOwnsStatuses}
                      onChange={(e) => setInterfaceEngineConnection("lisOwnsStatuses", e.target.checked)}
                      className="cem-checkbox-toggle"
                    />
                    <label htmlFor="lis-owns-statuses" className="cem-toggle-label--bold">
                      {t('facilityEditorModal.lis.lisOwnsStatuses')}
                    </label>
                  </div>
                  <div className="cem-toggle-row">
                    <input
                      type="checkbox"
                      id="allow-post-final"
                      checked={!!form.interfaceEngineConnection?.allowPathScribePostFinalActions}
                      onChange={(e) => setInterfaceEngineConnection("allowPathScribePostFinalActions", e.target.checked)}
                      className="cem-checkbox-toggle"
                    />
                    <label htmlFor="allow-post-final" className="cem-toggle-label--bold">
                      {t('facilityEditorModal.lis.allowPostFinal')}
                    </label>
                  </div>
                </>
              ) : (
                <div className="cem-infobox">
                  {t('facilityEditorModal.lis.notEnterprisePrefix')} {form.parentId
                    ? <>{t('facilityEditorModal.lis.inheritsConnectionFrom')} <strong>{allFacilities.find(c => c.id === form.parentId)?.name ?? t('facilityEditorModal.general.parentEnterpriseFallback')}</strong>.</>
                    : t('facilityEditorModal.lis.notEnterpriseNoParent')}
                </div>
              )}

              <div className="cem-section cem-section--spaced">{t('facilityEditorModal.lis.lisRouting')}</div>
              <p className="cem-note">
                {t('facilityEditorModal.lis.lisRoutingNote')}
              </p>
              {!form.isEnterprise && (
                <div className="cem-toggle-row cem-toggle-row--spaced-lg">
                  <input
                    type="checkbox"
                    id="override-routing"
                    checked={!!form.lisRouting}
                    onChange={(e) => set("lisRouting", e.target.checked ? { sendingFacilityId: "" } : null)}
                    className="cem-checkbox-toggle"
                  />
                  <label htmlFor="override-routing" className="cem-toggle-label--bold">
                    {t('facilityEditorModal.lis.overrideRouting')}
                  </label>
                </div>
              )}
              {(form.isEnterprise || form.lisRouting) ? (
                <div className="ps-client-editor-grid-2">
                  <Field label={t('facilityEditorModal.lis.sendingFacilityId')}>
                    <input
                      className={`cem-input${(errors as Record<string, string>).lisRouting ? ' cem-input--error' : ''}`}
                      value={form.lisRouting?.sendingFacilityId ?? ""}
                      onChange={(e) => setLisRouting("sendingFacilityId", e.target.value)}
                      placeholder="e.g. SURGI_CENTER_NORTH"
                    />
                    {(errors as Record<string, string>).lisRouting && (
                      <div className="ps-client-editor-field-error">
                        {(errors as Record<string, string>).lisRouting}
                      </div>
                    )}
                  </Field>
                  <Field label={t('facilityEditorModal.lis.receivingFacilityId')}>
                    <input className="cem-input" value={form.lisRouting?.receivingFacilityId ?? ""} onChange={(e) => setLisRouting("receivingFacilityId", e.target.value)} placeholder={t('facilityEditorModal.lis.optional')} />
                  </Field>
                  <Field label={t('facilityEditorModal.lis.outboundChannelOverride')} span>
                    <input className="cem-input" value={form.lisRouting?.outboundChannelOverride ?? ""} onChange={(e) => setLisRouting("outboundChannelOverride", e.target.value)} placeholder={t('facilityEditorModal.lis.outboundChannelOverridePlaceholder')} />
                  </Field>
                </div>
              ) : (
                <div className="cem-infobox">
                  {t('facilityEditorModal.lis.notOverriddenPrefix')} {form.parentId
                    ? <>{t('facilityEditorModal.lis.sendsParentDefault', { name: allFacilities.find(c => c.id === form.parentId)?.name ?? t('facilityEditorModal.general.parentEnterpriseFallback') })}</>
                    : t('facilityEditorModal.lis.sendsEnterpriseParentDefault')} {t('facilityEditorModal.lis.unchanged')}
                </div>
              )}
            </div>
          )}

          {/* Identifier Formats */}
          {tab === "identifier_formats" && (
            <IdentifierFormatsTab
              facility={form}
              allFacilities={allFacilities}
              onChange={(selection) => set("identifierFormats", selection)}
            />
          )}

          {/* Reporting */}
          {tab === "reporting" && (
            <div className="ps-client-editor-form">
              <div className="cem-section">{t('facilityEditorModal.reporting.preferences')}</div>
              <div className="ps-client-editor-grid-2">
                <Field label={t('facilityEditorModal.reporting.reportFormat')}>
                  <select className="cem-input" value={form.reporting.reportFormat} onChange={(e) => setReporting("reportFormat", e.target.value)}>
                    <option value="PDF">PDF</option>
                    <option value="HL7">HL7</option>
                    <option value="Both">{t('facilityEditorModal.reporting.reportFormatBoth')}</option>
                  </select>
                </Field>
                <Field label={t('facilityEditorModal.reporting.deliveryMethod')}>
                  <select className="cem-input" value={form.reporting.deliveryMethod} onChange={(e) => setReporting("deliveryMethod", e.target.value)}>
                    <option value="Email">{t('facilityEditorModal.reporting.deliveryEmail')}</option>
                    <option value="Fax">{t('facilityEditorModal.reporting.deliveryFax')}</option>
                    <option value="Portal">{t('facilityEditorModal.reporting.deliveryPortal')}</option>
                    <option value="HL7">HL7</option>
                  </select>
                </Field>
              </div>

              <div className="cem-reporting-stack">
                {REPORTING_OPTIONS.map(([key, label]) => (
                  <div key={key} className="cem-toggle-row">
                    <input
                      type="checkbox"
                      id={key}
                      checked={form.reporting[key] as boolean}
                      onChange={(e) => setReporting(key, e.target.checked)}
                      className="cem-checkbox-toggle"
                    />
                    <label htmlFor={key} className="cem-toggle-label--medium">{label}</label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAT & Escalation */}
          {tab === "tat" && (
            <div className="ps-client-editor-form">
              <div className="cem-section">{t('facilityEditorModal.tat.turnaroundTimeTargets')}</div>
              <div className="ps-client-editor-grid-2">
                <Field label={t('facilityEditorModal.tat.firstTouchTarget')}>
                  <input
                    className="cem-input"
                    type="number"
                    min={1}
                    max={168}
                    value={form.tatFirstTouchHours ?? ""}
                    onChange={(e) => set("tatFirstTouchHours", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="4"
                  />
                  <div className="cem-hint--tight">
                    {t('facilityEditorModal.tat.firstTouchTargetHint')}
                  </div>
                </Field>
                <Field label={t('facilityEditorModal.tat.totalCaseTarget')}>
                  <input
                    className="cem-input"
                    type="number"
                    min={1}
                    max={720}
                    value={form.tatTotalHours ?? ""}
                    onChange={(e) => set("tatTotalHours", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="24"
                  />
                  <div className="cem-hint--tight">
                    {t('facilityEditorModal.tat.totalCaseTargetHint')}
                  </div>
                </Field>
              </div>

              <div className="cem-section">{t('facilityEditorModal.tat.escalationPriority')}</div>
              <div className="cem-maxwidth-sm">
                <Field label={t('facilityEditorModal.tat.priorityLabel')}>
                  <select className="cem-input" value={form.escalationPriority ?? "high"} onChange={(e) => set("escalationPriority", e.target.value)}>
                    <option value="high">{t('facilityEditorModal.tat.priorityHigh')}</option>
                    <option value="critical">{t('facilityEditorModal.tat.priorityCritical')}</option>
                  </select>
                </Field>
              </div>

              <div className="cem-section">{t('facilityEditorModal.tat.escalationTargets')}</div>
              <div className="cem-escalation-stack">
                {ESCALATION_TARGETS.map(([key, label]) => (
                  <div key={key} className="cem-escalation-row">
                    <input
                      type="checkbox"
                      id={"esc-" + key}
                      checked={(form.escalationTargets ?? []).includes(key)}
                      onChange={(e) => {
                        const current = form.escalationTargets ?? [];
                        set("escalationTargets", e.target.checked ? [...current, key] : current.filter((x) => x !== key));
                      }}
                      className="cem-checkbox-align"
                    />
                    <label htmlFor={"esc-" + key} className="cem-escalation-label">
                      {label}
                    </label>
                  </div>
                ))}
              </div>

              <div className="cem-info-teal">
                {t('facilityEditorModal.tat.escalationNote')}
              </div>
            </div>
          )}

          {/* AI & Performance — real feature, per direct confirmation:
              "AI configuration should be gated exclusively by the
              performing_lab role." Only reachable via the tab bar when
              that role is checked (see tab bar above), and the tab
              itself resets to General if the role gets unchecked
              while active (see the useEffect near the top). */}
          {tab === "ai" && (
            <div className="ps-client-editor-form">
              <div className="cem-section">{t('facilityEditorModal.ai.orchestrator')}</div>
              <div className="ps-client-editor-grid-2">
                <Field label={t('facilityEditorModal.ai.narrativeAutoDraft')}>
                  <select
                    className="cem-input"
                    value={
                      form.internalAiOrchestratorEnabled === true ? 'on'
                      : form.internalAiOrchestratorEnabled === false ? 'off'
                      : 'inherit'
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      set("internalAiOrchestratorEnabled", v === 'inherit' ? null : v === 'on');
                    }}
                  >
                    <option value="inherit">{t('facilityEditorModal.ai.inheritOrgDefault')}</option>
                    <option value="on">{t('facilityEditorModal.ai.enabledForLab')}</option>
                    <option value="off">{t('facilityEditorModal.ai.disabledForLab')}</option>
                  </select>
                </Field>
                <Field label={t('facilityEditorModal.ai.idleTimeoutOverride')}>
                  <select
                    className="cem-input"
                    value={form.idleTimeoutMinutesOverride == null ? 'inherit' : String(form.idleTimeoutMinutesOverride)}
                    onChange={(e) => {
                      const v = e.target.value;
                      set("idleTimeoutMinutesOverride", v === 'inherit' ? null : Number(v));
                    }}
                  >
                    <option value="inherit">{t('facilityEditorModal.ai.inheritSystemDefault')}</option>
                    <option value="5">{t('facilityEditorModal.ai.minutes', { count: 5 })}</option>
                    <option value="10">{t('facilityEditorModal.ai.minutes', { count: 10 })}</option>
                    <option value="15">{t('facilityEditorModal.ai.minutes', { count: 15 })}</option>
                    <option value="20">{t('facilityEditorModal.ai.minutes', { count: 20 })}</option>
                    <option value="30">{t('facilityEditorModal.ai.minutes', { count: 30 })}</option>
                    <option value="60">{t('facilityEditorModal.ai.minutes', { count: 60 })}</option>
                  </select>
                </Field>
                <Field label={t('facilityEditorModal.ai.codeReviewSamplingRate')}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    className="cem-input"
                    placeholder={t('facilityEditorModal.ai.noRandomSampling')}
                    value={form.codeReviewSamplingRatePercent ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      set("codeReviewSamplingRatePercent", v === '' ? null : Math.max(0, Math.min(100, Number(v))));
                    }}
                  />
                  <p className="ps-billing-reason-hint">
                    {t('facilityEditorModal.ai.codeReviewSamplingRateHint')}
                  </p>
                </Field>
              </div>

              {/* Real feature, per direct specification: Post-Sign-Out
                  Release Buffer, Phase 2. Same real, explicit
                  inheritSystemDefault split as the spec's own "Inherit
                  System Default: Toggle (ON/OFF) — Facility Level Only"
                  requirement — not the simpler "blank means inherit"
                  shape idleTimeoutMinutesOverride above uses, since a
                  facility here needs to override THREE related values
                  together (enabled/duration/bypass), not one bare number. */}
              <div className="cem-section">{t('facilityEditorModal.ai.releaseBuffer')}</div>
              <div className="ps-client-editor-grid-2">
                <Field label={t('facilityEditorModal.ai.configForThisLab')}>
                  <select
                    className="cem-input"
                    value={form.releaseBufferOverride == null || form.releaseBufferOverride.inheritSystemDefault ? 'inherit' : 'override'}
                    onChange={(e) => {
                      const v = e.target.value;
                      set("releaseBufferOverride", v === 'inherit'
                        ? { inheritSystemDefault: true, enabled: true, durationMinutes: 10, bypassForStat: true }
                        : { inheritSystemDefault: false, enabled: true, durationMinutes: 10, bypassForStat: true });
                    }}
                  >
                    <option value="inherit">{t('facilityEditorModal.ai.inheritReleaseBufferDefault')}</option>
                    <option value="override">{t('facilityEditorModal.ai.overrideForLab')}</option>
                  </select>
                </Field>
                {form.releaseBufferOverride && !form.releaseBufferOverride.inheritSystemDefault && (
                  <>
                    <Field label={t('facilityEditorModal.ai.bufferEnabled')}>
                      <select
                        className="cem-input"
                        value={form.releaseBufferOverride.enabled ? 'on' : 'off'}
                        onChange={(e) => set("releaseBufferOverride", { ...form.releaseBufferOverride!, enabled: e.target.value === 'on' })}
                      >
                        <option value="on">{t('facilityEditorModal.ai.enabled')}</option>
                        <option value="off">{t('facilityEditorModal.ai.disabledImmediateRelease')}</option>
                      </select>
                    </Field>
                    <Field label={t('facilityEditorModal.ai.bufferDuration')}>
                      <input
                        type="number" min={1} max={30} className="cem-input"
                        value={form.releaseBufferOverride.durationMinutes}
                        disabled={!form.releaseBufferOverride.enabled}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const clamped = Number.isFinite(raw) ? Math.min(30, Math.max(1, raw)) : form.releaseBufferOverride!.durationMinutes;
                          set("releaseBufferOverride", { ...form.releaseBufferOverride!, durationMinutes: clamped });
                        }}
                      />
                    </Field>
                    <Field label={t('facilityEditorModal.ai.bypassForStat')}>
                      <select
                        className="cem-input"
                        value={form.releaseBufferOverride.bypassForStat ? 'on' : 'off'}
                        disabled={!form.releaseBufferOverride.enabled}
                        onChange={(e) => set("releaseBufferOverride", { ...form.releaseBufferOverride!, bypassForStat: e.target.value === 'on' })}
                      >
                        <option value="on">{t('facilityEditorModal.ai.bypassOn')}</option>
                        <option value="off">{t('facilityEditorModal.ai.bypassOff')}</option>
                      </select>
                    </Field>
                  </>
                )}
              </div>

              <div className="cem-section">{t('facilityEditorModal.ai.modelVersion')}</div>
              <Field label={t('facilityEditorModal.ai.model')}>
                <select
                  className="cem-input"
                  value={form.internalAiModelId ?? 'inherit'}
                  onChange={(e) => {
                    const v = e.target.value;
                    set("internalAiModelId", v === 'inherit' ? null : v);
                  }}
                >
                  <option value="inherit">{t('facilityEditorModal.ai.inheritModelDefault')}</option>
                  {eligibleModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name} {m.version}</option>
                  ))}
                </select>
                {/* Real, deliberate design: this list is not "every
                    model in the system" — only ones this exact
                    facility has a reported, PASS-graded validation
                    study for. No way around that from here, by
                    design; a facility with none available sees only
                    "Inherit," which is the correct, safe state. */}
                {isEdit && eligibleModels.length === 0 && (
                  <div className="cem-hint-sm">
                    {t('facilityEditorModal.ai.noEligibleModels')}
                  </div>
                )}
                {!isEdit && (
                  <div className="cem-hint-sm">
                    {t('facilityEditorModal.ai.saveFirstForModelOverride')}
                  </div>
                )}
              </Field>
            </div>
          )}

          {/* Locations — real feature, per direct confirmation: "we
              will need to accept PV1 HL7 data, but I don't believe we
              have Location / Rooms defined in config. They would
              naturally be associated to the Facility." Never gated to
              any specific role (see tab bar above) — edit-mode only,
              since a brand-new, unsaved facility can't have locations
              attached to it yet. */}
          {tab === "locations" && (
            <div className="ps-client-editor-form">
              <div className="cem-section">{t('facilityEditorModal.locations.title')}</div>
              <p className="ps-fixgate-intro cem-mb-12">
                {t('facilityEditorModal.locations.intro')}
              </p>

              {locationsLoading && <div className="cem-loading-text">{t('facilityEditorModal.locations.loading')}</div>}

              {!locationsLoading && locations.length === 0 && !showAddLocation && (
                <div className="cem-empty-text">
                  {t('facilityEditorModal.locations.noLocationsYet')}
                </div>
              )}

              {!locationsLoading && locations.length > 0 && (
                <div className="cem-locations-list">
                  {locations.map(loc => (
                    <div key={loc.id} className="cem-location-row">
                      <div>
                        <div className="cem-location-name">
                          {[loc.pointOfCare, loc.room, loc.bed].filter(Boolean).join(' / ')}
                          {loc.status === 'Unverified' && (
                            <span className="cem-badge cem-badge--warn">
                              {t('facilityEditorModal.locations.unverified')}
                            </span>
                          )}
                          {loc.status === 'Inactive' && (
                            <span className="cem-badge cem-badge--danger">
                              {t('facilityEditorModal.locations.inactive')}
                            </span>
                          )}
                        </div>
                        <div className="cem-location-meta">
                          {[loc.building && t('facilityEditorModal.locations.building', { building: loc.building }), loc.floor && t('facilityEditorModal.locations.floor', { floor: loc.floor }), loc.personLocationType, loc.locationStatus]
                            .filter(Boolean).join(' · ') || '—'}
                        </div>
                        {loc.autoCreated && loc.autoCreatedNote && (
                          <div className="cem-location-note">{loc.autoCreatedNote}</div>
                        )}
                      </div>
                      <div className="cem-location-actions">
                        {loc.status === 'Unverified' && (
                          <button
                            type="button"
                            onClick={() => handleVerifyLocation(loc.id)}
                            className="ps-conf-btn-secondary cem-btn-sm--verify"
                          >
                            {t('facilityEditorModal.locations.verify')}
                          </button>
                        )}
                        {loc.status !== 'Unverified' && (
                          <button
                            type="button"
                            onClick={() => handleToggleLocationActive(loc)}
                            className={`ps-conf-btn-secondary ${loc.status === 'Active' ? 'cem-btn-sm--deactivate' : 'cem-btn-sm--activate'}`}
                          >
                            {loc.status === 'Active' ? t('facilityEditorModal.locations.deactivate') : t('facilityEditorModal.locations.activate')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!showAddLocation ? (
                <button
                  type="button"
                  onClick={() => setShowAddLocation(true)}
                  className="ps-conf-btn-secondary cem-btn-sm"
                >
                  {t('facilityEditorModal.locations.addLocation')}
                </button>
              ) : (
                <div className="cem-add-location-form">
                  <div className="ps-client-editor-grid-2">
                    <Field label={t('facilityEditorModal.locations.pointOfCare')}>
                      <input
                        className="cem-input"
                        value={newLocation.pointOfCare}
                        onChange={e => setNewLocation(p => ({ ...p, pointOfCare: e.target.value }))}
                        placeholder={t('facilityEditorModal.locations.pointOfCarePlaceholder')}
                      />
                    </Field>
                    <Field label={t('facilityEditorModal.locations.room')}>
                      <input
                        className="cem-input"
                        value={newLocation.room}
                        onChange={e => setNewLocation(p => ({ ...p, room: e.target.value }))}
                        placeholder={t('facilityEditorModal.locations.roomPlaceholder')}
                      />
                    </Field>
                    <Field label={t('facilityEditorModal.locations.bed')}>
                      <input
                        className="cem-input"
                        value={newLocation.bed}
                        onChange={e => setNewLocation(p => ({ ...p, bed: e.target.value }))}
                        placeholder={t('facilityEditorModal.locations.bedPlaceholder')}
                      />
                    </Field>
                    <Field label={t('facilityEditorModal.locations.buildingLabel')}>
                      <input
                        className="cem-input"
                        value={newLocation.building}
                        onChange={e => setNewLocation(p => ({ ...p, building: e.target.value }))}
                        placeholder={t('facilityEditorModal.locations.buildingPlaceholder')}
                      />
                    </Field>
                    <Field label={t('facilityEditorModal.locations.floorLabel')}>
                      <input
                        className="cem-input"
                        value={newLocation.floor}
                        onChange={e => setNewLocation(p => ({ ...p, floor: e.target.value }))}
                        placeholder={t('facilityEditorModal.locations.floorPlaceholder')}
                      />
                    </Field>
                    <Field label={t('facilityEditorModal.locations.locationStatus')}>
                      <select
                        className="cem-input"
                        value={newLocation.locationStatus}
                        onChange={e => setNewLocation(p => ({ ...p, locationStatus: e.target.value }))}
                      >
                        <option value="">{t('facilityEditorModal.locations.noneOption')}</option>
                        {HL7_LOCATION_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label={t('facilityEditorModal.locations.personLocationType')} span>
                      <select
                        className="cem-input"
                        value={newLocation.personLocationType}
                        onChange={e => setNewLocation(p => ({ ...p, personLocationType: e.target.value }))}
                      >
                        <option value="">{t('facilityEditorModal.locations.noneOption')}</option>
                        {HL7_PERSON_LOCATION_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="cem-form-actions">
                    <button
                      type="button"
                      disabled={!newLocation.pointOfCare.trim()}
                      onClick={handleAddLocation}
                      className="cem-btn-primary-sm"
                    >
                      {t('facilityEditorModal.locations.addLocation')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddLocation(false); resetNewLocationForm(); }}
                      className="cem-btn-text"
                    >
                      {t('facilityEditorModal.locations.neverMind')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>{/* end body */}

        {/* ── Footer ── */}
        <div className="ps-client-editor-footer">
          <button onClick={onClose} className="cem-footer-cancel">{t('facilityEditorModal.cancel')}</button>
          <button
            onClick={handleSubmit}
            className={`cem-footer-save${saved ? ' cem-footer-save--saved' : ''}`}
          >
            {saved ? t('facilityEditorModal.saved') : isEdit ? t('facilityEditorModal.saveChanges') : t('facilityEditorModal.addFacility')}
          </button>
        </div>

      </div>
    </div>
  );
};
