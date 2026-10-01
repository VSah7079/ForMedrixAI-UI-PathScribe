// src/components/Config/Models/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The current organisation's adopted AI models (PS-58: global catalog +
// per-tenant adoption). Status, default, accuracy and cases processed shown
// here are this organisation's adoption record; name, vendor and type come
// from the shared ForMedrixAI catalog.
//
// i18n note: `m.name`/`.version` are model data, never translated.
// `m.vendor`/`.type`/`.status` are persisted enum values; the label maps
// below translate only their display.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { modelService, facilityService } from '../../../services';
import { AIModel, ModelType, ModelStatus } from '../../../services/models/IModelService';
import { MODEL_VENDOR_LABEL_KEY } from '../../../services/models/modelLabels';
import { facilitiesPinnedToModel } from '../../../services/models/modelAdoption';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { canBecomeDefault } from '../AI/resolveVoiceAiModel';

const STATUS_LABEL_KEY: Record<ModelStatus, string> = {
  Active:  'common.active',
  Retired: 'billingDictionarySection.status.retired',
  Beta:    'modelStoreModal.betaLabel',
};

const TYPE_LABEL_KEY: Record<ModelType, string> = {
  'Gross Only':     'modelsTab.type.grossOnly',
  'Micro Only':     'modelsTab.type.microOnly',
  'Gross + Micro':  'modelsTab.type.grossAndMicro',
  'Diagnosis Only': 'modelsTab.type.diagnosisOnly',
  'Voice Dictation': 'modelsTab.type.voiceDictation',
};

const ModelsTab: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [models,  setModels]  = useState<AIModel[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [modelsRes, facilitiesRes] = await Promise.all([modelService.getAll(), facilityService.getAll()]);
    if (modelsRes.ok) setModels(modelsRes.data);
    if (facilitiesRes.ok) setFacilities(facilitiesRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const handleSetDefault = async (id: string) => {
    setBlockedMessage(null);
    const target = models.find(m => m.id === id);
    // Voice models must have a PASS-graded study before going live; see
    // canBecomeDefault in resolveVoiceAiModel.ts.
    if (target && !(await canBecomeDefault(target))) {
      setBlockedMessage(t('modelsTab.blockedMessage', { nameVersion: `${target.name} ${target.version}` }));
      return;
    }
    // The service decides which defaults clear (voice and report
    // generation are separate groups); re-read rather than re-derive it.
    const res = await modelService.setDefault(id);
    if (res.ok) await load();
  };

  if (loading) return (
    <div className="ps-models-loading">{t('modelsTab.loading')}</div>
  );

  return (
    <div className="ps-models-page">
      <h2 className="ps-models-title">{t('modelsTab.title')}</h2>
      <p className="ps-models-subtitle">{t('modelsTab.subtitle')}</p>
      {blockedMessage && (
        <div className="ps-models-blocked-message">
          🔒 {blockedMessage}
        </div>
      )}
      <div className="ps-models-table-wrap">
        <table className="ps-models-table">
          <thead>
            <tr className="ps-models-thead-row">
              {[
                t('modelsTab.tableHeaders.model'),
                t('modelsTab.tableHeaders.vendor'),
                t('modelsTab.tableHeaders.type'),
                t('modelsTab.tableHeaders.accuracy'),
                t('modelsTab.tableHeaders.casesProcessed'),
                t('modelsTab.tableHeaders.status'),
                t('modelsTab.tableHeaders.facilitiesApproved'),
                t('modelsTab.tableHeaders.default'),
              ].map(h => (
                <th key={h} className="ps-models-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map(m => {
              const approved = facilitiesPinnedToModel(facilities, m.id);
              return (
              <tr key={m.id} className={`ps-models-tr${m.status === 'Retired' ? ' ps-models-tr--retired' : ''}`}>
                <td className="ps-models-td ps-models-td--strong">
                  {m.name} {m.version}
                </td>
                <td className="ps-models-td ps-models-td--muted">{t(MODEL_VENDOR_LABEL_KEY[m.vendor])}</td>
                <td className="ps-models-td ps-models-td--muted">{t(TYPE_LABEL_KEY[m.type])}</td>
                <td className="ps-models-td ps-models-td--accent">{t('modelsTab.accuracyValue', { value: m.accuracy.toLocaleString(i18n.language) })}</td>
                <td className="ps-models-td ps-models-td--muted">{m.casesProcessed.toLocaleString(i18n.language)}</td>
                <td className="ps-models-td">
                  <span className={`ps-models-status-badge ps-models-status-badge--${m.status.toLowerCase()}`}>{t(STATUS_LABEL_KEY[m.status])}</span>
                </td>
                <td className="ps-models-td ps-models-td--small">
                  {approved.length === 0 ? (
                    <span className="ps-models-facilities-empty">—</span>
                  ) : (
                    <span
                      className="ps-models-facilities-count"
                      title={approved.map(c => c.name).join(', ')}
                    >
                      {t('modelsTab.facilitiesCount', { count: approved.length })}
                    </span>
                  )}
                </td>
                <td className="ps-models-td">
                  {m.isDefault ? (
                    <span className="ps-models-default-badge">✓ {t('modelsTab.tableHeaders.default')}</span>
                  ) : m.status !== 'Retired' ? (
                    <button
                      onClick={() => handleSetDefault(m.id)}
                      className="ps-models-set-default-btn"
                    >{t('modelsTab.setDefaultButton')}</button>
                  ) : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ModelsTab;
