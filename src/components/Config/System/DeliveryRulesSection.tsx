// src/components/Config/System/DeliveryRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Let's create the UI now") — the real
// admin surface for Component C, the Delivery Configuration Rules
// Engine (services/delivery/). Mirrors RoutingRulesTab.tsx's own,
// proven three-part shape (rule table, add/edit modal, a live test
// panel) rather than inventing a new admin-UI pattern — the same real
// reasoning that shape already earned there applies here: an admin
// needs to see what's configured, change it safely, and verify a real
// case would resolve the way they expect before trusting it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import '../../../pathscribe.css';
import { mockDeliveryRuleService } from '../../../services/delivery/mockDeliveryRuleService';
import { resolveDeliveryAction } from '../../../services/delivery/resolveDeliveryAction';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import { mockPhysicianService } from '../../../services/physicians/mockPhysicianService';
import { mockLocationService } from '../../../services/locations/mockLocationService';
import type { DeliveryRule, DeliveryAction } from '../../../types/delivery/DeliveryRule';
import type { Facility } from '../../../services/facilities/IFacilityService';
import type { Physician } from '../../../services/physicians/IPhysicianService';

const ACTION_LABELS: Record<DeliveryAction, string> = {
  ELECTRONIC_ONLY: 'Electronic Only',
  PRINT_ONLY: 'Print Only',
  DUAL: 'Dual Delivery',
  SUPPRESS: 'Suppress (hold for manual retrieval)',
};
const ACTION_COLORS: Record<DeliveryAction, string> = {
  ELECTRONIC_ONLY: '#0891B2',
  PRINT_ONLY: '#c026d3',
  DUAL: '#059669',
  SUPPRESS: '#dc2626',
};
const REPORT_TYPE_LABELS: Record<string, string> = {
  PRELIMINARY: 'Preliminary', FINAL: 'Final', CORRECTED: 'Corrected', ADDENDUM: 'Addendum',
};

// ── Add/Edit Rule Modal ──────────────────────────────────────────────────────

const RuleModal: React.FC<{
  rule?: DeliveryRule;
  facilities: Facility[];
  physicians: Physician[];
  pointsOfCare: string[];
  onSave: (rule: Partial<DeliveryRule>) => void;
  onClose: () => void;
}> = ({ rule, facilities, physicians, pointsOfCare, onSave, onClose }) => {
  const [providerId, setProviderId] = useState(rule?.providerId ?? '');
  const [orderingFacilityId, setOrderingFacilityId] = useState(rule?.orderingFacilityId ?? '');
  const [pointOfCare, setPointOfCare] = useState(rule?.pointOfCare ?? '');
  const [reportType, setReportType] = useState(rule?.reportType ?? '');
  const [action, setAction] = useState<DeliveryAction>(rule?.action ?? 'ELECTRONIC_ONLY');
  const [note, setNote] = useState(rule?.note ?? '');

  const hasAnyCriterion = !!(providerId || orderingFacilityId || pointOfCare || reportType);

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-modal-dark--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">{rule ? 'Edit' : 'Add'} Delivery Rule</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>

        <div className="ps-modal-dark-body ps-rr-modal-body">
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px' }}>
            Every field below is optional — a rule matches only the criteria you set here, and the most
            specific real match (the rule matching the most fields) wins. Leave a field blank to match any value.
          </p>

          <div>
            <div className="ps-conf-label">Provider</div>
            <select className="ps-conf-select" aria-label="Provider" value={providerId} onChange={e => setProviderId(e.target.value)}>
              <option value="">— Any provider —</option>
              {physicians.map(p => <option key={p.id as string} value={p.id as string}>{p.lastName}, {p.firstName} — {p.specialty}</option>)}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">Ordering Facility</div>
            <select className="ps-conf-select" aria-label="Ordering Facility" value={orderingFacilityId} onChange={e => setOrderingFacilityId(e.target.value)}>
              <option value="">— Any facility —</option>
              {facilities.map(f => <option key={f.id as string} value={f.id as string}>{f.name} ({f.assigningAuthority})</option>)}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">Patient Location (Point of Care)</div>
            <select className="ps-conf-select" aria-label="Patient Location" value={pointOfCare} onChange={e => setPointOfCare(e.target.value)}>
              <option value="">— Any location —</option>
              {pointsOfCare.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">Report Type</div>
            <select className="ps-conf-select" aria-label="Report Type" value={reportType} onChange={e => setReportType(e.target.value)}>
              <option value="">— Any report type —</option>
              {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">Action *</div>
            <select className="ps-conf-select" aria-label="Action" value={action} onChange={e => setAction(e.target.value as DeliveryAction)}>
              {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">Note</div>
            <input className="ps-conf-input" placeholder="Why does this rule exist?" value={note} onChange={e => setNote(e.target.value)} />
          </div>

          {!hasAnyCriterion && (
            <p style={{ fontSize: 12, color: '#f59e0b', margin: '4px 0 0' }}>
              ⚠ No criteria set — this rule will match every case, but only ever as the lowest-priority match
              behind any more specific rule.
            </p>
          )}
        </div>

        <div className="ps-modal-dark-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="ps-conf-btn-primary"
            onClick={() => onSave({
              providerId: providerId || undefined,
              orderingFacilityId: orderingFacilityId || undefined,
              pointOfCare: pointOfCare || undefined,
              reportType: (reportType || undefined) as DeliveryRule['reportType'],
              action,
              note: note || undefined,
              active: rule?.active ?? true,
            })}
          >
            {rule ? 'Save Changes' : 'Add Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Test Panel ────────────────────────────────────────────────────────────────

const TestPanel: React.FC<{ rules: DeliveryRule[]; facilities: Facility[]; physicians: Physician[]; pointsOfCare: string[] }> =
  ({ rules, facilities, physicians, pointsOfCare }) => {
  const [providerId, setProviderId] = useState('');
  const [orderingFacilityId, setOrderingFacilityId] = useState('');
  const [pointOfCare, setPointOfCare] = useState('');
  const [reportType, setReportType] = useState('');
  const [result, setResult] = useState<{ action: DeliveryAction; matchedRuleId?: string } | null>(null);

  const test = () => {
    const activeRules = rules.filter(r => r.active);
    const resolved = resolveDeliveryAction({
      providerId: providerId || undefined,
      orderingFacilityId: orderingFacilityId || undefined,
      pointOfCare: pointOfCare || undefined,
      reportType: (reportType || undefined) as any,
    }, activeRules);
    setResult(resolved);
  };

  const matchedRule = result?.matchedRuleId ? rules.find(r => r.id === result.matchedRuleId) : undefined;

  return (
    <div className="ps-rr-test">
      <div className="ps-rr-test-title">🧪 Test Delivery Resolution</div>
      <div className="ps-rr-test-subtitle">Enter real case details to see which action would be selected and why.</div>

      <div className="ps-conf-label">Provider</div>
      <select className="ps-conf-select" value={providerId} onChange={e => setProviderId(e.target.value)}>
        <option value="">— Any —</option>
        {physicians.map(p => <option key={p.id as string} value={p.id as string}>{p.lastName}, {p.firstName}</option>)}
      </select>

      <div className="ps-conf-label">Ordering Facility</div>
      <select className="ps-conf-select" value={orderingFacilityId} onChange={e => setOrderingFacilityId(e.target.value)}>
        <option value="">— Any —</option>
        {facilities.map(f => <option key={f.id as string} value={f.id as string}>{f.name}</option>)}
      </select>

      <div className="ps-conf-label">Patient Location</div>
      <select className="ps-conf-select" value={pointOfCare} onChange={e => setPointOfCare(e.target.value)}>
        <option value="">— Any —</option>
        {pointsOfCare.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <div className="ps-conf-label">Report Type</div>
      <select className="ps-conf-select" value={reportType} onChange={e => setReportType(e.target.value)}>
        <option value="">— Any —</option>
        {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>

      <button className="ps-conf-btn-primary" style={{ marginTop: 12 }} onClick={test}>Resolve</button>

      {result && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Resolved action:</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: ACTION_COLORS[result.action] }}>{ACTION_LABELS[result.action]}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
            {matchedRule ? `Matched rule: ${matchedRule.note || matchedRule.id}` : 'No rule matched — this is the real, spec-stated default (Electronic Only) applied when nothing else qualifies.'}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

const DeliveryRulesSection: React.FC = () => {
  const [rules, setRules] = useState<DeliveryRule[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [pointsOfCare, setPointsOfCare] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ rule?: DeliveryRule } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, facilitiesRes, physiciansRes, locationsRes] = await Promise.all([
      mockDeliveryRuleService.getAll(),
      mockFacilityService.getAll(),
      mockPhysicianService.getAll(),
      mockLocationService.getAll(),
    ]);
    if (rulesRes.ok) setRules(rulesRes.data);
    if (facilitiesRes.ok) setFacilities((facilitiesRes.data as Facility[]).filter(f => f.status === 'Active'));
    if (physiciansRes.ok) setPhysicians((physiciansRes.data as Physician[]).filter(p => p.status === 'Active'));
    if (locationsRes.ok) {
      const distinct = Array.from(new Set(locationsRes.data.map(l => l.pointOfCare).filter(Boolean)));
      setPointsOfCare(distinct.sort());
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Partial<DeliveryRule>) => {
    if (modal?.rule) {
      await mockDeliveryRuleService.update(modal.rule.id, data);
    } else {
      await mockDeliveryRuleService.create(data as Omit<DeliveryRule, 'id' | 'createdAt' | 'updatedAt'>);
    }
    setModal(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await mockDeliveryRuleService.remove(id);
    load();
  };

  const handleToggle = async (rule: DeliveryRule) => {
    await mockDeliveryRuleService.update(rule.id, { active: !rule.active });
    load();
  };

  const describeCriteria = (rule: DeliveryRule): string => {
    const parts: string[] = [];
    if (rule.providerId) parts.push(`Provider: ${physicians.find(p => p.id === rule.providerId)?.lastName ?? rule.providerId}`);
    if (rule.orderingFacilityId) parts.push(`Facility: ${facilities.find(f => f.id === rule.orderingFacilityId)?.name ?? rule.orderingFacilityId}`);
    if (rule.pointOfCare) parts.push(`Location: ${rule.pointOfCare}`);
    if (rule.reportType) parts.push(`Report: ${REPORT_TYPE_LABELS[rule.reportType] ?? rule.reportType}`);
    return parts.length ? parts.join(' · ') : 'Matches every case (lowest priority)';
  };

  if (loading) return <div className="ps-conf-loading">Loading delivery rules…</div>;

  return (
    <div className="ps-rr-root">
      <div className="ps-rr-header">
        <div>
          <h2 className="tmpl-list-title">Delivery Configuration Rules</h2>
          <p className="tmpl-list-subtitle">
            Decide whether a released report is dispatched electronically, printed, both, or held for
            manual retrieval — by provider, ordering facility, patient location, and report type. The most
            specific real match wins; when nothing matches, delivery defaults to Electronic Only.
          </p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({})}>+ Add Rule</button>
      </div>

      <div className="ps-rr-layout">
        <div className="ps-rr-tables">
          <table className="ps-conf-table">
            <thead>
              <tr>
                <th>Criteria</th>
                <th>Action</th>
                <th>Note</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>No delivery rules configured yet — every case resolves to the real, spec-stated default (Electronic Only).</td></tr>
              )}
              {rules.map(rule => (
                <tr key={rule.id} style={{ opacity: rule.active ? 1 : 0.5 }}>
                  <td>{describeCriteria(rule)}</td>
                  <td><span style={{ color: ACTION_COLORS[rule.action], fontWeight: 600 }}>{ACTION_LABELS[rule.action]}</span></td>
                  <td>{rule.note ?? '—'}</td>
                  <td>
                    <button className="ps-rr-btn" onClick={() => handleToggle(rule)}>{rule.active ? 'Active' : 'Inactive'}</button>
                  </td>
                  <td>
                    <button className="ps-rr-btn" onClick={() => setModal({ rule })}>Edit</button>
                    <button className="ps-rr-btn ps-rr-btn--danger" onClick={() => handleDelete(rule.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <TestPanel rules={rules} facilities={facilities} physicians={physicians} pointsOfCare={pointsOfCare} />
      </div>

      {modal && (
        <RuleModal
          rule={modal.rule}
          facilities={facilities}
          physicians={physicians}
          pointsOfCare={pointsOfCare}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default DeliveryRulesSection;
