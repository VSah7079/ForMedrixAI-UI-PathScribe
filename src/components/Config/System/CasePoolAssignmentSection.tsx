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
import { mockCaseService } from '../../../services/cases/mockCaseService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { prepareDuplicate } from '../../../utils/duplicateEntry';

// ─── Routing logic explainer ──────────────────────────────────────────────────

const ROUTING_STEPS: { step: string; label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }[] = [
  { step: '1', label: 'Case arrives via HL7 or LIS', tone: 'neutral' },
  { step: '2', label: 'PathScribe checks for a direct LIS assignment', tone: 'neutral' },
  { step: '3', label: 'Assignment found → assigned directly to pathologist', tone: 'good' },
  { step: '4', label: 'No assignment → match specimen type against this lab\u2019s own rules, then Global rules', tone: 'warn' },
  { step: '5', label: 'Match found → routed to that pool', tone: 'good' },
  { step: '6', label: 'No match → routed to this lab\u2019s fallback pool, or the Global fallback', tone: 'warn' },
  { step: '7', label: 'No fallback configured → flagged for manual assignment', tone: 'bad' },
];

const RoutingDiagram: React.FC = () => (
  <div className="ps-conf-callout">
    <div className="ps-conf-callout-title">How routing works</div>
    <div className="ps-conf-callout-steps">
      {ROUTING_STEPS.map(({ step, label, tone }) => (
        <div key={step} className="ps-conf-callout-step">
          <span className="ps-conf-callout-step-num">{step}</span>
          <span className={`ps-conf-callout-step-label ps-conf-callout-step-label--${tone}`}>{label}</span>
        </div>
      ))}
    </div>
  </div>
);

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
    if (keywords.length === 0 && mappedIds.length === 0) e.keywordsText = 'At least one mapped specimen type or keyword is required.';
    if (!draft.subspecialtyId) e.subspecialtyId = 'A destination pool is required.';
    if (!draft.priority || draft.priority < 1) e.priority = 'Priority must be a positive number.';
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
          {mode === 'edit' ? `Edit Routing Rule${rule.builtIn ? ' (built-in)' : ''}` : 'Add Routing Rule'}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Mapped Specimen Types</label>
            <input className="ps-conf-search" placeholder="Search Specimen Dictionary..." value={specimenSearch} onChange={e => setSpecimenSearch(e.target.value)} />
            <div className="ps-conf-table-scroll" style={{ maxHeight: 160, marginTop: 8 }}>
              {filteredSpecimenEntries.length === 0
                ? <p className="ps-conf-section-subtitle">No specimen dictionary entries match.</p>
                : filteredSpecimenEntries.map(s => (
                    <label key={s.id} className="ps-conf-label" style={{ display: 'block' }}>
                      <input type="checkbox" checked={mappedIds.includes(s.id)} onChange={() => toggleSpecimen(s.id)} /> {' '}{s.name}
                    </label>
                  ))}
            </div>
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              The real, deterministic match — a specimen entered via the Specimen Dictionary picker is matched by
              this id directly, per FEAT-ROUT-01. {mappedIds.length} selected.
            </p>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Keyword Fallback <span className="ps-conf-label-opt">(optional)</span></label>
            <textarea className={`ps-conf-input ps-conf-textarea ${errors.keywordsText ? 'ps-conf-input--error' : ''}`}
              value={draft.keywordsText} onChange={e => set('keywordsText', e.target.value)}
              placeholder="colon, colorectal, sigmoid, rectum..." />
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              Comma-separated. Only ever consulted for a specimen with no Specimen Dictionary entry — a manual or legacy entry with no structured id to match on.
            </p>
            {errors.keywordsText && <span className="ps-conf-error-text">{errors.keywordsText}</span>}
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="rule-pool">Destination Pool <span className="ps-conf-required">*</span></label>
              <select id="rule-pool" className={`ps-conf-select ${errors.subspecialtyId ? 'ps-conf-input--error' : ''}`}
                value={draft.subspecialtyId} onChange={e => set('subspecialtyId', e.target.value)}>
                <option value="">— Select a pool —</option>
                {compatiblePools.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.performingLabFacilityId ? ` — ${labs.find(l => l.id === p.performingLabFacilityId)?.name ?? p.performingLabFacilityId}` : ' — Global'}
                  </option>
                ))}
              </select>
              {errors.subspecialtyId && <span className="ps-conf-error-text">{errors.subspecialtyId}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="rule-priority">Priority <span className="ps-conf-required">*</span></label>
              <input id="rule-priority" className={`ps-conf-input ${errors.priority ? 'ps-conf-input--error' : ''}`}
                type="number" min="1" value={draft.priority} onChange={e => set('priority', parseInt(e.target.value) || 0)} />
              {errors.priority && <span className="ps-conf-error-text">{errors.priority}</span>}
              <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">Lower checked first, within the same lab-specific/Global tier.</p>
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-lab">Performing Lab</label>
            <select id="rule-lab" className="ps-conf-select"
              value={draft.performingLabFacilityId ?? ''}
              onChange={e => set('performingLabFacilityId', e.target.value || undefined)}>
              <option value="">— Global (checked for every lab) —</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              A lab-specific rule is checked before Global rules for that lab's own cases.
            </p>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Note</label>
            <input className="ps-conf-input" value={draft.note ?? ''} onChange={e => set('note', e.target.value)} placeholder="Admin notes" />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? 'Add Rule' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const CasePoolAssignmentSection: React.FC = () => {
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

  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : 'Global';
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

  // Real, per the same "duplicate, edit, save as new" pattern as
  // Container Types/Physicians — a fresh id and builtIn:false even
  // when cloning a built-in, since a duplicated rule is always a real,
  // separately-editable custom rule, never a second built-in.
  const handleDuplicateRule = (source: RoutingRule) => {
    const cloned: RoutingRule = { ...prepareDuplicate(source, 'note'), id: `rule-custom-${crypto.randomUUID()}`, builtIn: false };
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
      const cases = await mockCaseService.listCasesForUser('all');
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
          <h3 className="ps-conf-section-title">Case Routing</h3>
          <p className="ps-conf-section-subtitle">
            Configure how unassigned cases are automatically distributed to subspecialty pools when the LIS does
            not provide a pathologist assignment. Rules and the fallback pool can be Global or scoped to one
            performing lab — a lab-specific entry always wins over a Global one for that lab's own cases.
          </p>
        </div>
      </div>

      <RoutingDiagram />

      {/* Master toggles */}
      <div className="ps-conf-form-field">
        <label className="ps-conf-label">
          <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} />
          {' '}Automatic Pool Routing — when enabled, cases without a LIS assignment are routed automatically based on specimen type.
        </label>
      </div>
      <div className="ps-conf-form-field">
        <label className="ps-conf-label">
          <input type="checkbox" checked={config.statRoutesImmediately} onChange={e => setConfig(c => ({ ...c, statRoutesImmediately: e.target.checked }))} />
          {' '}STAT Cases Route Immediately — bypasses the assignment timeout below.
        </label>
      </div>

      <div className="ps-conf-form-row">
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">Assignment Timeout (seconds)</label>
          <input className="ps-conf-input" type="number" min={0} max={3600}
            value={config.assignmentTimeoutSec}
            onChange={e => setConfig(c => ({ ...c, assignmentTimeoutSec: parseInt(e.target.value) || 0 }))} />
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
            How long PathScribe waits for the LIS to provide an assignment before routing to a pool. 0 = route immediately.
          </p>
        </div>
      </div>

      {/* Fallback pool — Global + per-lab overrides */}
      <div className="ps-conf-section-header">
        <h3 className="ps-conf-section-title">Fallback Pool</h3>
      </div>
      <p className="ps-conf-section-subtitle">
        Cases where no rule matches are sent here — typically a "General Pathology" pool. A pool tagged
        Default/Catch-All in Subspecialties config (per lab, or Global) takes precedence; the overrides below are
        a secondary, manual fallback for a lab that hasn't tagged one yet.
      </p>

      {pools.length === 0 ? (
        <p className="ps-conf-error-text">
          No active pools found. Go to System → Subspecialties and enable "Pool / Workgroup" mode on at least one subspecialty.
        </p>
      ) : (
        <>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Global Fallback Pool</label>
              <select className="ps-conf-select" value={config.fallbackPoolId}
                onChange={e => {
                  const pool = pools.find(p => p.id === e.target.value);
                  setConfig(c => ({ ...c, fallbackPoolId: e.target.value, fallbackPoolName: pool?.name ?? e.target.value }));
                }}>
                <option value="">— None (manual assignment required) —</option>
                {pools.filter(p => !p.performingLabFacilityId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {labs.length > 0 && (
            <div className="ps-conf-table-wrap">
              <table className="ps-conf-table">
                <thead>
                  <tr><th className="ps-conf-th">Performing Lab</th><th className="ps-conf-th">Fallback Pool Override</th></tr>
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
                            <option value="">— Use Global default —</option>
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
          {saved ? '✓ Saved' : 'Save Routing Config'}
        </button>
      </div>

      {/* Routing Rules table */}
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Routing Rules</h3>
          <p className="ps-conf-section-subtitle">
            Keyword rules matched against each specimen's description, in priority order within each lab-specific/Global tier.
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={handleAddRule}>+ Add Rule</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder="Search by keyword or note..." value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
          <option value="All">All Labs</option>
          <option value="Global">Global only</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {['Priority', 'Match', 'Pool', 'Performing Lab', 'Status', 'Actions'].map(h => (
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
                        ? `${r.mappedSpecimenTypeIds.length} specimen type${r.mappedSpecimenTypeIds.length !== 1 ? 's' : ''}`
                        : (r.keywords.slice(0, 4).join(', ') + (r.keywords.length > 4 ? `, +${r.keywords.length - 4} more` : ''))}
                      {r.builtIn && <span className="ps-sub-system-badge" title="Ships with PathScribe — can be deactivated but not deleted">BUILT-IN</span>}
                    </div>
                    {r.note && <div className="ps-conf-identity-sub">{r.note}</div>}
                  </td>
                  <td className="ps-conf-td">{poolName(r.subspecialtyId)}</td>
                  <td className="ps-conf-td">{labName(r.performingLabFacilityId)}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${r.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${r.active ? 'ps-conf-status-text--active' : ''}`}>{r.active ? 'Active' : 'Inactive'}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', rule: r })}>Edit</button>
                      <button className="ps-conf-btn-row" onClick={() => handleDuplicateRule(r)}>Duplicate</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleActive(r)}>
                        {r.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRules.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>No routing rules match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test routing preview */}
      <div className="ps-conf-section-header">
        <h3 className="ps-conf-section-title">Test Routing</h3>
      </div>
      <div className="ps-conf-form-row">
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">Specimen Dictionary Entry</label>
          <select className="ps-conf-select" value={testSpecimenId} onChange={e => setTestSpecimenId(e.target.value)}>
            <option value="">— None (test the keyword fallback instead) —</option>
            {specimenEntries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">Exercises the real, deterministic composite-key match.</p>
        </div>
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">Specimen Description <span className="ps-conf-label-opt">(keyword fallback only)</span></label>
          <input className="ps-conf-input" value={testDescription} onChange={e => setTestDescription(e.target.value)} placeholder="e.g. right colon, sigmoid resection" />
        </div>
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">As Performing Lab</label>
          <select className="ps-conf-select" value={testLabId} onChange={e => setTestLabId(e.target.value)}>
            <option value="">— Global only —</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      {testResult && (
        <p className="ps-conf-section-subtitle">
          {testResult.matched
            ? <>Would route to <span className="ps-conf-identity-name">{poolName(testResult.subspecialtyId!)}</span> via {testResult.rule?.mappedSpecimenTypeIds?.length ? 'a mapped specimen type' : `keyword "${testResult.rule?.keywords.join(', ')}"`} rule ({labName(testResult.rule?.performingLabFacilityId)}).</>
            : 'No rule matches — would fall through to the fallback pool.'}
        </p>
      )}

      {/* Run routing now */}
      <div className="ps-conf-section-header">
        <h3 className="ps-conf-section-title">Manual Routing Run</h3>
      </div>
      <p className="ps-conf-section-subtitle">
        Immediately route all unassigned cases to their appropriate pools. Useful after changing routing
        configuration or when recovering from a LIS outage.
      </p>
      <button onClick={handleRunNow} disabled={running} className="ps-conf-btn-teal-accent">
        {running ? '⏳ Running…' : '▶ Route Unassigned Cases Now'}
      </button>

      {runResults && (
        <div className="ps-conf-callout">
          <div className="ps-conf-callout-steps">
            <span>Routed: {runResults.routed}</span>{' · '}
            <span>Skipped: {runResults.skipped}</span>{' · '}
            <span>Failed: {runResults.failed}</span>
          </div>
          <div className="ps-conf-table-scroll">
            {runResults.results.map(({ caseId, result }) => (
              <div key={caseId} className="ps-conf-section-subtitle">
                {result.outcome.startsWith('routed') ? '✓' : '—'} {caseId} — {result.reason}
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
