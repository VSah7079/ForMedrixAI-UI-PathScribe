// src/components/TemplateBuilder/RoutingRulesTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin UI for template routing rule management and testing.
//
// Three sections:
//   1. Facility Overrides  — specific facility always gets a specific template
//   2. Physician Preferences — specific physician preference
//   3. Test Panel          — enter case details, see which template resolves
//
// Lives as a sub-tab within Report Templates section alongside
// "Report Templates" and "Part Library".
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';
import { useAuditLog } from '@/components/Audit/useAuditLog';
import { mockRoutingRuleService, buildRoutingRuleMap }       from '@/services/routingRules/mockRoutingRuleService';
import { traceReportTemplateResolution } from '@/services/reportTemplates/TemplateRoutingService';
import { mockReportTemplateService }    from '@/services/reportTemplates/mockReportTemplateService';
import { mockFacilityService }            from '@/services/facilities/mockFacilityService';
import { resolvePerformingLabFacilityId } from '@/services/facilities/IFacilityService';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import { mockPhysicianService }         from '@/services/physicians/mockPhysicianService';
import { listTemplates as listSynopticProtocols } from '@/services/templates/templateService';
import type { RoutingRule, RoutingRuleType } from '@/services/routingRules/IRoutingRuleService';
import type { ReportTemplate }          from '@/types/reportPart';
import type { Facility } from '@/services/facilities/IFacilityService';
import type { Physician }               from '@/services/physicians/IPhysicianService';

// ── Add/Edit Rule Modal ───────────────────────────────────────────────────────

// Persisted RoutingRuleType — translate only the displayed label, not the
// underlying value (established codebase pattern for enum-like fields).
const ENTITY_LABEL_KEY: Record<RoutingRuleType, string> = {
  client: 'routingRulesTab.entity.facility',
  physician: 'routingRulesTab.entity.physician',
  protocol: 'routingRulesTab.entity.protocol',
};

// Resolution-pass identifiers (trace.pass / result.resolvedBy) are internal
// keys, not on-screen text — only the number (language-independent) and the
// core label (translated) are shown, composed as "Pass {{number}} — {{label}}"
// or, in the priority-chain list, the core label alone.
const PASS_NUMBER: Record<string, string> = {
  'client-override': '0',
  'client-override-enterprise': '0a',
  'physician-preference': '0b',
  'protocol': '1',
  'subspecialty': '2',
  'gold-standard': '3',
};
const PASS_CORE_LABEL_KEY: Record<string, string> = {
  'client-override': 'routingRulesTab.pass.clientOverride',
  'client-override-enterprise': 'routingRulesTab.pass.clientOverrideEnterprise',
  'physician-preference': 'routingRulesTab.pass.physicianPreference',
  'protocol': 'routingRulesTab.pass.protocol',
  'subspecialty': 'routingRulesTab.pass.subspecialty',
  'gold-standard': 'routingRulesTab.pass.goldStandard',
};

const RuleModal: React.FC<{
  type:       RoutingRuleType;
  rule?:      RoutingRule;
  templates:  ReportTemplate[];
  facilities: Facility[];
  physicians: Physician[];
  protocols:  { id: string; name: string; status: string }[];
  labs:       Facility[];
  onSave:     (rule: Partial<RoutingRule>) => void;
  onClose:    () => void;
}> = ({ type, rule, templates, facilities, physicians, protocols, labs, onSave, onClose }) => {
  const { t } = useTranslation();
  const [entityId,    setEntityId]    = useState(rule?.entityId    ?? '');
  const [templateId,  setTemplateId]  = useState(rule?.templateId  ?? '');
  const [note,        setNote]        = useState(rule?.note        ?? '');
  const [performingLabFacilityId, setPerformingLabFacilityId] = useState(rule?.performingLabFacilityId ?? '');

  const entityLabel = t(ENTITY_LABEL_KEY[type]);
  const entityList  = type === 'client'
    ? facilities.map(c => ({ id: c.id as string, name: `${c.name} (${c.assigningAuthority})` }))
    : type === 'physician'
    ? physicians.map(p => ({ id: p.id as string, name: `${p.lastName}, ${p.firstName} — ${p.specialty}` }))
    : protocols.map(p => ({ id: p.id, name: `${p.name}${p.status !== 'published' ? ` (${p.status})` : ''}` }));

  const selectedEntity   = entityList.find(e => e.id === entityId);
  const selectedTemplate = templates.find(tpl => tpl.id === templateId);

  const canSave = entityId && templateId;

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-modal-dark--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">
            {rule
              ? t('routingRulesTab.modal.editTitle', { entityLabel })
              : t('routingRulesTab.modal.addTitle', { entityLabel })}
          </span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>

        <div className="ps-modal-dark-body ps-rr-modal-body">
          <div>
            <div className="ps-conf-label">{entityLabel}</div>
            <select
              className="ps-conf-select"
              aria-label={entityLabel}
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
            >
              <option value="">{t('routingRulesTab.modal.selectEntityPlaceholder', { entityLabel: entityLabel.toLowerCase() })}</option>
              {entityList.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">{t('routingRulesTab.modal.reportTemplateLabel')}</div>
            <select
              className="ps-conf-select"
              aria-label={t('routingRulesTab.modal.reportTemplateLabel')}
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
            >
              <option value="">{t('routingRulesTab.modal.selectTemplatePlaceholder')}</option>
              {templates.filter(tpl => tpl.status === 'published').map(tpl => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="ps-conf-label">{t('routingRulesTab.modal.noteLabel')} ({t('common.optional')})</div>
            <input
              className="ps-conf-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('routingRulesTab.modal.notePlaceholder')}
            />
          </div>

          <div>
            <div className="ps-conf-label">{t('routingRulesTab.modal.performingLabLabel')}</div>
            <select
              className="ps-conf-select"
              aria-label={t('routingRulesTab.modal.performingLabLabel')}
              value={performingLabFacilityId}
              onChange={e => setPerformingLabFacilityId(e.target.value)}
            >
              <option value="">{t('routingRulesTab.modal.globalLabPlaceholder')}</option>
              {labs.map(l => <option key={l.id as string} value={l.id as string}>{l.name}</option>)}
            </select>
            <p className="ps-rr-lab-hint">
              {t('routingRulesTab.modal.labHint')}
            </p>
          </div>

          {entityId && templateId && (
            <div className="ps-rr-preview">
              <span className="ps-rr-preview-arrow">→</span>
              <span className="ps-rr-preview-entity">{selectedEntity?.name}</span>
              <span className="ps-rr-preview-always">{t('routingRulesTab.modal.alwaysUses')}</span>
              <span className="ps-rr-preview-template">{selectedTemplate?.name}</span>
            </div>
          )}
        </div>

        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="ps-conf-btn-primary"
            disabled={!canSave}
            onClick={() => onSave({
              type, entityId, templateId, note,
              entityName:   selectedEntity?.name ?? entityId,
              templateName: selectedTemplate?.name ?? templateId,
              performingLabFacilityId: performingLabFacilityId || undefined,
              active: true,
            })}
          >
            {rule ? t('routingRulesTab.modal.saveChanges') : t('routingRulesTab.modal.addRule')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Rule Row ──────────────────────────────────────────────────────────────────

const RuleRow: React.FC<{
  rule:      RoutingRule;
  labs:      Facility[];
  onEdit:    () => void;
  onDelete:  () => void;
  onToggle:  () => void;
}> = ({ rule, labs, onEdit, onDelete, onToggle }) => {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const labName = rule.performingLabFacilityId
    ? (labs.find(l => l.id === rule.performingLabFacilityId)?.name ?? rule.performingLabFacilityId)
    : t('routingRulesTab.global');

  return (
    <div className={`ps-rr-row${!rule.active ? ' ps-rr-row--inactive' : ''}`}>
      <div className="ps-rr-row-main">
        <span className="ps-rr-entity">{rule.entityName}</span>
        <span className="ps-rr-arrow">→</span>
        <span className="ps-rr-template">{rule.templateName}</span>
        <span className="ps-rr-lab-badge">{labName}</span>
        {rule.note && <span className="ps-rr-note">{rule.note}</span>}
      </div>
      <div className="ps-rr-row-actions">
        <button
          className={`ps-rr-toggle${rule.active ? ' ps-rr-toggle--on' : ''}`}
          onClick={onToggle}
          title={rule.active ? t('routingRulesTab.row.disableRule') : t('routingRulesTab.row.enableRule')}
        >
          {rule.active ? t('common.active') : t('routingRulesTab.row.disabled')}
        </button>
        <button className="ps-rr-btn" onClick={onEdit}>{t('common.edit')}</button>
        {confirmDelete ? (
          <>
            <span className="ps-rr-confirm-text">{t('routingRulesTab.row.confirmDelete')}</span>
            <button className="ps-rr-btn ps-rr-btn--danger" onClick={onDelete}>{t('common.yes')}</button>
            <button className="ps-rr-btn" onClick={() => setConfirmDelete(false)}>{t('common.no')}</button>
          </>
        ) : (
          <button className="ps-rr-btn ps-rr-btn--ghost" onClick={() => setConfirmDelete(true)}>{t('common.delete')}</button>
        )}
      </div>
    </div>
  );
};

// ── Test Panel ────────────────────────────────────────────────────────────────

const TestPanel: React.FC<{
  templates:  ReportTemplate[];
  facilities: Facility[];
  physicians: Physician[];
  rules:      RoutingRule[];
  result:     any;
  onResult:   (r: any) => void;
}> = ({ templates, facilities, physicians, rules, result, onResult }) => {
  const { t } = useTranslation();
  const [synopticId,   setSynopticId]   = useState('');
  const [subspecialty, setSubspecialty] = useState('');
  const [clientId,     setClientId]     = useState('');
  const [physicianId,  setPhysicianId]  = useState('');
  const [protocols,    setProtocols]    = useState<{ id: string; name: string; status: string }[]>([]);

  // Pull the real, current synoptic protocol list rather than a
  // hardcoded copy — guarantees the picker can never offer an ID that the
  // routing maps don't actually recognise (the exact bug we found and fixed
  // earlier tonight, caused by a free-text field accepting any string).
  useEffect(() => {
    listSynopticProtocols().then(setProtocols).catch(() => setProtocols([]));
  }, []);

  const test = () => {
    // Real, per direct guidance: real Enterprise AND real performing-lab
    // resolution, same single-facility-lookup reasoning
    // resolveReportTemplateAsync itself now uses in production — the
    // Test panel exercises the exact same fallback chain a real case
    // would, not a simplified stand-in that could drift from it.
    const selectedFacility = facilities.find(c => c.id === clientId);
    const enterpriseFacilityId = (selectedFacility && !selectedFacility.isEnterprise && selectedFacility.parentId)
      ? selectedFacility.parentId
      : undefined;
    const performingLabFacilityId = selectedFacility ? resolvePerformingLabFacilityId(selectedFacility) : undefined;

    // Real, per direct guidance ("Routing Rules should also be tied to
    // a Performing Lab facility"): reuses the exact same
    // buildRoutingRuleMap most-specific-wins resolution the real
    // service itself uses (mockRoutingRuleService.ts), against these
    // not-yet-saved draft `rules`, so a lab-specific rule correctly
    // wins over a Global one here too — not a second, simplified
    // implementation that could silently disagree with production.
    const facilityMap  = buildRoutingRuleMap(rules.filter(r => r.type === 'client'    && r.active), performingLabFacilityId);
    const physicianMap = buildRoutingRuleMap(rules.filter(r => r.type === 'physician' && r.active), performingLabFacilityId);
    const protocolMap  = buildRoutingRuleMap(rules.filter(r => r.type === 'protocol'  && r.active), performingLabFacilityId);

    const trace = traceReportTemplateResolution({
      synopticTemplateIds:  synopticId.trim() ? [synopticId.trim()] : [],
      subspecialtyId:       subspecialty || undefined,
      performingFacilityId: clientId     || undefined,
      enterpriseFacilityId,
      orderingPhysicianId:  physicianId  || undefined,
      _facilityOverrides:  facilityMap,
      _physicianOverrides: physicianMap,
      _protocolOverrides:  protocolMap,
    } as any);
    const resolved = trace.result;
    const template = templates.find(tpl => tpl.id === resolved.templateId);
    onResult({ ...resolved, templateName: template?.name ?? resolved.templateId, passes: trace.passes });
  };

  const passLabel = (key: string): string =>
    t('routingRulesTab.pass.numbered', { number: PASS_NUMBER[key] ?? '', label: t(PASS_CORE_LABEL_KEY[key] ?? '') });

  return (
    <div className="ps-rr-test">
      <div className="ps-rr-test-title">🧪 {t('routingRulesTab.test.title')}</div>
      <div className="ps-rr-test-subtitle">
        {t('routingRulesTab.test.subtitle')}
      </div>

      <div className="ps-rr-test-fields">
        <div>
          <div className="ps-conf-label">{t('routingRulesTab.test.synopticTemplateIdLabel')}</div>
          <select className="ps-conf-select" aria-label={t('routingRulesTab.test.synopticTemplateIdLabel')} value={synopticId} onChange={e => setSynopticId(e.target.value)}>
            <option value="">{t('routingRulesTab.test.none')}</option>
            {protocols.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.status !== 'published' ? ` (${p.status})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="ps-conf-label">{t('routingRulesTab.test.subspecialtyLabel')}</div>
          {/* These short codes are the subspecialty identifiers themselves —
              shown as their own label (value === display text), not friendly
              prose — so they stay literal like other internal data keys. */}
          <select className="ps-conf-select" aria-label={t('routingRulesTab.test.subspecialtyLabel')} value={subspecialty} onChange={e => setSubspecialty(e.target.value)}>
            <option value="">{t('routingRulesTab.test.any')}</option>
            {['breast','gi','thoracic','uro','derm','neuro','heme','gyn'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="ps-conf-label">{t('routingRulesTab.test.performingFacilityLabel')}</div>
          <select className="ps-conf-select" aria-label={t('routingRulesTab.test.performingFacilityLabel')} value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">{t('routingRulesTab.test.none')}</option>
            {facilities.map(c => <option key={c.id as string} value={c.id as string}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <div className="ps-conf-label">{t('routingRulesTab.test.orderingPhysicianLabel')}</div>
          <select className="ps-conf-select" aria-label={t('routingRulesTab.test.orderingPhysicianLabel')} value={physicianId} onChange={e => setPhysicianId(e.target.value)}>
            <option value="">{t('routingRulesTab.test.none')}</option>
            {physicians.map(p => <option key={p.id as string} value={p.id as string}>{p.lastName}, {p.firstName}</option>)}
          </select>
        </div>
      </div>

      <button className="ps-conf-btn-primary ps-rr-test-btn" onClick={test}>
        {t('routingRulesTab.test.testRouting')} →
      </button>

      {result && (
        <div className="ps-rr-result">
          <div className="ps-rr-result-template">{result.templateName}</div>
          <div
            className={`ps-rr-result-pass ps-rr-pass--${result.resolvedBy ?? 'default'}`}
          >
            {PASS_CORE_LABEL_KEY[result.resolvedBy] ? passLabel(result.resolvedBy) : result.resolvedBy}
          </div>
          {result.ambiguous && (
            <div className="ps-rr-result-warn">
              ⚠️ {t('routingRulesTab.test.ambiguous', { candidates: result.candidates.join(', ') })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Tab ──────────────────────────────────────────────────────────────────

const RoutingRulesTab: React.FC = () => {
  const { t } = useTranslation();
  const [rules,      setRules]      = useState<RoutingRule[]>([]);
  const [result,     setResult]     = useState<any>(null);
  const [templates,  setTemplates]  = useState<ReportTemplate[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [labs,       setLabs]       = useState<Facility[]>([]);
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [protocols,  setProtocols]  = useState<{ id: string; name: string; status: string }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState<{ type: RoutingRuleType; rule?: RoutingRule } | null>(null);
  const { log } = useAuditLog();

  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, templatesRes, facilitiesRes, physiciansRes, protocolsRes] = await Promise.all([
      mockRoutingRuleService.getAll(),
      mockReportTemplateService.getAll(),
      mockFacilityService.getAll(),
      mockPhysicianService.getAll(),
      listSynopticProtocols().catch(() => []),
    ]);
    if ((rulesRes as any).ok)      setRules((rulesRes as any).data);
    if ((templatesRes as any).ok)  setTemplates((templatesRes as any).data);
    if ((facilitiesRes as any).ok) setFacilities((facilitiesRes as any).data.filter((c: Facility) => c.status === 'Active'));
    if ((physiciansRes as any).ok) setPhysicians((physiciansRes as any).data.filter((p: Physician) => p.status === 'Active'));
    setProtocols(protocolsRes as any);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Partial<RoutingRule>) => {
    if (modal?.rule) {
      await mockRoutingRuleService.update(modal.rule.id, data);
      log('validation_routing_rule_updated', {
        entityName:   data.entityName  ?? modal.rule.entityName,
        templateName: data.templateName ?? modal.rule.templateName,
      });
    } else {
      await mockRoutingRuleService.add({ ...data, createdBy: 'admin' } as any);
      log('validation_routing_rule_added', {
        entityName:   data.entityName  ?? '',
        templateName: data.templateName ?? '',
        ruleType:     data.type ?? 'client',
      });
    }
    setModal(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const rule = rules.find(r => r.id === id);
    await mockRoutingRuleService.remove(id);
    if (rule) log('validation_routing_rule_deleted', { entityName: rule.entityName, ruleType: rule.type });
    load();
  };

  const handleToggle = async (rule: RoutingRule) => {
    await mockRoutingRuleService.update(rule.id, { active: !rule.active });
    load();
  };

  const clientRules    = rules.filter(r => r.type === 'client');
  const physicianRules = rules.filter(r => r.type === 'physician');
  const protocolRules  = rules.filter(r => r.type === 'protocol');

  if (loading) return <div className="ps-conf-loading">{t('routingRulesTab.loading')}</div>;

  return (
    <div className="ps-rr-root">

      {/* Header */}
      <div className="ps-rr-header">
        <div>
          <h2 className="tmpl-list-title">{t('routingRulesTab.header.title')}</h2>
          <p className="tmpl-list-subtitle">
            {t('routingRulesTab.header.subtitle')}
          </p>
        </div>
      </div>

      <div className="ps-rr-layout">
        <div className="ps-rr-tables">

          {/* Priority chain reference */}
          <div className="ps-rr-priority">
            <div className="ps-rr-priority-title">{t('routingRulesTab.priority.title')}</div>
            {[
              { pass: '0',   key: 'client-override' },
              { pass: '0b',  key: 'physician-preference' },
              { pass: '1',   key: 'protocol' },
              { pass: '2',   key: 'subspecialty' },
              { pass: '3',   key: 'gold-standard' },
            ].map(p => {
              const trace = (result?.passes ?? []).find((tr: any) => tr.pass === p.key);
              const matched = !!trace?.matched;
              const unreached = !!trace && !trace.reached;
              return (
                <div
                  key={p.pass}
                  className={[
                    'ps-rr-priority-row',
                    matched ? 'ps-rr-priority-row--matched' : '',
                    unreached ? 'ps-rr-priority-row--unreached' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className={`ps-rr-priority-pass ps-rr-pass--${p.key}`}>{t('routingRulesTab.pass.short', { number: p.pass })}</span>
                  <span className="ps-rr-priority-label">{t(PASS_CORE_LABEL_KEY[p.key])}</span>
                  {trace && <span className="ps-rr-priority-result">{trace.detail}</span>}
                  {['0','0b'].includes(p.pass) && <span className="ps-rr-priority-admin">← {t('routingRulesTab.priority.adminDefined')}</span>}
                  {p.pass === '1' && <span className="ps-rr-priority-admin">← {t('routingRulesTab.priority.adminExtensible')}</span>}
                  {matched && <span className="ps-rr-priority-check" title={t('routingRulesTab.priority.resolvedTitle')}>✓</span>}
                </div>
              );
            })}
          </div>

          {/* Facility overrides */}
          <div className="ps-rr-section">
            <div className="ps-rr-section-header">
              <span className="ps-rr-section-title">{t('routingRulesTab.section.facilityOverrides')}</span>
              <span className="ps-rr-section-pass ps-rr-pass--client-override">{t('routingRulesTab.pass.short', { number: '0' })}</span>
              <button className="ps-section-add-btn" onClick={() => setModal({ type: 'client' })}>
                + {t('routingRulesTab.section.addFacilityRule')}
              </button>
            </div>
            {clientRules.length === 0 ? (
              <div className="ps-rr-empty">{t('routingRulesTab.section.noFacilityOverrides')}</div>
            ) : clientRules.map(r => (
              <RuleRow
                key={r.id} rule={r} labs={labs}
                onEdit={() => setModal({ type: 'client', rule: r })}
                onDelete={() => handleDelete(r.id)}
                onToggle={() => handleToggle(r)}
              />
            ))}
          </div>

          {/* Protocol mappings */}
          <div className="ps-rr-section">
            <div className="ps-rr-section-header">
              <span className="ps-rr-section-title">{t('routingRulesTab.section.protocolMappings')}</span>
              <span className="ps-rr-section-pass ps-rr-pass--protocol">{t('routingRulesTab.pass.short', { number: '1' })}</span>
              <button className="ps-section-add-btn" onClick={() => setModal({ type: 'protocol' })}>
                + {t('routingRulesTab.section.addProtocolMapping')}
              </button>
            </div>
            <div className="ps-rr-note ps-rr-note--spaced">
              {t('routingRulesTab.section.protocolMappingsNote')}
            </div>
            {protocolRules.length === 0 ? (
              <div className="ps-rr-empty">{t('routingRulesTab.section.noProtocolMappings')}</div>
            ) : protocolRules.map(r => (
              <RuleRow
                key={r.id} rule={r} labs={labs}
                onEdit={() => setModal({ type: 'protocol', rule: r })}
                onDelete={() => handleDelete(r.id)}
                onToggle={() => handleToggle(r)}
              />
            ))}
          </div>

          {/* Physician preferences */}
          <div className="ps-rr-section">
            <div className="ps-rr-section-header">
              <span className="ps-rr-section-title">{t('routingRulesTab.section.physicianPreferences')}</span>
              <span className="ps-rr-section-pass ps-rr-pass--physician-preference">{t('routingRulesTab.pass.short', { number: '0b' })}</span>
              <button className="ps-section-add-btn" onClick={() => setModal({ type: 'physician' })}>
                + {t('routingRulesTab.section.addPhysicianRule')}
              </button>
            </div>
            {physicianRules.length === 0 ? (
              <div className="ps-rr-empty">{t('routingRulesTab.section.noPhysicianPreferences')}</div>
            ) : physicianRules.map(r => (
              <RuleRow
                key={r.id} rule={r} labs={labs}
                onEdit={() => setModal({ type: 'physician', rule: r })}
                onDelete={() => handleDelete(r.id)}
                onToggle={() => handleToggle(r)}
              />
            ))}
          </div>
        </div>

        {/* Test panel */}
        <TestPanel
          templates={templates}
          facilities={facilities}
          physicians={physicians}
          rules={rules}
          result={result}
          onResult={setResult}
        />
      </div>

      {modal && (
        <RuleModal
          type={modal.type}
          rule={modal.rule}
          templates={templates}
          facilities={facilities}
          physicians={physicians}
          protocols={protocols}
          labs={labs}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default RoutingRulesTab;
