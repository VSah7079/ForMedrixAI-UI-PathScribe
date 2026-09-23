// src/components/Config/Models/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// i18n note: `m.name`/`.version`/`.accuracy`/`.casesProcessed` are real
// model data, never translated. `m.vendor`/`.type`/`.status` are real,
// persisted enum values — the local `VENDOR_LABEL_KEY`/`TYPE_LABEL_KEY`/
// `STATUS_LABEL_KEY` maps below translate only the displayed label,
// leaving the underlying enum values (used for conditional logic too,
// e.g. `target?.type === 'Voice Dictation'`) untouched as data.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { modelService, facilityService } from '../../../services';
import { AIModel, ModelVendor, ModelType, ModelStatus } from '../../../services/models/IModelService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { hasPassingValidationForVoiceModel } from '../AI/resolveVoiceAiModel';

const STATUS_LABEL_KEY: Record<ModelStatus, string> = {
  Active:  'common.active',
  Retired: 'billingDictionarySection.status.retired',
  Beta:    'modelStoreModal.betaLabel',
};

const VENDOR_LABEL_KEY: Record<ModelVendor, string> = {
  anthropic: 'navBar.systemInfo.anthropic',
  openai:    'modelsTab.vendor.openai',
  google:    'login.ssoGoogle',
  other:     'printerProfilesSection.vendorLabels.OTHER',
};

const TYPE_LABEL_KEY: Record<ModelType, string> = {
  'Gross Only':     'modelsTab.type.grossOnly',
  'Micro Only':     'modelsTab.type.microOnly',
  'Gross + Micro':  'modelsTab.type.grossAndMicro',
  'Diagnosis Only': 'modelsTab.type.diagnosisOnly',
  'Voice Dictation': 'modelsTab.type.voiceDictation',
};

const ModelsTab: React.FC = () => {
  const { t } = useTranslation();
  const [models,  setModels]  = useState<AIModel[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([modelService.getAll(), facilityService.getAll()]).then(([modelsRes, facilitiesRes]) => {
      if (modelsRes.ok) setModels(modelsRes.data);
      if (facilitiesRes.ok) setFacilities(facilitiesRes.data);
      setLoading(false);
    });
  }, []);

  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const handleSetDefault = async (id: string) => {
    setBlockedMessage(null);
    const target = models.find(m => m.id === id);
    // Real fix, per direct product decision: voice models have no
    // per-facility override layer the way report-generation models do
    // (Facility.internalAiModelId) — this "Set Default" action IS the
    // only point where a voice model actually goes live, so this is
    // the only place the hard block can meaningfully apply. Same
    // absolute-block posture as resolveClientAiModel.ts: an
    // unvalidated voice model going live on a real deployment is a
    // real liability concern, not just a UX one.
    if (target?.type === 'Voice Dictation') {
      const eligible = await hasPassingValidationForVoiceModel(id);
      if (!eligible) {
        setBlockedMessage(t('modelsTab.blockedMessage', { nameVersion: `${target.name} ${target.version}` }));
        return;
      }
    }
    const res = await modelService.setDefault(id);
    if (res.ok) {
      // Real fix: previously un-defaulted EVERY model in local state
      // regardless of type, no longer matching the now type-aware
      // backend (see mockModelService.ts's setDefault) — only clear
      // isDefault on other models within the same group (voice vs
      // non-voice) as the one just set.
      const isVoice = target?.type === 'Voice Dictation';
      setModels(prev => prev.map(m => {
        const sameGroup = (m.type === 'Voice Dictation') === isVoice;
        return sameGroup ? { ...m, isDefault: m.id === id } : m;
      }));
    }
  };

  // Real fix, per direct request: "track which types and versions are
  // at our customer sites." A facility is only ever "on" a model via
  // its own explicit internalAiModelId override — there's no separate
  // tracking table to fall out of sync, this reads the exact same
  // field the hard-block enforcement itself checks.
  const facilitiesOnModel = (modelId: string) => facilities.filter(c => c.internalAiModelId === modelId);

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
              const approved = facilitiesOnModel(m.id);
              return (
              <tr key={m.id} className={`ps-models-tr${m.status === 'Retired' ? ' ps-models-tr--retired' : ''}`}>
                <td className="ps-models-td ps-models-td--strong">
                  {m.name} {m.version}
                </td>
                <td className="ps-models-td ps-models-td--muted">{t(VENDOR_LABEL_KEY[m.vendor])}</td>
                <td className="ps-models-td ps-models-td--muted">{t(TYPE_LABEL_KEY[m.type])}</td>
                <td className="ps-models-td ps-models-td--accent">{m.accuracy}%</td>
                <td className="ps-models-td ps-models-td--muted">{m.casesProcessed.toLocaleString()}</td>
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
