// src/components/Config/Staff/RoleDictionary.tsx
// Two-panel layout: category groups left, permissions/facilities/cheat-sheet right

import React, { useState, useEffect, useMemo } from 'react';
import '../../../pathscribe.css';
import {
  ACTION_GROUPS, DEFAULT_ROLE_PERMISSIONS,
  ActionId, PermissionSet,
} from '../../../constants/systemActions';
import { mockActionRegistryService } from '../../../services/actionRegistry/mockActionRegistryService';
import { mockParticipationTypeService } from '../../../services/participationTypes/mockParticipationTypeService';
import type { ParticipationTypeRecord } from '../../../services/participationTypes/IParticipationTypeService';
import { roleService, auditService, facilityService } from '../../../services';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  caseAccess: boolean;
  canViewPediatric: boolean;
  configAccess: boolean;
  permissions: PermissionSet;
  builtIn: boolean;
  facilityIds?: string[];
  participationTypeIds: string[];
}

const DEFAULT_PARTICIPATION: Record<string, string[]> = {
  pathologist: ['primary', 'consultant', 'second_opinion', 'frozen_section'],
  resident:    ['grossing', 'preliminary_report', 'observer'],
  admin:       [],
  physician:   [],
};

export const DEFAULT_ROLES: Role[] = [
  { id: 'pathologist', name: 'Pathologist', description: 'Licensed pathologist with full clinical case access and sign-out authority.',   color: '#8AB4F8', caseAccess: true,  configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Pathologist'], canViewPediatric: false, builtIn: true, participationTypeIds: DEFAULT_PARTICIPATION['pathologist'] },
  { id: 'resident',    name: 'Resident',    description: 'Pathology resident with case access and co-sign capability.',                    color: '#81C995', caseAccess: true,  configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Resident'],    canViewPediatric: false, builtIn: true, participationTypeIds: DEFAULT_PARTICIPATION['resident']    },
  { id: 'admin',       name: 'Admin',       description: 'System administrator with configuration access but no clinical case access.',    color: '#FDD663', caseAccess: false, configAccess: true,  permissions: DEFAULT_ROLE_PERMISSIONS['Admin'],        canViewPediatric: false, builtIn: true, participationTypeIds: []                                    },
  { id: 'physician',   name: 'Physician',   description: 'External ordering physician. Directory only — no app access.',                   color: '#C084FC', caseAccess: false, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Physician'],    canViewPediatric: false, builtIn: true, participationTypeIds: []                                    },
];

// Real fix: this used to be a hardcoded, fictional list of 5 facilities
// (client_hosp_001..004, client_lab_001) completely disconnected from
// PathScribe's real, live facility roster (services/clients/). A real,
// meaningful bug: this tab exists to restrict which real hospital
// facilities a role can access - with a fake list, an admin could never
// actually restrict a role to a genuinely real client, and the
// facilityId stored would match nothing real in the live system. See
// the real, live fetch below (facilities state + effect).

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TriState = 'all' | 'some' | 'none';

function groupTriState(groupIds: ActionId[], permissions: PermissionSet): TriState {
  const granted = groupIds.filter(id => permissions[id]).length;
  if (granted === 0) return 'none';
  if (granted === groupIds.length) return 'all';
  return 'some';
}

// ─── TriCheckbox ──────────────────────────────────────────────────────────────

const TriCheckbox: React.FC<{ state: TriState; onClick: (e: React.MouseEvent) => void; size?: number }> = ({ state, onClick, size = 16 }) => (
  <div
    onClick={onClick}
    className={`ps-rd-cb ps-rd-tri-${state}`}
    style={{ width: size, height: size }}
  >
    {state === 'all'  && <span className="ps-rd-tri-check" style={{ fontSize: size * 0.6 }}>✓</span>}
    {state === 'some' && <span className="ps-rd-tri-dash"  style={{ fontSize: size * 0.75 }}>—</span>}
  </div>
);

// ─── DivCheckbox (div-based custom checkbox for interactive lists) ─────────────

const DivCheckbox: React.FC<{ checked: boolean; size?: number; variant?: 'blue' | 'green' }> = ({ checked, size = 18, variant = 'blue' }) => (
  <div
    className={`ps-rd-cb ${checked ? (variant === 'green' ? 'ps-rd-cb--on-green' : 'ps-rd-cb--on-blue') : 'ps-rd-cb--off'}`}
    style={{ width: size, height: size }}
  >
    {checked && <span className="ps-rd-tri-check" style={{ fontSize: size * 0.55 }}>✓</span>}
  </div>
);

// ─── RoleModal ────────────────────────────────────────────────────────────────

const RoleModal: React.FC<{
  mode: 'add' | 'edit';
  role?: Role;
  onSave: (draft: Omit<Role, 'id'>) => void;
  onClose: () => void;
}> = ({ mode, role, onSave, onClose }) => {
  const [draft, setDraft] = useState<Omit<Role, 'id'>>({
    name:                 role?.name ?? '',
    description:          role?.description ?? '',
    color:                role?.color ?? '#8AB4F8',
    caseAccess:           role?.caseAccess ?? false,
    canViewPediatric:     (role as any)?.canViewPediatric ?? false,
    configAccess:         role?.configAccess ?? false,
    permissions:          role?.permissions ?? {},
    builtIn:              role?.builtIn ?? false,
    facilityIds:          role?.facilityIds ?? [],
    participationTypeIds: role?.participationTypeIds ?? [],
  });

  const [activeTab,       setActiveTab]       = useState<'permissions' | 'facilities' | 'participation' | 'cheatsheet'>('permissions');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ACTION_GROUPS[0].id);
  const [search,          setSearch]          = useState('');
  const [cheatSearch,     setCheatSearch]     = useState('');
  // July 2026: was loadParticipationTypes() from ParticipationTypesSection's
  // own separate, disconnected local list -- now the real service, the
  // same one CaseTeamModal actually uses.
  const [participationTypes, setParticipationTypes] = useState<ParticipationTypeRecord[]>([]);
  useEffect(() => {
    mockParticipationTypeService.getActive().then(res => { if (res.ok) setParticipationTypes(res.data); });
  }, []);

  // Real fix: same "disconnected local list" bug pattern already fixed
  // for participationTypes above, found in the same component - the
  // real, live client roster, not a hardcoded, fictional one.
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    facilityService.getAll().then(res => { if (res.ok) setFacilities(res.data); });
  }, []);

  const allFacilities  = !draft.facilityIds || draft.facilityIds.length === 0;
  const selectedGroup  = ACTION_GROUPS.find(g => g.id === selectedGroupId) ?? ACTION_GROUPS[0];
  const groupIds       = selectedGroup.actions.map(a => a.id);
  const groupState     = groupTriState(groupIds, draft.permissions);
  const permCount      = Object.values(draft.permissions).filter(Boolean).length;
  const totalActions   = ACTION_GROUPS.reduce((n, g) => n + g.actions.length, 0);

  const filteredActions = search
    ? selectedGroup.actions.filter(a =>
        a.label.toLowerCase().includes(search.toLowerCase()) ||
        (a.description ?? '').toLowerCase().includes(search.toLowerCase()))
    : selectedGroup.actions;

  // Real, per direct follow-up ("Make the cheat sheet also show real
  // voice triggers/shortcuts from mockActionRegistryService" / "should
  // focus on worklist and synoptic report page commands"): this used
  // to source purely from ACTION_GROUPS — a completely separate
  // catalog from mockActionRegistryService's own real, live voice/
  // keyboard dispatch data (confirmed directly: different id scheme,
  // no voiceTriggers field at all on ACTION_GROUPS items, and only a
  // small fraction of ACTION_GROUPS entries even have a matching real
  // voice action). Now sources the list itself from the real, live
  // getActions(), scoped to WORKLIST + SYNOPTIC — every shortcut/
  // voice trigger shown here is the actual, current data, not a
  // separate catalog that had already drifted apart from it.
  //
  // internalKey is the real, confirmed bridge back to this role's own
  // permissions (ACTION_MAP/INTERNAL_KEY_MAP in systemActions.ts are
  // built from ACTION_GROUPS on this exact field) — used below only
  // to show a real "✓ Granted" badge where a genuine mapping exists;
  // confirmed directly that most real WORKLIST/SYNOPTIC actions have
  // no such mapping, so nothing is invented (no default true/false)
  // where one doesn't.
  const cheatActions = useMemo(() => {
    const permissionIdByInternalKey: Partial<Record<string, ActionId>> = {};
    ACTION_GROUPS.forEach(g => g.actions.forEach(a => {
      permissionIdByInternalKey[a.internalKey] = a.id;
    }));

    const all = mockActionRegistryService.getActions()
      .filter(a => a.category === 'WORKLIST' || a.category === 'SYNOPTIC')
      .map(a => ({
        ...a,
        groupTitle: a.category === 'WORKLIST' ? 'Worklist' : 'Synoptic Report',
        permissionId: permissionIdByInternalKey[a.internalKey],
      }));

    if (!cheatSearch) return all;
    const q = cheatSearch.toLowerCase();
    return all.filter(a =>
      a.label.toLowerCase().includes(q) ||
      a.groupTitle.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      a.shortcut.toLowerCase().includes(q) ||
      a.voiceTriggers.some(t => t.toLowerCase().includes(q))
    );
  }, [cheatSearch]);

  const toggleGroupAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = groupState !== 'all';
    const next = { ...draft.permissions };
    groupIds.forEach(id => { next[id] = newVal; });
    setDraft(d => ({ ...d, permissions: next }));
  };

  const toggleAction = (id: ActionId) =>
    setDraft(d => ({ ...d, permissions: { ...d.permissions, [id]: !d.permissions[id] } }));

  const toggleFacility = (facilityId: string) => {
    const current = draft.facilityIds ?? [];
    const next = current.includes(facilityId)
      ? current.filter(c => c !== facilityId)
      : [...current, facilityId];
    setDraft(d => ({ ...d, facilityIds: next }));
  };

  const TABS = [
    { id: 'permissions',   label: `Permissions (${permCount})` },
    { id: 'facilities',    label: `Facility Access (${allFacilities ? 'All' : (draft.facilityIds?.length ?? 0)})` },
    { id: 'participation', label: `Case Participation (${draft.participationTypeIds?.length ?? 0})` },
    { id: 'cheatsheet',    label: 'Action Reference' },
  ] as const;

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="fm-modal fm-modal--config" style={{ width: 'min(1080px, 96vw)', minHeight: 600, maxHeight: '90vh' }}>

        {/* Header */}
        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">Configuration · Role Dictionary</div>
            <div className="ps-rd-modal-name-row">
              <input
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="Role name"
                className="ps-conf-input ps-rd-modal-name-input"
              />
              <input
                type="color"
                value={draft.color}
                onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                className="ps-rd-color-picker"
                title="Badge colour"
              />
              <span className="ps-rd-role-badge" style={{ background: draft.color + '22', color: draft.color, border: `1px solid ${draft.color}44` }}>
                {draft.name || 'Preview'}
              </span>
              <span className="ps-rd-perm-badge">{permCount} / {totalActions} actions granted</span>
            </div>
          </div>
          <button onClick={onClose} className="ps-rd-close-btn">×</button>
        </div>

        {/* Description + access toggles */}
        <div className="ps-rd-desc-row">
          <input
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="Role description"
            className="ps-conf-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <label className="ps-rd-access-label">
            <input type="checkbox" checked={draft.caseAccess}
              onChange={e => setDraft(d => ({ ...d, caseAccess: e.target.checked }))}
              className="ps-rd-checkbox" />
            <span>Case Access</span>
          </label>
          <label className="ps-rd-access-label">
            <input type="checkbox" checked={draft.configAccess}
              onChange={e => setDraft(d => ({ ...d, configAccess: e.target.checked }))}
              className="ps-rd-checkbox" />
            <span>Config Access</span>
          </label>
          <label className="ps-rd-access-label">
            <input type="checkbox" checked={(draft as any).canViewPediatric ?? false}
              onChange={e => setDraft(d => ({ ...d, canViewPediatric: e.target.checked } as any))}
              className="ps-rd-checkbox ps-rd-checkbox--peds" />
            <span>Pediatric Access</span>
          </label>
        </div>

        {/* Tabs */}
        <div className="ps-rd-tabs">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`ps-rd-tab ${activeTab === tab.id ? 'ps-rd-tab--active' : 'ps-rd-tab--inactive'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="ps-rd-body">

          {/* ── PERMISSIONS TAB ── */}
          {activeTab === 'permissions' && (
            <>
              {/* Left — category list */}
              <div className="ps-rd-cat-panel">
                {ACTION_GROUPS.map(g => {
                  const gIds    = g.actions.map(a => a.id);
                  const granted = gIds.filter(id => draft.permissions[id]).length;
                  const isActive = g.id === selectedGroupId;
                  const ts      = groupTriState(gIds, draft.permissions);
                  return (
                    <div key={g.id} onClick={() => setSelectedGroupId(g.id)}
                      className={`ps-rd-cat-item ${isActive ? 'ps-rd-cat-item--active' : 'ps-rd-cat-item--inactive'}`}>
                      <span className={`ps-rd-cat-label ${isActive ? 'ps-rd-cat-label--active' : 'ps-rd-cat-label--inactive'}`}>
                        {g.title}
                      </span>
                      <span className={`ps-rd-cat-count ps-rd-cat-count--${ts}`}>
                        {granted}/{gIds.length}
                      </span>
                      <div className="ps-rd-cat-bar-bg">
                        <div className={`ps-rd-cat-bar-fill ps-rd-cat-bar-fill--${ts === 'none' ? 'some' : ts}`}
                          style={{ width: `${Math.round(granted / gIds.length * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right — action list */}
              <div className="ps-rd-action-panel">
                <div className="ps-rd-action-header">
                  <TriCheckbox state={groupState} onClick={toggleGroupAll} size={18} />
                  <span className="ps-rd-action-group-title">{selectedGroup.title}</span>
                  <span className="ps-rd-action-granted-count">
                    {groupIds.filter(id => draft.permissions[id]).length} / {groupIds.length} granted
                  </span>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Filter actions…"
                    className="ps-conf-input ps-rd-action-search" />
                </div>
                <div className="ps-rd-action-list">
                  {filteredActions.map(action => {
                    const granted = !!draft.permissions[action.id];
                    return (
                      <div key={action.id} onClick={() => toggleAction(action.id)}
                        className={`ps-rd-action-item ${granted ? 'ps-rd-action-item--granted' : 'ps-rd-action-item--default'}`}>
                        <DivCheckbox checked={granted} size={18} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="ps-rd-action-label-row">
                            <span className={`ps-rd-action-label ${granted ? 'ps-rd-action-label--granted' : 'ps-rd-action-label--default'}`}>
                              {action.label}
                            </span>
                            {action.prebuilt    && <span className="ps-rd-tag-future">future</span>}
                            {action.shortcutable && <span className="ps-rd-tag-shortcut">shortcutable</span>}
                          </div>
                          {action.description && <div className="ps-rd-action-desc">{action.description}</div>}
                        </div>
                      </div>
                    );
                  })}
                  {filteredActions.length === 0 && (
                    <div className="ps-rd-no-match">No actions match "{search}"</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── CLIENT ACCESS TAB ── */}
          {activeTab === 'facilities' && (
            <div className="ps-rd-clients-tab">
              <p className="ps-rd-clients-intro">
                Control which hospital facilities this role can access. Set to <strong>All Facilities</strong> for enterprise-wide access, or restrict to specific hospitals for multi-site deployments.
              </p>
              <div onClick={() => setDraft(d => ({ ...d, facilityIds: allFacilities ? (facilities[0] ? [facilities[0].id] : []) : [] }))}
                className={`ps-rd-all-clients-row ${allFacilities ? 'ps-rd-all-clients-row--on' : 'ps-rd-all-clients-row--off'}`}>
                <DivCheckbox checked={allFacilities} size={20} variant="green" />
                <div>
                  <div className={`ps-rd-all-clients-label ${allFacilities ? 'ps-rd-all-clients-label--on' : 'ps-rd-all-clients-label--off'}`}>All Facilities</div>
                  <div className="ps-rd-all-clients-sub">This role has access to cases and data from all hospital facilities</div>
                </div>
              </div>
              {!allFacilities && (
                <div>
                  <div className="ps-rd-clients-section-label">Select Specific Facilities</div>
                  {facilities.map(facility => {
                    const selected = (draft.facilityIds ?? []).includes(facility.id);
                    return (
                      <div key={facility.id} onClick={() => toggleFacility(facility.id)}
                        className={`ps-rd-client-item ${selected ? 'ps-rd-client-item--on' : 'ps-rd-client-item--off'}`}>
                        <DivCheckbox checked={selected} size={18} />
                        <div>
                          <div className={`ps-rd-client-name ${selected ? 'ps-rd-client-name--on' : 'ps-rd-client-name--off'}`}>{facility.name}</div>
                          <div className="ps-rd-client-id">{facility.id}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!allFacilities && (draft.facilityIds ?? []).length === 0 && (
                <div className="ps-rd-no-clients-warn">
                  ⚠ No facilities selected — this role will have no data access. Select at least one facility or switch to All Facilities.
                </div>
              )}
            </div>
          )}

          {/* ── CASE PARTICIPATION TAB ── */}
          {activeTab === 'participation' && (() => {
            const allTypes   = participationTypes;
            const selectedIds = draft.participationTypeIds ?? [];
            const toggle = (id: string) => setDraft(d => ({
              ...d,
              participationTypeIds: selectedIds.includes(id)
                ? selectedIds.filter(x => x !== id)
                : [...selectedIds, id],
            }));
            return (
              <div className="ps-rd-part-tab">
                <p className="ps-rd-part-intro">
                  Select which participation types staff with this role can serve as on a case.
                  Participation types are defined in <strong>System → Participation Types</strong>.
                </p>
                {!draft.caseAccess && (
                  <div className="ps-rd-part-warn">
                    ⚠ This role has no Case Access — participation types will have no effect until Case Access is enabled.
                  </div>
                )}
                {allTypes.length === 0 ? (
                  <div className="ps-rd-part-empty">
                    No active participation types defined yet.<br />
                    <span style={{ color: '#6b7280' }}>Go to System → Participation Types to add some.</span>
                  </div>
                ) : (
                  <div className="ps-rd-part-list">
                    {allTypes.map(t => {
                      const selected = selectedIds.includes(t.id);
                      return (
                        <div key={t.id} onClick={() => toggle(t.id)}
                          className={`ps-rd-part-item ${selected ? 'ps-rd-part-item--on' : 'ps-rd-part-item--off'}`}>
                          <DivCheckbox checked={selected} size={18} />
                          <div style={{ paddingTop: 1 }}>
                            <span className="ps-rd-role-badge" style={{ fontSize: 11, padding: '2px 10px', background: t.color + '22', color: t.color, border: `1px solid ${t.color}44`, whiteSpace: 'nowrap' }}>
                              {t.abbreviation}
                            </span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className={`ps-rd-part-name ${selected ? 'ps-rd-part-name--on' : 'ps-rd-part-name--off'}`}>{t.label}</div>
                            {t.description && <div className="ps-rd-part-desc">{t.description}</div>}
                            <div className="ps-rd-part-attrs">
                              {[
                                { label: 'Can Finalise',       value: t.canFinalize,           onColor: '#22c55e' },
                                { label: 'Countersign Req.',   value: t.requiresCountersign,   onColor: '#f59e0b' },
                                { label: 'Template Assign.',   value: t.canBeAssignedTemplate, onColor: '#8AB4F8' },
                                { label: 'Full Case View',     value: t.canViewWholeCase,      onColor: '#8AB4F8' },
                              ].map(attr => (
                                <span key={attr.label} className="ps-rd-part-attr" style={{
                                  background: attr.value ? attr.onColor + '18' : 'rgba(255,255,255,0.04)',
                                  color:      attr.value ? attr.onColor : '#4b5563',
                                  border:     `1px solid ${attr.value ? attr.onColor + '33' : 'rgba(255,255,255,0.06)'}`,
                                }}>
                                  {attr.value ? '✓' : '—'} {attr.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="ps-rd-part-count">
                  {selectedIds.length} of {allTypes.length} participation types selected for this role
                </div>
              </div>
            );
          })()}

          {/* ── CHEAT SHEET TAB ── */}
          {activeTab === 'cheatsheet' && (
            <div className="ps-rd-cheat-tab">
              <div className="ps-rd-cheat-header">
                <input autoFocus value={cheatSearch} onChange={e => setCheatSearch(e.target.value)}
                  placeholder="Search by name, ID, shortcut, or voice phrase…"
                  className="ps-conf-input" />
                <div className="ps-rd-cheat-count">
                  {cheatActions.length} of {mockActionRegistryService.getActions().filter(a => a.category === 'WORKLIST' || a.category === 'SYNOPTIC').length} worklist/synoptic actions shown
                </div>
              </div>
              <div className="ps-rd-cheat-list">
                {cheatActions.map(action => {
                  // Real, per direct follow-up: undefined here means this
                  // real voice/keyboard action has no matching entry in
                  // ACTION_GROUPS at all (confirmed the common case for
                  // this scope) — kept distinct from a real, mapped
                  // false, so the UI never invents a grant status this
                  // role dictionary doesn't actually track.
                  const granted = action.permissionId ? !!draft.permissions[action.permissionId] : undefined;
                  return (
                    <div key={action.id} className={`ps-rd-cheat-item ${granted ? 'ps-rd-cheat-item--granted' : 'ps-rd-cheat-item--default'}`}>
                      <div className="ps-rd-cheat-label-row">
                        <span className="ps-rd-cheat-group-tag">{action.groupTitle}</span>
                        <span className={`ps-rd-cheat-label ${granted ? 'ps-rd-cheat-label--granted' : 'ps-rd-cheat-label--default'}`}>
                          {action.label}
                        </span>
                        {granted === true  && <span className="ps-rd-tag-granted">✓ Granted</span>}
                        {granted === undefined && (
                          <span
                            title="No matching permission entry exists for this action — this role dictionary's permission grid doesn't track it."
                            style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.35)', borderRadius: '4px', padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                          >
                            No permission mapping
                          </span>
                        )}
                        {!action.isActive && (
                          <span
                            title="Registered but deliberately not voice/keyboard-eligible — see this action's own comment in mockActionRegistryService.ts."
                            style={{ fontSize: '9px', fontWeight: 'bold', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '4px', padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                          >
                            Disabled
                          </span>
                        )}
                        <span className="ps-rd-tag-shortcut">{action.requiredRole}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <code style={{ background: 'var(--ps-conf-surface)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#38bdf8' }}>{action.shortcut || '—'}</code>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {action.voiceTriggers.map(t => (
                            <span key={t} style={{ background: 'rgba(8, 145, 178, 0.15)', color: '#22d3ee', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', border: '1px solid rgba(34, 211, 238, 0.2)' }}>{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="ps-rd-cheat-id">{action.id} · {action.internalKey}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="fm-footer">
          <span className="ps-rd-footer-meta">
            {permCount} permissions · {allFacilities ? 'All facilities' : `${(draft.facilityIds ?? []).length} facility(s)`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="fm-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="fm-btn-apply" style={{ opacity: !draft.name.trim() ? 0.5 : 1 }} onClick={() => { if (!draft.name.trim()) return; onSave(draft); }}>
              {mode === 'add' ? 'Add Role' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main RoleDictionary ──────────────────────────────────────────────────────

const RoleDictionary: React.FC<{ onRolesChange?: (roles: Role[]) => void }> = ({ onRolesChange }) => {
  const [roles,   setRoles]   = useState<Role[]>(DEFAULT_ROLES);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState<{ mode: 'add' | 'edit'; role?: Role } | null>(null);

  useEffect(() => {
    roleService.getAll().then(res => {
      if (res.ok) {
        const mapped = res.data.map(r => ({
          ...r,
          canViewPediatric:     (r as any).canViewPediatric ?? false,
          participationTypeIds: r.participationTypeIds ?? [],
        })) as Role[];
        setRoles(mapped); onRolesChange?.(mapped);
      } else { onRolesChange?.(DEFAULT_ROLES); }
      setLoading(false);
    });
  }, []);

  const filtered = roles.filter(r =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase())
  );

  const totalActions = ACTION_GROUPS.reduce((n, g) => n + g.actions.length, 0);
  const permCount    = (r: Role) => Object.values(r.permissions).filter(Boolean).length;

  const handleSave = async (draft: Omit<Role, 'id'>) => {
    if (modal?.mode === 'add') {
      // canViewOrchestration defaults to false here too — same
      // documented "must be explicitly granted by an administrator"
      // intent as the seed roles; the create form doesn't collect
      // this yet.
      const res = await roleService.add({ ...draft, builtIn: false, canViewOrchestration: false });
      if (res.ok) {
        const next = [...roles, res.data as Role];
        setRoles(next); onRolesChange?.(next);
      }
    } else if (modal?.role) {
      const res = await roleService.update(modal.role.id, draft);
      if (res.ok) {
        const next = roles.map(r => r.id === res.data.id ? res.data as unknown as Role : r);
        setRoles(next); onRolesChange?.(next);
        const prevPed = (modal.role as any)?.canViewPediatric ?? false;
        const newPed  = (draft as any)?.canViewPediatric ?? false;
        if (prevPed !== newPed) {
          auditService.logEvent({
            type: 'system',
            event: newPed ? 'Pediatric Access Granted' : 'Pediatric Access Revoked',
            detail: `Pediatric Access ${newPed ? 'enabled' : 'disabled'} on role "${draft.name}" by administrator.`,
            user: 'System Admin', caseId: null, confidence: null,
          }).catch(() => {});
        }
      }
    }
    setModal(null);
  };

  // Real, per direct guidance: reuses the exact same 'add' flow/modal
  // as a genuinely new role, pre-filled with the source role's full
  // configuration (permissions, facility access, case participation,
  // color) — same "duplicate, then review before saving" pattern
  // already established for Container Types/Physicians/Case Routing
  // rules elsewhere in this app, rather than an instant, unreviewed
  // clone. builtIn is deliberately forced false regardless of the
  // source's own value — duplicating Pathologist/Resident/Admin/
  // Physician must always produce a genuine custom role, never a
  // second role silently claiming built-in status.
  const handleDuplicate = (role: Role) => {
    setModal({ mode: 'add', role: { ...role, name: `${role.name} (Copy)`, builtIn: false } });
  };

  if (loading) return <div className="ps-rd-loading">Loading roles…</div>;

  return (
    <div className="ps-rd-root">
      <div className="ps-rd-header">
        <div>
          <h2 className="ps-rd-title">Role Dictionary</h2>
          <p className="ps-rd-subtitle">Define roles, permissions, and facility access scopes.</p>
        </div>
        <button className="ps-section-add-btn" onClick={() => setModal({ mode: 'add' })}>+ Add Role</button>
      </div>

      <input type="text" placeholder="Search roles…" value={search}
        onChange={e => setSearch(e.target.value)} className="ps-rd-search" />

      <div className="ps-rd-table-wrap">
        <table className="ps-rd-table">
          <thead className="ps-rd-thead">
            <tr>
              {['Role', 'Description', 'Case Access', 'Config Access', 'Pediatric Access', 'Facilities', 'Permissions', ''].map(h => (
                <th key={h} className="ps-rd-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(role => {
              const allFacilities = !role.facilityIds || role.facilityIds.length === 0;
              const pct        = Math.round(permCount(role) / totalActions * 100);
              return (
                <tr key={role.id} className="ps-rd-tr">
                  <td className="ps-rd-td">
                    <div className="ps-rd-role-cell">
                      <span className="ps-rd-role-badge" style={{ background: role.color + '22', color: role.color, border: '1px solid ' + role.color + '44' }}>
                        {role.name}
                      </span>
                      {role.builtIn && <span className="ps-rd-builtin">built-in</span>}
                    </div>
                  </td>
                  <td className="ps-rd-td ps-rd-td--desc">
                    <span className="ps-rd-desc-clamp">{role.description}</span>
                  </td>
                  <td className="ps-rd-td">
                    <span className={`ps-rd-access ${role.caseAccess ? 'ps-rd-access--yes' : 'ps-rd-access--no'}`}>
                      {role.caseAccess ? '✓ Yes' : '— No'}
                    </span>
                  </td>
                  <td className="ps-rd-td">
                    <span className={`ps-rd-access ${role.configAccess ? 'ps-rd-access--yes' : 'ps-rd-access--no'}`}>
                      {role.configAccess ? '✓ Yes' : '— No'}
                    </span>
                  </td>
                  <td className="ps-rd-td">
                    <span className={`ps-rd-access ${(role as any).canViewPediatric ? 'ps-rd-access--peds-yes' : 'ps-rd-access--no'}`}>
                      {(role as any).canViewPediatric ? '✓ Yes' : '— No'}
                    </span>
                  </td>
                  <td className="ps-rd-td">
                    <span className={`ps-rd-clients ${allFacilities ? 'ps-rd-clients--all' : 'ps-rd-clients--some'}`}>
                      {allFacilities ? '🌐 All' : `${role.facilityIds?.length} facility${(role.facilityIds?.length ?? 0) !== 1 ? '(s)' : ''}`}
                    </span>
                  </td>
                  <td className="ps-rd-td">
                    <div className="ps-rd-perm-wrap">
                      <div className="ps-rd-perm-bar-bg">
                        <div className="ps-rd-perm-bar-fill" style={{ width: `${pct}%`, background: role.color }} />
                      </div>
                      <span className="ps-rd-perm-count">{permCount(role)}/{totalActions}</span>
                    </div>
                  </td>
                  <td className="ps-rd-td">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ps-rd-edit-btn" onClick={() => setModal({ mode: 'edit', role })}>Edit</button>
                      <button className="ps-rd-edit-btn" onClick={() => handleDuplicate(role)}>Duplicate</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && <RoleModal mode={modal.mode} role={modal.role} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default RoleDictionary;
