// src/components/Config/System/MigrationFieldMappingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration
// Engine gap's own "field mapping" ask — admin CRUD for
// MigrationFieldMapping. Same real list/add-edit-modal pattern this
// app's own other dictionaries already use.
//
// i18n sweep (batch 42): CATEGORY_LABEL_KEY resolves each internal
// MigrationFieldCategory id to a translated display label via t() —
// the established "data key stays English, display label is
// translated" shape (AIContributionTab.tsx's SUBSPECIALTY_LABELS,
// batch 34; FontsSection.tsx's CATEGORY_LABEL_KEY, batch 37). Real
// dictionary content admins type in (sourceSystemName,
// sourceFieldName, transformNote) and real internal schema field
// names (targetField / MIGRATION_TARGET_FIELDS_BY_CATEGORY, which are
// literal `keyof MigrationCaseDraft` identifiers, not UI text) both
// stay untranslated, same as every other dictionary in this app.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockMigrationFieldMappingService } from '../../../services/migration/mockMigrationFieldMappingService';
import { MIGRATION_FIELD_CATEGORIES, MIGRATION_TARGET_FIELDS_BY_CATEGORY, type MigrationFieldCategory } from '../../../types/migration/MigrationCaseDraft';
import type { MigrationFieldMapping, NewMigrationFieldMapping } from '../../../services/migration/IMigrationFieldMappingService';

type Draft = NewMigrationFieldMapping;
const emptyDraft = (): Draft => ({ sourceSystemName: '', sourceFieldName: '', targetField: '', category: 'demographics', active: true });

const CATEGORY_LABEL_KEY: Record<MigrationFieldCategory, string> = {
  demographics:           'migrationFieldMappingsSection.categories.demographics',
  accession_detail:       'migrationFieldMappingsSection.categories.accessionDetail',
  gross_micro_text:       'migrationFieldMappingsSection.categories.grossMicroText',
  coding:                 'migrationFieldMappingsSection.categories.coding',
  slide_block_inventory:  'migrationFieldMappingsSection.categories.slideBlockInventory',
  pdf_archive:            'migrationFieldMappingsSection.categories.pdfArchive',
  synoptic_field:         'migrationFieldMappingsSection.categories.synopticField',
};

const MappingModal: React.FC<{ mode: 'add' | 'edit'; entry?: MigrationFieldMapping; onSave: (draft: Draft) => void; onClose: () => void }> = ({ mode, entry, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());
  const isSynoptic = draft.category === 'synoptic_field';

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? t('migrationFieldMappingsSection.modal.addTitle') : t('migrationFieldMappingsSection.modal.editTitle')}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="mfm-source-system">{t('migrationFieldMappingsSection.modal.sourceSystemLabel')}</label>
          <input id="mfm-source-system" className="ps-conf-input" value={draft.sourceSystemName} onChange={e => setDraft({ ...draft, sourceSystemName: e.target.value })} placeholder={t('migrationFieldMappingsSection.modal.sourceSystemPlaceholder')} />

          <label className="ps-label" htmlFor="mfm-source-field">{t('migrationFieldMappingsSection.modal.sourceFieldLabel')}</label>
          <input id="mfm-source-field" className="ps-conf-input" value={draft.sourceFieldName} onChange={e => setDraft({ ...draft, sourceFieldName: e.target.value })} placeholder={t('migrationFieldMappingsSection.modal.sourceFieldPlaceholder')} />

          <label className="ps-label" htmlFor="mfm-category">{t('migrationFieldMappingsSection.modal.categoryLabel')}</label>
          <select id="mfm-category" className="ps-conf-select" value={draft.category}
            onChange={e => setDraft({ ...draft, category: e.target.value as MigrationFieldCategory, targetField: '' })}>
            {MIGRATION_FIELD_CATEGORIES.map(c => <option key={c} value={c}>{t(CATEGORY_LABEL_KEY[c])}</option>)}
          </select>

          <label className="ps-label" htmlFor="mfm-target-field">{t('migrationFieldMappingsSection.modal.targetFieldLabel')}</label>
          {isSynoptic ? (
            <input id="mfm-target-field" className="ps-conf-input" value={draft.targetField} onChange={e => setDraft({ ...draft, targetField: e.target.value })} placeholder={t('migrationFieldMappingsSection.modal.targetFieldPlaceholder')} />
          ) : (
            <select id="mfm-target-field" className="ps-conf-select" value={draft.targetField} onChange={e => setDraft({ ...draft, targetField: e.target.value })}>
              <option value="">{t('migrationFieldMappingsSection.modal.selectTargetField')}</option>
              {MIGRATION_TARGET_FIELDS_BY_CATEGORY[draft.category].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}

          <label className="ps-label" htmlFor="mfm-transform-note">{t('migrationFieldMappingsSection.modal.transformNoteLabel')}</label>
          <input id="mfm-transform-note" className="ps-conf-input" value={draft.transformNote ?? ''} onChange={e => setDraft({ ...draft, transformNote: e.target.value })} placeholder={t('migrationFieldMappingsSection.modal.transformNotePlaceholder')} />
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('migrationFieldMappingsSection.modal.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.sourceSystemName.trim() || !draft.sourceFieldName.trim() || !draft.targetField.trim()}>{t('migrationFieldMappingsSection.modal.save')}</button>
        </div>
      </div>
    </div>
  );
};

const MigrationFieldMappingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<MigrationFieldMapping[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: MigrationFieldMapping } | null>(null);
  const [sourceFilter, setSourceFilter] = useState('All');

  const refresh = () => { mockMigrationFieldMappingService.getAll().then(res => { if (res.ok) setEntries(res.data); }); };
  useEffect(() => { refresh(); }, []);

  const sourceSystems = Array.from(new Set(entries.map(e => e.sourceSystemName)));
  const visible = entries.filter(e => sourceFilter === 'All' || e.sourceSystemName === sourceFilter);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) await mockMigrationFieldMappingService.update(modal.entry.id, draft);
    else await mockMigrationFieldMappingService.add(draft);
    setModal(null);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">{t('migrationFieldMappingsSection.title')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            {t('migrationFieldMappingsSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('migrationFieldMappingsSection.addMapping')}</button>
      </div>

      {sourceSystems.length > 0 && (
        <select className="ps-conf-select ps-mfm__source-filter" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="All">{t('migrationFieldMappingsSection.allSourceSystems')}</option>
          {sourceSystems.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.sourceSystemName} · {e.sourceFieldName} → {e.targetField}
              <span className="ps-mfm__meta">
                {t(CATEGORY_LABEL_KEY[e.category])}{!e.active ? ` · ${t('migrationFieldMappingsSection.inactive')}` : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>{t('migrationFieldMappingsSection.edit')}</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('migrationFieldMappingsSection.emptyRow')}</div>}
      </div>

      {modal && <MappingModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default MigrationFieldMappingsSection;
