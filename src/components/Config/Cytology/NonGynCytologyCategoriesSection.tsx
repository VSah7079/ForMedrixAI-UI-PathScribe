// src/components/Config/Cytology/NonGynCytologyCategoriesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Non-GYN Cytology Classification
// Systems gap — admin CRUD for the Milan and Paris (urinary) category
// dictionaries. Same real list/add-edit-modal pattern this app's own
// other cytology dictionaries already use.
//
// i18n note: `system` ('milan'/'paris_urinary') is a real, persisted
// enum value — the local `SYSTEM_LABEL_KEY` map below translates only
// the displayed label, leaving the value itself untouched as data.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockNonGynCytologyCategoryService } from '../../../services/cytology/mockNonGynCytologyCategoryService';
import type { NonGynCytologyCategoryEntry, NewNonGynCytologyCategoryEntry, NonGynCytologySystem } from '../../../services/cytology/INonGynCytologyCategoryService';

type Draft = NewNonGynCytologyCategoryEntry;
const emptyDraft = (system: NonGynCytologySystem): Draft => ({ system, categoryNumber: '', label: '', requiresPathologistReview: true, active: true });

const SYSTEM_LABEL_KEY: Record<NonGynCytologySystem, string> = {
  milan: 'nonGynCytologyCategoriesSection.systemLabel.milan',
  paris_urinary: 'nonGynCytologyCategoriesSection.systemLabel.parisUrinary',
};

const CategoryModal: React.FC<{ mode: 'add' | 'edit'; system: NonGynCytologySystem; entry?: NonGynCytologyCategoryEntry; onSave: (draft: Draft) => void; onClose: () => void }> = ({ mode, system, entry, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft(system));

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">
          {mode === 'add'
            ? t('nonGynCytologyCategoriesSection.modal.addTitle', { system: t(SYSTEM_LABEL_KEY[system]) })
            : t('nonGynCytologyCategoriesSection.modal.editTitle', { system: t(SYSTEM_LABEL_KEY[system]) })}
        </div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="ngc-category-number">{t('nonGynCytologyCategoriesSection.modal.categoryNumberField')}</label>
          <input id="ngc-category-number" className="ps-conf-input" value={draft.categoryNumber} onChange={e => setDraft({ ...draft, categoryNumber: e.target.value })} placeholder={t('nonGynCytologyCategoriesSection.modal.categoryNumberPlaceholder')} />

          <label className="ps-label" htmlFor="ngc-label">{t('cytologyCategoriesSection.modal.labelField')}</label>
          <input id="ngc-label" className="ps-conf-input" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />

          <label className="ps-label" htmlFor="ngc-abbreviation">{t('cytologyCategoriesSection.modal.abbreviationField')}</label>
          <input id="ngc-abbreviation" className="ps-conf-input" value={draft.abbreviation ?? ''} onChange={e => setDraft({ ...draft, abbreviation: e.target.value })} placeholder={t('nonGynCytologyCategoriesSection.modal.abbreviationPlaceholder')} />

          <label className="ps-label" htmlFor="ngc-description">{t('nonGynCytologyCategoriesSection.modal.descriptionField')}</label>
          <textarea id="ngc-description" className="ps-conf-input" rows={3} value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} />

          <label className="ps-label" htmlFor="ngc-rom">{t('nonGynCytologyCategoriesSection.modal.romField')}</label>
          <input id="ngc-rom" className="ps-conf-input" type="number" min={0} max={100} value={draft.riskOfMalignancyPercent ?? ''}
            onChange={e => setDraft({ ...draft, riskOfMalignancyPercent: e.target.value === '' ? undefined : Number(e.target.value) })} />

          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={draft.requiresPathologistReview} onChange={e => setDraft({ ...draft, requiresPathologistReview: e.target.checked })} className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('nonGynCytologyCategoriesSection.modal.requiresReviewLabel')}</span>
          </label>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.categoryNumber.trim() || !draft.label.trim()}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
};

const NonGynCytologyCategoriesSection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<NonGynCytologyCategoryEntry[]>([]);
  const [system, setSystem] = useState<NonGynCytologySystem>('milan');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: NonGynCytologyCategoryEntry } | null>(null);

  const refresh = () => { mockNonGynCytologyCategoryService.getAll().then(res => { if (res.ok) setEntries(res.data); }); };
  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => e.system === system && (showInactive || e.active));

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) await mockNonGynCytologyCategoryService.update(modal.entry.id, draft);
    else await mockNonGynCytologyCategoryService.add(draft);
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: NonGynCytologyCategoryEntry) => {
    if (e.active) await mockNonGynCytologyCategoryService.deactivate(e.id);
    else await mockNonGynCytologyCategoryService.reactivate(e.id);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">{t('nonGynCytologyCategoriesSection.title')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            {t('nonGynCytologyCategoriesSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('cytologyCategoriesSection.addCategoryButton')}</button>
      </div>

      <div className="ps-flex-row-gap-8 ps-mb-12">
        {(Object.keys(SYSTEM_LABEL_KEY) as NonGynCytologySystem[]).map(s => (
          <button key={s} className={system === s ? 'ps-conf-btn-primary' : 'ps-conf-btn-secondary'} onClick={() => setSystem(s)}>{t(SYSTEM_LABEL_KEY[s])}</button>
        ))}
      </div>

      <label className="ps-conf-toggle-label-row ps-mb-12">
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">{t('common.showInactive')}</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.categoryNumber}. {e.label}{e.abbreviation ? ` (${e.abbreviation})` : ''}
              <span className="ps-cytqc-priority-inline">
                {[
                  e.riskOfMalignancyPercent !== undefined ? t('nonGynCytologyCategoriesSection.romLabel', { percent: e.riskOfMalignancyPercent }) : '',
                  !e.active ? t('common.inactive') : '',
                ].filter(Boolean).join(' · ')}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? t('common.deactivate') : t('common.reactivate')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>{t('common.edit')}</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('nonGynCytologyCategoriesSection.emptyState')}</div>}
      </div>

      {modal && <CategoryModal mode={modal.mode} system={system} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default NonGynCytologyCategoriesSection;
