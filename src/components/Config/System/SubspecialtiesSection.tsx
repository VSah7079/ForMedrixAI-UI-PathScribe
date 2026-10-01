import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
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

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-sub-toggle-wrap">
      <div
        onClick={() => onChange(!value)}
        className={`ps-sub-toggle-track${value ? ' ps-sub-toggle-track--on' : ' ps-sub-toggle-track--off'}`}
      >
        <div className={`ps-sub-toggle-thumb${value ? ' ps-sub-toggle-thumb--on' : ' ps-sub-toggle-thumb--off'}`} />
      </div>
      <span className={value ? 'ps-sub-toggle-label--on' : 'ps-sub-toggle-label--off'}>
        {value ? t('common.active') : t('common.inactive')}
      </span>
    </div>
  );
};

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
  const { t } = useTranslation();
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

  // Real FK match, per direct ruling ("Upgrading this to ID-based,
  // facility-scoped lookups is urgent") — replaces the old bare-name
  // match (`sp.subspecialty === sub.name`) everywhere a specimen
  // dictionary entry's subspecialty membership is checked. Falls back
  // to the legacy name match only for an entry that genuinely has no
  // subspecialtyId yet (seeded/saved before this field existed) — see
  // SpecimenDictionarySection.tsx's own EditorModal, which back-fills
  // the real id onto any such entry the moment it's next opened/saved,
  // so this fallback is a one-time migration path, not a permanent
  // second matching rule to keep in sync with the id-based one.
  const specimenBelongsToSubspecialty = (sp: (typeof specimens)[number], sub: Subspecialty): boolean =>
    sp.subspecialtyId ? sp.subspecialtyId === sub.id : sp.subspecialty === sub.name;

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
      specimens.filter(sp => specimenBelongsToSubspecialty(sp, sub)).map(sp => sp.id)
    );
    setSpecimenSearch(""); setPhysicianSearch(""); setFacilitySearch("");
    setActiveTab("specimens"); setNameError(""); setShowModal(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) { setNameError(t('subspecialtiesSection.modal.nameRequired')); return; }
    // PS-73: name uniqueness, compound-scoped by performing lab — same
    // standard pattern as every other lab-scoped dictionary
    // (ContainerTypesSection.tsx etc.). Previously enforced globally
    // instead, specifically because specimen-dictionary linking was
    // bare-name-based (a real collision risk once two same-named
    // subspecialties could exist across labs) — per direct ruling,
    // that underlying gap is now fixed (SpecimenEntry.subspecialtyId,
    // a real FK — see specimenBelongsToSubspecialty above and
    // SpecimenDictionarySection.tsx), so the same name can safely
    // exist once globally and once per lab again, matching this file's
    // own original inline reasoning ("its own General Pathology...
    // never shared with another lab's cases") that the global-only
    // rule had deliberately overridden until this fix landed.
    const nameCollision = findDuplicate(subspecialties, { performingLabFacilityId: draft.performingLabFacilityId || undefined, name: draft.name.trim() }, ['performingLabFacilityId', 'name'], editTarget?.id);
    if (nameCollision) {
      setNameError(draft.performingLabFacilityId
        ? t('subspecialtiesSection.modal.nameCollisionScoped', { name: nameCollision.name })
        : t('subspecialtiesSection.modal.nameCollisionGlobal', { name: nameCollision.name }));
      return;
    }
    const wasActive = editTarget ? editTarget.active !== false : true;

    if (modalMode === "edit" && wasActive && !draft.active) {
      const affectedSpecimens = specimens.filter(sp => specimenBelongsToSubspecialty(sp, editTarget!));
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
    let subspecialtyId = target?.id;
    if (modalMode === "add") {
      const addResult = await subspecialtyService.add({
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
      // Real id, needed below to link specimens by FK rather than
      // bare name — a brand-new subspecialty has no id until this
      // add() call returns one.
      if (addResult.ok) subspecialtyId = addResult.data.id;
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

    // Real FK write, per direct ruling — sets subspecialtyId (the
    // authoritative link) alongside subspecialty (kept as a display/
    // back-compat name cache, never read as the real link from here
    // on). currentlyBelongs uses the same id-with-legacy-name-fallback
    // check as specimenBelongsToSubspecialty above, so a legacy entry
    // linked only by name gets correctly recognized and migrated onto
    // the real id the moment its subspecialty is next touched here,
    // even if the admin didn't explicitly re-save it themselves.
    const specimenUpdates = specimens
      .map(sp => {
        const shouldBelong     = !unlinkAll && spAssignments.includes(sp.id);
        const currentlyBelongs = subspecialtyId
          ? (sp.subspecialtyId ? sp.subspecialtyId === subspecialtyId : sp.subspecialty === d.name)
          : false;
        if (shouldBelong && !currentlyBelongs)
          return { ...sp, subspecialty: d.name, subspecialtyId, updatedBy: "manual", updatedAt: new Date().toISOString(), version: sp.version + 1 };
        if (!shouldBelong && currentlyBelongs)
          return { ...sp, subspecialty: "", subspecialtyId: undefined, updatedBy: "manual", updatedAt: new Date().toISOString(), version: sp.version + 1 };
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

  const tableColumns: { label: string; align: 'left' | 'right' }[] = [
    { label: t('subspecialtiesSection.table.name'), align: 'left' },
    { label: t('subspecialtiesSection.table.status'), align: 'left' },
    { label: t('subspecialtiesSection.table.actions'), align: 'right' },
  ];

  return (
    <div className="ps-sub-shell">

      {/* ── Header ── */}
      <div className="ps-sub-header">
        <div>
          <h1 className="ps-sub-title">{t('subspecialtiesSection.title')}</h1>
          <p className="ps-sub-subtitle">{t('subspecialtiesSection.subtitle')}</p>
        </div>
        <button className="ps-sub-add-btn" onClick={openAdd}>{t('subspecialtiesSection.addBtn')}</button>
      </div>

      {/* ── Toolbar ── */}
      <div className="ps-sub-toolbar">
        <input
          type="text" placeholder={t('subspecialtiesSection.searchPlaceholder')} value={search}
          onChange={e => setSearch(e.target.value)} className="ps-sub-search"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} aria-label={t('subspecialtiesSection.filterByStatusAriaLabel')} className="ps-sub-filter">
          <option value="All">{t('subspecialtiesSection.filterAll')}</option>
          <option value="Active">{t('common.active')}</option>
          <option value="Inactive">{t('common.inactive')}</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="ps-sub-table-wrap">
        <div className="ps-sub-table-scroll">
          <table className="ps-sub-table">
            <colgroup>
              <col className="ps-sub-col-name" />
              <col className="ps-sub-col-half" /><col className="ps-sub-col-half" />
            </colgroup>
            <thead className="ps-sub-thead">
              <tr>
                {tableColumns.map(({ label, align }) => (
                  <th key={label} className={`ps-sub-th ${align === 'right' ? 'ps-sub-th--right' : 'ps-sub-th--left'}`}>{label}</th>
                ))}
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
                            {(sub as any).isWorkgroup && <span className="ps-sub-workgroup-dot" title={t('subspecialtiesSection.workgroupPoolTooltip')} />}
                            {(sub as any).isSystemManaged && (
                              <span
                                className="ps-sub-system-badge"
                                title={t('subspecialtiesSection.systemManagedTooltip')}
                              >
                                {t('subspecialtiesSection.systemBadge')}
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
                          {isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </div>
                    </td>
                    <td className="ps-sub-td ps-sub-td--right">
                      {(sub as any).isSystemManaged ? (
                        <span
                          className="ps-sub-readonly-label"
                          title={t('subspecialtiesSection.systemManagedReadonlyTooltip')}
                        >
                          {t('subspecialtiesSection.readOnlyLabel')}
                        </span>
                      ) : (
                        <button className="ps-sub-edit-btn" onClick={() => openEdit(sub)}>{t('common.edit')}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="ps-sub-tab-empty ps-sub-tab-empty--table">
                    {t('subspecialtiesSection.noneMatchFilter')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ps-sub-footer">
        <div className="ps-sub-sync-indicator">
          <span className="ps-sub-sync-dot">&#9679;</span> {t('subspecialtiesSection.systemLiveSync')}
        </div>
        <div>{t('subspecialtiesSection.countFooter', { count: subspecialties.length })}</div>
      </div>

      {/* ── Add / Edit Modal — two-pane layout matching Flag Manager ── */}
      {showModal && (
        <div className="ps-conf-backdrop">
          <div className="fm-modal ps-sub-modal--edit" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="fm-modal-header">
              <div>
                <div className="fm-eyebrow">{t('subspecialtiesSection.modal.eyebrow')}</div>
                <h2 className="fm-title ps-sub-title--sm">
                  {modalMode === "edit" ? t('subspecialtiesSection.modal.editTitle', { name: editTarget?.name }) : t('subspecialtiesSection.modal.addTitle')}
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
                    {t('subspecialtiesSection.modal.nameLabel')} <span className="ps-sub-label-req">*</span>
                  </label>
                  <input
                    className={`ps-sub-input${nameError ? ' ps-sub-input--error' : ''}`}
                    value={draft.name}
                    onChange={e => { setDraft({ ...draft, name: e.target.value }); setNameError(""); }}
                    placeholder={t('subspecialtiesSection.modal.namePlaceholder')}
                  />
                  {nameError && <span className="ps-sub-error">{nameError}</span>}
                </div>

                {/* Status */}
                <div className="ps-sub-field">
                  <label className="fm-section-label">{t('subspecialtiesSection.modal.statusLabel')}</label>
                  <Toggle value={draft.active} onChange={v => setDraft({ ...draft, active: v })} />
                  {modalMode === "edit" && editTarget?.active !== false && !draft.active && (() => {
                    const spCount   = specimens.filter(sp => specimenBelongsToSubspecialty(sp, editTarget!)).length;
                    const userCount = editTarget!.userIds.length;
                    if (spCount === 0 && userCount === 0) return null;
                    return (
                      <div className="ps-sub-warn-box">
                        &#9888;&nbsp; {t('subspecialtiesSection.modal.unlinkWarningPrefix')}&nbsp;
                        {spCount > 0 && <strong>{t('subspecialtiesSection.modal.specimenCount', { count: spCount })}</strong>}
                        {spCount > 0 && userCount > 0 && ` ${t('subspecialtiesSection.modal.andJoiner')} `}
                        {userCount > 0 && <strong>{t('subspecialtiesSection.modal.physicianCount', { count: userCount })}</strong>}.
                      </div>
                    );
                  })()}
                </div>

                {/* Assignment mode */}
                <div className="ps-sub-field">
                  <label className="fm-section-label">{t('subspecialtiesSection.modal.assignmentModeLabel')}</label>
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
                        {draft.isWorkgroup ? t('subspecialtiesSection.modal.poolWorkgroupLabel') : t('subspecialtiesSection.modal.createWorkgroupLabel')}
                      </div>
                      <div className="ps-sub-workgroup-hint">
                        {draft.isWorkgroup ? t('subspecialtiesSection.modal.sharedQueueHint') : t('subspecialtiesSection.modal.toggleOnHint')}
                      </div>
                    </div>
                    {draft.isWorkgroup && <span className="ps-sub-workgroup-badge">{t('subspecialtiesSection.modal.workgroupBadge')}</span>}
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
                    <label className="fm-section-label">{t('subspecialtiesSection.modal.performingLabLabel')}</label>
                    <select
                      className="ps-conf-select"
                      value={draft.performingLabFacilityId}
                      onChange={e => setDraft(prev => ({ ...prev, performingLabFacilityId: e.target.value }))}
                    >
                      <option value="">{t('subspecialtiesSection.modal.globalOption')}</option>
                      {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}

                {draft.isWorkgroup && (
                  <div className="ps-sub-field">
                    <label className="ps-conf-label">
                      <input type="checkbox" checked={draft.isCatchAll}
                        onChange={e => setDraft(prev => ({ ...prev, isCatchAll: e.target.checked }))} />
                      {' '}{t('subspecialtiesSection.modal.catchAllLabel', {
                        lab: draft.performingLabFacilityId
                          ? (labs.find(l => l.id === draft.performingLabFacilityId)?.name ?? t('subspecialtiesSection.modal.thisLabFallback'))
                          : t('subspecialtiesSection.modal.everyLabFallback'),
                      })}
                    </label>
                    <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                      {t('subspecialtiesSection.modal.catchAllHint')}
                    </p>
                  </div>
                )}

                {/* Description */}
                <div className="ps-sub-field">
                  <label className="fm-section-label">
                    {t('subspecialtiesSection.modal.descriptionLabel')} <span className="ps-sub-label-opt">{t('common.optional')}</span>
                  </label>
                  <input
                    className="ps-sub-input"
                    value={draft.description}
                    onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={t('subspecialtiesSection.modal.descriptionPlaceholder')}
                  />
                </div>

              </div>

              {/* ── RIGHT pane — assignments ── */}
              <div className="fm-right fm-right--config">

                {/* Tab bar */}
                <div className="ps-sub-tab-bar-underline fm-tab-bar--config">
                  {([
                    ["specimens", t('subspecialtiesSection.modal.tabSpecimens')],
                    ["physicians", t('subspecialtiesSection.modal.tabPhysicians')],
                    ["facilities", t('subspecialtiesSection.modal.tabFacilities')],
                  ] as const).map(([tab, label]) => {
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
                      placeholder={activeTab === "specimens" ? t('subspecialtiesSection.modal.searchSpecimensPlaceholder') : activeTab === "physicians" ? t('subspecialtiesSection.modal.searchPhysiciansPlaceholder') : t('subspecialtiesSection.modal.searchFacilitiesPlaceholder')}
                    />
                  </div>
                  <div className="fm-tab-list--config">

                    {activeTab === "specimens" && (
                      filteredSpecimens.length === 0
                        ? <div className="ps-sub-tab-empty">{specimenSearch ? t('subspecialtiesSection.modal.noSpecimensMatch') : t('subspecialtiesSection.modal.noSpecimensAvailable')}</div>
                        : filteredSpecimens.map(sp => {
                            // Id-aware, per direct ruling: a specimen already linked to
                            // THIS subspecialty (by id, or by legacy name for an
                            // unmigrated entry) is never "taken" from its own editor.
                            const belongsToThisOne = editTarget ? specimenBelongsToSubspecialty(sp, editTarget) : false;
                            const takenBy = sp.subspecialty && !belongsToThisOne ? sp.subspecialty : null;
                            return (
                              <CheckRow
                                key={sp.id} label={sp.name}
                                sub={takenBy ? t('subspecialtiesSection.modal.currentlyIn', { name: takenBy }) : sp.description || undefined}
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
                        ? <div className="ps-sub-tab-empty">{physicianSearch ? t('subspecialtiesSection.modal.noPhysiciansMatch') : t('subspecialtiesSection.modal.noPhysiciansAvailable')}</div>
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
                        ? <div className="ps-sub-tab-empty">{facilitySearch ? t('subspecialtiesSection.modal.noFacilitiesMatch') : t('subspecialtiesSection.modal.noFacilitiesAvailable')}</div>
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
                  ? t('subspecialtiesSection.modal.footerSummary', { specimens: specimenAssignments.length, physicians: draft.userIds.length, clients: draft.clientIds.length })
                  : t('subspecialtiesSection.modal.noAssignmentsYet')}
              </span>
              <div className="ps-sub-footer-actions">
                <button className="fm-btn-cancel" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                <button className="fm-btn-apply" onClick={handleSave}>
                  {modalMode === "edit" ? t('subspecialtiesSection.modal.saveChangesBtn') : t('common.save')}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Inactivation confirmation ── */}
      {inactiveConfirm && (
        <div className="ps-conf-backdrop">
          <div className="fm-modal ps-sub-modal--confirm-sm" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-eyebrow">{t('subspecialtiesSection.confirmActionEyebrow')}</div>
                <h2 className="fm-title fm-title--warning ps-sub-title--xs">&#9888;&nbsp; {t('subspecialtiesSection.inactivateConfirm.title')}</h2>
              </div>
            </div>
            <div className="fm-confirm-body">
              <p className="fm-confirm-text">
                {t('subspecialtiesSection.inactivateConfirm.intro', { name: inactiveConfirm.sub.name })}
              </p>
              {inactiveConfirm.affectedSpecimens.length > 0 && (
                <div className="ps-sub-confirm-header">
                  <div className="ps-sub-confirm-header-label">
                    {t('subspecialtiesSection.inactivateConfirm.specimensToUnlink')}
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
                    {t('subspecialtiesSection.inactivateConfirm.physiciansToUnassign')}
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
                    {t('subspecialtiesSection.inactivateConfirm.tatEntriesScoped')}
                    <span className="ps-sub-confirm-count">{inactiveConfirm.affectedTatCount}</span>
                  </div>
                </div>
              )}
              {inactiveConfirm.affectedRoutingRuleCount > 0 && (
                <div className="ps-sub-confirm-header">
                  <div className="ps-sub-confirm-header-label">
                    {t('subspecialtiesSection.inactivateConfirm.routingRulesTargeting')}
                    <span className="ps-sub-confirm-count">{inactiveConfirm.affectedRoutingRuleCount}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="fm-footer">
              <span />
              <div className="ps-sub-footer-actions">
                <button className="fm-btn-cancel" onClick={() => { setDraft(prev => ({ ...prev, active: true })); setInactiveConfirm(null); }}>{t('common.cancel')}</button>
                <button className="ps-sub-btn-inactivate" onClick={() => commitSave(inactiveConfirm.draft, inactiveConfirm.specimenAssignments, inactiveConfirm.sub, true)}>
                  {t('subspecialtiesSection.inactivateConfirm.inactivateAndUnlinkBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reactivation notice ── */}
      {reactivateConfirm && (
        <div className="ps-conf-backdrop">
          <div className="fm-modal ps-sub-modal--confirm-xs" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-eyebrow">{t('subspecialtiesSection.confirmActionEyebrow')}</div>
                <h2 className="fm-title fm-title--info ps-sub-title--xs">&#8635;&nbsp; {t('subspecialtiesSection.reactivateConfirm.title')}</h2>
              </div>
            </div>
            <div className="fm-confirm-body">
              <p className="fm-confirm-text">
                <strong className="ps-sub-emphasis">{reactivateConfirm.sub.name}</strong> {t('subspecialtiesSection.reactivateConfirm.willBeSetBackTo')}{' '}
                <strong className="ps-sub-emphasis--success">{t('common.active')}</strong>.
              </p>
              <p className="fm-confirm-text">
                {t('subspecialtiesSection.reactivateConfirm.notAutoRestoredNote')}
              </p>
              <div className="ps-sub-info-box">
                &#9432;&nbsp; {t('subspecialtiesSection.reactivateConfirm.gotItHint')}
              </div>
            </div>
            <div className="fm-footer">
              <span />
              <div className="ps-sub-footer-actions">
                <button className="fm-btn-cancel" onClick={() => setReactivateConfirm(null)}>{t('common.cancel')}</button>
                <button className="ps-sub-btn-reactivate" onClick={() => commitSave(reactivateConfirm.draft, reactivateConfirm.specimenAssignments, reactivateConfirm.sub, false)}>
                  {t('subspecialtiesSection.reactivateConfirm.gotItReactivateBtn')}
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
