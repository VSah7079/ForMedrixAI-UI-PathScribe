// src/components/Config/System/AbnormalTriggerRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-129 (part of PS-105, Core Abnormal Detection Engine). Admin config
// for the AbnormalTriggerRule dictionary — same overall structure/CSS
// classes (ps-defic-*, ps-ms-*) as DeficienciesSection.tsx's own
// TypeDictionaryTab, since this is the same real pattern (an admin-
// curated, Global/scoped dictionary), just with rule-specific fields
// (fieldLabel, triggerValues, severity) rather than that component's
// generic name/level shape — not a direct reuse of that component,
// since the fields genuinely differ.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { abnormalTriggerRuleService } from '../../../services';
import { useSystemConfig } from '../../../contexts/SystemConfigContext';
import type { Facility } from '../../../services/facilities/IFacilityService';
import type { AbnormalTriggerRule, AbnormalSeverity } from '../../../services/abnormalDetection/IAbnormalTriggerRuleService';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { findDuplicate } from '../../../utils/validateUnique';

const SEVERITIES: AbnormalSeverity[] = ['Abnormal', 'Critical', 'Malignant'];

const AbnormalTriggerRulesSection: React.FC = () => {
  const { enterpriseConfig, updateEnterpriseConfig } = useSystemConfig();
  const enterpriseEnabled = enterpriseConfig.features.abnormalDetectionEnabled;
  const [items, setItems] = useState<AbnormalTriggerRule[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [labFilter, setLabFilter] = useState<'All' | 'Global' | string>('All');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: AbnormalTriggerRule } | null>(null);
  const [draft, setDraft] = useState<{ fieldLabel: string; triggerValues: string; severity: AbnormalSeverity; description: string; active: boolean; performingLabFacilityId: string }>({
    fieldLabel: '', triggerValues: '', severity: 'Abnormal', description: '', active: true, performingLabFacilityId: '',
  });
  const [fieldError, setFieldError] = useState('');

  const load = () => { abnormalTriggerRuleService.getAll().then(res => { if (res.ok) setItems(res.data); setLoading(false); }); };
  useEffect(load, []);
  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);

  useEffect(() => {
    if (modal?.mode === 'edit' && modal.item) {
      setDraft({
        fieldLabel: modal.item.fieldLabel, triggerValues: modal.item.triggerValues.join(', '),
        severity: modal.item.severity, description: modal.item.description ?? '',
        active: modal.item.status === 'Active', performingLabFacilityId: modal.item.performingLabFacilityId ?? '',
      });
    } else if (modal?.mode === 'add') {
      setDraft({ fieldLabel: '', triggerValues: '', severity: 'Abnormal', description: '', active: true, performingLabFacilityId: '' });
    }
    setFieldError('');
  }, [modal]);

  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : 'Global';

  const filteredItems = items.filter(item =>
    labFilter === 'All' || (labFilter === 'Global' ? !item.performingLabFacilityId : item.performingLabFacilityId === labFilter)
  );

  const handleSave = async () => {
    if (!draft.fieldLabel.trim()) { setFieldError('Field label is required'); return; }
    const triggerValues = draft.triggerValues.split(',').map(v => v.trim()).filter(Boolean);
    if (triggerValues.length === 0) { setFieldError('At least one trigger value is required'); return; }

    // Same real, scope-aware uniqueness check as DeficienciesSection.tsx's
    // own dictionaries — a collision only blocks the save within the
    // same scope (same lab, or both Global).
    const excludeId = modal?.mode === 'edit' ? modal.item?.id : undefined;
    const collision = findDuplicate(items, { performingLabFacilityId: draft.performingLabFacilityId || undefined, fieldLabel: draft.fieldLabel.trim() }, ['performingLabFacilityId', 'fieldLabel'], excludeId);
    if (collision) { setFieldError(`A rule for "${collision.fieldLabel}" already exists${draft.performingLabFacilityId ? ' for this performing lab' : ''}.`); return; }

    const payload = {
      fieldLabel: draft.fieldLabel.trim(), triggerValues, severity: draft.severity,
      description: draft.description.trim() || undefined,
      status: (draft.active ? 'Active' : 'Inactive') as 'Active' | 'Inactive',
      performingLabFacilityId: draft.performingLabFacilityId || undefined,
    };
    if (modal?.mode === 'add') {
      const res = await abnormalTriggerRuleService.add(payload);
      if (res.ok) setItems(prev => [...prev, res.data]);
    } else if (modal?.item) {
      const res = await abnormalTriggerRuleService.update(modal.item.id, payload);
      if (res.ok) setItems(prev => prev.map(i => i.id === res.data.id ? res.data : i));
    }
    setModal(null);
  };

  const handleToggleActive = async (item: AbnormalTriggerRule) => {
    const res = item.status === 'Active' ? await abnormalTriggerRuleService.deactivate(item.id) : await abnormalTriggerRuleService.reactivate(item.id);
    if (res.ok) setItems(prev => prev.map(i => i.id === item.id ? res.data : i));
  };

  const severityBadgeClass = (s: AbnormalSeverity) => s === 'Malignant' ? 'ps-defic-status-badge--inactive' : s === 'Critical' ? 'ps-defic-status-badge--inactive' : 'ps-defic-status-badge--active';

  if (loading) return <div className="ps-defic-loading">Loading trigger rules...</div>;

  return (
    <div className="ps-defic-section">
      <h3 className="ps-defic-title">Abnormal Detection — High-Risk Trigger Rules</h3>
      <p className="ps-defic-subtitle">
        Configure which synoptic field/value combinations flag a case as Abnormal, Critical, or Malignant.
        A match is always a suggestion the pathologist confirms or disputes at sign-out — never an automatic determination.
      </p>

      {/* Real, per direct guidance (PS-105): "If the enterprise level
          is disabled then the performing facility level is disabled
          and cannot be overridden." A genuine kill switch — turning
          this off here disables the entire Abnormal Detection
          capability everywhere, for every facility, regardless of any
          facility's own setting (FacilityEditorModal.tsx's own toggle
          becomes non-functional while this is off). */}
      <div style={{
        border: `1.5px solid ${enterpriseEnabled ? 'rgba(8,145,178,0.4)' : 'rgba(239,68,68,0.5)'}`,
        borderRadius: 8, padding: 14, marginBottom: 18,
        background: enterpriseEnabled ? 'rgba(8,145,178,0.06)' : 'rgba(239,68,68,0.08)',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enterpriseEnabled}
            onChange={e => updateEnterpriseConfig({ features: { ...enterpriseConfig.features, abnormalDetectionEnabled: e.target.checked } })}
            style={{ width: 16, height: 16, accentColor: '#0891b2', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Enabled enterprise-wide</span>
        </label>
        <div style={{ fontSize: 11, color: enterpriseEnabled ? '#94a3b8' : '#fca5a5', marginTop: 6 }}>
          {enterpriseEnabled
            ? 'The Abnormal Detection capability is available; each performing facility can still further restrict it for itself in Facility Configuration.'
            : 'Abnormal Detection is disabled for the entire enterprise. No performing facility can re-enable it for itself while this is off.'}
        </div>
      </div>

      <div className="ps-defic-tab-header">
        <p className="ps-defic-tab-desc">Manage the discrete high-risk trigger dictionary.</p>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Trigger Rule</button>
      </div>

      {labs.length > 0 && (
        <div className="ps-conf-form-row">
          <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
            <option value="All">All Labs</option>
            <option value="Global">Global only</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="ps-defic-table-wrap">
        <table className="ps-defic-table">
          <thead>
            <tr><th>Field Label</th><th>Trigger Value(s)</th><th>Severity</th><th>Description</th>{labs.length > 0 && <th>Performing Lab</th>}<th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id}>
                <td className="ps-defic-cell-name">{item.fieldLabel}</td>
                <td>{item.triggerValues.join(', ')}</td>
                <td><span className={`ps-defic-status-badge ${severityBadgeClass(item.severity)}`}>{item.severity}</span></td>
                <td className="ps-defic-cell-desc">{item.description || '—'}</td>
                {labs.length > 0 && <td>{labName(item.performingLabFacilityId)}</td>}
                <td>
                  <span className={`ps-defic-status-badge ${item.status === 'Active' ? 'ps-defic-status-badge--active' : 'ps-defic-status-badge--inactive'}`}>
                    {item.status}
                  </span>
                </td>
                <td>
                  <div className="ps-defic-row-actions">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', item })}>Edit</button>
                    <button className="ps-conf-btn-row" onClick={() => handleToggleActive(item)}>
                      {item.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr><td colSpan={(labs.length > 0 ? 1 : 0) + 6} className="ps-defic-empty">No trigger rules match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="ps-ms-overlay" onClick={() => setModal(null)}>
          <div className="ps-ms-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ms-header">{modal.mode === 'add' ? 'Add Trigger Rule' : 'Edit Trigger Rule'}</div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">Synoptic Field Label</label>
              <input className="ps-ms-input" value={draft.fieldLabel} onChange={e => setDraft(d => ({ ...d, fieldLabel: e.target.value }))} placeholder='e.g. "Margin Status"' />
            </div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">Trigger Value(s)</label>
              <input className="ps-ms-input" value={draft.triggerValues} onChange={e => setDraft(d => ({ ...d, triggerValues: e.target.value }))} placeholder='e.g. "Positive" — comma-separated for more than one' />
              {fieldError && <span className="ps-conf-error-text">{fieldError}</span>}
            </div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">Severity</label>
              <select className="ps-ms-select" value={draft.severity} onChange={e => setDraft(d => ({ ...d, severity: e.target.value as AbnormalSeverity }))}>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">Description</label>
              <textarea className="ps-ms-textarea" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Shown to the pathologist as the reasoning behind the suggestion" />
            </div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">Performing Lab</label>
              <select className="ps-ms-select" value={draft.performingLabFacilityId} onChange={e => setDraft(d => ({ ...d, performingLabFacilityId: e.target.value }))}>
                <option value="">— Global (every performing lab) —</option>
                {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="ps-ms-field-group">
              <label className="ps-ms-label">Status</label>
              <select className="ps-ms-select" value={draft.active ? 'active' : 'inactive'} onChange={e => setDraft(d => ({ ...d, active: e.target.value === 'active' }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="ps-ms-footer">
              <button className="ps-ms-btn-cancel" onClick={() => setModal(null)}>Cancel</button>
              <button className="ps-ms-btn-apply" onClick={handleSave}>{modal.mode === 'add' ? 'Add' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AbnormalTriggerRulesSection;
