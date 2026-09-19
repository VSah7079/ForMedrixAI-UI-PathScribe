import React, { useState, useCallback, useEffect } from "react";
import '../../../pathscribe.css';
import { subspecialtyService, Subspecialty } from "../../../services";
import { useSpecimenDictionary } from "./useSpecimenDictionary";
import { userService } from "../../../services";
import { checkSubspecialtyReferences } from "../../../services/referenceCheck/referenceCheckService";
import { StaffUser } from "../Staff/StaffTab";
import { mockFacilityService } from "../../../services/facilities/mockFacilityService";
import { getActivePerformingLabs } from "../../../utils/performingLabs";
import type { Facility } from "../../../services/facilities/IFacilityService";
import { findDuplicate } from "../../../utils/validateUnique";

// ── Badge colours ─────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, { borderColor: string; color: string; background: string }> = {
  gi:              { borderColor: "#4A8F5A", color: "#7EC89A", background: "#0d2318" },
  dermatology:     { borderColor: "#B8863C", color: "#E0B96A", background: "#2a1e08" },
  breast:          { borderColor: "#4A9EBF", color: "#7FC8E8", background: "#0d2a36" },
  gynecologic:     { borderColor: "#8A6FA8", color: "#C4ABDF", background: "#1e1530" },
  gu:              { borderColor: "#5A6FA8", color: "#9AABDF", background: "#141c30" },
  hematopathology: { borderColor: "#7A9A4A", color: "#AECB78", background: "#1a220d" },
  general:         { borderColor: "#444",    color: "#888",    background: "#1a1a1a"  },
};
const getBadge = (name: string) => BADGE_STYLES[name.toLowerCase()] ?? BADGE_STYLES.general;

// ── Avatar ────────────────────────────────────────────────────────────────────

const Avatar = ({ name }: { name: string }) => {
  const words    = name.trim().split(" ");
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return <div className="ps-avatar">{initials}</div>;
};

// ── Toggle ────────────────────────────────────────────────────────────────────

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <div className="ps-sub-toggle-wrap">
    <div
      onClick={() => onChange(!value)}
      className={`ps-sub-toggle-track${value ? ' ps-sub-toggle-track--on' : ' ps-sub-toggle-track--off'}`}
    >
      <div className={`ps-sub-toggle-thumb${value ? ' ps-sub-toggle-thumb--on' : ' ps-sub-toggle-thumb--off'}`} />
    </div>
    <span className={value ? 'ps-sub-toggle-label--on' : 'ps-sub-toggle-label--off'}>
      {value ? 'Active' : 'Inactive'}
    </span>
  </div>
);

// ── Search input ──────────────────────────────────────────────────────────────

const SearchInput = ({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) => (
  <div className="ps-sub-search-wrap">
    <span className="ps-sub-search-icon">&#128269;</span>
    <input
      type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} className="ps-sub-search-input"
    />
    {value && (
      <span className="ps-sub-search-clear" onClick={() => onChange("")}>&#10005;</span>
    )}
  </div>
);

// ── Check row ─────────────────────────────────────────────────────────────────

const CheckRow = ({ label, sub, checked, onChange }: {
  label: string; sub?: string; checked: boolean; onChange: () => void;
}) => (
  <div
    onClick={onChange}
    className={`ps-sub-check-row${checked ? ' ps-sub-check-row--checked' : ' ps-sub-check-row--unchecked'}`}
  >
    <div className={`ps-sub-check-box${checked ? ' ps-sub-check-box--checked' : ' ps-sub-check-box--unchecked'}`}>
      {checked && <span className="ps-sub-check-tick">&#10003;</span>}
    </div>
    <div>
      <div className="ps-sub-check-label">{label}</div>
      {sub && <div className="ps-sub-check-sub">{sub}</div>}
    </div>
  </div>
);

// ── Impact row ────────────────────────────────────────────────────────────────

const ImpactRow = ({ name, sub }: { name: string; sub?: string }) => (
  <div className="ps-sub-impact-row">
    <span className="ps-sub-impact-dot" />
    {name}
    {sub && <span className="ps-sub-impact-sub">({sub})</span>}
  </div>
);

// ── Types ─────────────────────────────────────────────────────────────────────

type Draft = {
  name: string; active: boolean; userIds: string[];
  description: string; isWorkgroup: boolean; clientIds: string[];
  // '' = Global (every performing lab), same convention as
  // ContainerType/DelegationType's own performingLabFacilityId.
  performingLabFacilityId: string;
  // Per FEAT-ROUT-01: at most one catch-all pool per lab (and at
  // most one Global) — enforced on save, not just left to the admin.
  isCatchAll: boolean;
};

const emptyDraft: Draft = {
  name: "", active: true, userIds: [],
  description: "", isWorkgroup: false, clientIds: [],
  performingLabFacilityId: "", isCatchAll: false,
};

type InactiveConfirm = {
  sub: Subspecialty; draft: Draft; specimenAssignments: string[];
  affectedSpecimens: { id: string; name: string }[];
  affectedUsers: { id: string; name: string; role: string }[];
  /** Real edges verified this session — the existing check above only ever
   *  looked at specimens/users, missing two confirmed dependents. */
  affectedTatCount: number;
  affectedRoutingRuleCount: number;
};

type ReactivateConfirm = {
  sub: Subspecialty; draft: Draft; specimenAssignments: string[];
};

// ── Main component ────────────────────────────────────────────────────────────

const SubspecialtiesSection: React.FC = () => {
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const { dictionary: specimens, updateEntries } = useSpecimenDictionary();
  const [users,   setUsers]   = useState<StaffUser[]>([]);
  const [allFacilities, setAllFacilities] = useState<Facility[]>([]);
  const [labs,    setLabs]    = useState<Facility[]>([]);

  const loadSubspecialties = useCallback(() => {
    subspecialtyService.getAll().then(res => { if (res.ok) setSubspecialties(res.data); });
  }, []);

  useEffect(() => {
    loadSubspecialties();
    userService.getAll().then(res => { if (res.ok) setUsers(res.data); });
    mockFacilityService.getAll().then(res => { if (res.ok) setAllFacilities(res.data); });
    getActivePerformingLabs().then(setLabs);
  }, [loadSubspecialties]);

  const [search,              setSearch]              = useState("");
  const [statusFilter,        setStatusFilter]        = useState<"All"|"Active"|"Inactive">("All");
  const [showModal,           setShowModal]           = useState(false);
  const [modalMode,           setModalMode]           = useState<"add"|"edit">("add");
  const [editTarget,          setEditTarget]          = useState<Subspecialty | null>(null);
  const [draft,               setDraft]               = useState<Draft>(emptyDraft);
  const [activeTab,           setActiveTab]           = useState<"specimens"|"physicians"|"facilities">("specimens");
  const [specimenAssignments, setSpecimenAssignments] = useState<string[]>([]);
  const [specimenSearch,      setSpecimenSearch]      = useState("");
  const [physicianSearch,     setPhysicianSearch]     = useState("");
  const [facilitySearch,      setFacilitySearch]      = useState("");
  const [inactiveConfirm,     setInactiveConfirm]     = useState<InactiveConfirm | null>(null);
  const [nameError,           setNameError]           = useState("");
  const [reactivateConfirm,   setReactivateConfirm]   = useState<ReactivateConfirm | null>(null);

  const filtered = subspecialties.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All"
      || (statusFilter === "Active" ? s.active !== false : s.active === false);
    return matchSearch && matchStatus;
  });

  const openAdd = () => {
    setModalMode("add"); setEditTarget(null); setDraft(emptyDraft);
    setSpecimenAssignments([]); setSpecimenSearch(""); setPhysicianSearch("");
    setFacilitySearch(""); setActiveTab("specimens"); setNameError(""); setShowModal(true);
  };

  const openEdit = (sub: Subspecialty) => {
    setModalMode("edit"); setEditTarget(sub);
    setDraft({
      name: sub.name, active: sub.active !== false,
      userIds: [...sub.userIds],
      description: sub.description || "",
      isWorkgroup: sub.isWorkgroup  || false,
      clientIds:   sub.clientIds    || [],
      performingLabFacilityId: sub.performingLabFacilityId ?? "",
      isCatchAll: sub.isCatchAll ?? false,
    });
    setSpecimenAssignments(
      specimens.filter(sp => sp.subspecialty === sub.name).map(sp => sp.id)
    );
    setSpecimenSearch(""); setPhysicianSearch(""); setFacilitySearch("");
    setActiveTab("specimens"); setNameError(""); setShowModal(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) { setNameError("Name is required"); return; }
    // PS-73: name uniqueness — deliberately GLOBAL, not scoped by
    // performing lab like this same field's own PS-75 scoping (above,
    // in commitSave's catch-all logic) might suggest. Confirmed
    // directly: a Specimen links to its subspecialty by bare name
    // string (`sp.subspecialty === sub.name`, see the specimenUpdates
    // logic below and openEdit's specimenAssignments lookup) — never
    // by id, and never lab-aware. Two subspecialty records legitimately
    // sharing a name across two different labs would make that lookup
    // ambiguous (a specimen tagged "General Pathology" could silently
    // resolve to whichever same-named record happens to match first),
    // so this is enforced globally regardless of performingLabFacilityId
    // until specimen-linking itself is made lab-aware or id-based. Worth
    // Pete's attention as a separate, deeper finding, not just a
    // one-off scope call.
    const nameCollision = findDuplicate(subspecialties, { name: draft.name.trim() }, ['name'], editTarget?.id);
    if (nameCollision) { setNameError(`A subspecialty named "${nameCollision.name}" already exists.`); return; }
    const wasActive = editTarget ? editTarget.active !== false : true;

    if (modalMode === "edit" && wasActive && !draft.active) {
      const affectedSpecimens = specimens.filter(sp => sp.subspecialty === editTarget!.name);
      const affectedUsers     = users.filter(u => editTarget!.userIds.includes(u.id));
      const refCheck = await checkSubspecialtyReferences(editTarget!.id);
      const affectedTatCount = refCheck.sources.find(s => s.label === 'TAT Configuration entries')?.count ?? 0;
      const affectedRoutingRuleCount = refCheck.sources.find(s => s.label === 'Routing Rules')?.count ?? 0;
      if (affectedSpecimens.length > 0 || affectedUsers.length > 0 || affectedTatCount > 0 || affectedRoutingRuleCount > 0) {
        setInactiveConfirm({
          sub: editTarget!, draft, specimenAssignments,
          affectedSpecimens: affectedSpecimens.map(sp => ({ id: sp.id, name: sp.name })),
          affectedUsers: affectedUsers.map((u: any) => ({
            id: u.id, name: u.name ?? u.id, role: u.role ?? (u.roles?.[0] ?? ''),
          })),
          affectedTatCount, affectedRoutingRuleCount,
        });
        return;
      }
    }

    if (modalMode === "edit" && !wasActive && draft.active) {
      setReactivateConfirm({ sub: editTarget!, draft, specimenAssignments });
      return;
    }

    commitSave(draft, specimenAssignments, editTarget, false);
  };

  const commitSave = async (
    d: Draft, spAssignments: string[],
    target: Subspecialty | null, unlinkAll: boolean,
  ) => {
    // Real, per FEAT-ROUT-01: at most one catch-all pool per lab scope
    // (and at most one Global) — clear the flag on whichever pool
    // previously held it in this same scope before it moves here,
    // rather than leaving two pools both silently claiming to be the
    // fallback for the same lab.
    if (d.isCatchAll) {
      const previousHolder = subspecialties.find(s =>
        s.isCatchAll && s.id !== target?.id && (s.performingLabFacilityId ?? "") === (d.performingLabFacilityId || "")
      );
      if (previousHolder) await subspecialtyService.update(previousHolder.id, { isCatchAll: false });
    }
    if (modalMode === "add") {
      await subspecialtyService.add({
        name: d.name, active: d.active, userIds: d.userIds, specimenIds: [],
        // Real fix, per direct product decision: in the field, an admin
        // building a workgroup (adding real members to a real pool) is
        // already declaring who belongs — there's no real scenario
        // where they'd want a pool with a defined member list that
        // still lets anyone claim from it regardless. isWorkgroupEnabled
        // now mirrors isWorkgroup directly rather than being hardcoded
        // off — which, before this fix, meant membership enforcement
        // could never actually be turned on through this UI at all,
        // since no control for it existed here separately.
        clientIds: d.clientIds, isWorkgroup: d.isWorkgroup, isWorkgroupEnabled: d.isWorkgroup,
        description: d.description, status: d.active ? 'Active' : 'Inactive',
        // '' from the Global option in the dropdown means no real lab
        // was chosen — stored as undefined, same "absent, not empty
        // string" convention as ContainerType/DelegationType.
        performingLabFacilityId: d.performingLabFacilityId || undefined,
        isCatchAll: d.isWorkgroup ? d.isCatchAll : false,
      });
    } else {
      await subspecialtyService.update(target!.id, {
        name: d.name, active: d.active, userIds: unlinkAll ? [] : d.userIds,
        // Same real fix as the add path above — previously omitted
        // entirely here, meaning an existing pool's enforcement could
        // never be changed by editing isWorkgroup after creation either.
        clientIds: d.clientIds, isWorkgroup: d.isWorkgroup, isWorkgroupEnabled: d.isWorkgroup,
        description: d.description, status: d.active ? 'Active' : 'Inactive',
        performingLabFacilityId: d.performingLabFacilityId || undefined,
        isCatchAll: d.isWorkgroup ? d.isCatchAll : false,
      });
    }
    loadSubspecialties();

    const specimenUpdates = specimens
      .map(sp => {
        const shouldBelong     = !unlinkAll && spAssignments.includes(sp.id);
        const currentlyBelongs = sp.subspecialty === d.name;
        if (shouldBelong && !currentlyBelongs)
          return { ...sp, subspecialty: d.name, updatedBy: "manual", updatedAt: new Date().toISOString(), version: sp.version + 1 };
        if (!shouldBelong && currentlyBelongs)
          return { ...sp, subspecialty: "", updatedBy: "manual", updatedAt: new Date().toISOString(), version: sp.version + 1 };
        return null;
      })
      .filter((sp): sp is NonNullable<typeof sp> => sp !== null);
    if (specimenUpdates.length) updateEntries(specimenUpdates);

    setShowModal(false); setInactiveConfirm(null); setReactivateConfirm(null);
  };

  const filteredSpecimens  = specimens.filter(sp =>
    sp.name?.trim() && (!specimenSearch || sp.name.toLowerCase().includes(specimenSearch.toLowerCase()))
  );
  const filteredPhysicians = users
    .filter(u => u.roles?.includes("Pathologist") || u.roles?.includes("Resident"))
    .filter(u => !physicianSearch || `${u.firstName} ${u.lastName}`.toLowerCase().includes(physicianSearch.toLowerCase()));
  const filteredFacilities = allFacilities
    .filter(c => c.status === 'Active')
    .filter(c => !facilitySearch || c.name.toLowerCase().includes(facilitySearch.toLowerCase()));

  return (
    <div className="ps-sub-shell">

      {/* ── Header ── */}
      <div className="ps-sub-header">
        <div>
          <h1 className="ps-sub-title">Subspecialties</h1>
          <p className="ps-sub-subtitle">Manage pathology subspecialties, specimen groups, and physician assignments.</p>
        </div>
        <button className="ps-sub-add-btn" onClick={openAdd}>+ Add Subspecialty</button>
      </div>

      {/* ── Toolbar ── */}
      <div className="ps-sub-toolbar">
        <input
          type="text" placeholder="Search subspecialties..." value={search}
          onChange={e => setSearch(e.target.value)} className="ps-sub-search"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} aria-label="Filter by status" className="ps-sub-filter">
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="ps-sub-table-wrap">
        <div className="ps-sub-table-scroll">
          <table className="ps-sub-table">
            <colgroup>
              <col style={{ width: "50%" }} />
              <col style={{ width: "25%" }} /><col style={{ width: "25%" }} />
            </colgroup>
            <thead className="ps-sub-thead">
              <tr>
                {[["Subspecialty Name","left"],["Status","left"],["Actions","right"]].map(
                  ([label, align]) => (
                    <th key={label} className="ps-sub-th" style={{ textAlign: align as any }}>{label}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(sub => {
                // badge computed but never rendered in this row — BADGE_STYLES
                // exists and getBadge() resolves a real style per subspecialty,
                // but nothing in the row markup below actually displays it.
                // Flagged rather than silently deleted or guess-placed.
                const _badge   = getBadge(sub.name);
                void _badge; // underscore alone doesn't suppress noUnusedLocals for a local const
                const isActive = sub.active !== false;
                return (
                  <tr key={sub.id} className="ps-sub-row">
                    <td className="ps-sub-td">
                      <div className="ps-sub-name-cell">
                        <Avatar name={sub.name} />
                        <div className="ps-sub-name-text-wrap">
                          <div className="ps-sub-name-row">
                            <span className="ps-sub-name">{sub.name}</span>
                            {(sub as any).isWorkgroup && <span className="ps-sub-workgroup-dot" title="Workgroup / Pool" />}
                            {(sub as any).isSystemManaged && (
                              <span
                                className="ps-sub-system-badge"
                                title="Managed automatically by the system's own case-routing logic — not editable here"
                              >
                                SYSTEM
                              </span>
                            )}
                          </div>
                          {(sub as any).description && (
                            <div className="ps-sub-desc" title={(sub as any).description}>{(sub as any).description}</div>
                          )}
                          {sub.isWorkgroup && sub.performingLabFacilityId && (
                            <div className="ps-sub-desc">
                              {labs.find(l => l.id === sub.performingLabFacilityId)?.name ?? sub.performingLabFacilityId}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="ps-sub-td">
                      <div className="ps-sub-status-cell">
                        <span className={`ps-sub-status-dot${isActive ? ' ps-sub-status-dot--active' : ' ps-sub-status-dot--inactive'}`} />
                        <span className={isActive ? 'ps-sub-status-label--active' : 'ps-sub-status-label--inactive'}>
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>
                    <td className="ps-sub-td" style={{ textAlign: "right" }}>
                      {(sub as any).isSystemManaged ? (
                        <span
                          className="ps-sub-readonly-label"
                          title="This pool is created and maintained automatically — there's nothing here for an admin to configure"
                        >
                          Read-only
                        </span>
                      ) : (
                        <button className="ps-sub-edit-btn" onClick={() => openEdit(sub)}>Edit</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="ps-sub-tab-empty" style={{ padding: "32px 20px" }}>
                    No subspecialties match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ps-sub-footer">
        <div className="ps-sub-sync-indicator">
          <span className="ps-sub-sync-dot">&#9679;</span> System Live Sync
        </div>
        <div>{subspecialties.length} subspecialties</div>
      </div>

      {/* ── Add / Edit Modal — two-pane layout matching Flag Manager ── */}
      {showModal && (
        <div className="ps-conf-backdrop">
          <div className="fm-modal" style={{ width: 'min(900px, 96vw)', height: 600 }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="fm-modal-header">
              <div>
                <div className="fm-eyebrow">Configuration · Subspecialties</div>
                <h2 className="fm-title" style={{ fontSize: 17 }}>
                  {modalMode === "edit" ? `Edit \u2014 ${editTarget?.name}` : "Add Subspecialty"}
                </h2>
              </div>
              <button className="fm-btn-cancel" onClick={() => setShowModal(false)}>&#10005;</button>
            </div>

            {/* Two-pane body */}
            <div className="fm-body">

              {/* ── LEFT pane — metadata ── */}
              <div className="fm-left fm-left--config">

                {/* Name */}
                <div className="ps-sub-field">
                  <label className="fm-section-label">
                    Name <span className="ps-sub-label-req">*</span>
                  </label>
                  <input
                    className={`ps-sub-input${nameError ? ' ps-sub-input--error' : ''}`}
                    value={draft.name}
                    onChange={e => { setDraft({ ...draft, name: e.target.value }); setNameError(""); }}
                    placeholder="e.g. Breast, GI, Neuropathology..."
                  />
                  {nameError && <span className="ps-sub-error">{nameError}</span>}
                </div>

                {/* Status */}
                <div className="ps-sub-field">
                  <label className="fm-section-label">Status</label>
                  <Toggle value={draft.active} onChange={v => setDraft({ ...draft, active: v })} />
                  {modalMode === "edit" && editTarget?.active !== false && !draft.active && (() => {
                    const spCount   = specimens.filter(sp => sp.subspecialty === editTarget!.name).length;
                    const userCount = editTarget!.userIds.length;
                    if (spCount === 0 && userCount === 0) return null;
                    return (
                      <div className="ps-sub-warn-box">
                        &#9888;&nbsp; Saving will unlink&nbsp;
                        {spCount > 0 && <strong>{spCount} specimen{spCount !== 1 ? "s" : ""}</strong>}
                        {spCount > 0 && userCount > 0 && " and "}
                        {userCount > 0 && <strong>{userCount} physician{userCount !== 1 ? "s" : ""}</strong>}.
                      </div>
                    );
                  })()}
                </div>

                {/* Assignment mode */}
                <div className="ps-sub-field">
                  <label className="fm-section-label">Assignment Mode</label>
                  <div
                    onClick={() => setDraft(prev => ({ ...prev, isWorkgroup: !prev.isWorkgroup }))}
                    className={`ps-sub-workgroup-toggle${draft.isWorkgroup ? ' ps-sub-workgroup-toggle--on' : ' ps-sub-workgroup-toggle--off'}`}
                  >
                    <div
                      className={`ps-sub-toggle-track${draft.isWorkgroup ? ' ps-sub-toggle-track--on' : ' ps-sub-toggle-track--off'}`}
                    >
                      <div className={`ps-sub-toggle-thumb${draft.isWorkgroup ? ' ps-sub-toggle-thumb--on' : ' ps-sub-toggle-thumb--off'}`} />
                    </div>
                    <div>
                      <div className={draft.isWorkgroup ? 'ps-sub-workgroup-label--on' : 'ps-sub-workgroup-label--off'}>
                        {draft.isWorkgroup ? "Pool / Workgroup" : "Create Workgroup"}
                      </div>
                      <div className="ps-sub-workgroup-hint">
                        {draft.isWorkgroup ? "Cases go to a shared queue" : "Toggle on to enable shared pool mode"}
                      </div>
                    </div>
                    {draft.isWorkgroup && <span className="ps-sub-workgroup-badge">WORKGROUP</span>}
                  </div>
                </div>

                {/* Performing Lab — only meaningful for a real pool.
                    Global (no lab set) is available to every
                    performing lab's cases; scoping to one lab gives
                    that lab its own separate pool of the same name
                    (e.g. its own "General Pathology"), never shared
                    with another lab's cases. */}
                {draft.isWorkgroup && (
                  <div className="ps-sub-field">
                    <label className="fm-section-label">Performing Lab</label>
                    <select
                      className="ps-conf-select"
                      value={draft.performingLabFacilityId}
                      onChange={e => setDraft(prev => ({ ...prev, performingLabFacilityId: e.target.value }))}
                    >
                      <option value="">— Global (every performing lab) —</option>
                      {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}

                {draft.isWorkgroup && (
                  <div className="ps-sub-field">
                    <label className="ps-conf-label">
                      <input type="checkbox" checked={draft.isCatchAll}
                        onChange={e => setDraft(prev => ({ ...prev, isCatchAll: e.target.checked }))} />
                      {' '}Default / Catch-All Pool for {draft.performingLabFacilityId ? labs.find(l => l.id === draft.performingLabFacilityId)?.name ?? 'this lab' : 'every lab with no override'}
                    </label>
                    <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                      Unmapped specimens for this scope fall through here. Turning this on moves the flag off whichever pool currently holds it for the same scope.
                    </p>
                  </div>
                )}

                {/* Description */}
                <div className="ps-sub-field">
                  <label className="fm-section-label">
                    Description <span className="ps-sub-label-opt">(optional)</span>
                  </label>
                  <input
                    className="ps-sub-input"
                    value={draft.description}
                    onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Administrative notes..."
                  />
                </div>

              </div>

              {/* ── RIGHT pane — assignments ── */}
              <div className="fm-right fm-right--config">

                {/* Tab bar */}
                <div className="ps-sub-tab-bar-underline fm-tab-bar--config">
                  {([ ["specimens", "Specimens"], ["physicians", "Physicians"], ["facilities", "Facilities"] ] as const).map(([tab, label]) => {
                    const count = tab === "specimens" ? specimenAssignments.length
                      : tab === "physicians" ? draft.userIds.length
                      : draft.clientIds.length;
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`ps-sub-tab-btn-underline${activeTab === tab ? ' active' : ''}`}
                      >
                        {label}
                        <span className={`ps-sub-tab-count-underline${count > 0 ? ' ps-sub-tab-count-underline--has' : ' ps-sub-tab-count-underline--empty'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab content — scrollable list */}
                <div className="fm-tab-content--config">
                  <div className="fm-tab-search--config">
                    <SearchInput
                      value={activeTab === "specimens" ? specimenSearch : activeTab === "physicians" ? physicianSearch : facilitySearch}
                      onChange={activeTab === "specimens" ? setSpecimenSearch : activeTab === "physicians" ? setPhysicianSearch : setFacilitySearch}
                      placeholder={activeTab === "specimens" ? "Search specimens..." : activeTab === "physicians" ? "Search physicians..." : "Search facilities..."}
                    />
                  </div>
                  <div className="fm-tab-list--config">

                    {activeTab === "specimens" && (
                      filteredSpecimens.length === 0
                        ? <div className="ps-sub-tab-empty">{specimenSearch ? "No specimens match." : "No specimens available."}</div>
                        : filteredSpecimens.map(sp => {
                            const takenBy = sp.subspecialty && sp.subspecialty !== editTarget?.name ? sp.subspecialty : null;
                            return (
                              <CheckRow
                                key={sp.id} label={sp.name}
                                sub={takenBy ? `Currently in: ${takenBy}` : sp.description || undefined}
                                checked={specimenAssignments.includes(sp.id)}
                                onChange={() => setSpecimenAssignments(prev =>
                                  prev.includes(sp.id) ? prev.filter(x => x !== sp.id) : [...prev, sp.id]
                                )}
                              />
                            );
                          })
                    )}

                    {activeTab === "physicians" && (
                      filteredPhysicians.length === 0
                        ? <div className="ps-sub-tab-empty">{physicianSearch ? "No physicians match." : "No physicians available."}</div>
                        : filteredPhysicians.map(u => (
                            <CheckRow
                              key={u.id}
                              label={`${u.firstName} ${u.lastName}`}
                              sub={u.roles?.join(", ")}
                              checked={draft.userIds.includes(u.id)}
                              onChange={() => setDraft(prev => ({
                                ...prev,
                                userIds: prev.userIds.includes(u.id)
                                  ? prev.userIds.filter(x => x !== u.id)
                                  : [...prev.userIds, u.id],
                              }))}
                            />
                          ))
                    )}

                    {activeTab === "facilities" && (
                      filteredFacilities.length === 0
                        ? <div className="ps-sub-tab-empty">{facilitySearch ? "No facilities match." : "No facilities available."}</div>
                        : filteredFacilities.map(c => (
                            <CheckRow
                              key={c.id} label={c.name} sub={c.assigningAuthority}
                              checked={draft.clientIds.includes(c.id)}
                              onChange={() => setDraft(prev => ({
                                ...prev,
                                clientIds: prev.clientIds.includes(c.id)
                                  ? prev.clientIds.filter(x => x !== c.id)
                                  : [...prev.clientIds, c.id],
                              }))}
                            />
                          ))
                    )}

                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="fm-footer">
              <span className="fm-footer-status">
                {specimenAssignments.length > 0 || draft.userIds.length > 0
                  ? `${specimenAssignments.length} specimens · ${draft.userIds.length} physicians · ${draft.clientIds.length} clients assigned`
                  : 'No assignments yet'}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="fm-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="fm-btn-apply" onClick={handleSave}>
                  {modalMode === "edit" ? "Save Changes" : "Save"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Inactivation confirmation ── */}
      {inactiveConfirm && (
        <div className="ps-conf-backdrop">
          <div className="fm-modal" style={{ width: 'min(500px, 96vw)' }} onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-eyebrow">Confirm Action</div>
                <h2 className="fm-title fm-title--warning" style={{ fontSize: 16 }}>&#9888;&nbsp; Confirm Inactivation</h2>
              </div>
            </div>
            <div className="fm-confirm-body">
              <p className="fm-confirm-text">
                Inactivating <strong style={{ color: "#f9fafb" }}>{inactiveConfirm.sub.name}</strong> will
                unlink the following entries. They will need to be manually reassigned if reactivated.
              </p>
              {inactiveConfirm.affectedSpecimens.length > 0 && (
                <div className="ps-sub-confirm-header">
                  <div className="ps-sub-confirm-header-label">
                    Specimens to unlink
                    <span className="ps-sub-confirm-count">{inactiveConfirm.affectedSpecimens.length}</span>
                  </div>
                  <div className="ps-sub-confirm-list">
                    {inactiveConfirm.affectedSpecimens.map(sp => <ImpactRow key={sp.id} name={sp.name} />)}
                  </div>
                </div>
              )}
              {inactiveConfirm.affectedUsers.length > 0 && (
                <div className="ps-sub-confirm-header">
                  <div className="ps-sub-confirm-header-label">
                    Physicians to unassign
                    <span className="ps-sub-confirm-count">{inactiveConfirm.affectedUsers.length}</span>
                  </div>
                  <div className="ps-sub-confirm-list">
                    {inactiveConfirm.affectedUsers.map(u => <ImpactRow key={u.id} name={u.name} sub={u.role} />)}
                  </div>
                </div>
              )}
              {inactiveConfirm.affectedTatCount > 0 && (
                <div className="ps-sub-confirm-header">
                  <div className="ps-sub-confirm-header-label">
                    TAT Configuration entries still scoped to this subspecialty
                    <span className="ps-sub-confirm-count">{inactiveConfirm.affectedTatCount}</span>
                  </div>
                </div>
              )}
              {inactiveConfirm.affectedRoutingRuleCount > 0 && (
                <div className="ps-sub-confirm-header">
                  <div className="ps-sub-confirm-header-label">
                    Routing Rules still targeting this subspecialty's pool
                    <span className="ps-sub-confirm-count">{inactiveConfirm.affectedRoutingRuleCount}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="fm-footer">
              <span />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="fm-btn-cancel" onClick={() => { setDraft(prev => ({ ...prev, active: true })); setInactiveConfirm(null); }}>Cancel</button>
                <button className="ps-sub-btn-inactivate" onClick={() => commitSave(inactiveConfirm.draft, inactiveConfirm.specimenAssignments, inactiveConfirm.sub, true)}>
                  Inactivate &amp; Unlink
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reactivation notice ── */}
      {reactivateConfirm && (
        <div className="ps-conf-backdrop">
          <div className="fm-modal" style={{ width: 'min(460px, 96vw)' }} onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-eyebrow">Confirm Action</div>
                <h2 className="fm-title fm-title--info" style={{ fontSize: 16 }}>&#8635;&nbsp; Reactivating Subspecialty</h2>
              </div>
            </div>
            <div className="fm-confirm-body">
              <p className="fm-confirm-text">
                <strong style={{ color: "#f9fafb" }}>{reactivateConfirm.sub.name}</strong> will be set
                back to <strong style={{ color: "#22c55e" }}>Active</strong>.
              </p>
              <p className="fm-confirm-text">
                Specimens and physicians unlinked during inactivation will not be automatically restored.
                Use the Edit modal after reactivation to reassign them.
              </p>
              <div className="ps-sub-info-box">
                &#9432;&nbsp; After clicking <em>Got it</em>, open Edit to reassign specimens and physicians.
              </div>
            </div>
            <div className="fm-footer">
              <span />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="fm-btn-cancel" onClick={() => setReactivateConfirm(null)}>Cancel</button>
                <button className="ps-sub-btn-reactivate" onClick={() => commitSave(reactivateConfirm.draft, reactivateConfirm.specimenAssignments, reactivateConfirm.sub, false)}>
                  Got it &mdash; Reactivate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SubspecialtiesSection;
