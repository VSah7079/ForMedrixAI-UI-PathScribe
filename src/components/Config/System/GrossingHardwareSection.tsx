// src/components/Config/System/GrossingHardwareSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 359: the Grossing Hardware settings screen (Configuration → System →
// Workstation & Hardware). The profile service has existed since the grossing
// hardware work, but its admin screen was never built (services/
// grossingHardware/README.md said so). Pete chose to build it now, as part
// of centralising equipment:
//   - this screen keeps the grossing-specific settings: camera or scale, how
//     PathScribe reaches it (browser, PathScribe Agent, manual entry), the
//     Agent address, the station;
//   - which physical device it is comes from the equipment register
//     (services/equipment/).
// Rules: services/grossingHardware/grossingHardwareRules.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { equipmentService, grossingHardwareProfileService, scanStationService } from '../../../services';
import type { Equipment, GrossingHardwareBridgeType, GrossingHardwareKind, GrossingHardwareProfile, ScanStation } from '../../../services';
import { equipmentLinkOptions } from '../../../services/equipment/equipmentRules';
import {
  GROSSING_BRIDGES_BY_KIND, GROSSING_HARDWARE_KINDS, bridgeForKind, grossingHardwareDraftForSave, grossingProfilesForFacility,
  validateGrossingHardwareDraft, type GrossingHardwareDraft, type GrossingHardwareErrors,
} from '../../../services/grossingHardware/grossingHardwareRules';

const emptyDraft: GrossingHardwareDraft = { kind: 'camera', label: '', bridgeType: 'browser_native', stationId: '', agentBaseUrl: '', equipmentId: '', isActive: true };

interface ModalProps {
  mode: 'add' | 'edit';
  profile?: GrossingHardwareProfile;
  equipment: Equipment[];
  stations: ScanStation[];
  onSave: (draft: GrossingHardwareDraft) => Promise<boolean>;
  onClose: () => void;
}

const GrossingHardwareModal: React.FC<ModalProps> = ({ mode, profile, equipment, stations, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<GrossingHardwareDraft>(profile
    ? { kind: profile.kind, label: profile.label, bridgeType: profile.bridgeType, stationId: profile.stationId ?? '', agentBaseUrl: profile.agentBaseUrl ?? '', equipmentId: profile.equipmentId ?? '', isActive: profile.isActive }
    : emptyDraft);
  const [errors, setErrors] = useState<GrossingHardwareErrors>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const deviceOptions = equipmentLinkOptions(equipment, draft.kind, profile?.equipmentId);

  const set = <K extends keyof GrossingHardwareDraft>(k: K, v: GrossingHardwareDraft[K]) => {
    setDraft(prev => ({ ...prev, [k]: v }));
    setErrors(prev => ({ ...prev, [k]: undefined }));
  };
  const setKind = (kind: GrossingHardwareKind) => {
    setDraft(prev => ({ ...prev, kind, bridgeType: bridgeForKind(kind, prev.bridgeType), equipmentId: '' }));
    setErrors({});
  };

  const handleSave = async () => {
    const e = validateGrossingHardwareDraft(draft, equipment);
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSaveFailed(!(await onSave(grossingHardwareDraftForSave(draft))));
  };

  const errorText = (field: keyof GrossingHardwareErrors) =>
    errors[field] ? <span className="ps-conf-error-text">{t(`grossingHardwareSection.errors.${errors[field]}`)}</span> : null;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'add' ? t('grossingHardwareSection.modal.addTitle') : t('grossingHardwareSection.modal.editTitle', { name: profile?.label })}
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gh-kind">{t('grossingHardwareSection.modal.kindLabel')}</label>
            <select id="gh-kind" className="ps-conf-select" value={draft.kind} onChange={e => setKind(e.target.value as GrossingHardwareKind)}>
              {GROSSING_HARDWARE_KINDS.map(k => <option key={k} value={k}>{t(`equipmentKinds.${k}`)}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gh-label">{t('grossingHardwareSection.modal.labelLabel')} <span className="ps-conf-required">*</span></label>
            <input id="gh-label" className={`ps-conf-input ${errors.label ? 'ps-conf-input--error' : ''}`}
              value={draft.label} onChange={e => set('label', e.target.value)} placeholder={t('grossingHardwareSection.modal.labelPlaceholder')} />
            {errorText('label')}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gh-bridge">{t('grossingHardwareSection.modal.bridgeLabel')}</label>
            <select id="gh-bridge" className={`ps-conf-select ${errors.bridgeType ? 'ps-conf-input--error' : ''}`}
              value={draft.bridgeType} onChange={e => set('bridgeType', e.target.value as GrossingHardwareBridgeType)}>
              {GROSSING_BRIDGES_BY_KIND[draft.kind].map(b => <option key={b} value={b}>{t(`grossingHardwareSection.bridges.${b}`)}</option>)}
            </select>
            {errorText('bridgeType') ?? <span className="ps-conf-field-hint">{t(`grossingHardwareSection.bridgeHints.${draft.bridgeType}`)}</span>}
          </div>

          {draft.bridgeType === 'pathscribe_agent' && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="gh-agent">{t('grossingHardwareSection.modal.agentUrlLabel')} <span className="ps-conf-required">*</span></label>
              <input id="gh-agent" className={`ps-conf-input ${errors.agentBaseUrl ? 'ps-conf-input--error' : ''}`}
                value={draft.agentBaseUrl ?? ''} onChange={e => set('agentBaseUrl', e.target.value)} placeholder={t('grossingHardwareSection.modal.agentUrlPlaceholder')} />
              {errorText('agentBaseUrl')}
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gh-station">{t('grossingHardwareSection.modal.stationLabel')}</label>
            <select id="gh-station" className="ps-conf-select" value={draft.stationId ?? ''} onChange={e => set('stationId', e.target.value)}>
              <option value="">{t('grossingHardwareSection.modal.stationAnyOption')}</option>
              {stations.filter(s => s.status === 'Active' || s.id === draft.stationId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="gh-device">{t('grossingHardwareSection.modal.deviceLabel')}</label>
            <select id="gh-device" className={`ps-conf-select ${errors.equipmentId ? 'ps-conf-input--error' : ''}`}
              value={draft.equipmentId ?? ''} onChange={e => set('equipmentId', e.target.value)}>
              <option value="">{t('grossingHardwareSection.modal.deviceNoneOption')}</option>
              {deviceOptions.map(d => <option key={d.id} value={d.id}>{t('grossingHardwareSection.modal.deviceOption', { name: d.name, code: d.code })}</option>)}
            </select>
            {errorText('equipmentId') ?? <span className="ps-conf-field-hint">{t('grossingHardwareSection.modal.deviceHint')}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('grossingHardwareSection.modal.statusLabel')}</label>
            <div className="ps-conf-toggle-row">
              <button type="button" aria-pressed={draft.isActive} onClick={() => set('isActive', !draft.isActive)}
                className={`ps-conf-toggle-track ${draft.isActive ? 'ps-conf-toggle-track--active' : ''}`}>
                <span className="ps-conf-toggle-thumb" />
              </button>
              <span className={`ps-conf-toggle-label ${draft.isActive ? 'ps-conf-toggle-label--active' : ''}`}>{draft.isActive ? t('common.active') : t('common.inactive')}</span>
            </div>
          </div>
          {saveFailed && <span className="ps-conf-error-text">{t('grossingHardwareSection.errors.saveFailed')}</span>}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? t('grossingHardwareSection.modal.addButton') : t('grossingHardwareSection.modal.saveButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

const GrossingHardwareSection: React.FC<{ selectedFacilityId?: string }> = ({ selectedFacilityId }) => {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<GrossingHardwareProfile[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [stations, setStations] = useState<ScanStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; profile?: GrossingHardwareProfile } | null>(null);

  const reload = () => grossingHardwareProfileService.getAll().then(res => { if (res.ok) setProfiles(res.data); });
  useEffect(() => {
    Promise.all([
      reload(),
      equipmentService.getAll().then(res => { if (res.ok) setEquipment(res.data); }),
      scanStationService.getAll().then(res => { if (res.ok) setStations(res.data); }),
    ]).finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => grossingProfilesForFacility(profiles, stations, selectedFacilityId), [profiles, stations, selectedFacilityId]);

  const handleSave = async (draft: GrossingHardwareDraft): Promise<boolean> => {
    const res = modal?.mode === 'edit' && modal.profile
      ? await grossingHardwareProfileService.update(modal.profile.id, draft)
      : await grossingHardwareProfileService.create(draft);
    if (!res.ok) return false;
    await reload();
    setModal(null);
    return true;
  };

  const toggleActive = async (p: GrossingHardwareProfile) => {
    await grossingHardwareProfileService.update(p.id, { isActive: !p.isActive });
    await reload();
  };

  if (loading) return <div className="ps-conf-loading">{t('grossingHardwareSection.loading')}</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('grossingHardwareSection.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('grossingHardwareSection.subtitle')}</p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('grossingHardwareSection.addButton')}</button>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {(['label', 'kind', 'bridge', 'station', 'device', 'status', 'actions'] as const).map(h => (
                  <th key={h} className="ps-conf-th">{t(`grossingHardwareSection.headers.${h}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(p => {
                const device = p.equipmentId ? equipment.find(e => e.id === p.equipmentId) : undefined;
                return (
                  <tr key={p.id} className="ps-conf-tr">
                    <td className="ps-conf-td"><div className="ps-conf-identity-name">{p.label}</div></td>
                    <td className="ps-conf-td">{t(`equipmentKinds.${p.kind}`)}</td>
                    <td className="ps-conf-td">{t(`grossingHardwareSection.bridges.${p.bridgeType}`)}</td>
                    <td className="ps-conf-td">{p.stationId ? (stations.find(s => s.id === p.stationId)?.name ?? p.stationId) : t('grossingHardwareSection.anyStation')}</td>
                    <td className="ps-conf-td">{device ? t('grossingHardwareSection.modal.deviceOption', { name: device.name, code: device.code }) : (p.equipmentId ?? '—')}</td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-status-cell">
                        <span className={`ps-conf-status-dot ${p.isActive ? 'ps-conf-status-dot--active' : ''}`} />
                        <span className={`ps-conf-status-text ${p.isActive ? 'ps-conf-status-text--active' : ''}`}>{p.isActive ? t('common.active') : t('common.inactive')}</span>
                      </div>
                    </td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-row-actions">
                        <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', profile: p })}>{t('common.edit')}</button>
                        <button className="ps-conf-btn-row" onClick={() => toggleActive(p)}>{p.isActive ? t('common.deactivate') : t('common.reactivate')}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={7}>{t('grossingHardwareSection.emptyRow')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <GrossingHardwareModal mode={modal.mode} profile={modal.profile} equipment={equipment} stations={stations} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default GrossingHardwareSection;
