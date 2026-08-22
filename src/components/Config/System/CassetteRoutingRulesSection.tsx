// src/components/Config/System/CassetteRoutingRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the "Cassette Colors Basic
// Routing Algorithm Flow" spec — the real, missing admin UI for the
// rule dictionary built in services/cassetteRouting/. Same real
// table+modal pattern as ScanStationsSection.tsx — not a new one
// invented for this.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockCassetteRoutingRuleService } from '../../../services/cassetteRouting/mockCassetteRoutingRuleService';
import { mockProtocolService } from '../../../services/protocols/mockProtocolService';
import { mockScanStationService } from '../../../services/scanStations/mockScanStationService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import type { CassetteRoutingRule, CassetteRuleOrderPriority } from '../../../services/cassetteRouting/ICassetteRoutingRuleService';
import type { Protocol } from '../../../services/protocols/IProtocolService';
import type { ScanStation } from '../../../services/scanStations/IScanStationService';
import type { Facility } from '../../../services/facilities/IFacilityService';

const PRIORITY_OPTIONS: CassetteRuleOrderPriority[] = ['Routine', 'Rush', 'STAT'];

// ─── Modal ────────────────────────────────────────────────────────────────────
type Draft = Omit<CassetteRoutingRule, 'id' | 'createdAt' | 'updatedAt'>;

const emptyDraft: Draft = {
  name: '', description: '', conditions: {}, cassetteColor: '', printTemplateKey: '',
  priorityWeight: 10, active: true,
};

interface RuleModalProps {
  mode: 'add' | 'edit';
  rule?: CassetteRoutingRule;
  protocols: Protocol[];
  stations: ScanStation[];
  facilities: Facility[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const RuleModal: React.FC<RuleModalProps> = ({ mode, rule, protocols, stations, facilities, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(rule ? { ...rule } : emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };
  const setCondition = (k: keyof Draft['conditions'], v: any) => setDraft(prev => ({ ...prev, conditions: { ...prev.conditions, [k]: v || undefined } }));

  const togglePriority = (p: CassetteRuleOrderPriority) => {
    const current = draft.conditions.priority ?? [];
    const next = current.includes(p) ? current.filter(x => x !== p) : [...current, p];
    setCondition('priority', next.length > 0 ? next : undefined);
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = 'Required';
    if (!draft.cassetteColor.trim()) e.cassetteColor = 'Required — the whole point of this rule is what color it routes to';
    if (!Number.isFinite(draft.priorityWeight)) e.priorityWeight = 'Required — determines which rule wins when more than one matches';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal" style={{ maxWidth: 560 }}>
        <div className="ps-ms-header">{mode === 'add' ? 'Add Cassette Routing Rule' : `Edit — ${rule?.name}`}</div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Rule Name <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. STAT Override" />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            <textarea className="ps-conf-input" rows={2} value={draft.description ?? ''} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="ps-conf-section-divider">Conditions — every set condition must match (unset = matches anything)</div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-protocol">Protocol</label>
            <select id="rule-protocol" className="ps-conf-select" value={draft.conditions.protocolId ?? ''} onChange={e => setCondition('protocolId', e.target.value)}>
              <option value="">— Any protocol —</option>
              {protocols.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="ps-conf-field-hint">Also the real source for cassette type/form factor — see this rule's own output below.</span>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Order Priority</label>
            <div className="ps-conf-toggle-row" style={{ gap: 14 }}>
              {PRIORITY_OPTIONS.map(p => (
                <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
                  <input type="checkbox" checked={(draft.conditions.priority ?? []).includes(p)} onChange={() => togglePriority(p)} />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-station">Origin Station</label>
            <select id="rule-station" className="ps-conf-select" value={draft.conditions.originStationId ?? ''} onChange={e => setCondition('originStationId', e.target.value)}>
              <option value="">— Any station —</option>
              {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-facility">Ordering Facility</label>
            <select id="rule-facility" className="ps-conf-select" value={draft.conditions.orderingFacilityId ?? ''} onChange={e => setCondition('orderingFacilityId', e.target.value)}>
              <option value="">— Any facility —</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Case Type</label>
            <input className="ps-conf-input" value={draft.conditions.caseType ?? ''} onChange={e => setCondition('caseType', e.target.value)} placeholder="e.g. Consultation, Reference Lab" />
          </div>

          <div className="ps-conf-section-divider">Output</div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Cassette Color <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.cassetteColor ? 'ps-conf-input--error' : ''}`}
              value={draft.cassetteColor} onChange={e => set('cassetteColor', e.target.value)} placeholder="e.g. Blue, Pink, Red, White" />
            {errors.cassetteColor && <span className="ps-conf-error-text">{errors.cassetteColor}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Print Template Key</label>
            <input className="ps-conf-input" value={draft.printTemplateKey ?? ''} onChange={e => set('printTemplateKey', e.target.value)} placeholder="Optional" />
          </div>

          <div className="ps-conf-section-divider">Rule Metadata</div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Priority Weight (1–100, higher wins) <span className="ps-conf-required">*</span></label>
            <input type="number" min={1} max={100} className={`ps-conf-input ${errors.priorityWeight ? 'ps-conf-input--error' : ''}`}
              value={draft.priorityWeight} onChange={e => set('priorityWeight', parseInt(e.target.value, 10))} />
            {errors.priorityWeight && <span className="ps-conf-error-text">{errors.priorityWeight}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Effective From</label>
            <input type="date" className="ps-conf-input" value={draft.effectiveFrom?.slice(0, 10) ?? ''} onChange={e => set('effectiveFrom', e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Effective To</label>
            <input type="date" className="ps-conf-input" value={draft.effectiveTo?.slice(0, 10) ?? ''} onChange={e => set('effectiveTo', e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
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
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? 'Add Rule' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Main section ────────────────────────────────────────────────────────────
const CassetteRoutingRulesSection: React.FC = () => {
  const [rules, setRules]     = useState<CassetteRoutingRule[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stations, setStations]   = useState<ScanStation[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<{ mode: 'add' | 'edit'; rule?: CassetteRoutingRule } | null>(null);

  useEffect(() => {
    Promise.all([
      mockCassetteRoutingRuleService.getAll(),
      mockProtocolService.getAll(),
      mockScanStationService.getAll(),
      mockFacilityService.getAll(),
    ]).then(([r, p, s, f]) => {
      if (r.ok) setRules(r.data);
      if (p.ok) setProtocols(p.data);
      if (s.ok) setStations(s.data);
      if (f.ok) setFacilities(f.data);
      setLoading(false);
    });
  }, []);

  const protocolName = (id?: string) => protocols.find(p => p.id === id)?.name ?? '—';
  const stationName = (id?: string) => stations.find(s => s.id === id)?.name ?? '—';
  const facilityName = (id?: string) => facilities.find(f => f.id === id)?.name ?? '—';

  const conditionsSummary = (rule: CassetteRoutingRule): string => {
    const parts: string[] = [];
    if (rule.conditions.protocolId) parts.push(`Protocol: ${protocolName(rule.conditions.protocolId)}`);
    if (rule.conditions.priority?.length) parts.push(`Priority: ${rule.conditions.priority.join(', ')}`);
    if (rule.conditions.originStationId) parts.push(`Station: ${stationName(rule.conditions.originStationId)}`);
    if (rule.conditions.orderingFacilityId) parts.push(`Facility: ${facilityName(rule.conditions.orderingFacilityId)}`);
    if (rule.conditions.caseType) parts.push(`Case type: ${rule.conditions.caseType}`);
    return parts.length > 0 ? parts.join(' · ') : 'Any (catch-all)';
  };

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'add') {
      const res = await mockCassetteRoutingRuleService.create(draft);
      if (res.ok) setRules(prev => [...prev, res.data]);
    } else if (modal?.rule) {
      const res = await mockCassetteRoutingRuleService.update(modal.rule.id, draft);
      if (res.ok) setRules(prev => prev.map(r => r.id === res.data.id ? res.data : r));
    }
    setModal(null);
  };

  const handleToggleStatus = async (rule: CassetteRoutingRule) => {
    const res = rule.active ? await mockCassetteRoutingRuleService.deactivate(rule.id) : await mockCassetteRoutingRuleService.reactivate(rule.id);
    if (res.ok) setRules(prev => prev.map(r => r.id === rule.id ? res.data : r));
  };

  if (loading) return <div className="ps-conf-loading">Loading cassette routing rules...</div>;

  const sorted = [...rules].sort((a, b) => b.priorityWeight - a.priorityWeight);

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Cassette Routing Rules</h3>
          <p className="ps-conf-section-subtitle">
            Determines cassette color for an order based on protocol, priority, origin station, and ordering facility.
            Cassette type/form factor always comes from the matched protocol's own processing format — never set
            separately here, so it can never drift from the real protocol definition. Higher priority weight wins
            when more than one rule genuinely matches the same order.
          </p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Rule</button>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {['Weight', 'Rule', 'Conditions', 'Color', 'Status', 'Actions'].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(rule => (
                <tr key={rule.id} className="ps-conf-tr">
                  <td className="ps-conf-td"><code>{rule.priorityWeight}</code></td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name">{rule.name}</div>
                    {rule.description && <div className="ps-conf-field-hint">{rule.description}</div>}
                  </td>
                  <td className="ps-conf-td" style={{ fontSize: 12, color: '#94a3b8' }}>{conditionsSummary(rule)}</td>
                  <td className="ps-conf-td">{rule.cassetteColor}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${rule.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${rule.active ? 'ps-conf-status-text--active' : ''}`}>{rule.active ? 'Active' : 'Inactive'}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', rule })}>Edit</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(rule)}>{rule.active ? 'Deactivate' : 'Reactivate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>No cassette routing rules configured yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <RuleModal
          mode={modal.mode} rule={modal.rule}
          protocols={protocols} stations={stations} facilities={facilities}
          onSave={handleSave} onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default CassetteRoutingRulesSection;
