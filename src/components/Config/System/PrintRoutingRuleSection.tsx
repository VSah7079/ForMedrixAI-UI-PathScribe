// src/components/Config/System/PrintRoutingRuleSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-278/279 gap-closing follow-up ("PrintRoutingRule admin
// UI") — also closes PS-337's own tracked recurring gap for this one
// specific engine (Delivery Rules/Print Routing/Print Queue each
// lacked an admin UI; this closes the Print Routing one). Mirrors
// DeliveryRulesSection.tsx's own proven three-part shape (rule table,
// add/edit modal, a live test panel) rather than inventing a new
// admin-UI pattern — same real reasoning: an admin needs to see what's
// configured, change it safely, and verify a real job would resolve
// the way they expect before trusting it. Reuses every one of that
// component's own `.ps-rr-*`/`.ps-conf-*`/`.ps-modal-dark`/`.ps-overlay`
// CSS classes verbatim — confirmed directly against pathscribe.css
// before writing this that none of them are Delivery-Rules-specific in
// their actual styling (only naming), so this needs zero new CSS.
//
// Real, deliberate difference from DeliveryRulesSection.tsx:
// PrintRoutingRule has an outer SCOPE TIER (workstation → location →
// clientAccount → facility, §2.1.2's own strict precedence — see
// resolvePrintDestination.ts's own header) that DeliveryRule has no
// analog for at all, plus a real PrintDestination sub-object (network
// protocol/address) instead of a simple enum action. The scope-tier
// picker drives which real reference-data field appears for scopeId:
//   - 'workstation' → free-text. Confirmed directly before building
//     this: this app has no real workstation/scan-station dictionary
//     service (only ad hoc, per-mock-data IDs like
//     'ws-fgh-theatre2-01' — see mockPrintRoutingRuleService.ts's own
//     seed data) to populate a dropdown from, so forcing a `<select>`
//     here would mean inventing a fake, closed list — a free-text
//     field is the honest choice, not a fallback shortcut.
//   - 'location' → the same real, distinct `pointOfCare` list
//     DeliveryRulesSection.tsx already loads via mockLocationService.
//   - 'clientAccount'/'facility' → the same real Facility list
//     (mockFacilityService) — both are real Facility ids per
//     PrintRoutingRule.ts's own header (ordering vs. performing lab
//     respectively); this app has one real Facility entity, not two
//     separate dictionaries, so both tiers share the same list.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockPrintRoutingRuleService } from '../../../services/printRouting/mockPrintRoutingRuleService';
import { resolvePrintDestination } from '../../../services/printRouting/resolvePrintDestination';
import { mockFacilityService } from '../../../services/facilities/mockFacilityService';
import { mockLocationService } from '../../../services/locations/mockLocationService';
import type {
  PrintRoutingRule, PrintDestinationScopeType, SpecimenCaseType, EventTriggerType,
} from '../../../types/printRouting/PrintRoutingRule';
import type { PrintDestination, PrintProtocol } from '../../../types/printRouting/PrintDestination';
import type { Facility } from '../../../services/facilities/IFacilityService';

const SCOPE_TYPE_LABEL_KEY: Record<PrintDestinationScopeType, string> = {
  workstation: 'printRoutingRulesSection.scopeTypeLabels.workstation',
  location: 'printRoutingRulesSection.scopeTypeLabels.location',
  clientAccount: 'printRoutingRulesSection.scopeTypeLabels.clientAccount',
  facility: 'printRoutingRulesSection.scopeTypeLabels.facility',
};
const SPECIMEN_CASE_TYPE_LABEL_KEY: Record<SpecimenCaseType, string> = {
  FROZEN_SECTION: 'printRoutingRulesSection.specimenCaseTypeLabels.frozenSection',
  ROUTINE_SURGICAL: 'printRoutingRulesSection.specimenCaseTypeLabels.routineSurgical',
  CYTOLOGY: 'printRoutingRulesSection.specimenCaseTypeLabels.cytology',
};
const EVENT_TRIGGER_TYPE_LABEL_KEY: Record<EventTriggerType, string> = {
  INITIAL_SIGNOUT: 'printRoutingRulesSection.eventTriggerTypeLabels.initialSignout',
  PRELIMINARY: 'printRoutingRulesSection.eventTriggerTypeLabels.preliminary',
  AMENDED_SIGNOUT: 'printRoutingRulesSection.eventTriggerTypeLabels.amendedSignout',
};
const PROTOCOL_LABEL_KEY: Record<PrintProtocol, string> = {
  RAW_9100: 'printRoutingRulesSection.protocolLabels.raw9100',
  LPR_LPD: 'printRoutingRulesSection.protocolLabels.lprLpd',
  IPP: 'printRoutingRulesSection.protocolLabels.ipp',
};

type DestinationDraft = {
  protocol: PrintProtocol;
  ipAddress: string;
  port: string;
  queueName: string;
  resourcePath: string;
  displayName: string;
};

function destinationToDraft(d?: PrintDestination): DestinationDraft {
  return {
    protocol: d?.protocol ?? 'RAW_9100',
    ipAddress: d?.ipAddress ?? '',
    port: d?.port !== undefined ? String(d.port) : '',
    queueName: d?.queueName ?? '',
    resourcePath: d?.resourcePath ?? '',
    displayName: d?.displayName ?? '',
  };
}

function draftToDestination(draft: DestinationDraft): PrintDestination {
  return {
    protocol: draft.protocol,
    ipAddress: draft.ipAddress.trim(),
    port: draft.port.trim() ? Number(draft.port) : undefined,
    queueName: draft.protocol === 'LPR_LPD' ? (draft.queueName.trim() || undefined) : undefined,
    resourcePath: draft.protocol === 'IPP' ? (draft.resourcePath.trim() || undefined) : undefined,
    displayName: draft.displayName.trim() || undefined,
  };
}

// ── Add/Edit Rule Modal ──────────────────────────────────────────────────────

const RuleModal: React.FC<{
  rule?: PrintRoutingRule;
  facilities: Facility[];
  pointsOfCare: string[];
  onSave: (rule: Partial<PrintRoutingRule>) => void;
  onClose: () => void;
}> = ({ rule, facilities, pointsOfCare, onSave, onClose }) => {
  const { t } = useTranslation();
  const [scopeType, setScopeType] = useState<PrintDestinationScopeType>(rule?.scopeType ?? 'workstation');
  const [scopeId, setScopeId] = useState(rule?.scopeId ?? '');
  const [specimenCaseType, setSpecimenCaseType] = useState<SpecimenCaseType | ''>(rule?.specimenCaseType ?? '');
  const [eventTriggerType, setEventTriggerType] = useState<EventTriggerType | ''>(rule?.eventTriggerType ?? '');
  const [note, setNote] = useState(rule?.note ?? '');
  const [destination, setDestination] = useState<DestinationDraft>(destinationToDraft(rule?.printDestination));

  const scopeIdMissing = !scopeId.trim();
  const destinationMissing = !destination.ipAddress.trim();

  const handleScopeTypeChange = (next: PrintDestinationScopeType) => {
    setScopeType(next);
    setScopeId(''); // real, deliberate reset — a scopeId value from one tier's own vocabulary (a pointOfCare string, say) is never a valid value for another tier
  };

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-modal-dark--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">{rule ? t('printRoutingRulesSection.modal.editTitle') : t('printRoutingRulesSection.modal.addTitle')}</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>

        <div className="ps-modal-dark-body ps-rr-modal-body">
          <p className="ps-rr-modal-hint">{t('printRoutingRulesSection.modal.hint')}</p>

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.fields.scopeType')}</div>
            <select
              className="ps-conf-select"
              aria-label={t('printRoutingRulesSection.fields.scopeType')}
              value={scopeType}
              onChange={e => handleScopeTypeChange(e.target.value as PrintDestinationScopeType)}
            >
              {(Object.keys(SCOPE_TYPE_LABEL_KEY) as PrintDestinationScopeType[]).map(st => (
                <option key={st} value={st}>{t(SCOPE_TYPE_LABEL_KEY[st])}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.fields.scopeId')}</div>
            {scopeType === 'workstation' && (
              <input
                className="ps-conf-input"
                aria-label={t('printRoutingRulesSection.fields.scopeId')}
                placeholder={t('printRoutingRulesSection.modal.workstationIdPlaceholder')}
                value={scopeId}
                onChange={e => setScopeId(e.target.value)}
              />
            )}
            {scopeType === 'location' && (
              <select className="ps-conf-select" aria-label={t('printRoutingRulesSection.fields.scopeId')} value={scopeId} onChange={e => setScopeId(e.target.value)}>
                <option value="">{t('printRoutingRulesSection.modal.locationPlaceholder')}</option>
                {pointsOfCare.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {(scopeType === 'clientAccount' || scopeType === 'facility') && (
              <select className="ps-conf-select" aria-label={t('printRoutingRulesSection.fields.scopeId')} value={scopeId} onChange={e => setScopeId(e.target.value)}>
                <option value="">{t('printRoutingRulesSection.modal.facilityPlaceholder')}</option>
                {facilities.map(f => <option key={f.id as string} value={f.id as string}>{f.name}</option>)}
              </select>
            )}
            {scopeIdMissing && <p className="ps-rr-modal-warn">{t('printRoutingRulesSection.modal.missingScopeIdWarning')}</p>}
          </div>

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.fields.specimenCaseType')}</div>
            <select
              className="ps-conf-select"
              aria-label={t('printRoutingRulesSection.fields.specimenCaseType')}
              value={specimenCaseType}
              onChange={e => setSpecimenCaseType(e.target.value as SpecimenCaseType | '')}
            >
              <option value="">{t('printRoutingRulesSection.modal.specimenCaseTypePlaceholder')}</option>
              {(Object.keys(SPECIMEN_CASE_TYPE_LABEL_KEY) as SpecimenCaseType[]).map(sc => (
                <option key={sc} value={sc}>{t(SPECIMEN_CASE_TYPE_LABEL_KEY[sc])}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.fields.eventTriggerType')}</div>
            <select
              className="ps-conf-select"
              aria-label={t('printRoutingRulesSection.fields.eventTriggerType')}
              value={eventTriggerType}
              onChange={e => setEventTriggerType(e.target.value as EventTriggerType | '')}
            >
              <option value="">{t('printRoutingRulesSection.modal.eventTriggerTypePlaceholder')}</option>
              {(Object.keys(EVENT_TRIGGER_TYPE_LABEL_KEY) as EventTriggerType[]).map(et => (
                <option key={et} value={et}>{t(EVENT_TRIGGER_TYPE_LABEL_KEY[et])}</option>
              ))}
            </select>
          </div>

          <div className="ps-rr-section-title">{t('printRoutingRulesSection.modal.destinationSectionTitle')}</div>

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.modal.protocolLabel')}</div>
            <select
              className="ps-conf-select"
              aria-label={t('printRoutingRulesSection.modal.protocolLabel')}
              value={destination.protocol}
              onChange={e => setDestination({ ...destination, protocol: e.target.value as PrintProtocol })}
            >
              {(Object.keys(PROTOCOL_LABEL_KEY) as PrintProtocol[]).map(p => (
                <option key={p} value={p}>{t(PROTOCOL_LABEL_KEY[p])}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.modal.ipAddressLabel')}</div>
            <input
              className="ps-conf-input"
              aria-label={t('printRoutingRulesSection.modal.ipAddressLabel')}
              value={destination.ipAddress}
              onChange={e => setDestination({ ...destination, ipAddress: e.target.value })}
            />
          </div>

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.modal.portLabel')}</div>
            <input
              className="ps-conf-input"
              aria-label={t('printRoutingRulesSection.modal.portLabel')}
              placeholder={t('printRoutingRulesSection.modal.portPlaceholder')}
              value={destination.port}
              onChange={e => setDestination({ ...destination, port: e.target.value })}
            />
          </div>

          {destination.protocol === 'LPR_LPD' && (
            <div>
              <div className="ps-conf-label">{t('printRoutingRulesSection.modal.queueNameLabel')}</div>
              <input
                className="ps-conf-input"
                aria-label={t('printRoutingRulesSection.modal.queueNameLabel')}
                placeholder={t('printRoutingRulesSection.modal.queueNamePlaceholder')}
                value={destination.queueName}
                onChange={e => setDestination({ ...destination, queueName: e.target.value })}
              />
            </div>
          )}

          {destination.protocol === 'IPP' && (
            <div>
              <div className="ps-conf-label">{t('printRoutingRulesSection.modal.resourcePathLabel')}</div>
              <input
                className="ps-conf-input"
                aria-label={t('printRoutingRulesSection.modal.resourcePathLabel')}
                placeholder={t('printRoutingRulesSection.modal.resourcePathPlaceholder')}
                value={destination.resourcePath}
                onChange={e => setDestination({ ...destination, resourcePath: e.target.value })}
              />
            </div>
          )}

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.modal.displayNameLabel')}</div>
            <input
              className="ps-conf-input"
              aria-label={t('printRoutingRulesSection.modal.displayNameLabel')}
              placeholder={t('printRoutingRulesSection.modal.displayNamePlaceholder')}
              value={destination.displayName}
              onChange={e => setDestination({ ...destination, displayName: e.target.value })}
            />
          </div>

          {destinationMissing && <p className="ps-rr-modal-warn">{t('printRoutingRulesSection.modal.missingDestinationWarning')}</p>}

          <div>
            <div className="ps-conf-label">{t('printRoutingRulesSection.modal.noteLabel')}</div>
            <input className="ps-conf-input" placeholder={t('printRoutingRulesSection.modal.notePlaceholder')} value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>

        <div className="ps-modal-dark-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="ps-conf-btn-primary"
            disabled={scopeIdMissing || destinationMissing}
            onClick={() => onSave({
              scopeType,
              scopeId: scopeId.trim(),
              specimenCaseType: specimenCaseType || undefined,
              eventTriggerType: eventTriggerType || undefined,
              printDestination: draftToDestination(destination),
              note: note.trim() || undefined,
              active: rule?.active ?? true,
            })}
          >
            {rule ? t('printRoutingRulesSection.modal.saveChangesButton') : t('printRoutingRulesSection.modal.addRuleButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Test Panel ────────────────────────────────────────────────────────────────

const TestPanel: React.FC<{ rules: PrintRoutingRule[]; facilities: Facility[]; pointsOfCare: string[] }> =
  ({ rules, facilities, pointsOfCare }) => {
  const { t } = useTranslation();
  const [workstationId, setWorkstationId] = useState('');
  const [pointOfCare, setPointOfCare] = useState('');
  const [orderingFacilityId, setOrderingFacilityId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [specimenCaseType, setSpecimenCaseType] = useState<SpecimenCaseType | ''>('');
  const [eventTriggerType, setEventTriggerType] = useState<EventTriggerType | ''>('');
  const [result, setResult] = useState<{ destination?: PrintDestination; matchedRuleId?: string; matchedScopeType?: PrintDestinationScopeType } | null>(null);

  const test = () => {
    const activeRules = rules.filter(r => r.active);
    const resolved = resolvePrintDestination(activeRules, {
      workstationId: workstationId || undefined,
      pointOfCare: pointOfCare || undefined,
      orderingFacilityId: orderingFacilityId || undefined,
      facilityId: facilityId || undefined,
      specimenCaseType: specimenCaseType || undefined,
      eventTriggerType: eventTriggerType || undefined,
    });
    setResult(resolved);
  };

  const matchedRule = result?.matchedRuleId ? rules.find(r => r.id === result.matchedRuleId) : undefined;

  return (
    <div className="ps-rr-test">
      <div className="ps-rr-test-title">{t('printRoutingRulesSection.testPanel.title')}</div>
      <div className="ps-rr-test-subtitle">{t('printRoutingRulesSection.testPanel.subtitle')}</div>

      <div className="ps-conf-label">{t('printRoutingRulesSection.testPanel.workstationIdLabel')}</div>
      <input className="ps-conf-input" placeholder={t('printRoutingRulesSection.testPanel.anyPlaceholder')} value={workstationId} onChange={e => setWorkstationId(e.target.value)} />

      <div className="ps-conf-label">{t('printRoutingRulesSection.scopeTypeLabels.location')}</div>
      <select className="ps-conf-select" value={pointOfCare} onChange={e => setPointOfCare(e.target.value)}>
        <option value="">{t('printRoutingRulesSection.testPanel.anyPlaceholder')}</option>
        {pointsOfCare.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <div className="ps-conf-label">{t('printRoutingRulesSection.scopeTypeLabels.clientAccount')}</div>
      <select className="ps-conf-select" value={orderingFacilityId} onChange={e => setOrderingFacilityId(e.target.value)}>
        <option value="">{t('printRoutingRulesSection.testPanel.anyPlaceholder')}</option>
        {facilities.map(f => <option key={f.id as string} value={f.id as string}>{f.name}</option>)}
      </select>

      <div className="ps-conf-label">{t('printRoutingRulesSection.scopeTypeLabels.facility')}</div>
      <select className="ps-conf-select" value={facilityId} onChange={e => setFacilityId(e.target.value)}>
        <option value="">{t('printRoutingRulesSection.testPanel.anyPlaceholder')}</option>
        {facilities.map(f => <option key={f.id as string} value={f.id as string}>{f.name}</option>)}
      </select>

      <div className="ps-conf-label">{t('printRoutingRulesSection.fields.specimenCaseType')}</div>
      <select className="ps-conf-select" value={specimenCaseType} onChange={e => setSpecimenCaseType(e.target.value as SpecimenCaseType | '')}>
        <option value="">{t('printRoutingRulesSection.testPanel.anyPlaceholder')}</option>
        {(Object.keys(SPECIMEN_CASE_TYPE_LABEL_KEY) as SpecimenCaseType[]).map(sc => <option key={sc} value={sc}>{t(SPECIMEN_CASE_TYPE_LABEL_KEY[sc])}</option>)}
      </select>

      <div className="ps-conf-label">{t('printRoutingRulesSection.fields.eventTriggerType')}</div>
      <select className="ps-conf-select" value={eventTriggerType} onChange={e => setEventTriggerType(e.target.value as EventTriggerType | '')}>
        <option value="">{t('printRoutingRulesSection.testPanel.anyPlaceholder')}</option>
        {(Object.keys(EVENT_TRIGGER_TYPE_LABEL_KEY) as EventTriggerType[]).map(et => <option key={et} value={et}>{t(EVENT_TRIGGER_TYPE_LABEL_KEY[et])}</option>)}
      </select>

      <button className="ps-conf-btn-primary ps-mt-12" onClick={test}>{t('printRoutingRulesSection.testPanel.resolveButton')}</button>

      {result && (
        <div className="ps-rr-test-result-box">
          <div className="ps-rr-test-result-label">{t('printRoutingRulesSection.testPanel.resolvedDestinationLabel')}</div>
          <div className="ps-rr-test-result-value">{result.destination?.displayName ?? result.destination?.ipAddress ?? '—'}</div>
          <div className="ps-rr-test-result-matched">
            {matchedRule && result.matchedScopeType
              ? t('printRoutingRulesSection.testPanel.matchedRule', { tier: t(SCOPE_TYPE_LABEL_KEY[result.matchedScopeType]), note: matchedRule.note || matchedRule.id })
              : t('printRoutingRulesSection.testPanel.noRuleMatched')}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

const PrintRoutingRuleSection: React.FC = () => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<PrintRoutingRule[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [pointsOfCare, setPointsOfCare] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ rule?: PrintRoutingRule } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, facilitiesRes, locationsRes] = await Promise.all([
      mockPrintRoutingRuleService.getAll(),
      mockFacilityService.getAll(),
      mockLocationService.getAll(),
    ]);
    if (rulesRes.ok) setRules(rulesRes.data);
    if (facilitiesRes.ok) setFacilities((facilitiesRes.data as Facility[]).filter(f => f.status === 'Active'));
    if (locationsRes.ok) {
      const distinct = Array.from(new Set(locationsRes.data.map(l => l.pointOfCare).filter(Boolean)));
      setPointsOfCare(distinct.sort());
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Partial<PrintRoutingRule>) => {
    if (modal?.rule) {
      await mockPrintRoutingRuleService.update(modal.rule.id, data);
    } else {
      await mockPrintRoutingRuleService.create(data as Omit<PrintRoutingRule, 'id' | 'createdAt' | 'updatedAt'>);
    }
    setModal(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await mockPrintRoutingRuleService.remove(id);
    load();
  };

  const handleToggle = async (rule: PrintRoutingRule) => {
    await mockPrintRoutingRuleService.update(rule.id, { active: !rule.active });
    load();
  };

  const describeCriteria = (rule: PrintRoutingRule): string => {
    const parts: string[] = [];
    if (rule.specimenCaseType) parts.push(t('printRoutingRulesSection.criteriaDescription.specimenCaseType', { type: t(SPECIMEN_CASE_TYPE_LABEL_KEY[rule.specimenCaseType]) }));
    if (rule.eventTriggerType) parts.push(t('printRoutingRulesSection.criteriaDescription.eventTriggerType', { type: t(EVENT_TRIGGER_TYPE_LABEL_KEY[rule.eventTriggerType]) }));
    return parts.length ? parts.join(' · ') : t('printRoutingRulesSection.criteriaDescription.matchesEvery');
  };

  const describeScope = (rule: PrintRoutingRule): string => `${t(SCOPE_TYPE_LABEL_KEY[rule.scopeType])}: ${rule.scopeId}`;
  const describeDestination = (rule: PrintRoutingRule): string =>
    rule.printDestination.displayName ?? `${rule.printDestination.protocol} — ${rule.printDestination.ipAddress}`;

  if (loading) return <div className="ps-conf-loading">{t('printRoutingRulesSection.loading')}</div>;

  return (
    <div className="ps-rr-root">
      <div className="ps-rr-header">
        <div>
          <h2 className="tmpl-list-title">{t('printRoutingRulesSection.title')}</h2>
          <p className="tmpl-list-subtitle">{t('printRoutingRulesSection.subtitle')}</p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({})}>{t('printRoutingRulesSection.addRuleButton')}</button>
      </div>

      <div className="ps-rr-layout">
        <div className="ps-rr-tables">
          <table className="ps-conf-table">
            <thead>
              <tr>
                <th>{t('printRoutingRulesSection.table.headers.scope')}</th>
                <th>{t('printRoutingRulesSection.table.headers.criteria')}</th>
                <th>{t('printRoutingRulesSection.table.headers.destination')}</th>
                <th>{t('printRoutingRulesSection.table.headers.note')}</th>
                <th>{t('common.active')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr><td colSpan={6} className="ps-rr-empty-row">{t('printRoutingRulesSection.table.emptyState')}</td></tr>
              )}
              {rules.map(rule => (
                <tr key={rule.id} className={rule.active ? undefined : 'ps-rr-row--inactive'}>
                  <td>{describeScope(rule)}</td>
                  <td>{describeCriteria(rule)}</td>
                  <td><span className="ps-rr-action-label">{describeDestination(rule)}</span></td>
                  <td>{rule.note ?? '—'}</td>
                  <td>
                    <button className="ps-rr-btn" onClick={() => handleToggle(rule)}>{rule.active ? t('common.active') : t('common.inactive')}</button>
                  </td>
                  <td>
                    <button className="ps-rr-btn" onClick={() => setModal({ rule })}>{t('common.edit')}</button>
                    <button className="ps-rr-btn ps-rr-btn--danger" onClick={() => handleDelete(rule.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <TestPanel rules={rules} facilities={facilities} pointsOfCare={pointsOfCare} />
      </div>

      {modal && (
        <RuleModal
          rule={modal.rule}
          facilities={facilities}
          pointsOfCare={pointsOfCare}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default PrintRoutingRuleSection;
