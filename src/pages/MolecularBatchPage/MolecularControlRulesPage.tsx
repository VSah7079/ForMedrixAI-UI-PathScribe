// src/pages/MolecularBatchPage/MolecularControlRulesPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §3.2 "Dynamic Control
// Rules"/"Position Enforcements" — the real, missing admin UI this
// module's own validation (resolveMolecularControlRequirementValidation.ts)
// and service (mockMolecularAssayControlRuleService.ts) needed: a real
// place for an admin to actually define which controls a given assay
// requires, and whether each one is fixed to a specific real well or
// allowed anywhere (per the spec's own "prevent cross-contamination
// patterns" reasoning for the random-position case).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import '../../pathscribe.css';
import { mockMolecularAssayControlRuleService } from '../../services/molecular/mockMolecularAssayControlRuleService';
import { mockStainTypeService } from '../../services/stains/mockStainTypeService';
import type { StainType } from '../../services/stains/IStainService';
import type { MolecularAssayControlRule, MolecularRequiredControl } from '../../services/molecular/IMolecularAssayControlRuleService';
import type { MolecularSampleType } from '../../services/molecular/IMolecularBatchService';

// Real, per this file's own header — a rule's own required controls
// are real controls/calibrators, never a real patient specimen.
const CONTROL_TYPES_FOR_RULES: MolecularSampleType[] = ['CONTROL_NTC', 'CONTROL_PTC_HIGH', 'CONTROL_PTC_LOW', 'CALIBRATOR'];

const emptyRequiredControl = (): MolecularRequiredControl => ({ sampleType: 'CONTROL_NTC', positionMode: 'fixed', fixedWellPosition: 'A01' });

const MolecularControlRulesPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rules, setRules] = useState<MolecularAssayControlRule[]>([]);
  // Real, per direct follow-up ("wouldn't we use the existing process
  // catalog to define the assays?") — the real, existing Diagnostic
  // Catalog's own Molecular-category entries, fetched fresh so a new
  // catalog entry an admin adds there is immediately selectable here
  // too, never a second, stale copy of that same real list.
  const [molecularAssayTypes, setMolecularAssayTypes] = useState<StainType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draftAssayCode, setDraftAssayCode] = useState('');
  const [draftControls, setDraftControls] = useState<MolecularRequiredControl[]>([emptyRequiredControl()]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    mockMolecularAssayControlRuleService.getAll().then(res => {
      if (res.ok) setRules(res.data);
      setLoading(false);
    });
    mockStainTypeService.getAll().then(res => {
      if (res.ok) setMolecularAssayTypes(res.data.filter(t => t.category === 'Molecular' && t.active));
    });
  };
  useEffect(load, []);

  const startNew = () => {
    setEditingId('new');
    setDraftAssayCode('');
    setDraftControls([emptyRequiredControl()]);
    setSaveError(null);
  };

  const startEdit = (rule: MolecularAssayControlRule) => {
    setEditingId(rule.id);
    setDraftAssayCode(rule.assayCode);
    setDraftControls(rule.requiredControls.map(c => ({ ...c })));
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!draftAssayCode.trim()) { setSaveError(t('molecularControlRulesPage.assayCodeRequired')); return; }
    for (const c of draftControls) {
      if (c.positionMode === 'fixed' && !c.fixedWellPosition?.trim()) {
        setSaveError(t('molecularControlRulesPage.fixedPositionMissingWell', { sampleType: c.sampleType }));
        return;
      }
    }
    setSaving(true);
    try {
      const payload = { assayCode: draftAssayCode.trim(), requiredControls: draftControls };
      const res = editingId === 'new'
        ? await mockMolecularAssayControlRuleService.create(payload)
        : await mockMolecularAssayControlRuleService.update(editingId!, payload);
      if (!res.ok) { setSaveError('error' in res ? res.error : t('molecularControlRulesPage.genericSaveError')); return; }
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await mockMolecularAssayControlRuleService.delete(id);
    load();
  };

  const updateDraftControl = (index: number, patch: Partial<MolecularRequiredControl>) => {
    setDraftControls(prev => prev.map((c, i) => (i === index ? { ...c, ...patch, fixedWellPosition: patch.positionMode === 'random' ? undefined : (patch.fixedWellPosition ?? c.fixedWellPosition) } : c)));
  };

  return (
    <div className="ps-app-root ps-page-container ps-page-container--narrow">
      <button className="ps-btn-small ps-back-btn" onClick={() => navigate('/molecular')}>{t('molecularControlRulesPage.backToBatches')}</button>
      <div className="ps-page-header-row">
        <div>
          <h1 className="ps-page-title">{t('molecularControlRulesPage.title')}</h1>
          <p className="ps-page-subtitle">
            {t('molecularControlRulesPage.subtitle')}
          </p>
        </div>
        {editingId === null && <button className="ps-conf-btn-secondary" onClick={startNew}>{t('molecularControlRulesPage.newRule')}</button>}
      </div>

      {loading && <div className="ps-conf-loading">{t('molecularControlRulesPage.loading')}</div>}

      {!loading && editingId === null && (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>
                  <th className="ps-conf-th">{t('molecularControlRulesPage.colAssayCode')}</th>
                  <th className="ps-conf-th">{t('molecularControlRulesPage.colRequiredControls')}</th>
                  <th className="ps-conf-th">{t('molecularControlRulesPage.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={3}>{t('molecularControlRulesPage.emptyRules')}</td></tr>)}
                {rules.map(rule => (
                  <tr key={rule.id} className="ps-conf-tr">
                    <td className="ps-conf-td">{molecularAssayTypes.find(t => t.id === rule.assayCode)?.name ?? rule.assayCode}</td>
                    <td className="ps-conf-td">
                      {rule.requiredControls.map((c, i) => (
                        <div key={i}>{c.sampleType} — {c.positionMode === 'fixed' ? t('molecularControlRulesPage.fixedAt', { position: c.fixedWellPosition }) : t('molecularControlRulesPage.randomPosition')}</div>
                      ))}
                    </td>
                    <td className="ps-conf-td">
                      <button className="ps-btn-small ps-mr-8" onClick={() => startEdit(rule)}>{t('molecularControlRulesPage.edit')}</button>
                      <button className="ps-btn-small" onClick={() => handleDelete(rule.id)}>{t('molecularControlRulesPage.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingId !== null && (
        <div className="ps-panel-box">
          <h3 className="ps-panel-title">{editingId === 'new' ? t('molecularControlRulesPage.newRuleTitle') : t('molecularControlRulesPage.editRuleTitle')}</h3>
          <label className="ps-label" htmlFor="rule-assay-code">{t('molecularControlRulesPage.assayLabel')}</label>
          <select id="rule-assay-code" className="ps-input-dark ps-w-full ps-mb-16" value={draftAssayCode} onChange={e => setDraftAssayCode(e.target.value)}>
            <option value="">{t('molecularControlRulesPage.selectAssayOption')}</option>
            {molecularAssayTypes.map(at => <option key={at.id} value={at.id}>{at.name}</option>)}
          </select>

          <label className="ps-label">{t('molecularControlRulesPage.colRequiredControls')}</label>
          {draftControls.map((c, i) => (
            <div key={i} className="ps-control-row">
              <select className="ps-input-dark" value={c.sampleType} onChange={e => updateDraftControl(i, { sampleType: e.target.value as MolecularSampleType })}>
                {CONTROL_TYPES_FOR_RULES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
              <select className="ps-input-dark" value={c.positionMode} onChange={e => updateDraftControl(i, { positionMode: e.target.value as 'fixed' | 'random' })}>
                <option value="fixed">{t('molecularControlRulesPage.fixedPositionOption')}</option>
                <option value="random">{t('molecularControlRulesPage.randomPositionOption')}</option>
              </select>
              {c.positionMode === 'fixed' && (
                <input className="ps-input-dark ps-input-well-position" value={c.fixedWellPosition ?? ''} onChange={e => updateDraftControl(i, { fixedWellPosition: e.target.value })} placeholder="A01" />
              )}
              <button className="ps-btn-small" onClick={() => setDraftControls(prev => prev.filter((_, idx) => idx !== i))}>{t('molecularControlRulesPage.removeButton')}</button>
            </div>
          ))}
          <button className="ps-btn-small ps-mb-16" onClick={() => setDraftControls(prev => [...prev, emptyRequiredControl()])}>{t('molecularControlRulesPage.addRequiredControl')}</button>

          {saveError && <div className="ps-error-text">{saveError}</div>}
          <div className="ps-flex-row-gap-8">
            <button className="ps-conf-btn-secondary" disabled={saving} onClick={handleSave}>{saving ? t('molecularControlRulesPage.saving') : t('molecularControlRulesPage.saveRule')}</button>
            <button className="ps-btn-small" onClick={() => setEditingId(null)}>{t('molecularControlRulesPage.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MolecularControlRulesPage;
