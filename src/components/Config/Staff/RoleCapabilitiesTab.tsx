// src/components/Config/Staff/RoleCapabilitiesTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): the Role Dictionary's Capabilities tab, the part of a
// role PathScribe enforces. Capabilities are grouped the way administrators
// know the app (report history, then the Quality Assurance pillars).
//
// When one capability depends on another, the administrator is told, per
// Pete: turning on one that needs another offers to turn that on too;
// turning off one that others need offers to turn those off too. Either
// way they can cancel and leave the role as it was. What depends on what
// is decided by services/authorization (planGrant / planRevoke); this tab
// only shows it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  capabilitiesByGroup, capabilityDefinition, capabilityDescriptionKey, capabilityGroupKey, capabilityLabelKey,
  dependentsOf, planGrant, planRevoke, requirementsOf,
} from '@/services';
import { DivCheckbox, TriCheckbox, type TriState } from './roleDictionaryControls';

interface Props {
  granted: string[];
  onChange: (next: string[]) => void;
  /** Batch 371: the platform role (Superadmin) is shown, not edited. */
  readOnly?: boolean;
  /** Batch 371: ForMedrixAI platform capabilities are listed only for the
   *  platform role; a hospital role can never hold them. */
  includePlatform?: boolean;
}

type Prompt =
  | { kind: 'grant'; what: string; others: string[]; next: string[] }
  | { kind: 'revoke'; what: string; others: string[]; next: string[] };

const pctVar = (pct: number) => ({ '--rd-pct': `${pct}%` } as React.CSSProperties);

const triState = (keys: string[], granted: Set<string>): TriState => {
  const n = keys.filter(k => granted.has(k)).length;
  return n === 0 ? 'none' : n === keys.length ? 'all' : 'some';
};

export const RoleCapabilitiesTab: React.FC<Props> = ({ granted, onChange, readOnly = false, includePlatform = false }) => {
  const { t } = useTranslation();
  const groups = capabilitiesByGroup().filter(g => includePlatform || g.group !== 'platform');
  const [groupId, setGroupId] = useState(groups[0]?.group);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const have = new Set(granted);
  const group = groups.find(g => g.group === groupId) ?? groups[0];
  const groupKeys = group.capabilities.map(c => c.key);
  const labelOf = (key: string) => { const d = capabilityDefinition(key); return d ? t(capabilityLabelKey(d)) : key; };

  const turnOn = (keys: string[], what: string) => {
    const plan = planGrant(granted, keys);
    if (plan.requested.length === 0) return;
    if (plan.missingRequirements.length === 0) { onChange(plan.withRequirements); return; }
    setPrompt({ kind: 'grant', what, others: plan.missingRequirements, next: plan.withRequirements });
  };
  const turnOff = (keys: string[], what: string) => {
    const plan = planRevoke(granted, keys);
    if (plan.requested.length === 0) return;
    if (plan.affectedDependents.length === 0) { onChange(plan.withDependents); return; }
    setPrompt({ kind: 'revoke', what, others: plan.affectedDependents, next: plan.withDependents });
  };
  const toggle = (key: string) => { if (readOnly) return; if (have.has(key)) turnOff([key], labelOf(key)); else turnOn([key], labelOf(key)); };
  const toggleGroup = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    const what = t(capabilityGroupKey(group.group));
    if (triState(groupKeys, have) === 'all') turnOff(groupKeys, what); else turnOn(groupKeys, what);
  };

  return (
    <>
      <div className="ps-rd-cat-panel">
        {groups.map(g => {
          const keys = g.capabilities.map(c => c.key);
          const n = keys.filter(k => have.has(k)).length;
          const ts = triState(keys, have);
          const active = g.group === group.group;
          return (
            <div key={g.group} onClick={() => setGroupId(g.group)}
              className={`ps-rd-cat-item ${active ? 'ps-rd-cat-item--active' : 'ps-rd-cat-item--inactive'}`}>
              <span className={`ps-rd-cat-label ${active ? 'ps-rd-cat-label--active' : 'ps-rd-cat-label--inactive'}`}>{t(capabilityGroupKey(g.group))}</span>
              <span className={`ps-rd-cat-count ps-rd-cat-count--${ts}`}>{n}/{keys.length}</span>
              <div className="ps-rd-cat-bar-bg">
                <div className={`ps-rd-cat-bar-fill ps-rd-cat-bar-fill--${ts === 'none' ? 'some' : ts}`} style={pctVar(Math.round(n / keys.length * 100))} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="ps-rd-action-panel">
        <p className="ps-rd-cap-intro">{t('roleDictionary.capabilities.intro')}</p>
        <div className="ps-rd-action-header">
          <TriCheckbox state={triState(groupKeys, have)} onClick={toggleGroup} size={18} />
          <span className="ps-rd-action-group-title">{t(capabilityGroupKey(group.group))}</span>
          <span className="ps-rd-action-granted-count">
            {t('roleDictionary.permissions.grantedCount', { granted: groupKeys.filter(k => have.has(k)).length, total: groupKeys.length })}
          </span>
        </div>
        <div className="ps-rd-action-list">
          {group.capabilities.map(c => {
            const on = have.has(c.key);
            const needs = requirementsOf(c.key);
            const neededBy = dependentsOf(c.key);
            return (
              <div key={c.key} onClick={() => toggle(c.key)} data-capability={c.key}
                className={`ps-rd-action-item ${on ? 'ps-rd-action-item--granted' : 'ps-rd-action-item--default'}`}>
                <DivCheckbox checked={on} size={18} />
                <div className="ps-rd-flex-1-minw0">
                  <div className="ps-rd-action-label-row">
                    <span className={`ps-rd-action-label ${on ? 'ps-rd-action-label--granted' : 'ps-rd-action-label--default'}`}>{t(capabilityLabelKey(c))}</span>
                    {c.risk === 'high' && <span className="ps-rd-tag-audited" title={t('roleDictionary.capabilities.auditedTitle')}>{t('roleDictionary.capabilities.auditedTag')}</span>}
                  </div>
                  <div className="ps-rd-action-desc">{t(capabilityDescriptionKey(c))}</div>
                  {needs.length > 0 && <div className="ps-rd-cap-link">{t('roleDictionary.capabilities.needs', { list: needs.map(labelOf).join(', ') })}</div>}
                  {neededBy.length > 0 && <div className="ps-rd-cap-link">{t('roleDictionary.capabilities.neededBy', { list: neededBy.map(labelOf).join(', ') })}</div>}
                  <code className="ps-rd-cap-key">{c.key}</code>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {prompt && (
        <div className="ps-rd-cap-prompt-backdrop" onClick={() => setPrompt(null)}>
          <div className="ps-rd-cap-prompt" role="alertdialog" aria-modal="true" aria-labelledby="ps-rd-cap-prompt-title" onClick={e => e.stopPropagation()}>
            <div id="ps-rd-cap-prompt-title" className="ps-rd-cap-prompt-title">{t('roleDictionary.capabilities.prompt.title')}</div>
            <p className="ps-rd-cap-prompt-body">
              {t(prompt.kind === 'grant' ? 'roleDictionary.capabilities.prompt.grantIntro' : 'roleDictionary.capabilities.prompt.revokeIntro', { what: prompt.what })}
            </p>
            <ul className="ps-rd-cap-prompt-list">
              {prompt.others.map(k => <li key={k}>{labelOf(k)}</li>)}
            </ul>
            <p className="ps-rd-cap-prompt-hint">
              {t(prompt.kind === 'grant' ? 'roleDictionary.capabilities.prompt.grantHint' : 'roleDictionary.capabilities.prompt.revokeHint', { what: prompt.what, count: prompt.others.length })}
            </p>
            <div className="ps-flex-row-gap-8 ps-rd-cap-prompt-actions">
              <button className="fm-btn-cancel" onClick={() => setPrompt(null)}>{t('common.cancel')}</button>
              <button className="fm-btn-apply" autoFocus onClick={() => { onChange(prompt.next); setPrompt(null); }}>
                {t(prompt.kind === 'grant' ? 'roleDictionary.capabilities.prompt.grantConfirm' : 'roleDictionary.capabilities.prompt.revokeConfirm', { count: prompt.others.length })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
