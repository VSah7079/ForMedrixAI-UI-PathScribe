// src/components/Config/Staff/RoleDictionary.tsx
// Two-panel layout: category groups left, capabilities/commands/participation/cheat-sheet right
// PS-356 (Batch 370): saving goes through services/roles/roleAdministration.ts
// (config:roles:manage). The role-level Pediatric Access switch and Facility
// Access tab are gone: they were never enforced. Pediatric and orchestration
// access, and facility scope, are set on the staff record.

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { CapabilityButton } from '@/components/Common/CapabilityButton';
import { saveRole } from '@/services/roles/roleAdministration';
import '../../../pathscribe.css';
import {
  ACTION_GROUPS, DEFAULT_ROLE_PERMISSIONS,
  ActionId, PermissionSet,
} from '../../../constants/systemActions';
import type { ParticipationTypeRecord } from '../../../services/participationTypes/IParticipationTypeService';
import { roleService, auditService, authorizationService, actionRegistryService, participationTypeService, ALL_CAPABILITY_KEYS } from '../../../services';
import { isPlatformOnly } from '@/services/authorization/capabilityCatalog';
import { useAuth } from '../../../contexts/AuthContext';
import { duplicateRole } from '@/services/duplication/duplicateEntities';
import { TriCheckbox, DivCheckbox, type TriState } from './roleDictionaryControls';
import { RoleCapabilitiesTab } from './RoleCapabilitiesTab';

// i18n note (batch 118): DEFAULT_ROLES' own name/description strings
// are persisted seed data (written to roleService on first load, same
// as protocolShared.tsx's PROTOCOL_REGISTRY), and ACTION_GROUPS'
// title/label/description fields (and everything sourced from
// actionRegistryService — action label/description/shortcut/
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
  configAccess: boolean;
  permissions: PermissionSet;
  /** PS-355: catalog capabilities (services/authorization/). Enforced. */
  capabilities?: string[];
  seededCapabilities?: string[];
  /** false: can't be given to staff (Superadmin). */
  assignable?: boolean;
  builtIn: boolean;
  participationTypeIds: string[];
}

const DEFAULT_PARTICIPATION: Record<string, string[]> = {
  pathologist: ['primary', 'consultant', 'second_opinion', 'frozen_section'],
  resident:    ['grossing', 'preliminary_report', 'observer'],
  admin:       [],
  physician:   [],
};

export const DEFAULT_ROLES: Role[] = [
  { id: 'pathologist', name: 'Pathologist', description: 'Licensed pathologist with full clinical case access and sign-out authority.',   color: '#8AB4F8', caseAccess: true,  configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Pathologist'], builtIn: true, participationTypeIds: DEFAULT_PARTICIPATION['pathologist'] },
  { id: 'resident',    name: 'Resident',    description: 'Pathology resident with case access and co-sign capability.',                    color: '#81C995', caseAccess: true,  configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Resident'],    builtIn: true, participationTypeIds: DEFAULT_PARTICIPATION['resident']    },
  { id: 'admin',       name: 'Admin',       description: 'System administrator with configuration access but no clinical case access.',    color: '#FDD663', caseAccess: false, configAccess: true,  permissions: DEFAULT_ROLE_PERMISSIONS['Admin'],        builtIn: true, participationTypeIds: []                                    },
  { id: 'physician',   name: 'Physician',   description: 'External ordering physician. Directory only — no app access.',                   color: '#C084FC', caseAccess: false, configAccess: false, permissions: DEFAULT_ROLE_PERMISSIONS['Physician'],    builtIn: true, participationTypeIds: []                                    },
];


// ─── Helpers ──────────────────────────────────────────────────────────────────


function groupTriState(groupIds: ActionId[], permissions: PermissionSet): TriState {
  const granted = groupIds.filter(id => permissions[id]).length;
  if (granted === 0) return 'none';
  if (granted === groupIds.length) return 'all';
  return 'some';
}

/** The only per-instance values that cross into markup are custom properties:
 *  a role's own colour (--ps-hue) and a bar's fill percentage (--rd-pct).
 *  Tints and borders are derived in pathscribe.css with color-mix(). */
/** Batch 371: capabilities a hospital role can hold (platform ones excluded). */
const HOSPITAL_CAPABILITY_COUNT = ALL_CAPABILITY_KEYS.filter(k => !isPlatformOnly(k)).length;

const hueVar = (color: string) => ({ '--ps-hue': color } as React.CSSProperties);
const pctVar = (pct: number, color?: string) => ({ '--rd-pct': `${pct}%`, ...(color ? { '--ps-hue': color } : {}) } as React.CSSProperties);

// ─── RoleModal ────────────────────────────────────────────────────────────────

const RoleModal: React.FC<{
  mode: 'add' | 'edit';
  role?: Role;
  /** Resolves with a locale key to show when the save was refused, or null. */
  onSave: (draft: Omit<Role, 'id'>) => Promise<string | null>;
  onClose: () => void;
}> = ({ mode, role, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Omit<Role, 'id'>>({
    name:                 role?.name ?? '',
    description:          role?.description ?? '',
    color:                role?.color ?? '#8AB4F8',
    caseAccess:           role?.caseAccess ?? false,
    configAccess:         role?.configAccess ?? false,
    permissions:          role?.permissions ?? {},
    capabilities:         role?.capabilities ?? [],
    builtIn:              role?.builtIn ?? false,
    participationTypeIds: role?.participationTypeIds ?? [],
  });
  // Batch 371 (Pete): a hospital has no control over Superadmin. A role
  // staff can't be given (Superadmin) opens read-only: nothing here changes
  // it, and the role service refuses a save as well.
  const readOnly = mode === 'edit' && role?.assignable === false;
  const edit = (fn: React.SetStateAction<Omit<Role, 'id'>>) => { if (!readOnly) setDraft(fn); };

  // PS-355: Capabilities (enforced) open first; Commands are voice/keyboard.
  const [activeTab,       setActiveTab]       = useState<'capabilities' | 'permissions' | 'participation' | 'cheatsheet'>('capabilities');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ACTION_GROUPS[0].id);
  const [search,          setSearch]          = useState('');
  const [cheatSearch,     setCheatSearch]     = useState('');
  // July 2026: was loadParticipationTypes() from ParticipationTypesSection's
  // own separate, disconnected local list -- now the real service, the
  // same one CaseTeamModal actually uses.
  const [participationTypes, setParticipationTypes] = useState<ParticipationTypeRecord[]>([]);
  useEffect(() => {
    participationTypeService.getActive().then(res => { if (res.ok) setParticipationTypes(res.data); });
  }, []);


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
  // voice triggers/shortcuts from actionRegistryService" / "should
  // focus on worklist and synoptic report page commands"): this used
  // to source purely from ACTION_GROUPS — a completely separate
  // catalog from actionRegistryService's own real, live voice/
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

    const all = actionRegistryService.getActions()
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
    edit(d => ({ ...d, permissions: next }));
  };

  const toggleAction = (id: ActionId) =>
    edit(d => ({ ...d, permissions: { ...d.permissions, [id]: !d.permissions[id] } }));


  const capCount = draft.capabilities?.length ?? 0;
  const TABS = [
    { id: 'capabilities',  label: t('roleDictionary.tabs.capabilities', { count: capCount }) },
    { id: 'permissions',   label: t('roleDictionary.tabs.permissions', { count: permCount }) },
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
                onChange={e => edit(d => ({ ...d, name: e.target.value }))}
                placeholder={t('roleDictionary.modal.roleNamePlaceholder')}
                className="ps-conf-input ps-rd-modal-name-input"
                readOnly={readOnly}
              />
              <input
                type="color"
                value={draft.color}
                onChange={e => edit(d => ({ ...d, color: e.target.value }))}
                className="ps-rd-color-picker"
                disabled={readOnly}
                title={t('roleDictionary.modal.badgeColorTitle')}
              />
              <span className="ps-rd-role-badge" style={hueVar(draft.color)}>
                {draft.name || t('roleDictionary.modal.previewFallback')}
              </span>
              <span className="ps-rd-perm-badge">{t('roleDictionary.modal.actionsGranted', { granted: permCount, total: totalActions })}</span>
            </div>
          </div>
          <button onClick={onClose} className="ps-rd-close-btn">×</button>
        </div>

        {readOnly && <div className="ps-rd-platform-banner" role="note">{t('roleDictionary.platformRole.banner')}</div>}

        {/* Description + access toggles */}
        <div className="ps-rd-desc-row">
          <input
            value={draft.description}
            onChange={e => edit(d => ({ ...d, description: e.target.value }))}
            placeholder={t('roleDictionary.modal.roleDescriptionPlaceholder')}
            className="ps-conf-input ps-rd-desc-input"
            readOnly={readOnly}
          />
          <label className="ps-rd-access-label">
            <input type="checkbox" checked={draft.caseAccess}
              onChange={e => edit(d => ({ ...d, caseAccess: e.target.checked }))}
              className="ps-rd-checkbox" disabled={readOnly} />
            <span>{t('roleDictionary.modal.caseAccess')}</span>
          </label>
          <label className="ps-rd-access-label">
            <input type="checkbox" checked={draft.configAccess}
              onChange={e => edit(d => ({ ...d, configAccess: e.target.checked }))}
              className="ps-rd-checkbox" disabled={readOnly} />
            <span>{t('roleDictionary.modal.configAccess')}</span>
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

          {/* ── CAPABILITIES TAB (PS-355) ── */}
          {activeTab === 'capabilities' && (
            <RoleCapabilitiesTab
              granted={draft.capabilities ?? []}
              onChange={next => edit(d => ({ ...d, capabilities: next }))}
              readOnly={readOnly}
              includePlatform={readOnly}
            />
          )}

          {/* ── COMMANDS TAB (voice/keyboard; not access control) ── */}
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
                          style={pctVar(Math.round(granted / gIds.length * 100))} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right — action list */}
              <div className="ps-rd-action-panel">
                <p className="ps-rd-cap-intro">{t('roleDictionary.permissions.commandsNote')}</p>
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

          {/* ── CASE PARTICIPATION TAB ── */}
          {activeTab === 'participation' && (() => {
            const allTypes   = participationTypes;
            const selectedIds = draft.participationTypeIds ?? [];
            const toggle = (id: string) => edit(d => ({
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
                            <span className="ps-rd-role-badge ps-rd-part-abbr-badge" style={hueVar(pt.color)}>
                              {pt.abbreviation}
                            </span>
                          </div>
                          <div className="ps-rd-flex-1-minw0">
                            <div className={`ps-rd-part-name ${selected ? 'ps-rd-part-name--on' : 'ps-rd-part-name--off'}`}>{pt.label}</div>
                            {pt.description && <div className="ps-rd-part-desc">{pt.description}</div>}
                            <div className="ps-rd-part-attrs">
                              {attrs.map(attr => (
                                <span key={attr.label} className={`ps-rd-part-attr ps-rd-part-attr--${attr.value ? 'on' : 'off'}`} style={attr.value ? hueVar(attr.onColor) : undefined}>
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
                  {t('roleDictionary.cheatsheet.shownCount', { shown: cheatActions.length, total: actionRegistryService.getActions().filter(a => a.category === 'WORKLIST' || a.category === 'SYNOPTIC').length })}
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
            {t('roleDictionary.footer.permissionsSummary', { capabilities: capCount, count: permCount })}
          </span>
          <div className="ps-flex-row-gap-8">
            <button className="fm-btn-cancel" onClick={onClose}>{readOnly ? t('common.close') : t('common.cancel')}</button>
            {saveError && <span className="ps-st-error" role="alert">{t(saveError)}</span>}
            {!readOnly && (
              <CapabilityButton capability="config:roles:manage" className={`fm-btn-apply ${!draft.name.trim() ? 'ps-rd-btn-apply--invalid' : ''}`} onClick={() => { if (!draft.name.trim()) return; void onSave(draft).then(setSaveError); }}>
                {mode === 'add' ? t('roleDictionary.modal.addRole') : t('roleDictionary.modal.saveChanges')}
              </CapabilityButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main RoleDictionary ──────────────────────────────────────────────────────

const RoleDictionary: React.FC<{ onRolesChange?: (roles: Role[]) => void }> = ({ onRolesChange }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [roles,   setRoles]   = useState<Role[]>(DEFAULT_ROLES);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState<{ mode: 'add' | 'edit'; role?: Role } | null>(null);

  useEffect(() => {
    roleService.getAll().then(res => {
      if (res.ok) {
        const mapped = res.data.map(r => ({
          ...r,
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

  // PS-356: the save is checked (config:roles:manage), validated and
  // audited by services/authorization/roleAdministration.ts. Resolves with
  // a locale key when refused; the modal stays open to show it.
  const handleSave = async (draft: Omit<Role, 'id'>): Promise<string | null> => {
    const deps = { roleService, authorization: authorizationService, auditService, actorName: user?.name ?? 'unknown' };
    const res = modal?.mode === 'edit' && modal.role
      ? await saveRole({ mode: 'edit', id: modal.role.id, draft: draft as any }, deps)
      : await saveRole({ mode: 'add', draft: draft as any }, deps);
    if (res.ok === false) return `roleDictionary.saveErrors.${res.reason}`;
    const saved = res.role as unknown as Role;
    const next = roles.some(r => r.id === saved.id) ? roles.map(r => (r.id === saved.id ? saved : r)) : [...roles, saved];
    setRoles(next); onRolesChange?.(next);
    setModal(null);
    return null;
  };

  // Reuses the same 'add' flow/modal as a new role, pre-filled with the
  // source role's full configuration (capabilities, commands, case
  // participation, color): "duplicate, then review before saving", never an
  // instant clone. services/duplication/duplicateEntities.ts → duplicateRole
  // forces builtIn false (a copy of Pathologist/Resident/Admin is always a
  // custom role) and marks the name in the user's language (PS-73).
  const handleDuplicate = (role: Role) => {
    setModal({ mode: 'add', role: duplicateRole(role, name => t('common.copyOfName', { name })) });
  };

  if (loading) return <div className="ps-rd-loading">{t('roleDictionary.list.loading')}</div>;

  const TABLE_HEADERS = [
    t('roleDictionary.list.headers.role'),
    t('roleDictionary.list.headers.description'),
    t('roleDictionary.list.headers.caseAccess'),
    t('roleDictionary.list.headers.configAccess'),
    t('roleDictionary.list.headers.capabilities'),
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
        <CapabilityButton capability="config:roles:manage" className="ps-section-add-btn" onClick={() => setModal({ mode: 'add' })}>{t('roleDictionary.list.addRoleButton')}</CapabilityButton>
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
              const pct        = Math.round(permCount(role) / totalActions * 100);
              return (
                <tr key={role.id} className="ps-rd-tr">
                  <td className="ps-rd-td">
                    <div className="ps-rd-role-cell">
                      <span className="ps-rd-role-badge" style={hueVar(role.color)}>
                        {role.name}
                      </span>
                      {role.builtIn && <span className="ps-rd-builtin">{t(role.assignable === false ? 'roleDictionary.list.platformManaged' : 'roleDictionary.list.builtIn')}</span>}
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
                    <span className="ps-rd-perm-count" data-capability-count={role.capabilities?.length ?? 0}>{role.capabilities?.length ?? 0}/{role.assignable === false ? ALL_CAPABILITY_KEYS.length : HOSPITAL_CAPABILITY_COUNT}</span>
                  </td>
                  <td className="ps-rd-td">
                    <div className="ps-rd-perm-wrap">
                      <div className="ps-rd-perm-bar-bg">
                        <div className="ps-rd-perm-bar-fill" style={pctVar(pct, role.color)} />
                      </div>
                      <span className="ps-rd-perm-count">{permCount(role)}/{totalActions}</span>
                    </div>
                  </td>
                  <td className="ps-rd-td">
                    <div className="ps-rd-row-actions">
                      <button className="ps-rd-edit-btn" onClick={() => setModal({ mode: 'edit', role })}>{role.assignable === false ? t('roleDictionary.list.view') : t('common.edit')}</button>
                      {role.assignable !== false && (
                        <CapabilityButton capability="config:roles:manage" className="ps-rd-edit-btn" onClick={() => handleDuplicate(role)}>{t('roleDictionary.list.duplicate')}</CapabilityButton>
                      )}
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
