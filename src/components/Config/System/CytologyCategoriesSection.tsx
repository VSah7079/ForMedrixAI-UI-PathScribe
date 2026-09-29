// src/components/Config/System/CytologyCategoriesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Cytology & Cervical Screening — Bethesda System category dictionary.
// Phase 1 of the Cytology module (see the uploaded requirements doc's
// own "Integrated Bethesda System Reporting" ask). Real, per direct
// guidance: configuration for this module lives here, as a new subtab
// under the existing System configuration screen — same established
// pattern as every other admin dictionary (ParticipationTypesSection,
// SubspecialtiesSection, GoverningBodiesSection, etc.), not a new,
// separate configuration surface.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '../../../utils/csv';
import '../../../pathscribe.css';
import { cytologyCategoryService } from '@/services';
import type {
  CytologyCategoryEntry,
  CytologyCategorySection,
  CytologyNomenclatureSystem,
  NewCytologyCategoryEntry,
} from '../../../services/cytology/ICytologyCategoryService';

// ─── Small chip helpers ─────────────────────────────────────────────────────

const Chip: React.FC<{ label: string; color: string; filled?: boolean }> = ({ label, color, filled = true }) => (
  <span className={`ps-cytcat-chip${filled ? ' ps-cytcat-chip--filled' : ''}`} style={filled ? { '--ps-hue': color } as React.CSSProperties : undefined}>
    {label}
  </span>
);

const SEVERITY_COLOR: Record<string, string> = { Abnormal: '#f59e0b', Critical: '#f97316', Malignant: '#ef4444' };

// Data-key-stays-English, label-is-translated: 'Abnormal'/'Critical'/
// 'Malignant' remain the real, literal stored severity values
// (ICytologyCategoryService.ts's own union type) — this map only
// translates the displayed text for the <select> options and the Chip.
const SEVERITY_LABEL_KEY: Record<'Abnormal' | 'Critical' | 'Malignant', string> = {
  Abnormal: 'cytologyCategoriesSection.severity.abnormal',
  Critical: 'cytologyCategoriesSection.severity.critical',
  Malignant: 'cytologyCategoriesSection.severity.malignant',
};

// ─── Section tabs ────────────────────────────────────────────────────────────

const SECTION_TABS: { id: CytologyCategorySection; labelKey: string }[] = [
  { id: 'adequacy', labelKey: 'cytologyCategoriesSection.tabs.adequacy' },
  { id: 'general_categorization', labelKey: 'cytologyCategoriesSection.tabs.generalCategorization' },
  { id: 'interpretation_result', labelKey: 'cytologyCategoriesSection.tabs.interpretationResult' },
  { id: 'recommendation', labelKey: 'cytologyCategoriesSection.tabs.recommendation' },
];

// Real, per direct guidance: closing the real, self-documented gap
// emptyDraft's own prior comment named directly — "hasn't been
// extended with a real nomenclature-system selector yet." Shown
// regardless of real, current seed-data coverage (bscc_rcpath/
// munchen_iiib are fully seeded; sfcc has zero entries of its own but
// is a real, derived view over Bethesda's — see the sfcc banner and
// cytologyCategoryService.ts's own getByNomenclatureSystem) — an
// admin managing an as-yet-unseeded system is exactly who this
// selector exists for.
//
// Real, direct fix (PS-328): 'palga_cisoea' deliberately excluded
// here, not merely unseeded. Confirmed directly against
// CytologyScreeningPage.tsx (PS-183): the real Dutch CISOE-A workflow
// is a genuinely separate, hardcoded 6-axis scoring form — it never
// reads this dictionary at all, by design (services/cytology/
// README.md's own Phase 30 note: 'palga_cisoea' "exists purely as the
// real, effective-settings signal... not a tag on any real
// CytologyCategoryEntry row"). Unlike sfcc/bscc_rcpath/munchen_iiib
// above, there is no future state where an admin adding entries here
// would do anything — showing it here previously let an admin
// populate categories under "PALGA CISOE-A" that no real workflow
// would ever read. The facility-level choice of CISOE-A as a site's
// reporting system is still made in
// CytologyNomenclatureSettingsSection.tsx, unaffected by this — that
// selector's 'palga_cisoea' option is a real, effective-settings
// signal, not a promise that this dictionary has entries for it.
const NOMENCLATURE_SYSTEMS: { id: CytologyNomenclatureSystem; labelKey: string }[] = [
  { id: 'bethesda', labelKey: 'cytologyCategoriesSection.nomenclatureSystems.bethesda' },
  { id: 'bscc_rcpath', labelKey: 'cytologyCategoriesSection.nomenclatureSystems.bsccRcpath' },
  { id: 'munchen_iiib', labelKey: 'cytologyCategoriesSection.nomenclatureSystems.munchenIiib' },
  { id: 'sfcc', labelKey: 'cytologyCategoriesSection.nomenclatureSystems.sfcc' },
];

// ─── Draft / modal ───────────────────────────────────────────────────────────

type Draft = NewCytologyCategoryEntry;

const emptyDraft = (section: CytologyCategorySection, nomenclatureSystem: CytologyNomenclatureSystem): Draft => ({
  // Real, direct fix: this used to hardcode 'bethesda' regardless of
  // which real system the admin was actually viewing — a new entry
  // added while managing BSCC/RCPath would have been silently
  // mis-tagged as Bethesda. Now takes the real, currently-selected
  // system directly.
  section, nomenclatureSystem, group: undefined, label: '', abbreviation: undefined, description: undefined,
  requiresPathologistReview: false, suggestedAbnormalSeverity: undefined, active: true,
});

const CategoryModal: React.FC<{
  mode: 'add' | 'edit';
  section: CytologyCategorySection;
  nomenclatureSystem: CytologyNomenclatureSystem;
  entry?: CytologyCategoryEntry;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}> = ({ mode, section, nomenclatureSystem, entry, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft(section, nomenclatureSystem));

  return (
    <div className="ps-cytcat-modal-overlay">
      <div className="ps-cytcat-modal-box">
        <h2 className="ps-cytcat-modal-title">
          {mode === 'add' ? t('cytologyCategoriesSection.modal.addTitle') : t('cytologyCategoriesSection.modal.editTitle')}
        </h2>

        <label className="ps-cytcat-field-label">{t('cytologyCategoriesSection.modal.labelField')}</label>
        <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })}
          className="ps-cytcat-field-input" />

        {/* Real, per direct guidance on SFCC (France): SFCC has no
            entries of its own — it's these same Bethesda entries with
            French text substituted (cytologyCategoryService.ts's
            own getByNomenclatureSystem). Editable only here, on the
            real Bethesda record, never through a derived SFCC view —
            editing a derived row would silently overwrite the
            canonical English label/description instead. */}
        {draft.nomenclatureSystem === 'bethesda' && (
          <>
            <label className="ps-cytcat-field-label">{t('cytologyCategoriesSection.modal.frenchLabelField')}</label>
            <input value={draft.labelFr ?? ''} onChange={e => setDraft({ ...draft, labelFr: e.target.value || undefined })}
              className="ps-cytcat-field-input" />
          </>
        )}

        <label className="ps-cytcat-field-label">{t('cytologyCategoriesSection.modal.abbreviationField')}</label>
        <input value={draft.abbreviation ?? ''} onChange={e => setDraft({ ...draft, abbreviation: e.target.value || undefined })}
          className="ps-cytcat-field-input" />

        {section === 'interpretation_result' && (
          <>
            <label className="ps-cytcat-field-label">{t('cytologyCategoriesSection.modal.groupField')}</label>
            <input value={draft.group ?? ''} onChange={e => setDraft({ ...draft, group: e.target.value || undefined })}
              className="ps-cytcat-field-input" />
          </>
        )}

        <label className="ps-cytcat-field-label">{t('cytologyCategoriesSection.modal.descriptionField')}</label>
        <textarea value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value || undefined })}
          rows={2}
          className="ps-cytcat-field-textarea" />

        {draft.nomenclatureSystem === 'bethesda' && (
          <>
            <label className="ps-cytcat-field-label">{t('cytologyCategoriesSection.modal.frenchDescriptionField')}</label>
            <textarea value={draft.descriptionFr ?? ''} onChange={e => setDraft({ ...draft, descriptionFr: e.target.value || undefined })}
              rows={2}
              className="ps-cytcat-field-textarea" />
          </>
        )}

        <label className="ps-cytcat-checkbox-row">
          <input type="checkbox" checked={draft.requiresPathologistReview}
            onChange={e => setDraft({ ...draft, requiresPathologistReview: e.target.checked })} />
          {t('cytologyCategoriesSection.modal.requiresReviewLabel')}
        </label>

        <label className="ps-cytcat-field-label">{t('cytologyCategoriesSection.modal.severityField')}</label>
        <select value={draft.suggestedAbnormalSeverity ?? ''} onChange={e => setDraft({ ...draft, suggestedAbnormalSeverity: (e.target.value || undefined) as any })}
          className="ps-conf-select ps-cytcat-select--full">
          <option value="">{t('cytologyCategoriesSection.modal.severityNoneOption')}</option>
          {(Object.keys(SEVERITY_LABEL_KEY) as Array<keyof typeof SEVERITY_LABEL_KEY>).map(s => (
            <option key={s} value={s}>{t(SEVERITY_LABEL_KEY[s])}</option>
          ))}
        </select>

        <label className="ps-cytcat-checkbox-row ps-cytcat-checkbox-row--last">
          <input type="checkbox" checked={draft.active}
            onChange={e => setDraft({ ...draft, active: e.target.checked })} />
          {t('common.active')}
        </label>

        <div className="ps-cytcat-modal-actions">
          <button onClick={onClose} className="ps-cytcat-btn-secondary">
            {t('common.cancel')}
          </button>
          <button onClick={() => draft.label.trim() && onSave(draft)}
            disabled={!draft.label.trim()}
            className={`ps-cytcat-btn-primary ${draft.label.trim() ? 'ps-cytcat-btn-primary--enabled' : 'ps-cytcat-btn-primary--disabled'}`}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

const CytologyCategoriesSection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<CytologyCategoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CytologyCategorySection>('adequacy');
  const [nomenclatureSystem, setNomenclatureSystem] = useState<CytologyNomenclatureSystem>('bethesda');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: CytologyCategoryEntry } | null>(null);

  const refresh = () => {
    setLoading(true);
    // Real, per this file's own direct fix — fetches the real,
    // correctly-scoped set for whichever system is selected. For
    // 'sfcc' this returns Bethesda's own entries with French text
    // substituted (cytologyCategoryService's own real, derived
    // view) — never a second, independently-stored set.
    cytologyCategoryService.getByNomenclatureSystem(nomenclatureSystem).then(res => {
      if (res.ok) setEntries(res.data);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, [nomenclatureSystem]);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'add') {
      await cytologyCategoryService.add(draft);
    } else if (modal?.entry) {
      await cytologyCategoryService.update(modal.entry.id, draft);
    }
    refresh();
    setModal(null);
  };

  const toggleActive = async (entry: CytologyCategoryEntry) => {
    if (entry.active) await cytologyCategoryService.deactivate(entry.id);
    else await cytologyCategoryService.reactivate(entry.id);
    refresh();
  };

  // Real, per direct guidance ("is there a mechanism to update them...
  // via CSV file?") — mirrors the same real, established CSV
  // import/export pattern (utils/csv.ts, PS-48) already used by
  // StainDictionarySection.tsx and other admin dictionaries in this
  // app, not a new, invented mechanism. Deliberately scoped to just
  // the French text fields
  // (id + English label/description for real, human context + the
  // two French fields to fill in), not a general bulk category
  // editor — the real, stated need here is translating Bethesda's own
  // existing 46 entries quickly, not adding new categories via CSV.
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportFrenchTranslations = async () => {
    const res = await cytologyCategoryService.getByNomenclatureSystem('bethesda');
    if (!res.ok) return;
    const rows = res.data.map(e => ({
      Id: e.id, Section: e.section, EnglishLabel: e.label, EnglishDescription: e.description ?? '',
      FrenchLabel: e.labelFr ?? '', FrenchDescription: e.descriptionFr ?? '',
    }));
    downloadCsv('BethesdaFrenchTranslations.csv', toCsv(rows));
  };

  const handleImportFrenchTranslations = async (file: File) => {
    if (!isCsvFile(file)) {
      alert(t('cytologyCategoriesSection.import.invalidFileType', { fileName: file.name }));
      return;
    }
    const text = await readFileAsText(file);
    const rows: any[] = parseCsv(text);
    // Real, matched by Id — never by label text, which could
    // legitimately change independently of the row's own identity.
    for (const row of rows) {
      const id = String(row['Id'] ?? '').trim();
      if (!id) continue;
      const labelFr = String(row['FrenchLabel'] ?? '').trim();
      const descriptionFr = String(row['FrenchDescription'] ?? '').trim();
      await cytologyCategoryService.update(id, {
        labelFr: labelFr || undefined,
        descriptionFr: descriptionFr || undefined,
      });
    }
    refresh();
  };

  const visible = entries
    .filter(e => e.section === activeTab)
    .filter(e => showInactive || e.active);

  // Real Bethesda structure: interpretation_result entries are grouped
  // by their own real sub-group (Organisms, Reactive Changes, Squamous,
  // Glandular, etc.); adequacy/general_categorization entries have no
  // sub-group and render as one flat list.
  const groups = Array.from(new Set(visible.map(e => e.group ?? '__none__')));

  return (
    <div className="ps-cytcat-page">
      <div className="ps-cytcat-header-row">
        <div>
          <h1 className="ps-cytcat-title">{t('cytologyCategoriesSection.title')}</h1>
          <p className="ps-cytcat-subtitle">
            {t('cytologyCategoriesSection.subtitle')}
          </p>
        </div>
        {/* Real, per this file's own direct fix — SFCC is a derived
            view over Bethesda's own entries (see CategoryModal's own
            comment), never independently editable. Adding here would
            create a real, standalone entry incorrectly tagged
            nomenclatureSystem: 'sfcc', which getByNomenclatureSystem
            never reads for that system. */}
        {nomenclatureSystem !== 'sfcc' && (
          <button className="ps-section-add-btn" onClick={() => setModal({ mode: 'add' })}>
            {t('cytologyCategoriesSection.addCategoryButton')}
          </button>
        )}
        <button onClick={handleExportFrenchTranslations} className="ps-cytcat-btn-toolbar">
          {t('cytologyCategoriesSection.exportButton')}
        </button>
        <button onClick={() => importFileInputRef.current?.click()} className="ps-cytcat-btn-toolbar">
          {t('cytologyCategoriesSection.importButton')}
        </button>
        <input ref={importFileInputRef} type="file" hidden accept=".csv,text/csv"
          onChange={e => { if (e.target.files?.[0]) handleImportFrenchTranslations(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {nomenclatureSystem === 'sfcc' && (
        <div className="ps-cytcat-sfcc-banner">
          {t('cytologyCategoriesSection.sfccBanner')}
        </div>
      )}

      {/* Real, per this file's own direct fix — the real, previously-
          missing nomenclature-system selector. Defaults to 'bethesda',
          matching this dictionary's own original, real default. */}
      <div className="ps-cytcat-nomenclature-row">
        <label className="ps-cytcat-nomenclature-label">{t('cytologyCategoriesSection.nomenclatureLabel')}</label>
        <select value={nomenclatureSystem} onChange={e => setNomenclatureSystem(e.target.value as CytologyNomenclatureSystem)}
          className="ps-cytcat-nomenclature-select">
          {NOMENCLATURE_SYSTEMS.map(s => (<option key={s.id} value={s.id}>{t(s.labelKey)}</option>))}
        </select>
      </div>

      {/* Section tabs */}
      <div className="ps-cytcat-tabs-row">
        {SECTION_TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`ps-cytcat-tab-btn ${activeTab === tab.id ? 'ps-cytcat-tab-btn--active' : ''}`}>
            {t(tab.labelKey)}
          </button>
        ))}
        <label className="ps-cytcat-showinactive-label">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          {t('common.showInactive')}
        </label>
      </div>

      {loading && <div className="ps-cytcat-empty-state">{t('common.loading')}</div>}

      {!loading && groups.map(group => (
        <div key={group} className="ps-cytcat-group-block">
          {group !== '__none__' && (
            <div className="ps-cytcat-group-heading">
              {group}
            </div>
          )}
          <div className="ps-cytcat-group-card">
            {visible.filter(e => (e.group ?? '__none__') === group).map((e, i, arr) => (
              <div key={e.id}
                className={`ps-cytcat-row ${i === arr.length - 1 ? 'ps-cytcat-row--last' : ''} ${e.active ? '' : 'ps-cytcat-row--inactive'}`}>
                <div className="ps-cytcat-row-content">
                  <div className="ps-cytcat-row-title-line">
                    {e.abbreviation && (
                      <span className="ps-cytcat-abbrev-badge">
                        {e.abbreviation}
                      </span>
                    )}
                    <span className="ps-cytcat-row-label">{e.label}</span>
                    {e.isSystem && <span className="ps-cytcat-builtin-tag">{t('cytologyCategoriesSection.builtin')}</span>}
                  </div>
                  {e.description && (
                    <div className="ps-cytcat-row-description">{e.description}</div>
                  )}
                </div>
                <div className="ps-cytcat-chips-wrap">
                  {e.requiresPathologistReview && <Chip label={t('cytologyCategoriesSection.chips.pathologistReview')} color="#f59e0b" />}
                  {e.suggestedAbnormalSeverity && <Chip label={t(SEVERITY_LABEL_KEY[e.suggestedAbnormalSeverity])} color={SEVERITY_COLOR[e.suggestedAbnormalSeverity]} />}
                  {!e.active && <Chip label={t('common.inactive')} color="#4b5563" />}
                </div>
                {nomenclatureSystem !== 'sfcc' && (
                  <>
                    <button onClick={() => toggleActive(e)} className="ps-cytcat-btn-row-secondary">
                      {e.active ? t('common.deactivate') : t('common.reactivate')}
                    </button>
                    <button onClick={() => setModal({ mode: 'edit', entry: e })} className="ps-cytcat-btn-row-edit">
                      {t('common.edit')}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!loading && visible.length === 0 && (
        <div className="ps-cytcat-empty-state">
          {t('cytologyCategoriesSection.emptyState')}
        </div>
      )}

      <div className="ps-cytcat-footer">
        <div className="ps-cytcat-livesync">
          <span className="ps-cytcat-livesync-dot">●</span> {t('cytologyCategoriesSection.footer.liveSync')}
        </div>
        <div>{t('cytologyCategoriesSection.footer.counts', { active: entries.filter(e => e.active).length, total: entries.length })}</div>
      </div>

      {modal && (
        <CategoryModal
          mode={modal.mode}
          section={activeTab}
          nomenclatureSystem={nomenclatureSystem}
          entry={modal.entry}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default CytologyCategoriesSection;
