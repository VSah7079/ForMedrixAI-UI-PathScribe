// src/components/Config/System/GrossingRouteOverridesSection.tsx
// ─────────────────────────────────────────────────────────────
// Admin screen for Grossing Route overrides (S0-CF-12) — the piece
// that was genuinely missing before. AccessionPage.tsx always passed
// routingOverrides: [] to evaluateGrossingTemplateAssignment because
// there was no way to create an override; the evaluation function's
// own consuming logic (mockCaseService.ts) was already real and
// correct. This screen is the missing data-entry side, not new
// evaluation logic.
//
// specimenType is a free-text field, not a dropdown against Specimen
// Categories — checked the real Pass G0 matching code in
// mockCaseService.ts directly rather than assume: it compares by exact
// string equality against GrossingEvaluationSpecimen.specimenType
// (sp._entry?.type from the Specimen Dictionary), which is a finer,
// genuinely free-text field, not the coarser 4-value Category
// dictionary. A dropdown against Categories would have looked correct
// but silently never matched anything real.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { grossingRoutingOverrideService, facilityService, specimenDictionaryService } from '../../../services';
import type { GrossingRoutingOverrideEntry } from '../../../services/grossingRoutingOverrides/IGrossingRoutingOverrideService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import type { SpecimenEntry } from '../../../services/specimenDictionary/specimenTypes';

// Same three Gold Standard routes as DepartmentsSection.tsx —
// same pragmatic hardcode-rather-than-fetch call, same reason. Same
// `{ id, labelKey }` conversion those files' own GROSSING_TEMPLATES
// already went through (batch 71 / SpecimenCategoriesSection.tsx) —
// a per-file namespace here rather than a shared one, consistent with
// how each of those files keeps its own copy.
const GROSSING_TEMPLATES: { id: string; labelKey: string }[] = [
  { id: 'grossing_standard_tissue', labelKey: 'grossingRouteOverridesSection.grossingTemplates.standardTissue' },
  { id: 'grossing_fluid_cytology',  labelKey: 'grossingRouteOverridesSection.grossingTemplates.fluidCytology' },
  { id: 'grossing_histology_only',  labelKey: 'grossingRouteOverridesSection.grossingTemplates.histologyOnly' },
];

type Draft = Omit<GrossingRoutingOverrideEntry, 'id' | 'createdAt' | 'updatedAt'>;

const emptyDraft = (facilities: Facility[]): Draft => ({
  clientId: facilities[0]?.id ?? '',
  specimenType: '',
  grossingTemplateId: 'grossing_standard_tissue',
  active: true,
});

interface OverrideModalProps {
  mode: 'add' | 'edit';
  entry?: GrossingRoutingOverrideEntry;
  facilities: Facility[];
  knownSpecimenTypes: string[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const OverrideModal: React.FC<OverrideModalProps> = ({ mode, entry, facilities, knownSpecimenTypes, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ?? emptyDraft(facilities));
  const [error, setError] = useState('');
  const set = (k: keyof Draft, v: any) => setDraft(prev => ({ ...prev, [k]: v }));

  const handleSave = () => {
    if (!draft.specimenType.trim()) { setError(t('common.required')); return; }
    onSave(draft);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'add' ? t('grossingRouteOverridesSection.modal.addTitle') : t('grossingRouteOverridesSection.modal.editTitle')}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gro-facility">{t('grossingRouteOverridesSection.modal.facilityLabel')} <span className="ps-conf-required">*</span></label>
            <select id="gro-facility" className="ps-conf-select" value={draft.clientId} onChange={e => set('clientId', e.target.value)}>
              {facilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('grossingRouteOverridesSection.modal.specimenTypeLabel')} <span className="ps-conf-required">*</span></label>
            <input
              className={`ps-conf-input ${error ? 'ps-conf-input--error' : ''}`}
              list="ps-gro-known-types"
              value={draft.specimenType}
              onChange={e => { set('specimenType', e.target.value); setError(''); }}
              placeholder={t('grossingRouteOverridesSection.modal.specimenTypePlaceholder')}
            />
            <datalist id="ps-gro-known-types">
              {knownSpecimenTypes.map(st => <option key={st} value={st} />)}
            </datalist>
            {error && <span className="ps-conf-error-text">{error}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gro-template">{t('grossingRouteOverridesSection.modal.overrideRouteLabel')} <span className="ps-conf-required">*</span></label>
            <select id="gro-template" className="ps-conf-select" value={draft.grossingTemplateId} onChange={e => set('grossingTemplateId', e.target.value)}>
              {GROSSING_TEMPLATES.map(gt => <option key={gt.id} value={gt.id}>{t(gt.labelKey)}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('grossingRouteOverridesSection.modal.statusLabel')}</label>
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
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? t('grossingRouteOverridesSection.modal.addButton') : t('grossingRouteOverridesSection.modal.saveChangesButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

const GrossingRouteOverridesSection: React.FC = () => {
  const { t } = useTranslation();
  const [overrides, setOverrides] = useState<GrossingRoutingOverrideEntry[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [knownSpecimenTypes, setKnownSpecimenTypes] = useState<string[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<{ mode: 'add' | 'edit'; entry?: GrossingRoutingOverrideEntry } | null>(null);

  const loadAll = () => {
    Promise.all([
      grossingRoutingOverrideService.getAll(),
      facilityService.getAll(),
      specimenDictionaryService.getAll(),
    ]).then(([overridesRes, facilitiesRes, entriesRes]) => {
      if (overridesRes.ok) setOverrides(overridesRes.data);
      if (facilitiesRes.ok) setFacilities(facilitiesRes.data);
      if (entriesRes.ok) {
        const types = Array.from(new Set(entriesRes.data.map((e: SpecimenEntry) => e.type).filter(Boolean)));
        setKnownSpecimenTypes(types);
      }
      setLoading(false);
    });
  };

  useEffect(() => { loadAll(); }, []);

  const resolveFacilityName = (id: string) => facilities.find(c => c.id === id)?.name ?? id;
  const templateName = (id: string) => { const tpl = GROSSING_TEMPLATES.find(gt => gt.id === id); return tpl ? t(tpl.labelKey) : id; };

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'add') {
      const res = await grossingRoutingOverrideService.add(draft);
      if (res.ok) setOverrides(prev => [...prev, res.data]);
    } else if (modal?.entry) {
      const res = await grossingRoutingOverrideService.update(modal.entry.id, draft);
      if (res.ok) setOverrides(prev => prev.map(o => o.id === res.data.id ? res.data : o));
    }
    setModal(null);
  };

  const handleRemove = async (id: string) => {
    await grossingRoutingOverrideService.remove(id);
    setOverrides(prev => prev.filter(o => o.id !== id));
  };

  if (loading) return <div className="ps-conf-loading">{t('grossingRouteOverridesSection.loading')}</div>;

  const headers: Array<{ key: string; label: string }> = [
    { key: 'facility', label: t('grossingRouteOverridesSection.table.headers.facility') },
    { key: 'specimenType', label: t('grossingRouteOverridesSection.table.headers.specimenType') },
    { key: 'overrideRoute', label: t('grossingRouteOverridesSection.table.headers.overrideRoute') },
    { key: 'status', label: t('grossingRouteOverridesSection.table.headers.status') },
    { key: 'actions', label: t('grossingRouteOverridesSection.table.headers.actions') },
  ];

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('grossingRouteOverridesSection.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('grossingRouteOverridesSection.subtitle')}</p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>{t('grossingRouteOverridesSection.addButton')}</button>
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
              {overrides.map(o => (
                <tr key={o.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{resolveFacilityName(o.clientId)}</td>
                  <td className="ps-conf-td">{o.specimenType}</td>
                  <td className="ps-conf-td">{templateName(o.grossingTemplateId)}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${o.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${o.active ? 'ps-conf-status-text--active' : ''}`}>{o.active ? t('common.active') : t('common.inactive')}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: o })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleRemove(o.id)}>{t('common.remove')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {overrides.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>{t('grossingRouteOverridesSection.table.emptyState')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <OverrideModal
          mode={modal.mode}
          entry={modal.entry}
          facilities={facilities}
          knownSpecimenTypes={knownSpecimenTypes}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default GrossingRouteOverridesSection;
