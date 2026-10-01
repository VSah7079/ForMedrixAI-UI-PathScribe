// src/components/Config/System/CytologyQcRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded "Automated Cytopathology QC Assignment
// Engine" spec — the admin screen for building, editing, prioritizing,
// and duplicating the real QC rules that drive
// resolveQcRuleEvaluation.ts. Real, per direct guidance ("no business
// logic in the UI and text strings"): every real decision (draft
// well-formedness) lives in resolveQcRuleDraftValidation.ts — this
// file only calls it and renders the result. Built with
// useTranslation() from the start, per the standing i18n policy.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCytologyQcRuleService } from '../../../services/cytologyQc/mockCytologyQcRuleService';
import { resolveQcRuleDraftValidation } from '../../../services/cytologyQc/resolveQcRuleDraftValidation';
import { JURISDICTION_LABELS, type Jurisdiction } from '../../../types/systemConfig';
import type { CytologyQcRule, QcRuleCriteria, QcSamplingLogic, QcPeerReviewPriorityTier } from '../../../types/cytologyQc/CytologyQcRule';
import type { NewCytologyQcRule } from '../../../services/cytologyQc/ICytologyQcRuleService';

type Draft = NewCytologyQcRule;

const emptyDraft = (): Draft => ({
  name: '', description: '', active: true, evaluationPriority: 50,
  criteria: {}, samplingLogic: { type: 'percentage', ratePercent: 10 },
  peerReviewPriorityTier: 'routine_random', slaHours: 24,
});

const ALL_JURISDICTIONS = Object.keys(JURISDICTION_LABELS) as Jurisdiction[];
const PROVIDER_ROLES: Array<'pathologist' | 'cytotechnologist'> = ['pathologist', 'cytotechnologist'];
const ONBOARDING_STATUSES: Array<'new_hire' | 'probationary'> = ['new_hire', 'probationary'];
const SPECIMEN_CATEGORIES: Array<'gyn_pap' | 'non_gyn_fluid' | 'fna'> = ['gyn_pap', 'non_gyn_fluid', 'fna'];
const ADEQUACY_OPTIONS: Array<'satisfactory' | 'unsatisfactory' | 'limited'> = ['satisfactory', 'unsatisfactory', 'limited'];
const PRIORITY_TIERS: QcPeerReviewPriorityTier[] = ['high_escalation', 'targeted_high_consequence', 'routine_random'];

function toggleInArray<T>(list: T[] | undefined, value: T): T[] | undefined {
  const current = list ?? [];
  const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
  return next.length > 0 ? next : undefined;
}

function parseCommaList(text: string): string[] | undefined {
  const parsed = text.split(',').map(s => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

const RuleModal: React.FC<{
  mode: 'add' | 'edit';
  rule?: CytologyQcRule;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}> = ({ mode, rule, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(rule ? { ...rule } : emptyDraft());
  const [errors, setErrors] = useState<string[]>([]);

  const criteria = draft.criteria;
  const setCriteria = (patch: Partial<QcRuleCriteria>) => setDraft({ ...draft, criteria: { ...criteria, ...patch } });

  const handleSave = () => {
    const validation = resolveQcRuleDraftValidation(draft);
    if (!validation.valid) { setErrors(validation.errors); return; }
    onSave(draft);
  };

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">
          {mode === 'add' ? t('cytologyQcRules.addTitle') : t('cytologyQcRules.editTitle')}
        </div>
        <div className="ps-conf-modal-body">
          {errors.length > 0 && (
            <div className="ps-conf-validation-errors">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          <h3 className="ps-conf-form-section-title">{t('cytologyQcRules.section.basics')}</h3>
          <label className="ps-label" htmlFor="qc-rule-name">{t('cytologyQcRules.nameLabel')}</label>
          <input id="qc-rule-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

          <label className="ps-label" htmlFor="qc-rule-desc">{t('cytologyQcRules.descriptionLabel')}</label>
          <textarea id="qc-rule-desc" className="ps-conf-input ps-conf-textarea" value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} />

          <div className="ps-conf-form-row">
            <div>
              <label className="ps-label" htmlFor="qc-rule-priority">{t('cytologyQcRules.priorityLabel')}</label>
              <input id="qc-rule-priority" type="number" className="ps-conf-input" value={draft.evaluationPriority}
                onChange={e => setDraft({ ...draft, evaluationPriority: Number(e.target.value) })} />
            </div>
            <div>
              <label className="ps-label" htmlFor="qc-rule-sla">{t('cytologyQcRules.slaHoursLabel')}</label>
              <input id="qc-rule-sla" type="number" className="ps-conf-input" value={draft.slaHours}
                onChange={e => setDraft({ ...draft, slaHours: Number(e.target.value) })} />
            </div>
          </div>

          <label className="ps-label" htmlFor="qc-rule-tier">{t('cytologyQcRules.tierLabel')}</label>
          <select id="qc-rule-tier" className="ps-conf-input" value={draft.peerReviewPriorityTier}
            onChange={e => setDraft({ ...draft, peerReviewPriorityTier: e.target.value as QcPeerReviewPriorityTier })}>
            {PRIORITY_TIERS.map(tier => <option key={tier} value={tier}>{t(`cytologyQcRules.tier.${tier}`)}</option>)}
          </select>

          <label className="ps-conf-toggle-label-row ps-mt-10">
            <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('common.active')}</span>
          </label>

          <h3 className="ps-conf-form-section-title">{t('cytologyQcRules.section.samplingLogic')}</h3>
          <select className="ps-conf-input" value={draft.samplingLogic.type}
            onChange={e => {
              const type = e.target.value as QcSamplingLogic['type'];
              const next: QcSamplingLogic = type === 'percentage' ? { type, ratePercent: 10 }
                : type === 'interval' ? { type, everyNthCase: 5 }
                : { type, firstNCases: 20 };
              setDraft({ ...draft, samplingLogic: next });
            }}>
            <option value="percentage">{t('cytologyQcRules.sampling.percentage')}</option>
            <option value="interval">{t('cytologyQcRules.sampling.interval')}</option>
            <option value="fixed_volume">{t('cytologyQcRules.sampling.fixedVolume')}</option>
          </select>
          {draft.samplingLogic.type === 'percentage' && (
            <input type="number" step="0.1" className="ps-conf-input ps-mt-8"
              value={draft.samplingLogic.ratePercent} placeholder={t('cytologyQcRules.sampling.ratePercentPlaceholder')}
              onChange={e => setDraft({ ...draft, samplingLogic: { type: 'percentage', ratePercent: Number(e.target.value) } })} />
          )}
          {draft.samplingLogic.type === 'interval' && (
            <input type="number" className="ps-conf-input ps-mt-8"
              value={draft.samplingLogic.everyNthCase} placeholder={t('cytologyQcRules.sampling.everyNthPlaceholder')}
              onChange={e => setDraft({ ...draft, samplingLogic: { type: 'interval', everyNthCase: Number(e.target.value) } })} />
          )}
          {draft.samplingLogic.type === 'fixed_volume' && (
            <input type="number" className="ps-conf-input ps-mt-8"
              value={draft.samplingLogic.firstNCases} placeholder={t('cytologyQcRules.sampling.firstNPlaceholder')}
              onChange={e => setDraft({ ...draft, samplingLogic: { type: 'fixed_volume', firstNCases: Number(e.target.value) } })} />
          )}

          <h3 className="ps-conf-form-section-title">{t('cytologyQcRules.section.location')}</h3>
          <p className="ps-conf-section-subtitle">{t('cytologyQcRules.jurisdictionsHint')}</p>
          <div className="ps-conf-checkbox-grid">
            {ALL_JURISDICTIONS.map(j => (
              <label key={j} className="ps-conf-toggle-label-row">
                <input type="checkbox" className="ps-conf-radio-input" checked={(criteria.jurisdictions ?? []).includes(j)}
                  onChange={() => setCriteria({ jurisdictions: toggleInArray(criteria.jurisdictions, j) })} />
                <span className="ps-conf-option-text">{t(`jurisdictionNames.${j}`)}</span>
              </label>
            ))}
          </div>
          <label className="ps-label" htmlFor="qc-rule-facilities">{t('cytologyQcRules.facilityIdsLabel')}</label>
          <input id="qc-rule-facilities" className="ps-conf-input" placeholder={t('cytologyQcRules.commaListPlaceholder')}
            value={(criteria.performingFacilityIds ?? []).join(', ')}
            onChange={e => setCriteria({ performingFacilityIds: parseCommaList(e.target.value) })} />

          <h3 className="ps-conf-form-section-title">{t('cytologyQcRules.section.provider')}</h3>
          <div className="ps-conf-checkbox-grid">
            {PROVIDER_ROLES.map(role => (
              <label key={role} className="ps-conf-toggle-label-row">
                <input type="checkbox" className="ps-conf-radio-input" checked={(criteria.providerRole ?? []).includes(role)}
                  onChange={() => setCriteria({ providerRole: toggleInArray(criteria.providerRole, role) })} />
                <span className="ps-conf-option-text">{t(`cytologyQcRules.role.${role}`)}</span>
              </label>
            ))}
            {ONBOARDING_STATUSES.map(status => (
              <label key={status} className="ps-conf-toggle-label-row">
                <input type="checkbox" className="ps-conf-radio-input" checked={(criteria.providerOnboardingStatus ?? []).includes(status)}
                  onChange={() => setCriteria({ providerOnboardingStatus: toggleInArray(criteria.providerOnboardingStatus, status) })} />
                <span className="ps-conf-option-text">{t(`cytologyQcRules.onboarding.${status}`)}</span>
              </label>
            ))}
          </div>
          <label className="ps-label" htmlFor="qc-rule-eligible-reviewers">{t('cytologyQcRules.eligibleReviewerRolesLabel')}</label>
          <input id="qc-rule-eligible-reviewers" className="ps-conf-input" placeholder={t('cytologyQcRules.commaListPlaceholder')}
            value={(draft.eligibleReviewerRoles ?? []).join(', ')}
            onChange={e => setDraft({ ...draft, eligibleReviewerRoles: parseCommaList(e.target.value) })} />

          <h3 className="ps-conf-form-section-title">{t('cytologyQcRules.section.specimen')}</h3>
          <div className="ps-conf-checkbox-grid">
            {SPECIMEN_CATEGORIES.map(cat => (
              <label key={cat} className="ps-conf-toggle-label-row">
                <input type="checkbox" className="ps-conf-radio-input" checked={(criteria.specimenCategory ?? []).includes(cat)}
                  onChange={() => setCriteria({ specimenCategory: toggleInArray(criteria.specimenCategory, cat) })} />
                <span className="ps-conf-option-text">{t(`cytologyQcRules.specimenCategory.${cat}`)}</span>
              </label>
            ))}
            {ADEQUACY_OPTIONS.map(adeq => (
              <label key={adeq} className="ps-conf-toggle-label-row">
                <input type="checkbox" className="ps-conf-radio-input" checked={(criteria.sampleAdequacy ?? []).includes(adeq)}
                  onChange={() => setCriteria({ sampleAdequacy: toggleInArray(criteria.sampleAdequacy, adeq) })} />
                <span className="ps-conf-option-text">{t(`cytologyQcRules.adequacy.${adeq}`)}</span>
              </label>
            ))}
          </div>
          <label className="ps-label" htmlFor="qc-rule-negative">{t('cytologyQcRules.resultIsNegativeLabel')}</label>
          <select id="qc-rule-negative" className="ps-conf-input"
            value={criteria.resultIsNegative === undefined ? 'any' : criteria.resultIsNegative ? 'negative' : 'non_negative'}
            onChange={e => setCriteria({ resultIsNegative: e.target.value === 'any' ? undefined : e.target.value === 'negative' })}>
            <option value="any">{t('cytologyQcRules.resultFilter.any')}</option>
            <option value="negative">{t('cytologyQcRules.resultFilter.negative')}</option>
            <option value="non_negative">{t('cytologyQcRules.resultFilter.nonNegative')}</option>
          </select>

          <h3 className="ps-conf-form-section-title">{t('cytologyQcRules.section.clinicalDiagnostic')}</h3>
          <label className="ps-label" htmlFor="qc-rule-highrisk">{t('cytologyQcRules.highRiskFlagsLabel')}</label>
          <input id="qc-rule-highrisk" className="ps-conf-input" placeholder={t('cytologyQcRules.commaListPlaceholder')}
            value={(criteria.highRiskFlags ?? []).join(', ')}
            onChange={e => setCriteria({ highRiskFlags: parseCommaList(e.target.value) })} />

          <label className="ps-label" htmlFor="qc-rule-bethesda">{t('cytologyQcRules.bethesdaLabel')}</label>
          <input id="qc-rule-bethesda" className="ps-conf-input" placeholder={t('cytologyQcRules.commaListPlaceholder')}
            value={(criteria.bethesdaClassifications ?? []).join(', ')}
            onChange={e => setCriteria({ bethesdaClassifications: parseCommaList(e.target.value) })} />

          <label className="ps-label" htmlFor="qc-rule-snomed">{t('cytologyQcRules.snomedLabel')}</label>
          <input id="qc-rule-snomed" className="ps-conf-input" placeholder={t('cytologyQcRules.commaListPlaceholder')}
            value={(criteria.snomedConceptCodes ?? []).join(', ')}
            onChange={e => setCriteria({ snomedConceptCodes: parseCommaList(e.target.value) })} />
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={handleSave}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
};

const CytologyQcRulesSection: React.FC = () => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<CytologyQcRule[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; rule?: CytologyQcRule } | null>(null);

  const refresh = () => {
    mockCytologyQcRuleService.getAll().then(res => { if (res.ok) setRules(res.data); });
  };

  useEffect(() => { refresh(); }, []);

  // Real, per direct guidance's own real, provided seed convention —
  // higher evaluationPriority evaluates first, so the admin list
  // shows the same real order the engine itself uses.
  const sortedRules = [...rules].sort((a, b) => b.evaluationPriority - a.evaluationPriority);
  const visible = sortedRules.filter(r => showInactive || r.active);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.rule) {
      await mockCytologyQcRuleService.update(modal.rule.id, draft);
    } else {
      await mockCytologyQcRuleService.add(draft);
    }
    setModal(null);
    refresh();
  };

  const toggleActive = async (rule: CytologyQcRule) => {
    if (rule.active) await mockCytologyQcRuleService.deactivate(rule.id);
    else await mockCytologyQcRuleService.reactivate(rule.id);
    refresh();
  };

  const handleDuplicate = async (rule: CytologyQcRule) => {
    const result = await mockCytologyQcRuleService.duplicate(rule.id, t('common.copyOfName', { name: rule.name }));
    if (result.ok) setModal({ mode: 'edit', rule: result.data });
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">{t('cytologyQcRules.title')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">{t('cytologyQcRules.description')}</p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('cytologyQcRules.addRuleBtn')}</button>
      </div>

      <label className="ps-conf-toggle-label-row ps-mb-12">
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">{t('common.showInactive')}</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(rule => (
          <div key={rule.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {rule.name}
              <span className="ps-cytqc-priority-inline">
                {t('cytologyQcRules.priorityInline', { priority: rule.evaluationPriority })} · {t(`cytologyQcRules.tier.${rule.peerReviewPriorityTier}`)}
                {!rule.active ? ` · ${t('common.inactive')}` : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => handleDuplicate(rule)}>{t('cytologyQcRules.duplicateBtn')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(rule)}>{rule.active ? t('common.deactivate') : t('common.reactivate')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', rule })}>{t('common.edit')}</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('cytologyQcRules.emptyRow')}</div>}
      </div>

      {modal && <RuleModal mode={modal.mode} rule={modal.rule} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default CytologyQcRulesSection;
