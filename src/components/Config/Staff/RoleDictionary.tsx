// src/components/Config/Staff/RoleDictionary.tsx
// Two-panel layout: category groups left, permissions/facilities/cheat-sheet right

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import {
  ACTION_GROUPS, DEFAULT_ROLE_PERMISSIONS,
  ActionId, PermissionSet,
} from '../../../constants/systemActions';
import { mockActionRegistryService } from '../../../services/actionRegistry/mockActionRegistryService';
import { mockParticipationTypeService } from '../../../services/participationTypes/mockParticipationTypeService';
import type { ParticipationTypeRecord } from '../../../services/participationTypes/IParticipationTypeService';
import { roleService, auditService, facilityService } from '../../../services';

// i18n note (batch 118): DEFAULT_ROLES' own name/description strings
// are persisted seed data (written to roleService on first load, same
// as protocolShared.tsx's PROTOCOL_REGISTRY), and ACTION_GROUPS'
// title/label/description fields (and everything sourced from
// mockActionRegistryService — action label/description/shortcut/
// voiceTriggers/internalKey/id/requiredRole) are configured/catalog
// data imported from outside this file, not chrome authored here —
// both stay untranslated, same posture as VOICE_PROFILES in batch 117.
// Audit log `event`/`detail` strings passed to auditService.logEvent
// are persisted audit-trail text and stay English by established
// convention. Role/participation-type names, descriptions, colors and
// facility names are all likewise persisted/configured data.
// `action.groupTitle` (Worklist / Synoptic Report) is kept as an
// English internal string for the cheat-sheet's own search matching,
// same as protocolGroup()'s comparison-key precedent — translation
// happens only at the display site via CHEAT_GROUP_LABEL_KEY below.
const CHEAT_GROUP_LABEL_KEY: Record<'WORKLIST' | 'SYNOPTIC', string> = {
  WORKLIST: 'roleDictionary.cheatsheet.groupWorklist',
  SYNOPTIC: 'roleDictionary.cheatsheet.groupSynoptic',
};

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
  const { t } = useTranslation();
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
      a.voiceTriggers.some(vt => vt.toLowerCase().includes(q))
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
    { id: 'permissions',   label: t('roleDictionary.tabs.permissions', { count: permCount }) },
    { id: 'facilities',    label: t('roleDictionary.tabs.facilityAccess', { value: allFacilities ? t('roleDictionary.tabs.allFacilitiesValue') : (draft.facilityIds?.length ?? 0) }) },
    { id: 'participation', label: t('roleDictionary.tabs.caseParticipation', { count: draft.participationTypeIds?.length ?? 0 }) },
    { id: 'cheatsheet',    label: t('roleDictionary.tabs.actionReference') },
  ] as const;

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="fm-modal fm-modal--config ps-rd-modal-size">

        {/* Header */}
        <div className="fm-modal-header">
          <div>
            <div className="fm-eyebrow">{t('roleDictionary.modal.eyebrow')}</div>
            <div className="ps-rd-modal-name-row">
              <input
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder={t('roleDictionary.modal.roleNamePlaceholder')}
                className="ps-conf-input ps-rd-modal-name-input"
              />
              <input
                type="color"
                value={draft.color}
                onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                className="ps-rd-color-picker"
                title={t('roleDictionary.modal.badgeColorTitle')}
              />
              <span className="ps-rd-role-badge" style={{ background: draft.color + '22', color: draft.color, border: `1px solid ${draft.color}44` }}>
                {draft.name || t('roleDictionary.modal.previewFallback')}
              </span>
              <span className="ps-rd-perm-badge">{t('roleDictionary.modal.actionsGranted', { granted: permCount, total: totalActions })}</span>
            </div>
          </div>
          <button onClick={onClose} className="ps-rd-close-btn">×</button>
        </div>

        {/* Description + access toggles */}
        <div className="ps-rd-desc-row">
          <input
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder={t('roleDictionary.modal.roleDescriptionPlaceholder')}
            className="ps-conf-input ps-rd-desc-input"
          />
          <label className="ps-rd-access-label">
            <input type="checkbox" checked={draft.caseAccess}
              onChange={e => setDraft(d => ({ ...d, caseAccess: e.target.checked }))}
              className="ps-rd-checkbox" />
            <span>{t('roleDictionary.modal.caseAccess')}</span>
          </label>
          <label className="ps-rd-access-label">
            <input type="checkbox" checked={draft.configAccess}
              onChange={e => setDraft(d => ({ ...d, configAccess: e.target.checked }))}
              className="ps-rd-checkbox" />
            <span>{t('roleDictionary.modal.configAccess')}</span>
          </label>
          <label className="ps-rd-access-label">
            <input type="checkbox" checked={(draft as any).canViewPediatric ?? false}
              onChange={e => setDraft(d => ({ ...d, canViewPediatric: e.target.checked } as any))}
              className="ps-rd-checkbox ps-rd-checkbox--peds" />
            <span>{t('roleDictionary.modal.pediatricAccess')}</span>
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
                    {t('roleDictionary.permissions.grantedCount', { granted: groupIds.filter(id => draft.permissions[id]).length, total: groupIds.length })}
                  </span>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={t('roleDictionary.permissions.filterPlaceholder')}
                    className="ps-conf-input ps-rd-action-search" />
                </div>
                <div className="ps-rd-action-list">
                  {filteredActions.map(action => {
                    const granted = !!draft.permissions[action.id];
                    return (
                      <div key={action.id} onClick={() => toggleAction(action.id)}
                        className={`ps-rd-action-item ${granted ? 'ps-rd-action-item--granted' : 'ps-rd-action-item--default'}`}>
                        <DivCheckbox checked={granted} size={18} />
                        <div className="ps-rd-flex-1-minw0">
                          <div className="ps-rd-action-label-row">
                            <span className={`ps-rd-action-label ${granted ? 'ps-rd-action-label--granted' : 'ps-rd-action-label--default'}`}>
                              {action.label}
                            </span>
                            {action.prebuilt    && <span className="ps-rd-tag-future">{t('roleDictionary.permissions.futureTag')}</span>}
                            {action.shortcutable && <span className="ps-rd-tag-shortcut">{t('roleDictionary.permissions.shortcutableTag')}</span>}
                          </div>
                          {action.description && <div className="ps-rd-action-desc">{action.description}</div>}
                        </div>
                      </div>
                    );
                  })}
                  {filteredActions.length === 0 && (
                    <div className="ps-rd-no-match">{t('roleDictionary.permissions.noActionsMatch', { search })}</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── CLIENT ACCESS TAB ── */}
          {activeTab === 'facilities' && (
            <div className="ps-rd-clients-tab">
              <p className="ps-rd-clients-intro">
                <Trans i18nKey="roleDictionary.facilities.intro" components={{ strong: <strong /> }} />
              </p>
              <div onClick={() => setDraft(d => ({ ...d, facilityIds: allFacilities ? (facilities[0] ? [facilities[0].id] : []) : [] }))}
                className={`ps-rd-all-clients-row ${allFacilities ? 'ps-rd-all-clients-row--on' : 'ps-rd-all-clients-row--off'}`}>
                <DivCheckbox checked={allFacilities} size={20} variant="green" />
                <div>
                  <div className={`ps-rd-all-clients-label ${allFacilities ? 'ps-rd-all-clients-label--on' : 'ps-rd-all-clients-label--off'}`}>{t('roleDictionary.facilities.allFacilities')}</div>
                  <div className="ps-rd-all-clients-sub">{t('roleDictionary.facilities.allFacilitiesSub')}</div>
                </div>
              </div>
              {!allFacilities && (
                <div>
                  <div className="ps-rd-clients-section-label">{t('roleDictionary.facilities.selectSpecific')}</div>
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
                  ⚠ {t('roleDictionary.facilities.noneSelectedWarn')}
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
                  <Trans i18nKey="roleDictionary.participation.intro" components={{ strong: <strong /> }} />
                </p>
                {!draft.caseAccess && (
                  <div className="ps-rd-part-warn">
                    ⚠ {t('roleDictionary.participation.noCaseAccessWarn')}
                  </div>
                )}
                {allTypes.length === 0 ? (
                  <div className="ps-rd-part-empty">
                    {t('roleDictionary.participation.noneDefinedYet')}<br />
                    <span className="ps-rd-part-empty-hint">{t('roleDictionary.participation.goToSystemHint')}</span>
                  </div>
                ) : (
                  <div className="ps-rd-part-list">
                    {allTypes.map(pt => {
                      const selected = selectedIds.includes(pt.id);
                      const attrs = [
                        { label: t('roleDictionary.participation.attr.canFinalize'),       value: pt.canFinalize,           onColor: '#22c55e' },
                        { label: t('roleDictionary.participation.attr.countersignReq'),     value: pt.requiresCountersign,   onColor: '#f59e0b' },
                        { label: t('roleDictionary.participation.attr.templateAssign'),     value: pt.canBeAssignedTemplate, onColor: '#8AB4F8' },
                        { label: t('roleDictionary.participation.attr.fullCaseView'),       value: pt.canViewWholeCase,      onColor: '#8AB4F8' },
                      ];
                      return (
                        <div key={pt.id} onClick={() => toggle(pt.id)}
                          className={`ps-rd-part-item ${selected ? 'ps-rd-part-item--on' : 'ps-rd-part-item--off'}`}>
                          <DivCheckbox checked={selected} size={18} />
                          <div className="ps-rd-part-abbr-pad">
                            <span className="ps-rd-role-badge ps-rd-part-abbr-badge" style={{ background: pt.color + '22', color: pt.color, border: `1px solid ${pt.color}44` }}>
                              {pt.abbreviation}
                            </span>
                          </div>
                          <div className="ps-rd-flex-1-minw0">
                            <div className={`ps-rd-part-name ${selected ? 'ps-rd-part-name--on' : 'ps-rd-part-name--off'}`}>{pt.label}</div>
                            {pt.description && <div className="ps-rd-part-desc">{pt.description}</div>}
                            <div className="ps-rd-part-attrs">
                              {attrs.map(attr => (
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
                  {t('roleDictionary.participation.selectedCount', { selected: selectedIds.length, total: allTypes.length })}
                </div>
              </div>
            );
          })()}

          {/* ── CHEAT SHEET TAB ── */}
          {activeTab === 'cheatsheet' && (
            <div className="ps-rd-cheat-tab">
              <div className="ps-rd-cheat-header">
                <input autoFocus value={cheatSearch} onChange={e => setCheatSearch(e.target.value)}
                  placeholder={t('roleDictionary.cheatsheet.searchPlaceholder')}
                  className="ps-conf-input" />
                <div className="ps-rd-cheat-count">
                  {t('roleDictionary.cheatsheet.shownCount', { shown: cheatActions.length, total: mockActionRegistryService.getActions().filter(a => a.category === 'WORKLIST' || a.category === 'SYNOPTIC').length })}
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
                        <span className="ps-rd-cheat-group-tag">{t(CHEAT_GROUP_LABEL_KEY[action.category as 'WORKLIST' | 'SYNOPTIC'])}</span>
                        <span className={`ps-rd-cheat-label ${granted ? 'ps-rd-cheat-label--granted' : 'ps-rd-cheat-label--default'}`}>
                          {action.label}
                        </span>
                        {granted === true  && <span className="ps-rd-tag-granted">✓ {t('roleDictionary.cheatsheet.grantedTag')}</span>}
                        {granted === undefined && (
                          <span
                            title={t('roleDictionary.cheatsheet.noMappingTitle')}
                            className="ps-rd-cheat-tag--nomap"
                          >
                            {t('roleDictionary.cheatsheet.noMappingTag')}
                          </span>
                        )}
                        {!action.isActive && (
                          <span
                            title={t('roleDictionary.cheatsheet.disabledTitle')}
                            className="ps-rd-cheat-tag--disabled"
                          >
                            {t('roleDictionary.cheatsheet.disabledTag')}
                          </span>
                        )}
                        <span className="ps-rd-tag-shortcut">{action.requiredRole}</span>
                      </div>
                      <div className="ps-rd-cheat-shortcut-row">
                        <code className="ps-rd-cheat-shortcut-code">{action.shortcut || '—'}</code>
                        <div className="ps-rd-cheat-voice-wrap">
                          {action.voiceTriggers.map(vt => (
                            <span key={vt} className="ps-rd-cheat-voice-chip">{vt}</span>
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
            {t('roleDictionary.footer.permissionsSummary', { count: permCount, facilities: allFacilities ? t('roleDictionary.footer.allFacilitiesShort') : t('roleDictionary.footer.facilityCount', { count: (draft.facilityIds ?? []).length }) })}
          </span>
          <div className="ps-flex-row-gap-8">
            <button className="fm-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
            <button className={`fm-btn-apply ${!draft.name.trim() ? 'ps-rd-btn-apply--invalid' : ''}`} onClick={() => { if (!draft.name.trim()) return; onSave(draft); }}>
              {mode === 'add' ? t('roleDictionary.modal.addRole') : t('roleDictionary.modal.saveChanges')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main RoleDictionary ──────────────────────────────────────────────────────

const RoleDictionary: React.FC<{ onRolesChange?: (roles: Role[]) => void }> = ({ onRolesChange }) => {
  const { t } = useTranslation();
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

  if (loading) return <div className="ps-rd-loading">{t('roleDictionary.list.loading')}</div>;

  const TABLE_HEADERS = [
    t('roleDictionary.list.headers.role'),
    t('roleDictionary.list.headers.description'),
    t('roleDictionary.list.headers.caseAccess'),
    t('roleDictionary.list.headers.configAccess'),
    t('roleDictionary.list.headers.pediatricAccess'),
    t('roleDictionary.list.headers.facilities'),
    t('roleDictionary.list.headers.permissions'),
    '',
  ];

  return (
    <div className="ps-rd-root">
      <div className="ps-rd-header">
        <div>
          <h2 className="ps-rd-title">{t('roleDictionary.list.pageTitle')}</h2>
          <p className="ps-rd-subtitle">{t('roleDictionary.list.pageSubtitle')}</p>
        </div>
        <button className="ps-section-add-btn" onClick={() => setModal({ mode: 'add' })}>{t('roleDictionary.list.addRoleButton')}</button>
      </div>

      <input type="text" placeholder={t('roleDictionary.list.searchPlaceholder')} value={search}
        onChange={e => setSearch(e.target.value)} className="ps-rd-search" />

      <div className="ps-rd-table-wrap">
        <table className="ps-rd-table">
          <thead className="ps-rd-thead">
            <tr>
              {TABLE_HEADERS.map((h, i) => (
                <th key={i} className="ps-rd-th">{h}</th>
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
                      {role.builtIn && <span className="ps-rd-builtin">{t('roleDictionary.list.builtIn')}</span>}
                    </div>
                  </td>
                  <td className="ps-rd-td ps-rd-td--desc">
                    <span className="ps-rd-desc-clamp">{role.description}</span>
                  </td>
                  <td className="ps-rd-td">
                    <span className={`ps-rd-access ${role.caseAccess ? 'ps-rd-access--yes' : 'ps-rd-access--no'}`}>
                      {role.caseAccess ? `✓ ${t('common.yes')}` : `— ${t('common.no')}`}
                    </span>
                  </td>
                  <td className="ps-rd-td">
                    <span className={`ps-rd-access ${role.configAccess ? 'ps-rd-access--yes' : 'ps-rd-access--no'}`}>
                      {role.configAccess ? `✓ ${t('common.yes')}` : `— ${t('common.no')}`}
                    </span>
                  </td>
                  <td className="ps-rd-td">
                    <span className={`ps-rd-access ${(role as any).canViewPediatric ? 'ps-rd-access--peds-yes' : 'ps-rd-access--no'}`}>
                      {(role as any).canViewPediatric ? `✓ ${t('common.yes')}` : `— ${t('common.no')}`}
                    </span>
                  </td>
                  <td className="ps-rd-td">
                    <span className={`ps-rd-clients ${allFacilities ? 'ps-rd-clients--all' : 'ps-rd-clients--some'}`}>
                      {allFacilities ? `🌐 ${t('roleDictionary.list.allFacilitiesShort')}` : t('roleDictionary.list.facilityCount', { count: role.facilityIds?.length ?? 0 })}
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
                    <div className="ps-rd-row-actions">
                      <button className="ps-rd-edit-btn" onClick={() => setModal({ mode: 'edit', role })}>{t('common.edit')}</button>
                      <button className="ps-rd-edit-btn" onClick={() => handleDuplicate(role)}>{t('roleDictionary.list.duplicate')}</button>
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
