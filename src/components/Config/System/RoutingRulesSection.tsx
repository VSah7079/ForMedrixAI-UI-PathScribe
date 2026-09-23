// src/components/Config/System/RoutingRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin UI for configuring specimen → subspecialty pool routing rules.
// Rules are keyword-based: if a specimen description contains any keyword,
// the case routes to the mapped subspecialty pool.
//
// Built-in rules ship with PathScribe (cannot be deleted, can be disabled).
// Custom rules can be added, edited, and deleted.
// Priority controls which rule wins when multiple match.
//
// i18n sweep (batch 49): every on-screen string converted to the new
// `routingRulesSection` namespace, swept together with `RuleModal.tsx`
// (batch 48) given how tightly the two files are coupled. Real,
// admin-entered data (pool/subspecialty names, rule keywords, rule
// notes) stays as typed/stored — only page chrome is translated.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import {
  RoutingRule, loadRoutingRules, saveRoutingRules,
  testSpecimenRouting, BUILT_IN_ROUTING_RULES,
} from '../../../services/cases/casePoolAssignmentService';
import { subspecialtyService } from '../../../services';
import { Subspecialty } from '../../../services/subspecialties/ISubspecialtyService';
import RuleModal from './RuleModal';
import ConfirmModal from '../../Common/ConfirmModal';

// ─── Main Section ─────────────────────────────────────────────────────────────

const RoutingRulesSection: React.FC = () => {
  const { t } = useTranslation();
  const [rules,       setRules]       = useState<RoutingRule[]>(loadRoutingRules);
  const [pools,       setPools]       = useState<Subspecialty[]>([]);
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState<'all' | 'active' | 'inactive' | 'custom'>('all');
  const [modal,       setModal]       = useState<{ mode: 'add' | 'edit'; rule?: RoutingRule } | null>(null);
  const [testInput,   setTestInput]   = useState('');
  const [testResult,  setTestResult]  = useState<ReturnType<typeof testSpecimenRouting> | null>(null);
  // Real fix: was window.confirm() — replaced with the shared ConfirmModal
  // (its own README describes it as "explicitly meant to replace
  // window.confirm() throughout the app"). Needs pending-delete state
  // since ConfirmModal is async/UI-driven rather than a blocking call.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    subspecialtyService.getAll().then(res => {
      if (res.ok) setPools(res.data.filter((s: Subspecialty) => s.active && s.isWorkgroup));
    });
  }, []);

  const persist = (next: RoutingRule[]) => { setRules(next); saveRoutingRules(next); };

  const handleSave = (draft: Omit<RoutingRule, 'id' | 'builtIn'>) => {
    if (modal?.mode === 'add') {
      const newRule: RoutingRule = { ...draft, id: 'rule-custom-' + Date.now(), builtIn: false };
      persist([...rules, newRule].sort((a, b) => a.priority - b.priority));
    } else if (modal?.rule) {
      persist(rules.map(r => r.id === modal.rule!.id ? { ...r, ...draft } : r).sort((a, b) => a.priority - b.priority));
    }
    setModal(null);
  };

  const handleDelete = (id: string) => {
    // Safety guard — built-in rules cannot be deleted even if called programmatically
    if (BUILT_IN_ROUTING_RULES.some(r => r.id === id)) return;
    setPendingDeleteId(id);
  };

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    persist(rules.filter(r => r.id !== pendingDeleteId));
    setPendingDeleteId(null);
  };

  const handleToggle = (id: string) => {
    persist(rules.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const handleTest = () => {
    if (!testInput.trim()) return;
    setTestResult(testSpecimenRouting(testInput));
  };

  const filtered = rules.filter(r => {
    const matchSearch = !search ||
      r.keywords.some(k => k.includes(search.toLowerCase())) ||
      (r.note ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'active'   ? r.active :
      filter === 'inactive' ? !r.active :
      filter === 'custom'   ? !r.builtIn : true;
    return matchSearch && matchFilter;
  });

  const poolName = (id: string) => pools.find(p => p.id === id)?.name ?? id;

  const tableHeaders = [
    t('routingRulesSection.table.priority'),
    t('routingRulesSection.table.pool'),
    t('routingRulesSection.table.keywords'),
    t('routingRulesSection.table.note'),
    t('routingRulesSection.table.status'),
    '',
  ];

  return (
    <div className="ps-routingrules__page">

      {/* Header */}
      <div className="ps-routingrules__header">
        <div>
          <h1 className="ps-routingrules__title">{t('routingRulesSection.pageTitle')}</h1>
          <p className="ps-routingrules__subtitle">
            {t('routingRulesSection.pageSubtitle')}
          </p>
        </div>
        <button className="ps-section-add-btn" onClick={() => setModal({ mode: 'add' })}>{t('routingRulesSection.addRuleBtn')}</button>
      </div>

      {/* Test specimen description */}
      <div className="ps-routingrules__test-box">
        <div className="ps-routingrules__test-label">
          {t('routingRulesSection.testRouting.label')}
        </div>
        <div className="ps-routingrules__test-row">
          <input
            value={testInput}
            onChange={e => { setTestInput(e.target.value); setTestResult(null); }}
            onKeyDown={e => e.key === 'Enter' && handleTest()}
            placeholder={t('routingRulesSection.testRouting.placeholder')}
            className="ps-routingrules__input ps-routingrules__input--flex"
          />
          <button onClick={handleTest}
            className="ps-conf-btn-primary ps-routingrules__test-btn">
            {t('routingRulesSection.testRouting.testBtn')}
          </button>
        </div>
        {testResult && (
          <div className={`ps-routingrules__test-result${testResult.matched ? ' ps-routingrules__test-result--matched' : ' ps-routingrules__test-result--nomatch'}`}>
            {testResult.matched ? (
              <div className="ps-routingrules__test-result-text ps-routingrules__test-result-text--matched">
                <Trans i18nKey="routingRulesSection.testRouting.matched" values={{ pool: poolName(testResult.subspecialtyId!) }} components={{ strong: <strong /> }} />
                {testResult.rule && (
                  <span className="ps-routingrules__test-via-rule">
                    {t('routingRulesSection.testRouting.viaRule', { ruleLabel: testResult.rule.note ?? testResult.rule.id, priority: testResult.rule.priority })}
                  </span>
                )}
              </div>
            ) : (
              <div className="ps-routingrules__test-result-text ps-routingrules__test-result-text--nomatch">
                {t('routingRulesSection.testRouting.noMatch')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="ps-routingrules__filters">
        <input type="text" placeholder={t('routingRulesSection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
          className="ps-routingrules__search-input" />
        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          aria-label={t('routingRulesSection.filterAriaLabel')}
          className="ps-conf-select">
          <option value="all">{t('routingRulesSection.filterOptions.all')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
          <option value="custom">{t('routingRulesSection.filterOptions.custom')}</option>
        </select>
      </div>

      {/* Rules table */}
      <div className="ps-routingrules__table-wrap">
        <div>
          <table className="ps-routingrules__table">
            <thead>
              <tr className="ps-routingrules__thead-row">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="ps-routingrules__th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((rule, i) => (
                <tr key={rule.id}
                  className={`ps-routingrules__tr${i < filtered.length - 1 ? ' ps-routingrules__tr--divider' : ''}${rule.active ? '' : ' ps-routingrules__tr--inactive'}`}
                >
                  {/* Priority */}
                  <td className="ps-routingrules__td-priority">
                    {rule.priority}
                  </td>
                  {/* Pool */}
                  <td className="ps-routingrules__td-pool">
                    <div className="ps-routingrules__pool-name">{poolName(rule.subspecialtyId)}</div>
                    {rule.builtIn && <div className="ps-routingrules__builtin-label">{t('routingRulesSection.builtInLabel')}</div>}
                  </td>
                  {/* Keywords */}
                  <td className="ps-routingrules__td-keywords">
                    <div className="ps-routingrules__keyword-chips">
                      {rule.keywords.slice(0, 8).map(kw => (
                        <span key={kw} className="ps-routingrules__keyword-chip">{kw}</span>
                      ))}
                      {rule.keywords.length > 8 && (
                        <span className="ps-routingrules__keyword-more">{t('routingRulesSection.moreKeywords', { count: rule.keywords.length - 8 })}</span>
                      )}
                    </div>
                  </td>
                  {/* Note */}
                  <td className="ps-routingrules__td-note">
                    <span className="ps-routingrules__note-clamp">
                      {rule.note ?? '—'}
                    </span>
                  </td>
                  {/* Toggle */}
                  <td className="ps-routingrules__td-toggle">
                    <div onClick={() => handleToggle(rule.id)}
                      className={`ps-routingrules__toggle-track${rule.active ? ' ps-routingrules__toggle-track--on' : ' ps-routingrules__toggle-track--off'}`}>
                      <div className={`ps-routingrules__toggle-thumb${rule.active ? ' ps-routingrules__toggle-thumb--on' : ' ps-routingrules__toggle-thumb--off'}`} />
                    </div>
                  </td>
                  {/* Actions */}
                  <td className="ps-routingrules__td-actions">
                    <button onClick={() => setModal({ mode: 'edit', rule })}
                      className="ps-routingrules__edit-btn">
                      {t('common.edit')}
                    </button>
                    {!rule.builtIn && (
                      <button onClick={() => handleDelete(rule.id)}
                        className="ps-routingrules__delete-btn">
                        {t('common.delete')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="ps-routingrules__empty-row">{t('routingRulesSection.emptyRow')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer count */}
      <div className="ps-routingrules__footer">
        <div className="ps-routingrules__footer-autosave">
          <span className="ps-routingrules__footer-dot">●</span> {t('routingRulesSection.footer.autoSave')}
        </div>
        <div>{t('routingRulesSection.footer.counts', { active: rules.filter(r => r.active).length, total: rules.length, custom: rules.filter(r => !r.builtIn).length })}</div>
      </div>

      {modal && (
        <RuleModal
          mode={modal.mode}
          rule={modal.rule}
          pools={pools}
          allRules={rules}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmModal
        show={!!pendingDeleteId}
        title={t('routingRulesSection.deleteModal.title')}
        message={t('routingRulesSection.deleteModal.message')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
};

export default RoutingRulesSection;
