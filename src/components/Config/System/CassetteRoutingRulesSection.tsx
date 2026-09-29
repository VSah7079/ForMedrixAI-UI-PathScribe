// src/components/Config/System/CassetteRoutingRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the "Cassette Colors Basic
// Routing Algorithm Flow" spec — the real, missing admin UI for the
// rule dictionary built in services/cassetteRouting/. Same real
// table+modal pattern as ScanStationsSection.tsx — not a new one
// invented for this.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCassetteRoutingRuleService } from '../../../services/cassetteRouting/mockCassetteRoutingRuleService';
import { mockProtocolService } from '../../../services/protocols/mockProtocolService';
import { mockScanStationService } from '../../../services/scanStations/mockScanStationService';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import { mockCassetteColorService } from '../../../services/cassetteColors/mockCassetteColorService';
import type { CassetteRoutingRule, CassetteRuleOrderPriority } from '../../../services/cassetteRouting/ICassetteRoutingRuleService';
import { duplicateCassetteRoutingRule } from '@/services/duplication/duplicateEntities';
import type { Protocol } from '../../../services/protocols/IProtocolService';
import type { ScanStation } from '../../../services/scanStations/IScanStationService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import type { CassetteColorDefinition } from '../../../services/cassetteColors/ICassetteColorService';

const PRIORITY_OPTIONS: CassetteRuleOrderPriority[] = ['Routine', 'Rush', 'STAT'];

const PRIORITY_LABEL_KEY: Record<CassetteRuleOrderPriority, string> = {
  Routine: 'cassetteRoutingRulesSection.priorityLabels.routine',
  Rush: 'cassetteRoutingRulesSection.priorityLabels.rush',
  STAT: 'cassetteRoutingRulesSection.priorityLabels.stat',
};

// ─── Modal ────────────────────────────────────────────────────────────────────
type Draft = Omit<CassetteRoutingRule, 'id' | 'createdAt' | 'updatedAt'>;

// Real, per direct fix: CassetteRoutingRule.colorId (a real reference
// into the real color dictionary, services/cassetteColors/) replaced
// the old free-text cassetteColor — this component's own Draft/UI
// never got updated to match at the time, which is the real, direct
// cause of every real TS error reported on this file. Fixed here:
// colorId throughout, and a real dropdown sourced from the actual
// color dictionary instead of a free-text input a rule could
// misspell independently of the real, defined color set.
const emptyDraft: Draft = {
  name: '', description: '', conditions: {}, colorId: '', printTemplateKey: '',
  priorityWeight: 10, active: true,
};

interface RuleModalProps {
  mode: 'add' | 'edit';
  rule?: CassetteRoutingRule;
  protocols: Protocol[];
  stations: ScanStation[];
  facilities: Facility[];
  colors: CassetteColorDefinition[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const RuleModal: React.FC<RuleModalProps> = ({ mode, rule, protocols, stations, facilities, colors, onSave, onClose }) => {
  const { t } = useTranslation();
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
    if (!draft.name.trim()) e.name = t('common.required');
    if (!draft.colorId.trim()) e.colorId = t('cassetteRoutingRulesSection.modal.errors.colorRequired');
    if (!Number.isFinite(draft.priorityWeight)) e.priorityWeight = t('cassetteRoutingRulesSection.modal.errors.priorityWeightRequired');
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--medium">
        <div className="ps-ms-header">
          {mode === 'add' ? t('cassetteRoutingRulesSection.modal.addTitle') : t('cassetteRoutingRulesSection.modal.editTitle', { name: rule?.name })}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.nameLabel')} <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder={t('cassetteRoutingRulesSection.modal.namePlaceholder')} />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.descriptionLabel')}</label>
            <textarea className="ps-conf-input" rows={2} value={draft.description ?? ''} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="ps-conf-section-divider">{t('cassetteRoutingRulesSection.modal.conditionsDivider')}</div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-protocol">{t('cassetteRoutingRulesSection.modal.protocolLabel')}</label>
            <select id="rule-protocol" className="ps-conf-select" value={draft.conditions.protocolId ?? ''} onChange={e => setCondition('protocolId', e.target.value)}>
              <option value="">{t('cassetteRoutingRulesSection.modal.protocolPlaceholder')}</option>
              {protocols.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="ps-conf-field-hint">{t('cassetteRoutingRulesSection.modal.protocolHint')}</span>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.orderPriorityLabel')}</label>
            <div className="ps-conf-toggle-row ps-conf-toggle-row--gap14">
              {PRIORITY_OPTIONS.map(p => (
                <label key={p} className="ps-cassrr-priority-label">
                  <input type="checkbox" checked={(draft.conditions.priority ?? []).includes(p)} onChange={() => togglePriority(p)} />
                  {t(PRIORITY_LABEL_KEY[p])}
                </label>
              ))}
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-station">{t('cassetteRoutingRulesSection.modal.originStationLabel')}</label>
            <select id="rule-station" className="ps-conf-select" value={draft.conditions.originStationId ?? ''} onChange={e => setCondition('originStationId', e.target.value)}>
              <option value="">{t('cassetteRoutingRulesSection.modal.originStationPlaceholder')}</option>
              {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-facility">{t('cassetteRoutingRulesSection.modal.orderingFacilityLabel')}</label>
            <select id="rule-facility" className="ps-conf-select" value={draft.conditions.orderingFacilityId ?? ''} onChange={e => setCondition('orderingFacilityId', e.target.value)}>
              <option value="">{t('cassetteRoutingRulesSection.modal.orderingFacilityPlaceholder')}</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.caseTypeLabel')}</label>
            <input className="ps-conf-input" value={draft.conditions.caseType ?? ''} onChange={e => setCondition('caseType', e.target.value)} placeholder={t('cassetteRoutingRulesSection.modal.caseTypePlaceholder')} />
          </div>

          <div className="ps-conf-section-divider">{t('cassetteRoutingRulesSection.modal.outputDivider')}</div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="rule-color">{t('cassetteRoutingRulesSection.modal.cassetteColorLabel')} <span className="ps-conf-required">*</span></label>
            <select id="rule-color" className={`ps-conf-select ${errors.colorId ? 'ps-conf-input--error' : ''}`}
              value={draft.colorId} onChange={e => set('colorId', e.target.value)}>
              <option value="">{t('cassetteRoutingRulesSection.modal.selectColorPlaceholder')}</option>
              {colors.map(c => <option key={c.id} value={c.id}>{c.displayName}{!c.active ? t('cassetteRoutingRulesSection.modal.inactiveColorSuffix') : ''}</option>)}
            </select>
            {draft.colorId && colors.find(c => c.id === draft.colorId) && (
              <span className="ps-conf-field-hint ps-cassrr-color-hint">
                <span className="ps-cassrr-color-swatch" style={{ '--swatch-hex': colors.find(c => c.id === draft.colorId)!.hexCode } as React.CSSProperties} />
                {colors.find(c => c.id === draft.colorId)!.key}
              </span>
            )}
            {errors.colorId && <span className="ps-conf-error-text">{errors.colorId}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.printTemplateKeyLabel')}</label>
            <input className="ps-conf-input" value={draft.printTemplateKey ?? ''} onChange={e => set('printTemplateKey', e.target.value)} placeholder={t('cassetteRoutingRulesSection.modal.printTemplateKeyPlaceholder')} />
          </div>

          <div className="ps-conf-section-divider">{t('cassetteRoutingRulesSection.modal.metadataDivider')}</div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.priorityWeightLabel')} <span className="ps-conf-required">*</span></label>
            <input type="number" min={1} max={100} className={`ps-conf-input ${errors.priorityWeight ? 'ps-conf-input--error' : ''}`}
              value={draft.priorityWeight} onChange={e => set('priorityWeight', parseInt(e.target.value, 10))} />
            {errors.priorityWeight && <span className="ps-conf-error-text">{errors.priorityWeight}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.effectiveFromLabel')}</label>
            <input type="date" className="ps-conf-input" value={draft.effectiveFrom?.slice(0, 10) ?? ''} onChange={e => set('effectiveFrom', e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.effectiveToLabel')}</label>
            <input type="date" className="ps-conf-input" value={draft.effectiveTo?.slice(0, 10) ?? ''} onChange={e => set('effectiveTo', e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteRoutingRulesSection.modal.statusLabel')}</label>
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
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? t('cassetteRoutingRulesSection.modal.addButton') : t('cassetteRoutingRulesSection.modal.saveChangesButton')}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Main section ────────────────────────────────────────────────────────────
const CassetteRoutingRulesSection: React.FC = () => {
  const { t } = useTranslation();
  const [rules, setRules]     = useState<CassetteRoutingRule[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stations, setStations]   = useState<ScanStation[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [colors, setColors] = useState<CassetteColorDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<{ mode: 'add' | 'edit'; rule?: CassetteRoutingRule } | null>(null);

  useEffect(() => {
    Promise.all([
      mockCassetteRoutingRuleService.getAll(),
      mockProtocolService.getAll(),
      mockScanStationService.getAll(),
      mockFacilityService.getAll(),
      mockCassetteColorService.getAll(),
    ]).then(([r, p, s, f, c]) => {
      if (r.ok) setRules(r.data);
      if (p.ok) setProtocols(p.data);
      if (s.ok) setStations(s.data);
      if (f.ok) setFacilities(f.data);
      if (c.ok) setColors(c.data);
      setLoading(false);
    });
  }, []);

  const protocolName = (id?: string) => protocols.find(p => p.id === id)?.name ?? '—';
  const stationName = (id?: string) => stations.find(s => s.id === id)?.name ?? '—';
  const facilityName = (id?: string) => facilities.find(f => f.id === id)?.name ?? '—';
  const colorFor = (id: string) => colors.find(c => c.id === id);

  const conditionsSummary = (rule: CassetteRoutingRule): string => {
    const parts: string[] = [];
    if (rule.conditions.protocolId) parts.push(t('cassetteRoutingRulesSection.conditionsSummary.protocol', { name: protocolName(rule.conditions.protocolId) }));
    if (rule.conditions.priority?.length) parts.push(t('cassetteRoutingRulesSection.conditionsSummary.priority', { list: rule.conditions.priority.map(p => t(PRIORITY_LABEL_KEY[p])).join(', ') }));
    if (rule.conditions.originStationId) parts.push(t('cassetteRoutingRulesSection.conditionsSummary.station', { name: stationName(rule.conditions.originStationId) }));
    if (rule.conditions.orderingFacilityId) parts.push(t('cassetteRoutingRulesSection.conditionsSummary.facility', { name: facilityName(rule.conditions.orderingFacilityId) }));
    if (rule.conditions.caseType) parts.push(t('cassetteRoutingRulesSection.conditionsSummary.caseType', { type: rule.conditions.caseType }));
    return parts.length > 0 ? parts.join(' · ') : t('cassetteRoutingRulesSection.conditionsSummary.catchAll');
  };

  // Duplicate (PS-73): conditions deep-copied, and the copy starts inactive
  // so it can't route real cassettes until the admin has made the change it
  // was copied for (services/duplication/duplicateEntities.ts).
  const handleDuplicate = (source: CassetteRoutingRule) =>
    setModal({ mode: 'add', rule: duplicateCassetteRoutingRule(source, name => t('common.copyOfName', { name })) });

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

  if (loading) return <div className="ps-conf-loading">{t('cassetteRoutingRulesSection.loading')}</div>;

  const sorted = [...rules].sort((a, b) => b.priorityWeight - a.priorityWeight);

  const headers: Array<{ key: string; label: string }> = [
    { key: 'weight', label: t('cassetteRoutingRulesSection.table.headers.weight') },
    { key: 'rule', label: t('cassetteRoutingRulesSection.table.headers.rule') },
    { key: 'conditions', label: t('cassetteRoutingRulesSection.table.headers.conditions') },
    { key: 'color', label: t('cassetteRoutingRulesSection.table.headers.color') },
    { key: 'status', label: t('cassetteRoutingRulesSection.table.headers.status') },
    { key: 'actions', label: t('cassetteRoutingRulesSection.table.headers.actions') },
  ];

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('cassetteRoutingRulesSection.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('cassetteRoutingRulesSection.subtitle')}</p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>{t('cassetteRoutingRulesSection.addButton')}</button>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {headers.map(h => (
                  <th key={h.key} className="ps-conf-th">{h.label}</th>
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
                  <td className="ps-conf-td ps-cassrr-conditions-summary">{conditionsSummary(rule)}</td>
                  <td className="ps-conf-td">
                    {colorFor(rule.colorId) ? (
                      <span className="ps-cassrr-color-hint">
                        <span className="ps-cassrr-color-swatch" style={{ '--swatch-hex': colorFor(rule.colorId)!.hexCode } as React.CSSProperties} />
                        {colorFor(rule.colorId)!.displayName}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${rule.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${rule.active ? 'ps-conf-status-text--active' : ''}`}>{rule.active ? t('common.active') : t('common.inactive')}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', rule })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleDuplicate(rule)}>{t('common.duplicate')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(rule)}>{rule.active ? t('cassetteRoutingRulesSection.table.deactivateButton') : t('cassetteRoutingRulesSection.table.reactivateButton')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>{t('cassetteRoutingRulesSection.table.emptyState')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <RuleModal
          mode={modal.mode} rule={modal.rule}
          protocols={protocols} stations={stations} facilities={facilities} colors={colors}
          onSave={handleSave} onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default CassetteRoutingRulesSection;
