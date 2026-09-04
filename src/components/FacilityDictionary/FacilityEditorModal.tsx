/**
 * FacilityEditorModal.tsx
 * Located at: src/components/FacilityDictionary/FacilityEditorModal.tsx
 *
 * Add / Edit modal for a single facility.
 * Props:
 *   isOpen  -- boolean
 *   onClose -- () => void
 *   facility -- Facility | undefined (undefined = add mode, Facility = edit mode)
 *   onSave  -- (input: FacilityInput) => void — parent owns the actual
 *              facilityService.add/update call, same convention as
 *              PhysiciansSection.tsx / DepartmentsSection.tsx
 */

import React, { useState, useEffect } from "react";
import '../../pathscribe.css';
import type { Facility, FacilityInput, FacilityRole } from "../../services/facilities/IFacilityService";
import { FACILITY_ROLE_LABELS, FACILITY_ROLE_TOOLTIPS } from "../../services/facilities/IFacilityService";
import { mockPlaceOfServiceCodeService } from "../../services/billing/mockPlaceOfServiceCodeService";
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
  /** Existing facility to edit, or undefined to add a new one. Passed
   *  directly rather than a facilityId + internal lookup — matches
   *  PhysiciansSection/DepartmentsSection's convention. */
  facility?: Facility;
  onSave: (input: FacilityInput) => void;
  /** Full facility list, used to populate the Parent Enterprise
   *  dropdown — e.g. picking which NHS Trust a hospital is an
   *  affiliate of. */
  allFacilities: Facility[];
}

// ─── Static data (extracted to avoid inline type assertions in JSX) ───────────

type ReportingOption = [keyof Facility['reporting'], string];

const REPORTING_OPTIONS: ReportingOption[] = [
  ['autoRelease',     'Auto-release reports on finalization'],
  ['copyToReferring', 'Copy report to referring physician'],
];

type EscalationTarget = 'pathGroup' | 'admin' | 'referrer';
type EscalationOption = [EscalationTarget, string];

const ESCALATION_TARGETS: EscalationOption[] = [
  ['pathGroup', 'Pathology Group - all pathologists assigned to this facility'],
  ['admin',     'Lab Administrator - the lab admin receives the alert'],
  ['referrer',  'Referring Physician - the requesting clinician is notified'],
];

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

// ─── Style constants ──────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "13px",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "7px",
  outline: "none",
  boxSizing: "border-box",
  color: "#e2e8f0",
  background: "#0f172a",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "#cbd5e1",
  marginBottom: "4px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const SECTION: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#0891b2",
  textTransform: "uppercase",
  letterSpacing: "0.6px",
  marginBottom: "12px",
  paddingBottom: "6px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode; span?: boolean }> = ({
  label, children, span,
}) => (
  <div style={span ? { gridColumn: "1 / -1" } : {}}>
    <label style={LABEL}>{label}</label>
    {children}
  </div>
);

const onF = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  (e.currentTarget.style.borderColor = "#0891b2");

const onB = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)");

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "general" | "lis_integration" | "identifier_formats" | "reporting" | "tat" | "ai" | "locations";

// ─── Component ────────────────────────────────────────────────────────────────

export const FacilityEditorModal: React.FC<FacilityEditorModalProps> = ({
  isOpen,
  onClose,
  facility,
  onSave,
  allFacilities,
}) => {
  const isEdit = !!facility;

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
    if (!isOpen || !facility?.id || !hasRole('performing_lab')) { setEligibleModels([]); return; }
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
  }, [isOpen, facility?.id, form.roles.includes('performing_lab')]);

  // Real, new: the real, versioned CMS Place of Service dictionary
  // (services/billing/mockPlaceOfServiceCodeService.ts). Deliberately
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
      const res = await mockPlaceOfServiceCodeService.getActiveCodes();
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
    if (!facility?.id) { setLocations([]); return; }
    setLocationsLoading(true);
    const res = await locationService.listForFacility(facility.id);
    if (res.ok) setLocations(res.data);
    setLocationsLoading(false);
  };
  useEffect(() => {
    if (!isOpen || !facility?.id) { setLocations([]); return; }
    reloadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, facility?.id]);

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({
    pointOfCare: '', room: '', bed: '', building: '', floor: '',
    locationStatus: '', personLocationType: '',
  });
  const resetNewLocationForm = () => setNewLocation({ pointOfCare: '', room: '', bed: '', building: '', floor: '', locationStatus: '', personLocationType: '' });

  const handleAddLocation = async () => {
    if (!facility?.id || !newLocation.pointOfCare.trim()) return;
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
    if (!form.name.trim()) e.name = "Facility name is required";
    if (!form.assigningAuthority.trim()) e.assigningAuthority = "Assigning Authority is required";
    if (!form.email.trim() || !form.email.includes("@"))
      e.email = "Valid email required";
    // Real, per direct guidance: replaces the old hl7.enabled-based
    // check — presence of a real, configured object is the enabled
    // signal now, not a separate boolean. interfaceEngineConnection
    // is only ever set here when isEnterprise, so endpoint is the
    // one real required field once an admin starts configuring it.
    if (form.isEnterprise && form.interfaceEngineConnection && !form.interfaceEngineConnection.endpoint.trim())
      (e as Record<string, string>).interfaceEngineConnection = "Endpoint is required once Interface Engine Connection is configured";
    if (form.lisRouting && !form.lisRouting.sendingFacilityId.trim())
      (e as Record<string, string>).lisRouting = "Sending Facility ID is required once LIS Routing is configured";
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

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    borderBottom: tab === t ? "2px solid #0891b2" : "2px solid transparent",
    color: tab === t ? "#0891b2" : "#64748b",
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
className="ps-overlay" style={{ zIndex: 9000 }}
      onClick={onClose}
    >
      <div
className="ps-client-editor-shell"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header + tab bar ── */}
        <div className="ps-client-editor-header">
          <div className="ps-client-editor-header-row">
            <h2 className="ps-client-editor-title">
              {isEdit ? "Edit Facility" : "Add Facility"}
            </h2>
            <button
              onClick={onClose}
className="ps-modal-close"
            >&#x2715;</button>
          </div>
          <div className="ps-client-editor-tabs">
            <button style={tabStyle("general")}   onClick={() => setTab("general")}>General</button>
            {/* Real, per direct guidance: never role-gated — LIS
                routing metadata is real, potentially-relevant data
                for any facility that sends messages toward the
                shared Interface Engine connection, not just ones
                holding a specific role. Interface Engine Connection
                fields within this tab are still gated to isEnterprise
                internally, since that half is deliberately
                Enterprise-only. */}
            <button style={tabStyle("lis_integration")} onClick={() => setTab("lis_integration")}>LIS Integration</button>
            {/* Real, per direct guidance: same real move as LIS
                Integration above - never role-gated, real for any
                facility. */}
            <button style={tabStyle("identifier_formats")} onClick={() => setTab("identifier_formats")}>Identifier Formats</button>
            {/* Real fix, per direct confirmation: not role-gated —
                TAT/reporting apply to any facility that handles
                cases, not just ordering-client roles. Confirmed
                against real seed data: Fenwick General Hospital is
                performing_lab-only but has real, configured TAT
                targets (8h/48h) that were invisible under the old
                isOrderingClient gate. */}
            <button style={tabStyle("reporting")}  onClick={() => setTab("reporting")}>Reporting</button>
            <button style={tabStyle("tat")}        onClick={() => setTab("tat")}>TAT &amp; Escalation</button>
            {hasRole('performing_lab') && (
              <button style={tabStyle("ai")}         onClick={() => setTab("ai")}>AI &amp; Performance</button>
            )}
            {/* Real fix, per direct confirmation: never gated to any
                specific role — a facility can want its
                locations configured purely for manual accessioning
                (AccessionPage.tsx's own Location dropdown), with no
                HL7 integration involved at all. Still edit-mode only —
                a brand-new, unsaved facility can't have locations
                attached to it yet. */}
            {isEdit && (
              <button style={tabStyle("locations")}  onClick={() => setTab("locations")}>Locations</button>
            )}
          </div>
        </div>

        {/* ── Body — all four tabs live inside this scrollable div ── */}
        <div className="ps-client-editor-body">

          {/* General */}
          {tab === "general" && (
            <div className="ps-client-editor-form">
              <div style={SECTION}>Facility Details</div>
              <div style={grid2}>
                <Field label="Facility Name *" span>
                  <input
                    className={`ps-modal-dark-input${errors.name ? " ps-modal-dark-input--error" : ""}`}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    onFocus={onF} onBlur={onB}
                    placeholder="e.g. Northwest Oncology Group"
                  />
                  {errors.name && <div className="ps-client-editor-field-error">{errors.name}</div>}
                </Field>
                <Field label="Assigning Authority *">
                  <input
                    className={`ps-modal-dark-input${errors.assigningAuthority ? " ps-modal-dark-input--error" : ""}`} style={{ fontFamily: "monospace", textTransform: "uppercase" as const }}
                    value={form.assigningAuthority}
                    onChange={(e) => set("assigningAuthority", e.target.value.toUpperCase())}
                    onFocus={onF} onBlur={onB}
                    placeholder="e.g. NWOG"
                    maxLength={10}
                  />
                  {errors.assigningAuthority && <div className="ps-client-editor-field-error">{errors.assigningAuthority}</div>}
                </Field>
                <Field label="Status">
                  <select
                    style={INPUT}
                    value={form.status}
                    onChange={(e) => set("status", e.target.value)}
                    onFocus={onF} onBlur={onB}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    {/* Unverified is only ever set by order-intake auto-creation,
                        not a state an admin manually assigns — so it's shown
                        here (read-only-ish, via disabled) only when already set,
                        rather than offered as a normal choice. */}
                    {form.status === 'Unverified' && <option value="Unverified" disabled>Unverified (verify via table action)</option>}
                  </select>
                </Field>
                <Field label="Roles" span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {FACILITY_ROLE_ORDER.map(role => (
                      <label
                        key={role}
                        htmlFor={`role-${role}`}
                        title={FACILITY_ROLE_TOOLTIPS[role]}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                          background: hasRole(role) ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${hasRole(role) ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          id={`role-${role}`}
                          checked={hasRole(role)}
                          onChange={e => toggleRole(role, e.target.checked)}
                          style={{ width: 15, height: 15, accentColor: '#0891b2', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>{FACILITY_ROLE_LABELS[role]}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                    A facility can hold any combination — e.g. a hospital can be both a Performing Lab and an
                    Internal Ordering Facility at once. HL7, Reporting/TAT, and AI &amp; Performance tabs above
                    appear based on which roles are checked here.
                  </div>
                </Field>
                {hasRole('specimen_acquisition') && (
                  <Field label="Place of Service Code">
                    <select
                      style={INPUT}
                      value={form.placeOfServiceCodeId ?? ''}
                      onChange={(e) => set("placeOfServiceCodeId", e.target.value || undefined)}
                      onFocus={onF} onBlur={onB}
                    >
                      <option value="">Not set</option>
                      {posCodes.map(c => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      The real, current CMS Place of Service code set — reflects the setting where the
                      specimen is actually collected, not this facility's own performing-lab characteristics.
                    </div>
                  </Field>
                )}
                {hasRole('performing_lab') && (
                  <Field label="CLIA / ISO Accreditation Number">
                    <input
                      style={INPUT}
                      value={form.cliaOrIsoNumber ?? ''}
                      onChange={(e) => set("cliaOrIsoNumber", e.target.value || undefined)}
                      onFocus={onF} onBlur={onB}
                      placeholder="e.g. 12D3456789 (US CLIA) or a UK/ISO accreditation number"
                    />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      Free text, not validated against a format — a real US CLIA number and a real UK/ISO
                      accreditation number look genuinely different, and this app has no verified format spec
                      for either to check against.
                    </div>
                  </Field>
                )}
                {hasRole('performing_lab') && (
                  <Field label="Abnormal Detection">
                    <label
                      htmlFor="abnormalDetectionEnabled"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', width: 'fit-content',
                        background: form.abnormalDetectionEnabled !== false ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${form.abnormalDetectionEnabled !== false ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        id="abnormalDetectionEnabled"
                        checked={form.abnormalDetectionEnabled !== false}
                        onChange={(e) => set("abnormalDetectionEnabled", e.target.checked ? undefined : false)}
                        style={{ width: 15, height: 15, accentColor: '#0891b2', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>Enabled at this facility</span>
                    </label>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      This facility's own choice, subject to the enterprise-level setting — if disabled at
                      the enterprise level, this facility's own setting cannot re-enable it. Checking this box
                      clears an explicit facility-level override back to following the enterprise default,
                      rather than forcing a stored "true" this facility didn't actually choose.
                    </div>
                  </Field>
                )}
                <Field label="Jurisdiction">
                  <select
                    style={INPUT}
                    value={form.jurisdiction}
                    onChange={(e) => set("jurisdiction", e.target.value)}
                    onFocus={onF} onBlur={onB}
                  >
                    {(Object.entries(JURISDICTION_LABELS) as [Jurisdiction, string][]).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Specimen / Block Labeling">
                  <select
                    style={INPUT}
                    value={form.specimenLabelStyle ?? 'alpha-specimen'}
                    onChange={(e) => set("specimenLabelStyle", e.target.value)}
                    onFocus={onF} onBlur={onB}
                  >
                    <option value="alpha-specimen">Specimen A, B, C / Block A1, A2, A3</option>
                    <option value="numeric-specimen">Specimen 1, 2, 3 / Block 1A, 1B, 1C</option>
                  </select>
                </Field>
                <Field label="Enterprise">
                  <label
                    htmlFor="isEnterprise"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', width: 'fit-content',
                      background: form.isEnterprise ? 'rgba(8,145,178,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${form.isEnterprise ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      id="isEnterprise"
                      checked={!!form.isEnterprise}
                      onChange={e => set("isEnterprise", e.target.checked || undefined)}
                      style={{ width: 15, height: 15, accentColor: '#0891b2', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>This is a top-level Enterprise institution</span>
                  </label>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                    Only Enterprise-tagged facilities appear as selectable Parent Enterprises below — keeps a
                    real affiliate from accidentally pointing at another affiliate.
                  </div>
                </Field>
                <Field label="Parent Enterprise">
                  <select
                    style={INPUT}
                    value={form.parentId ?? ''}
                    onChange={(e) => set("parentId", e.target.value || undefined)}
                    onFocus={onF} onBlur={onB}
                  >
                    <option value="">None — this is the top-level institution</option>
                    {allFacilities
                      .filter(c => c.id !== facility?.id && c.isEnterprise)
                      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>

              <div style={SECTION}>Contact</div>
              <div style={grid2}>
                <Field label="Contact Prefix">
                  <select style={INPUT} value={form.contactNamePrefix ?? ''} onChange={(e) => set("contactNamePrefix", e.target.value)} onFocus={onF} onBlur={onB}>
                    <option value="">None</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Mx.">Mx.</option>
                    <option value="Dr.">Dr.</option>
                  </select>
                </Field>
                <Field label="Contact Suffix">
                  {contactSuffixCustom ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input style={INPUT} value={form.contactNameSuffix ?? ''} onChange={(e) => set("contactNameSuffix", e.target.value)} onFocus={onF} onBlur={onB} placeholder="e.g. Esq., MD" />
                      <button type="button" onClick={() => { setContactSuffixCustom(false); set("contactNameSuffix", ""); }}
                        style={{ background: "none", border: "none", color: "#38bdf8", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "underline" }}>
                        Use list
                      </button>
                    </div>
                  ) : (
                    <select style={INPUT} value={form.contactNameSuffix ?? ''} onChange={(e) => {
                      if (e.target.value === "__other__") { setContactSuffixCustom(true); set("contactNameSuffix", ""); }
                      else set("contactNameSuffix", e.target.value);
                    }} onFocus={onF} onBlur={onB}>
                      <option value="">None</option>
                      {SUFFIX_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="__other__">Other…</option>
                    </select>
                  )}
                </Field>
                <Field label="Contact Given Name(s)">
                  <input style={INPUT} value={form.contactGivenNames ?? ''} onChange={(e) => set("contactGivenNames", e.target.value)} onFocus={onF} onBlur={onB} placeholder="e.g. Jane" />
                </Field>
                <Field label="Contact Family Name(s)">
                  <input style={INPUT} value={form.contactFamilyNames ?? ''} onChange={(e) => set("contactFamilyNames", e.target.value)} onFocus={onF} onBlur={onB} placeholder="e.g. Smith" />
                </Field>
                <Field label="Contact Preferred Name" span>
                  <input style={INPUT} value={form.contactPreferredName ?? ''} onChange={(e) => set("contactPreferredName", e.target.value)} onFocus={onF} onBlur={onB} placeholder="Optional — what to call them" />
                </Field>
                <Field label="Email *">
                  <input
                    className={`ps-modal-dark-input${errors.email ? " ps-modal-dark-input--error" : ""}`}
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    onFocus={onF} onBlur={onB}
                    placeholder="contact@facility.com"
                    type="email"
                  />
                  {errors.email && <div className="ps-client-editor-field-error">{errors.email}</div>}
                </Field>
                <Field label="Phone">
                  <input style={INPUT} value={form.phone} onChange={(e) => set("phone", e.target.value)} onFocus={onF} onBlur={onB} placeholder="555-000-0000" />
                </Field>
                <Field label="Address" span>
                  <input style={INPUT} value={form.address} onChange={(e) => set("address", e.target.value)} onFocus={onF} onBlur={onB} placeholder="123 Main St, City, State ZIP" />
                </Field>
              </div>
            </div>
          )}

          {/* LIS Integration */}
          {tab === "lis_integration" && (
            <div className="ps-client-editor-form">
              <div style={SECTION}>Interface Engine Connection</div>
              {form.isEnterprise ? (
                <>
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 12px" }}>
                    Real, per direct architectural guidance: PathScribe maintains one physical connection to
                    this Enterprise's own Interface Engine (Mirth, Rhapsody, etc.), which then routes/transforms
                    to whichever real downstream LIS a given message actually belongs to. There is deliberately
                    no per-facility version of this — a facility that needed a genuinely separate physical
                    connection would be a different Enterprise, not an override of this one.
                  </p>
                  <div style={{ ...grid2, marginBottom: "12px" }}>
                    <Field label="Interface Engine Endpoint">
                      <input
                        style={{ ...INPUT, borderColor: (errors as Record<string, string>).interfaceEngineConnection ? "#ef4444" : "rgba(255,255,255,0.1)" }}
                        value={form.interfaceEngineConnection?.endpoint ?? ""}
                        onChange={(e) => setInterfaceEngineConnection("endpoint", e.target.value)}
                        onFocus={onF} onBlur={onB}
                        placeholder="hl7://interface-engine.example.org:2575"
                      />
                      {(errors as Record<string, string>).interfaceEngineConnection && (
                        <div className="ps-client-editor-field-error">
                          {(errors as Record<string, string>).interfaceEngineConnection}
                        </div>
                      )}
                    </Field>
                    <Field label="HL7 Version">
                      <select style={INPUT} value={form.interfaceEngineConnection?.hl7Version ?? "2.5.1"} onChange={(e) => setInterfaceEngineConnection("hl7Version", e.target.value)} onFocus={onF} onBlur={onB}>
                        <option value="2.3">2.3</option>
                        <option value="2.4">2.4</option>
                        <option value="2.5">2.5</option>
                        <option value="2.5.1">2.5.1</option>
                        <option value="2.6">2.6</option>
                      </select>
                    </Field>
                    <Field label="Auth Type">
                      <select style={INPUT} value={form.interfaceEngineConnection?.authType ?? "none"} onChange={(e) => setInterfaceEngineConnection("authType", e.target.value)} onFocus={onF} onBlur={onB}>
                        <option value="none">None</option>
                        <option value="basic">Basic</option>
                        <option value="oauth2">OAuth2</option>
                        <option value="api_key">API Key</option>
                      </select>
                    </Field>
                    <Field label="Credential Configured">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "8px" }}>
                        <input
                          type="checkbox"
                          id="credential-configured"
                          checked={!!form.interfaceEngineConnection?.credentialConfigured}
                          onChange={(e) => setInterfaceEngineConnection("credentialConfigured", e.target.checked)}
                          style={{ width: "16px", height: "16px", accentColor: "#0891b2", cursor: "pointer" }}
                        />
                        <label htmlFor="credential-configured" style={{ fontSize: "13px", color: "#e2e8f0", cursor: "pointer" }}>
                          A real credential has been provisioned for this connection
                        </label>
                      </div>
                    </Field>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", marginBottom: "8px" }}>
                    <input
                      type="checkbox"
                      id="lis-owns-statuses"
                      checked={!!form.interfaceEngineConnection?.lisOwnsStatuses}
                      onChange={(e) => setInterfaceEngineConnection("lisOwnsStatuses", e.target.checked)}
                      style={{ width: "16px", height: "16px", accentColor: "#0891b2", cursor: "pointer" }}
                    />
                    <label htmlFor="lis-owns-statuses" style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", cursor: "pointer" }}>
                      The connected LIS owns major case statuses
                    </label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <input
                      type="checkbox"
                      id="allow-post-final"
                      checked={!!form.interfaceEngineConnection?.allowPathScribePostFinalActions}
                      onChange={(e) => setInterfaceEngineConnection("allowPathScribePostFinalActions", e.target.checked)}
                      style={{ width: "16px", height: "16px", accentColor: "#0891b2", cursor: "pointer" }}
                    />
                    <label htmlFor="allow-post-final" style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", cursor: "pointer" }}>
                      Pathologists can initiate Addendum/Amendment directly in PathScribe
                    </label>
                  </div>
                </>
              ) : (
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px", color: "#94a3b8" }}>
                  Only meaningful on an Enterprise institution. {form.parentId
                    ? <>This facility inherits its connection from <strong>{allFacilities.find(c => c.id === form.parentId)?.name ?? "its Parent Enterprise"}</strong>.</>
                    : "Set a Parent Enterprise on the General tab to inherit a real connection, or check Enterprise to configure one directly."}
                </div>
              )}

              <div style={{ ...SECTION, marginTop: "24px" }}>LIS Routing</div>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 12px" }}>
                Real routing metadata sent alongside every message to the shared Interface Engine connection
                above — never a new physical connection. The Interface Engine's own conditional routing rules
                key off these identifiers to decide where a message actually needs to go.
              </p>
              {!form.isEnterprise && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", marginBottom: "12px" }}>
                  <input
                    type="checkbox"
                    id="override-routing"
                    checked={!!form.lisRouting}
                    onChange={(e) => set("lisRouting", e.target.checked ? { sendingFacilityId: "" } : null)}
                    style={{ width: "16px", height: "16px", accentColor: "#0891b2", cursor: "pointer" }}
                  />
                  <label htmlFor="override-routing" style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", cursor: "pointer" }}>
                    Override Enterprise routing for this facility
                  </label>
                </div>
              )}
              {(form.isEnterprise || form.lisRouting) ? (
                <div style={grid2}>
                  <Field label="Sending Facility ID (MSH-4)">
                    <input
                      style={{ ...INPUT, borderColor: (errors as Record<string, string>).lisRouting ? "#ef4444" : "rgba(255,255,255,0.1)" }}
                      value={form.lisRouting?.sendingFacilityId ?? ""}
                      onChange={(e) => setLisRouting("sendingFacilityId", e.target.value)}
                      onFocus={onF} onBlur={onB}
                      placeholder="e.g. SURGI_CENTER_NORTH"
                    />
                    {(errors as Record<string, string>).lisRouting && (
                      <div className="ps-client-editor-field-error">
                        {(errors as Record<string, string>).lisRouting}
                      </div>
                    )}
                  </Field>
                  <Field label="Receiving Facility ID (MSH-6)">
                    <input style={INPUT} value={form.lisRouting?.receivingFacilityId ?? ""} onChange={(e) => setLisRouting("receivingFacilityId", e.target.value)} onFocus={onF} onBlur={onB} placeholder="Optional" />
                  </Field>
                  <Field label="Outbound Channel Override" span>
                    <input style={INPUT} value={form.lisRouting?.outboundChannelOverride ?? ""} onChange={(e) => setLisRouting("outboundChannelOverride", e.target.value)} onFocus={onF} onBlur={onB} placeholder="e.g. a distinct SFTP folder or local VPN listener — optional" />
                  </Field>
                </div>
              ) : (
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px", color: "#94a3b8" }}>
                  Not overridden — this facility sends {form.parentId
                    ? <>{allFacilities.find(c => c.id === form.parentId)?.name ?? "its Parent Enterprise"}'s own default routing metadata</>
                    : "its Enterprise parent's own default routing metadata"} unchanged.
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
              <div style={SECTION}>Reporting Preferences</div>
              <div style={grid2}>
                <Field label="Report Format">
                  <select style={INPUT} value={form.reporting.reportFormat} onChange={(e) => setReporting("reportFormat", e.target.value)} onFocus={onF} onBlur={onB}>
                    <option value="PDF">PDF</option>
                    <option value="HL7">HL7</option>
                    <option value="Both">Both (PDF + HL7)</option>
                  </select>
                </Field>
                <Field label="Delivery Method">
                  <select style={INPUT} value={form.reporting.deliveryMethod} onChange={(e) => setReporting("deliveryMethod", e.target.value)} onFocus={onF} onBlur={onB}>
                    <option value="Email">Email</option>
                    <option value="Fax">Fax</option>
                    <option value="Portal">Portal</option>
                    <option value="HL7">HL7</option>
                  </select>
                </Field>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                {REPORTING_OPTIONS.map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <input
                      type="checkbox"
                      id={key}
                      checked={form.reporting[key] as boolean}
                      onChange={(e) => setReporting(key, e.target.checked)}
                      style={{ width: "16px", height: "16px", accentColor: "#0891b2", cursor: "pointer" }}
                    />
                    <label htmlFor={key} style={{ fontSize: "13px", fontWeight: 500, color: "#e2e8f0", cursor: "pointer" }}>{label}</label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAT & Escalation */}
          {tab === "tat" && (
            <div className="ps-client-editor-form">
              <div style={SECTION}>Turnaround Time Targets</div>
              <div style={grid2}>
                <Field label="First Touch Target (hours)">
                  <input
                    style={INPUT}
                    type="number"
                    min={1}
                    max={168}
                    value={form.tatFirstTouchHours ?? ""}
                    onChange={(e) => set("tatFirstTouchHours", e.target.value === "" ? null : Number(e.target.value))}
                    onFocus={onF} onBlur={onB}
                    placeholder="4"
                  />
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                    Hours from received before first-open escalation fires. Blank = system default.
                  </div>
                </Field>
                <Field label="Total Case TAT Target (hours)">
                  <input
                    style={INPUT}
                    type="number"
                    min={1}
                    max={720}
                    value={form.tatTotalHours ?? ""}
                    onChange={(e) => set("tatTotalHours", e.target.value === "" ? null : Number(e.target.value))}
                    onFocus={onF} onBlur={onB}
                    placeholder="24"
                  />
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                    Hours from receivedDate to finalizedAt. Blank = system default.
                  </div>
                </Field>
              </div>

              <div style={SECTION}>Escalation Priority</div>
              <div style={{ maxWidth: "260px" }}>
                <Field label="Priority when threshold is breached">
                  <select
                    style={INPUT}
                    value={form.escalationPriority ?? "high"}
                    onChange={(e) => set("escalationPriority", e.target.value)}
                    onFocus={onF} onBlur={onB}
                  >
                    <option value="high">High - notify on next login</option>
                    <option value="critical">Critical - immediate notification</option>
                  </select>
                </Field>
              </div>

              <div style={SECTION}>Escalation Targets</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {ESCALATION_TARGETS.map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <input
                      type="checkbox"
                      id={"esc-" + key}
                      checked={(form.escalationTargets ?? []).includes(key)}
                      onChange={(e) => {
                        const current = form.escalationTargets ?? [];
                        set("escalationTargets", e.target.checked ? [...current, key] : current.filter((x) => x !== key));
                      }}
                      style={{ width: "16px", height: "16px", accentColor: "#0891b2", cursor: "pointer", marginTop: "2px", flexShrink: 0 }}
                    />
                    <label htmlFor={"esc-" + key} style={{ fontSize: "13px", fontWeight: 500, color: "#e2e8f0", cursor: "pointer", lineHeight: "1.4" }}>
                      {label}
                    </label>
                  </div>
                ))}
              </div>

              <div style={{ padding: "12px 14px", background: "rgba(8,145,178,0.06)", border: "1px solid #bae6fd", borderRadius: "8px", fontSize: "12px", color: "#38bdf8" }}>
                When no escalation targets are selected, alerts are suppressed for this facility.
                Leave blank to use system defaults (First Touch: 4h, Total TAT: 24h).
                Restricted cases (pediatric access control) always escalate at Critical regardless of this setting.
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
              <div style={SECTION}>AI Orchestrator</div>
              <div style={grid2}>
                <Field label="Narrative Auto-Draft">
                  <select
                    style={INPUT}
                    value={
                      form.internalAiOrchestratorEnabled === true ? 'on'
                      : form.internalAiOrchestratorEnabled === false ? 'off'
                      : 'inherit'
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      set("internalAiOrchestratorEnabled", v === 'inherit' ? null : v === 'on');
                    }}
                    onFocus={onF} onBlur={onB}
                  >
                    <option value="inherit">Inherit organisation default (Configuration → AI Behavior)</option>
                    <option value="on">Enabled for this lab</option>
                    <option value="off">Disabled for this lab</option>
                  </select>
                </Field>
                <Field label="Idle session timeout override">
                  <select
                    style={INPUT}
                    value={form.idleTimeoutMinutesOverride == null ? 'inherit' : String(form.idleTimeoutMinutesOverride)}
                    onChange={(e) => {
                      const v = e.target.value;
                      set("idleTimeoutMinutesOverride", v === 'inherit' ? null : Number(v));
                    }}
                    onFocus={onF} onBlur={onB}
                  >
                    <option value="inherit">Inherit organisation default (Configuration → System)</option>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="20">20 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </Field>
                <Field label="Code review random sampling rate">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    style={INPUT}
                    placeholder="No random sampling"
                    value={form.codeReviewSamplingRatePercent ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      set("codeReviewSamplingRatePercent", v === '' ? null : Math.max(0, Math.min(100, Number(v))));
                    }}
                    onFocus={onF} onBlur={onB}
                  />
                  <p className="ps-billing-reason-hint">
                    Real percentage of this lab's own signed-out cases randomly routed to the Code Review Pool
                    (Quality Assurance → Financials) for a billing specialist's review. Blank means no random
                    sampling. Independent of manual case flagging — a case can land in the pool either way.
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
              <div style={SECTION}>Post-Sign-Out Release Buffer</div>
              <div style={grid2}>
                <Field label="Configuration for this lab">
                  <select
                    style={INPUT}
                    value={form.releaseBufferOverride == null || form.releaseBufferOverride.inheritSystemDefault ? 'inherit' : 'override'}
                    onChange={(e) => {
                      const v = e.target.value;
                      set("releaseBufferOverride", v === 'inherit'
                        ? { inheritSystemDefault: true, enabled: true, durationMinutes: 10, bypassForStat: true }
                        : { inheritSystemDefault: false, enabled: true, durationMinutes: 10, bypassForStat: true });
                    }}
                    onFocus={onF} onBlur={onB}
                  >
                    <option value="inherit">Inherit organisation default (Configuration → System → LIS Integration)</option>
                    <option value="override">Override for this lab</option>
                  </select>
                </Field>
                {form.releaseBufferOverride && !form.releaseBufferOverride.inheritSystemDefault && (
                  <>
                    <Field label="Buffer enabled for this lab">
                      <select
                        style={INPUT}
                        value={form.releaseBufferOverride.enabled ? 'on' : 'off'}
                        onChange={(e) => set("releaseBufferOverride", { ...form.releaseBufferOverride!, enabled: e.target.value === 'on' })}
                        onFocus={onF} onBlur={onB}
                      >
                        <option value="on">Enabled</option>
                        <option value="off">Disabled — release immediately on sign-out</option>
                      </select>
                    </Field>
                    <Field label="Buffer duration (minutes)">
                      <input
                        type="number" min={1} max={30} style={INPUT}
                        value={form.releaseBufferOverride.durationMinutes}
                        disabled={!form.releaseBufferOverride.enabled}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const clamped = Number.isFinite(raw) ? Math.min(30, Math.max(1, raw)) : form.releaseBufferOverride!.durationMinutes;
                          set("releaseBufferOverride", { ...form.releaseBufferOverride!, durationMinutes: clamped });
                        }}
                        onFocus={onF} onBlur={onB}
                      />
                    </Field>
                    <Field label="Bypass buffer for STAT cases">
                      <select
                        style={INPUT}
                        value={form.releaseBufferOverride.bypassForStat ? 'on' : 'off'}
                        disabled={!form.releaseBufferOverride.enabled}
                        onChange={(e) => set("releaseBufferOverride", { ...form.releaseBufferOverride!, bypassForStat: e.target.value === 'on' })}
                        onFocus={onF} onBlur={onB}
                      >
                        <option value="on">Bypass — STAT cases release immediately</option>
                        <option value="off">No bypass — STAT cases still buffered</option>
                      </select>
                    </Field>
                  </>
                )}
              </div>

              <div style={SECTION}>AI Model Version</div>
              <Field label="Model">
                <select
                  style={INPUT}
                  value={form.internalAiModelId ?? 'inherit'}
                  onChange={(e) => {
                    const v = e.target.value;
                    set("internalAiModelId", v === 'inherit' ? null : v);
                  }}
                  onFocus={onF} onBlur={onB}
                >
                  <option value="inherit">Inherit organisation default (Configuration → AI Behavior → Models)</option>
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
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    No validated model versions available for this facility yet — a reported, passing
                    Validation Study is required before a model override can be set here.
                  </div>
                )}
                {!isEdit && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Save this facility first, then reopen it to set a model override — eligibility is
                    checked against a real facility id.
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
              <div style={SECTION}>Locations</div>
              <p className="ps-fixgate-intro" style={{ marginBottom: 12 }}>
                Wards, rooms, and beds configured for this facility. An inbound PV1 (HL7 ADT/ORM) resolves
                against this list — no match auto-creates an Unverified entry here for review, rather than
                silently accepting or dropping unvalidated data.
              </p>

              {locationsLoading && <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>}

              {!locationsLoading && locations.length === 0 && !showAddLocation && (
                <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginBottom: 12 }}>
                  No locations configured yet.
                </div>
              )}

              {!locationsLoading && locations.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {locations.map(loc => (
                    <div
                      key={loc.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                          {[loc.pointOfCare, loc.room, loc.bed].filter(Boolean).join(' / ')}
                          {loc.status === 'Unverified' && (
                            <span style={{
                              marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
                              background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
                            }}>
                              Unverified
                            </span>
                          )}
                          {loc.status === 'Inactive' && (
                            <span style={{
                              marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
                              background: 'rgba(239,68,68,0.15)', color: '#f87171',
                            }}>
                              Inactive
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {[loc.building && `Building ${loc.building}`, loc.floor && `Floor ${loc.floor}`, loc.personLocationType, loc.locationStatus]
                            .filter(Boolean).join(' · ') || '—'}
                        </div>
                        {loc.autoCreated && loc.autoCreatedNote && (
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{loc.autoCreatedNote}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {loc.status === 'Unverified' && (
                          <button
                            type="button"
                            onClick={() => handleVerifyLocation(loc.id)}
                            className="ps-conf-btn-secondary"
                            style={{ padding: '4px 10px', fontSize: 11, color: '#34d399', borderColor: 'rgba(34,197,94,0.35)' }}
                          >
                            Verify
                          </button>
                        )}
                        {loc.status !== 'Unverified' && (
                          <button
                            type="button"
                            onClick={() => handleToggleLocationActive(loc)}
                            className="ps-conf-btn-secondary"
                            style={{
                              padding: '4px 10px', fontSize: 11,
                              color: loc.status === 'Active' ? '#f87171' : '#34d399',
                              borderColor: loc.status === 'Active' ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)',
                            }}
                          >
                            {loc.status === 'Active' ? 'Deactivate' : 'Activate'}
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
                  className="ps-conf-btn-secondary"
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  + Add Location
                </button>
              ) : (
                <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={grid2}>
                    <Field label="Point of Care (Ward/Unit) *">
                      <input
                        style={INPUT}
                        value={newLocation.pointOfCare}
                        onChange={e => setNewLocation(p => ({ ...p, pointOfCare: e.target.value }))}
                        onFocus={onF} onBlur={onB}
                        placeholder="e.g. Ward 3"
                      />
                    </Field>
                    <Field label="Room">
                      <input
                        style={INPUT}
                        value={newLocation.room}
                        onChange={e => setNewLocation(p => ({ ...p, room: e.target.value }))}
                        onFocus={onF} onBlur={onB}
                        placeholder="e.g. 101"
                      />
                    </Field>
                    <Field label="Bed">
                      <input
                        style={INPUT}
                        value={newLocation.bed}
                        onChange={e => setNewLocation(p => ({ ...p, bed: e.target.value }))}
                        onFocus={onF} onBlur={onB}
                        placeholder="e.g. A"
                      />
                    </Field>
                    <Field label="Building">
                      <input
                        style={INPUT}
                        value={newLocation.building}
                        onChange={e => setNewLocation(p => ({ ...p, building: e.target.value }))}
                        onFocus={onF} onBlur={onB}
                        placeholder="e.g. Main"
                      />
                    </Field>
                    <Field label="Floor">
                      <input
                        style={INPUT}
                        value={newLocation.floor}
                        onChange={e => setNewLocation(p => ({ ...p, floor: e.target.value }))}
                        onFocus={onF} onBlur={onB}
                        placeholder="e.g. 1"
                      />
                    </Field>
                    <Field label="Location Status (HL7 Table 0306)">
                      <select
                        style={INPUT}
                        value={newLocation.locationStatus}
                        onChange={e => setNewLocation(p => ({ ...p, locationStatus: e.target.value }))}
                        onFocus={onF} onBlur={onB}
                      >
                        <option value="">— None —</option>
                        {HL7_LOCATION_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label="Person Location Type (HL7 Table 0305)" span>
                      <select
                        style={INPUT}
                        value={newLocation.personLocationType}
                        onChange={e => setNewLocation(p => ({ ...p, personLocationType: e.target.value }))}
                        onFocus={onF} onBlur={onB}
                      >
                        <option value="">— None —</option>
                        {HL7_PERSON_LOCATION_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      disabled={!newLocation.pointOfCare.trim()}
                      onClick={handleAddLocation}
                      style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: 'none',
                        background: newLocation.pointOfCare.trim() ? '#0891b2' : 'rgba(255,255,255,0.06)',
                        color: newLocation.pointOfCare.trim() ? '#0f172a' : '#64748b',
                        cursor: newLocation.pointOfCare.trim() ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Add Location
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddLocation(false); resetNewLocationForm(); }}
                      style={{ padding: '6px 14px', fontSize: 12, color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      Never mind
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>{/* end body */}

        {/* ── Footer ── */}
        <div className="ps-client-editor-footer">
          <button
            onClick={onClose}
            style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#64748b", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
          >Cancel</button>
          <button
            onClick={handleSubmit}
            style={{ padding: "9px 24px", borderRadius: "8px", border: "none", background: saved ? "#10b981" : "#0891b2", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer", transition: "background 0.2s" }}
          >
            {saved ? "Saved" : isEdit ? "Save Changes" : "Add Facility"}
          </button>
        </div>

      </div>
    </div>
  );
};
