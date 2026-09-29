// src/components/Config/System/CasePoolAssignmentSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin UI for automatic case pool routing (Config → Integrations →
// Case Routing). Controls how unassigned cases are distributed to
// subspecialty pools when the LIS does not provide an assignment.
//
// Real redesign, per direct guidance: the previous version only ever
// exposed RoutingConfig (the master toggle, timeout, one global
// fallback pool) — the keyword → pool RoutingRule[] that actually
// drives matching had no admin UI at all, despite the service's own
// comment describing "custom rules added by admins." This is that
// missing table+modal, using the same real, proven pattern as
// ContainerTypesSection/DelegationTypeSection: table + modal,
// Edit/Duplicate/Deactivate (no Delete — built-in rules genuinely
// can't be removed, and custom rules follow the same shape for
// consistency; "deactivate" is the real, reversible way to retire
// one).
//
// Facility-driven scoping, per direct guidance ("different facilities
// will have their own pools" / fallback = "General Pathology for the
// Performing Lab Facility"): both RoutingRule and the fallback pool
// now carry the same Global/scoped performingLabFacilityId convention
// already proven on Container Types and Delegation Types, resolved at
// routing time via resolvePerformingLabFacilityId() — never a bare
// facilityId read. See casePoolAssignmentService.ts's own updated
// header for the full resolution/precedence account.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import {
  RoutingConfig,
  getRoutingConfig,
  saveRoutingConfig,
  routeUnassignedCases,
  RoutingResult,
  RoutingRule,
  loadRoutingRules,
  saveRoutingRules,
  testSpecimenRouting,
} from '../../../services/cases/casePoolAssignmentService';
import { subspecialtyService } from '../../../services';
import { specimenDictionaryService } from '../../../services';
import { Subspecialty } from '../../../services/subspecialties/ISubspecialtyService';
import type { SpecimenEntry } from '../../../services/specimenDictionary/specimenTypes';
import { caseService } from '@/services';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { duplicateRoutingRule } from '@/services/duplication/duplicateEntities';

// ─── Routing logic explainer ──────────────────────────────────────────────────
// Labels stored as translation keys, not raw text — this array lives
// at module scope (outside any component), so the actual t() call
// happens in RoutingDiagram's own render, where useTranslation() is
// in scope.

const ROUTING_STEPS: { step: string; labelKey: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }[] = [
  { step: '1', labelKey: 'casePoolAssignmentSection.routingDiagram.step1', tone: 'neutral' },
  { step: '2', labelKey: 'casePoolAssignmentSection.routingDiagram.step2', tone: 'neutral' },
  { step: '3', labelKey: 'casePoolAssignmentSection.routingDiagram.step3', tone: 'good' },
  { step: '4', labelKey: 'casePoolAssignmentSection.routingDiagram.step4', tone: 'warn' },
  { step: '5', labelKey: 'casePoolAssignmentSection.routingDiagram.step5', tone: 'good' },
  { step: '6', labelKey: 'casePoolAssignmentSection.routingDiagram.step6', tone: 'warn' },
  { step: '7', labelKey: 'casePoolAssignmentSection.routingDiagram.step7', tone: 'bad' },
];

const RoutingDiagram: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="ps-conf-callout">
      <div className="ps-conf-callout-title">{t('casePoolAssignmentSection.routingDiagram.title')}</div>
      <div className="ps-conf-callout-steps">
        {ROUTING_STEPS.map(({ step, labelKey, tone }) => (
          <div key={step} className="ps-conf-callout-step">
            <span className="ps-conf-callout-step-num">{step}</span>
            <span className={`ps-conf-callout-step-label ps-conf-callout-step-label--${tone}`}>{t(labelKey)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Rule modal ────────────────────────────────────────────────────────────────

type RuleDraft = Omit<RoutingRule, 'keywords'> & { keywordsText: string };

const draftFromRule = (rule: RoutingRule): RuleDraft => ({ ...rule, keywordsText: rule.keywords.join(', ') });

interface RuleModalProps {
  mode: 'add' | 'edit';
  rule: RoutingRule;
  pools: Subspecialty[];
  labs: Facility[];
  specimenEntries: SpecimenEntry[];
  onSave: (rule: RoutingRule) => void;
  onClose: () => void;
}

const RuleModal: React.FC<RuleModalProps> = ({ mode, rule, pools, labs, specimenEntries, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft]   = useState<RuleDraft>(draftFromRule(rule));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [specimenSearch, setSpecimenSearch] = useState('');

  const set = (k: keyof RuleDraft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const mappedIds = draft.mappedSpecimenTypeIds ?? [];
  const toggleSpecimen = (id: string) => {
    set('mappedSpecimenTypeIds', mappedIds.includes(id) ? mappedIds.filter(x => x !== id) : [...mappedIds, id]);
  };
  const filteredSpecimenEntries = specimenEntries.filter(s =>
    !specimenSearch || s.name.toLowerCase().includes(specimenSearch.toLowerCase())
  );

  // Only pools compatible with the rule's own scope can ever be a real
  // routing destination for it — a Global rule may target a Global
  // pool or a lab-specific one (it'll only actually match that lab's
  // cases per casePoolAssignmentService's own runtime safety check),
  // but a lab-scoped rule should only ever offer that lab's own pools
  // plus Global ones, so an admin can't build a rule that can never
  // fire.
  const compatiblePools = pools.filter(p =>
    !draft.performingLabFacilityId || !p.performingLabFacilityId || p.performingLabFacilityId === draft.performingLabFacilityId
  );

  const validate = () => {
    const e: typeof errors = {};
    const keywords = draft.keywordsText.split(',').map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0 && mappedIds.length === 0) e.keywordsText = t('casePoolAssignmentSection.ruleModal.keywordsRequiredError');
    if (!draft.subspecialtyId) e.subspecialtyId = t('casePoolAssignmentSection.ruleModal.poolRequiredError');
    if (!draft.priority || draft.priority < 1) e.priority = t('casePoolAssignmentSection.ruleModal.priorityRequiredError');
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    const { keywordsText, ...rest } = draft;
    onSave({ ...rest, keywords: keywordsText.split(',').map(k => k.trim()).filter(Boolean) });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'edit'
            ? (rule.builtIn ? t('casePoolAssignmentSection.ruleModal.editHeaderBuiltIn') : t('casePoolAssignmentSection.ruleModal.editHeader'))
            : t('casePoolAssignmentSection.ruleModal.addHeader')}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('casePoolAssignmentSection.ruleModal.mappedSpecimenTypesLabel')}</label>
            <input className="ps-conf-search" placeholder={t('casePoolAssignmentSection.ruleModal.specimenSearchPlaceholder')} value={specimenSearch} onChange={e => setSpecimenSearch(e.target.value)} />
            <div className="ps-conf-table-scroll ps-cpa-specimen-list">
              {filteredSpecimenEntries.length === 0
                ? <p className="ps-conf-section-subtitle">{t('casePoolAssignmentSection.ruleModal.noSpecimenEntriesMatch')}</p>
                : filteredSpecimenEntries.map(s => (
                    <label key={s.id} className="ps-conf-label ps-cpa-specimen-label">
                      <input type="checkbox" checked={mappedIds.includes(s.id)} onChange={() => toggleSpecimen(s.id)} /> {' '}{s.name}
                    </label>
                  ))}
            </div>
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              {t('casePoolAssignmentSection.ruleModal.mappedSpecimenTypesHint', { count: mappedIds.length })}
            </p>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('casePoolAssignmentSection.ruleModal.keywordFallbackLabel')} <span className="ps-conf-label-opt">{t('casePoolAssignmentSection.ruleModal.optionalNote')}</span></label>
            <textarea className={`ps-conf-input ps-conf-textarea ${errors.keywordsText ? 'ps-conf-input--error' : ''}`}
              value={draft.keywordsText} onChange={e => set('keywordsText', e.target.value)}
              placeholder={t('casePoolAssignmentSection.ruleModal.keywordFallbackPlaceholder')} />
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              {t('casePoolAssignmentSection.ruleModal.keywordFallbackHint')}
            </p>
            {errors.keywordsText && <span className="ps-conf-error-text">{errors.keywordsText}</span>}
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="rule-pool">{t('casePoolAssignmentSection.ruleModal.destinationPoolLabel')} <span className="ps-conf-required">*</span></label>
              <select id="rule-pool" className={`ps-conf-select ${errors.subspecialtyId ? 'ps-conf-input--error' : ''}`}
                value={draft.subspecialtyId} onChange={e => set('subspecialtyId', e.target.value)}>
                <option value="">{t('casePoolAssignmentSection.ruleModal.selectPoolOption')}</option>
                {compatiblePools.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.performingLabFacilityId
                      ? t('casePoolAssignmentSection.ruleModal.poolOptionLab', { name: p.name, lab: labs.find(l => l.id === p.performingLabFacilityId)?.name ?? p.performingLabFacilityId })
                      : t('casePoolAssignmentSection.ruleModal.poolOptionGlobal', { name: p.name })}
                  </option>
                ))}
              </select>
              {errors.subspecialtyId && <span className="ps-conf-error-text">{errors.subspecialtyId}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="rule-priority">{t('casePoolAssignmentSection.ruleModal.priorityLabel')} <span className="ps-conf-required">*</span></label>
              <input id="rule-priority" className={`ps-conf-input ${errors.priority ? 'ps-conf-input--error' : ''}`}
                type="number" min="1" value={draft.priority} onChange={e => set('priority', parseInt(e.target.value) || 0)} />
              {errors.priority && <span className="ps-conf-error-text">{errors.priority}</span>}
              <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">{t('casePoolAssignmentSection.ruleModal.priorityHint')}</p>
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-lab">{t('casePoolAssignmentSection.ruleModal.performingLabLabel')}</label>
            <select id="rule-lab" className="ps-conf-select"
              value={draft.performingLabFacilityId ?? ''}
              onChange={e => set('performingLabFacilityId', e.target.value || undefined)}>
              <option value="">{t('casePoolAssignmentSection.ruleModal.globalLabOption')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              {t('casePoolAssignmentSection.ruleModal.performingLabHint')}
            </p>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('casePoolAssignmentSection.ruleModal.noteLabel')}</label>
            <input className="ps-conf-input" value={draft.note ?? ''} onChange={e => set('note', e.target.value)} placeholder={t('casePoolAssignmentSection.ruleModal.notePlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('casePoolAssignmentSection.ruleModal.statusLabel')}</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? t('common.active') : t('common.inactive')}</span>
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? t('casePoolAssignmentSection.ruleModal.addHeader') : t('casePoolAssignmentSection.saveChangesBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const CasePoolAssignmentSection: React.FC = () => {
  const { t } = useTranslation();
  const [config,     setConfig]     = useState<RoutingConfig>(getRoutingConfig());
  const [pools,      setPools]      = useState<Subspecialty[]>([]);
  const [labs,       setLabs]       = useState<Facility[]>([]);
  const [rules,      setRules]      = useState<RoutingRule[]>([]);
  const [specimenEntries, setSpecimenEntries] = useState<SpecimenEntry[]>([]);
  const [saved,      setSaved]      = useState(false);
  const [running,    setRunning]    = useState(false);
  const [runResults, setRunResults] = useState<{ routed: number; skipped: number; failed: number; results: { caseId: string; result: RoutingResult }[] } | null>(null);

  // Rule table filters
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [labFilter,    setLabFilter]    = useState<'All' | 'Global' | string>('All');
  const [modal,         setModal]         = useState<{ mode: 'add' | 'edit'; rule: RoutingRule } | null>(null);

  // Test routing preview
  const [testDescription, setTestDescription] = useState('');
  const [testLabId,       setTestLabId]       = useState('');
  const [testSpecimenId,  setTestSpecimenId]  = useState('');

  useEffect(() => {
    subspecialtyService.getAll().then(res => {
      if (res.ok) setPools(res.data.filter((s: Subspecialty) => s.active && s.isWorkgroup));
    });
    getActivePerformingLabs().then(setLabs);
    specimenDictionaryService.getAll().then(res => { if (res.ok) setSpecimenEntries(res.data.filter((s: SpecimenEntry) => s.active)); });
    setRules(loadRoutingRules());
  }, []);

  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : t('casePoolAssignmentSection.globalLabel');
  const poolName = (id: string) => pools.find(p => p.id === id)?.name ?? id;

  const filteredRules = rules.filter(r => {
    const matchSearch = !search
      || r.keywords.some(k => k.toLowerCase().includes(search.toLowerCase()))
      || (r.note ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || (statusFilter === 'Active' ? r.active : !r.active);
    const matchLab = labFilter === 'All'
      || (labFilter === 'Global' ? !r.performingLabFacilityId : r.performingLabFacilityId === labFilter);
    return matchSearch && matchStatus && matchLab;
  }).sort((a, b) => {
    const aSpecific = a.performingLabFacilityId ? 0 : 1;
    const bSpecific = b.performingLabFacilityId ? 0 : 1;
    return aSpecific !== bSpecific ? aSpecific - bSpecific : a.priority - b.priority;
  });

  const persistRules = (next: RoutingRule[]) => {
    setRules(next);
    saveRoutingRules(next);
  };

  const handleSaveRule = (rule: RoutingRule) => {
    const exists = rules.some(r => r.id === rule.id);
    persistRules(exists ? rules.map(r => r.id === rule.id ? rule : r) : [...rules, rule]);
    setModal(null);
  };

  const handleToggleActive = (rule: RoutingRule) => {
    persistRules(rules.map(r => r.id === rule.id ? { ...r, active: !r.active } : r));
  };

  // "Duplicate, edit, save as new" (PS-73). services/duplication decides what
  // the copy is: always custom (never a second built-in), note marked in the
  // user's language, next free priority. This screen's save upserts by id, so
  // the copy gets its real custom id here, the same way handleAddRule does.
  const handleDuplicateRule = (source: RoutingRule) => {
    const cloned: RoutingRule = { ...duplicateRoutingRule(source, rules, name => t('common.copyOfName', { name })), id: `rule-custom-${crypto.randomUUID()}` };
    setModal({ mode: 'add', rule: cloned });
  };

  const handleAddRule = () => {
    setModal({
      mode: 'add',
      rule: { id: `rule-custom-${crypto.randomUUID()}`, subspecialtyId: '', keywords: [], builtIn: false, active: true, priority: 100 },
    });
  };

  const handleSaveConfig = () => {
    saveRoutingConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const setLabFallback = (performingLabFacilityId: string, poolId: string) => {
    const pool = pools.find(p => p.id === poolId);
    setConfig(c => {
      const others = (c.labFallbacks ?? []).filter(f => f.performingLabFacilityId !== performingLabFacilityId);
      if (!poolId) return { ...c, labFallbacks: others };
      return { ...c, labFallbacks: [...others, { performingLabFacilityId, poolId, poolName: pool?.name ?? poolId }] };
    });
  };

  const handleRunNow = async () => {
    setRunning(true);
    setRunResults(null);
    try {
      const cases = await caseService.listCasesForUser('all');
      const results = await routeUnassignedCases(cases);
      setRunResults(results);
    } finally {
      setRunning(false);
    }
  };

  const testResult = (testDescription.trim() || testSpecimenId)
    ? testSpecimenRouting(testDescription, testLabId || undefined, testSpecimenId || undefined)
    : null;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('casePoolAssignmentSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('casePoolAssignmentSection.subtitle')}
          </p>
        </div>
      </div>

      <RoutingDiagram />

      {/* Master toggles */}
      <div className="ps-conf-form-field">
        <label className="ps-conf-label">
          <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} />
          {' '}{t('casePoolAssignmentSection.enabledLabel')}
        </label>
      </div>
      <div className="ps-conf-form-field">
        <label className="ps-conf-label">
          <input type="checkbox" checked={config.statRoutesImmediately} onChange={e => setConfig(c => ({ ...c, statRoutesImmediately: e.target.checked }))} />
          {' '}{t('casePoolAssignmentSection.statImmediateLabel')}
        </label>
      </div>

      <div className="ps-conf-form-row">
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">{t('casePoolAssignmentSection.assignmentTimeoutLabel')}</label>
          <input className="ps-conf-input" type="number" min={0} max={3600}
            value={config.assignmentTimeoutSec}
            onChange={e => setConfig(c => ({ ...c, assignmentTimeoutSec: parseInt(e.target.value) || 0 }))} />
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
            {t('casePoolAssignmentSection.assignmentTimeoutHint')}
          </p>
        </div>
      </div>

      {/* Fallback pool — Global + per-lab overrides */}
      <div className="ps-conf-section-header">
        <h3 className="ps-conf-section-title">{t('casePoolAssignmentSection.fallbackPool.title')}</h3>
      </div>
      <p className="ps-conf-section-subtitle">
        {t('casePoolAssignmentSection.fallbackPool.subtitle')}
      </p>

      {pools.length === 0 ? (
        <p className="ps-conf-error-text">
          {t('casePoolAssignmentSection.fallbackPool.noPoolsFound')}
        </p>
      ) : (
        <>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('casePoolAssignmentSection.fallbackPool.globalFallbackLabel')}</label>
              <select className="ps-conf-select" value={config.fallbackPoolId}
                onChange={e => {
                  const pool = pools.find(p => p.id === e.target.value);
                  setConfig(c => ({ ...c, fallbackPoolId: e.target.value, fallbackPoolName: pool?.name ?? e.target.value }));
                }}>
                <option value="">{t('casePoolAssignmentSection.fallbackPool.noneOption')}</option>
                {pools.filter(p => !p.performingLabFacilityId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {labs.length > 0 && (
            <div className="ps-conf-table-wrap">
              <table className="ps-conf-table">
                <thead>
                  <tr><th className="ps-conf-th">{t('casePoolAssignmentSection.fallbackPool.performingLabHeader')}</th><th className="ps-conf-th">{t('casePoolAssignmentSection.fallbackPool.fallbackOverrideHeader')}</th></tr>
                </thead>
                <tbody>
                  {labs.map(lab => {
                    const current = config.labFallbacks?.find(f => f.performingLabFacilityId === lab.id)?.poolId ?? '';
                    const labPools = pools.filter(p => !p.performingLabFacilityId || p.performingLabFacilityId === lab.id);
                    return (
                      <tr key={lab.id} className="ps-conf-tr">
                        <td className="ps-conf-td">{lab.name}</td>
                        <td className="ps-conf-td">
                          <select className="ps-conf-select" value={current} onChange={e => setLabFallback(lab.id, e.target.value)}>
                            <option value="">{t('casePoolAssignmentSection.fallbackPool.useGlobalDefaultOption')}</option>
                            {labPools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="ps-ms-footer">
        <button className={saved ? 'ps-conf-btn-secondary' : 'ps-conf-btn-primary'} onClick={handleSaveConfig}>
          {saved ? `✓ ${t('casePoolAssignmentSection.savedBtn')}` : t('casePoolAssignmentSection.saveConfigBtn')}
        </button>
      </div>

      {/* Routing Rules table */}
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('casePoolAssignmentSection.rulesTable.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('casePoolAssignmentSection.rulesTable.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={handleAddRule}>+ {t('casePoolAssignmentSection.ruleModal.addHeader')}</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder={t('casePoolAssignmentSection.rulesTable.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">{t('casePoolAssignmentSection.rulesTable.statusAll')}</option>
          <option value="Active">{t('common.active')}</option>
          <option value="Inactive">{t('common.inactive')}</option>
        </select>
        <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
          <option value="All">{t('casePoolAssignmentSection.rulesTable.allLabsOption')}</option>
          <option value="Global">{t('casePoolAssignmentSection.rulesTable.globalOnlyOption')}</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {[
                  t('casePoolAssignmentSection.rulesTable.priorityHeader'),
                  t('casePoolAssignmentSection.rulesTable.matchHeader'),
                  t('casePoolAssignmentSection.rulesTable.poolHeader'),
                  t('casePoolAssignmentSection.fallbackPool.performingLabHeader'),
                  t('casePoolAssignmentSection.rulesTable.statusHeader'),
                  t('casePoolAssignmentSection.rulesTable.actionsHeader'),
                ].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRules.map(r => (
                <tr key={r.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{r.priority}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name">
                      {r.mappedSpecimenTypeIds?.length
                        ? t('casePoolAssignmentSection.rulesTable.specimenTypeCount', { count: r.mappedSpecimenTypeIds.length })
                        : (r.keywords.slice(0, 4).join(', ') + (r.keywords.length > 4 ? t('casePoolAssignmentSection.rulesTable.moreKeywords', { count: r.keywords.length - 4 }) : ''))}
                      {r.builtIn && <span className="ps-sub-system-badge" title={t('casePoolAssignmentSection.rulesTable.builtInTitle')}>{t('casePoolAssignmentSection.rulesTable.builtInBadge')}</span>}
                    </div>
                    {r.note && <div className="ps-conf-identity-sub">{r.note}</div>}
                  </td>
                  <td className="ps-conf-td">{poolName(r.subspecialtyId)}</td>
                  <td className="ps-conf-td">{labName(r.performingLabFacilityId)}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${r.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${r.active ? 'ps-conf-status-text--active' : ''}`}>{r.active ? t('common.active') : t('common.inactive')}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', rule: r })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleDuplicateRule(r)}>{t('common.duplicate')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleActive(r)}>
                        {r.active ? t('casePoolAssignmentSection.rulesTable.deactivateBtn') : t('casePoolAssignmentSection.rulesTable.reactivateBtn')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRules.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>{t('casePoolAssignmentSection.rulesTable.emptyRow')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test routing preview */}
      <div className="ps-conf-section-header">
        <h3 className="ps-conf-section-title">{t('casePoolAssignmentSection.testRouting.title')}</h3>
      </div>
      <div className="ps-conf-form-row">
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">{t('casePoolAssignmentSection.testRouting.specimenEntryLabel')}</label>
          <select className="ps-conf-select" value={testSpecimenId} onChange={e => setTestSpecimenId(e.target.value)}>
            <option value="">{t('casePoolAssignmentSection.testRouting.noneSpecimenOption')}</option>
            {specimenEntries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">{t('casePoolAssignmentSection.testRouting.specimenEntryHint')}</p>
        </div>
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">{t('casePoolAssignmentSection.testRouting.descriptionLabel')} <span className="ps-conf-label-opt">{t('casePoolAssignmentSection.testRouting.descriptionOptNote')}</span></label>
          <input className="ps-conf-input" value={testDescription} onChange={e => setTestDescription(e.target.value)} placeholder={t('casePoolAssignmentSection.testRouting.descriptionPlaceholder')} />
        </div>
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">{t('casePoolAssignmentSection.testRouting.asLabLabel')}</label>
          <select className="ps-conf-select" value={testLabId} onChange={e => setTestLabId(e.target.value)}>
            <option value="">{t('casePoolAssignmentSection.testRouting.globalOnlyOption')}</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      {testResult && (
        <p className="ps-conf-section-subtitle">
          {testResult.matched
            ? <Trans
                i18nKey="casePoolAssignmentSection.testRouting.matchedResult"
                values={{
                  pool: poolName(testResult.subspecialtyId!),
                  via: testResult.rule?.mappedSpecimenTypeIds?.length
                    ? t('casePoolAssignmentSection.testRouting.viaMappedSpecimen')
                    : t('casePoolAssignmentSection.testRouting.viaKeyword', { keywords: testResult.rule?.keywords.join(', ') }),
                  lab: labName(testResult.rule?.performingLabFacilityId),
                }}
                components={{ poolSpan: <span className="ps-conf-identity-name" /> }}
              />
            : t('casePoolAssignmentSection.testRouting.noMatchResult')}
        </p>
      )}

      {/* Run routing now */}
      <div className="ps-conf-section-header">
        <h3 className="ps-conf-section-title">{t('casePoolAssignmentSection.manualRun.title')}</h3>
      </div>
      <p className="ps-conf-section-subtitle">
        {t('casePoolAssignmentSection.manualRun.subtitle')}
      </p>
      <button onClick={handleRunNow} disabled={running} className="ps-conf-btn-teal-accent">
        {running ? `⏳ ${t('casePoolAssignmentSection.manualRun.runningBtn')}` : `▶ ${t('casePoolAssignmentSection.manualRun.runBtn')}`}
      </button>

      {runResults && (
        <div className="ps-conf-callout">
          <div className="ps-conf-callout-steps">
            <span>{t('casePoolAssignmentSection.manualRun.routedCount', { count: runResults.routed })}</span>{' · '}
            <span>{t('casePoolAssignmentSection.manualRun.skippedCount', { count: runResults.skipped })}</span>{' · '}
            <span>{t('casePoolAssignmentSection.manualRun.failedCount', { count: runResults.failed })}</span>
          </div>
          <div className="ps-conf-table-scroll">
            {runResults.results.map(({ caseId, result }) => (
              <div key={caseId} className="ps-conf-section-subtitle">
                {result.outcome.startsWith('routed') ? '✓' : '—'} <span data-phi="accession">{caseId}</span> — {result.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <RuleModal mode={modal.mode} rule={modal.rule} pools={pools} labs={labs} specimenEntries={specimenEntries}
          onSave={handleSaveRule} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default CasePoolAssignmentSection;
