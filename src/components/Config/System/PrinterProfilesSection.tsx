// src/components/Config/System/PrinterProfilesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct request: PS-51's own spec, Section 2
// ("Printer Capability & Profile Registry"). Real admin UI for the
// registry — see IPrinterProfileService.ts's own header for the full
// scope reasoning (this is the real, PathScribe-side data store;
// actually detecting a real printer's capabilities is Section 8's own
// separate Local Bridge Agent responsibility).
//
// Batch 346 (PS-52): the optional Agent Port for PathScribe Agent
// printers. The save checks come from
// services/printerProfiles/validatePrinterProfileDraft.ts.
//
// Batch 359: each profile can name its physical printer in the equipment
// register (services/equipment/, kind 'label_printer'). This screen keeps
// the printing settings; the register holds the device. The list filter and
// support label moved to services/printerProfiles/printerProfileList.ts.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { printerProfileService, equipmentService } from '../../../services';
import type { PrinterProfile, PrinterVendor, PrinterBridgeType, Facility, Equipment } from '../../../services';
import { equipmentLinkOptions } from '@/services/equipment/equipmentRules';
import { printerProfilesForFacility, printerSupportLabelKey } from '@/services/printerProfiles/printerProfileList';
import { duplicatePrinterProfile } from '@/services/duplication/duplicateEntities';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { hasInvalidAgentPort, isPrinterProfileDraftValid, printerProfileDraftForSave } from '@/services/printerProfiles/validatePrinterProfileDraft';

type Draft = Omit<PrinterProfile, 'id' | 'createdAt' | 'updatedAt'>;

// Real, persisted enum values stay as data — only the display label
// each one maps to gets translated, same `XXX_LABEL_KEY` split this
// sweep already established elsewhere (e.g. QC_MODE_LABEL_KEY,
// MODIFIER_LABEL_KEY).
const VENDOR_LABEL_KEY: Record<PrinterVendor, string> = {
  ZEBRA_ZPL: 'printerProfilesSection.vendorLabels.ZEBRA_ZPL',
  CITIZEN: 'printerProfilesSection.vendorLabels.CITIZEN',
  SATO: 'printerProfilesSection.vendorLabels.SATO',
  LEICA_CEREBRO: 'printerProfilesSection.vendorLabels.LEICA_CEREBRO',
  SAKURA_TISSUE_TEK: 'printerProfilesSection.vendorLabels.SAKURA_TISSUE_TEK',
  OTHER: 'printerProfilesSection.vendorLabels.OTHER',
};

// Real, researched labels — see PrinterBridgeType's own doc comment
// in IPrinterProfileService.ts for the full reasoning behind each.
const BRIDGE_LABEL_KEY: Record<PrinterBridgeType, string> = {
  qz_tray: 'printerProfilesSection.bridgeLabels.qz_tray',
  zebra_browser_print: 'printerProfilesSection.bridgeLabels.zebra_browser_print',
  bartender_rest: 'printerProfilesSection.bridgeLabels.bartender_rest',
  direct_interface_engine: 'printerProfilesSection.bridgeLabels.direct_interface_engine',
  pathscribe_agent: 'printerProfilesSection.bridgeLabels.pathscribe_agent',
  os_print_dialog: 'printerProfilesSection.bridgeLabels.os_print_dialog',
};

const emptyDraft = (defaultFacilityId?: string): Draft => ({
  printerId: '', model: '', dpi: 300, supportsDataMatrix: true, supportsGS1: true,
  zplVersion: '', maxPrintDensity: 300, moduleSize: 4, vendor: 'ZEBRA_ZPL', bridgeType: 'os_print_dialog',
  ipAddress: '', port: 9100, facilityId: defaultFacilityId ?? '', active: true,
});

interface EditorModalProps {
  mode: 'add' | 'edit';
  entry?: PrinterProfile;
  labs: Facility[];
  equipment: Equipment[];
  defaultFacilityId?: string;
  onSave: (draft: Draft) => Promise<boolean>;
  onClose: () => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ mode, entry, labs, equipment, defaultFacilityId, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? {
    printerId: entry.printerId, model: entry.model, dpi: entry.dpi,
    supportsDataMatrix: entry.supportsDataMatrix, supportsGS1: entry.supportsGS1,
    zplVersion: entry.zplVersion, maxPrintDensity: entry.maxPrintDensity, moduleSize: entry.moduleSize,
    vendor: entry.vendor, bridgeType: entry.bridgeType, ipAddress: entry.ipAddress ?? '', port: entry.port,
    agentPort: entry.agentPort, facilityId: entry.facilityId ?? '', equipmentId: entry.equipmentId, active: entry.active,
  } : emptyDraft(defaultFacilityId));
  const [saveFailed, setSaveFailed] = useState(false);
  const deviceOptions = equipmentLinkOptions(equipment, 'label_printer', entry?.equipmentId);

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(prev => ({ ...prev, [field]: value }));
  const canSave = isPrinterProfileDraftValid(draft);
  const agentPortInvalid = hasInvalidAgentPort(draft);

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--medium">
        <div className="ps-ms-header-row">
          <div className="ps-ms-header">{mode === 'edit' ? t('printerProfilesSection.modal.editTitle', { printerId: entry?.printerId }) : t('printerProfilesSection.modal.addTitle')}</div>
          <button className="ps-ms-close-btn" onClick={onClose} title={t('printerProfilesSection.modal.closeTitle')}>✕</button>
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.printerIdField')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={draft.printerId} onChange={e => set('printerId', e.target.value)} placeholder={t('printerProfilesSection.modal.printerIdPlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.modelField')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={draft.model} onChange={e => set('model', e.target.value)} placeholder={t('printerProfilesSection.modal.modelPlaceholder')} />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.vendorField')}</label>
              <select className="ps-conf-select" value={draft.vendor} onChange={e => set('vendor', e.target.value as PrinterVendor)}>
                {(Object.keys(VENDOR_LABEL_KEY) as PrinterVendor[]).map(v => <option key={v} value={v}>{t(VENDOR_LABEL_KEY[v])}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.zplVersionField')}</label>
              <input className="ps-conf-input" value={draft.zplVersion} onChange={e => set('zplVersion', e.target.value)} placeholder={t('printerProfilesSection.modal.zplVersionPlaceholder')} />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" title={t('printerProfilesSection.modal.bridgeTypeHint')}>
                {t('printerProfilesSection.modal.bridgeTypeField')}
              </label>
              <select className="ps-conf-select" value={draft.bridgeType} onChange={e => set('bridgeType', e.target.value as PrinterBridgeType)}>
                {(Object.keys(BRIDGE_LABEL_KEY) as PrinterBridgeType[]).map(b => <option key={b} value={b}>{t(BRIDGE_LABEL_KEY[b])}</option>)}
              </select>
            </div>
          </div>
          {draft.bridgeType === 'pathscribe_agent' && (
            <div className="ps-conf-form-row">
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="ps-printer-agent-port">{t('printerProfilesSection.modal.agentPortField')}</label>
                <input
                  id="ps-printer-agent-port"
                  className="ps-conf-input"
                  type="number"
                  min={1024}
                  max={65535}
                  value={draft.agentPort ?? ''}
                  onChange={e => set('agentPort', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder={t('printerProfilesSection.modal.agentPortPlaceholder')}
                  aria-invalid={agentPortInvalid}
                  aria-describedby="ps-printer-agent-port-hint"
                />
                <p id="ps-printer-agent-port-hint" className={agentPortInvalid ? 'ps-printer-agent-port-hint ps-printer-agent-port-hint--error' : 'ps-printer-agent-port-hint'}>
                  {agentPortInvalid ? t('printerProfilesSection.modal.agentPortInvalid') : t('printerProfilesSection.modal.agentPortHint')}
                </p>
              </div>
            </div>
          )}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" title={t('printerProfilesSection.modal.facilityHint')}>
                {t('printerProfilesSection.modal.facilityField')}
              </label>
              <select className="ps-conf-select" value={draft.facilityId ?? ''} onChange={e => set('facilityId', e.target.value || undefined)}>
                <option value="">{t('printerProfilesSection.modal.globalFacilityOption')}</option>
                {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="ps-printer-device">{t('printerProfilesSection.modal.deviceField')}</label>
              <select id="ps-printer-device" className="ps-conf-select" value={draft.equipmentId ?? ''} onChange={e => set('equipmentId', e.target.value || undefined)}>
                <option value="">{t('printerProfilesSection.modal.deviceNoneOption')}</option>
                {deviceOptions.map(d => <option key={d.id} value={d.id}>{t('printerProfilesSection.modal.deviceOption', { name: d.name, code: d.code })}</option>)}
              </select>
              <span className="ps-conf-field-hint">{t('printerProfilesSection.modal.deviceHint')}</span>
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.dpiField')}</label>
              <input className="ps-conf-input" type="number" value={draft.dpi} onChange={e => set('dpi', Number(e.target.value) || 0)} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.maxPrintDensityField')}</label>
              <input className="ps-conf-input" type="number" value={draft.maxPrintDensity} onChange={e => set('maxPrintDensity', Number(e.target.value) || 0)} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" title={t('printerProfilesSection.modal.moduleSizeHint')}>
                {t('printerProfilesSection.modal.moduleSizeField')}
              </label>
              <input className="ps-conf-input" type="number" value={draft.moduleSize} onChange={e => set('moduleSize', Number(e.target.value) || 0)} />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.ipAddressField')}</label>
              <input className="ps-conf-input" value={draft.ipAddress} onChange={e => set('ipAddress', e.target.value)} placeholder={t('printerProfilesSection.modal.ipAddressPlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.portField')}</label>
              <input className="ps-conf-input" type="number" value={draft.port ?? ''} onChange={e => set('port', e.target.value ? Number(e.target.value) : undefined)} placeholder={t('printerProfilesSection.modal.portPlaceholder')} />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.supportsDataMatrixField')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('supportsDataMatrix', !draft.supportsDataMatrix)} className={`ps-conf-toggle-track ${draft.supportsDataMatrix ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.supportsGs1Field')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('supportsGS1', !draft.supportsGS1)} className={`ps-conf-toggle-track ${draft.supportsGS1 ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('printerProfilesSection.modal.activeField')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
              </div>
            </div>
          </div>
          {saveFailed && <span className="ps-conf-error-text">{t('printerProfilesSection.modal.saveFailed')}</span>}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={async () => setSaveFailed(!(await onSave(printerProfileDraftForSave(draft))))} disabled={!canSave}>
            {mode === 'add' ? t('printerProfilesSection.modal.addProfileButton') : t('printerProfilesSection.modal.saveChangesButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

const PrinterProfilesSection: React.FC<{ selectedFacilityId?: string }> = ({ selectedFacilityId }) => {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: PrinterProfile } | null>(null);

  const loadAll = () => { printerProfileService.getAll().then(res => { if (res.ok) setProfiles(res.data); }); };
  useEffect(() => {
    loadAll();
    getActivePerformingLabs().then(setLabs);
    equipmentService.getAll().then(res => { if (res.ok) setEquipment(res.data); });
  }, []);

  // Group-level Facility Selector: that lab's printers plus shared (no-lab)
  // ones; the rule is printerProfilesForFacility (Batch 359).
  const filteredProfiles = printerProfilesForFacility(profiles, selectedFacilityId);

  const facilityName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : t('printerProfilesSection.globalFacilityLabel');

  const handleSave = async (draft: Draft): Promise<boolean> => {
    const res = modal?.mode === 'edit' && modal.entry
      ? await printerProfileService.update(modal.entry.id, draft)
      : await printerProfileService.add(draft);
    if (!res.ok) return false;
    setModal(null);
    loadAll();
    return true;
  };

  const handleRemove = (id: string) => {
    printerProfileService.remove(id).then(() => loadAll());
  };

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('printerProfilesSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('printerProfilesSection.subtitle')}
          </p>
        </div>
        <div className="ps-specdict-header-actions">
          <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('printerProfilesSection.addProfileButton')}</button>
        </div>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {([
                  ['printerId', t('printerProfilesSection.headers.printerId')],
                  ['model', t('printerProfilesSection.headers.model')],
                  ['vendor', t('printerProfilesSection.headers.vendor')],
                  ['bridge', t('printerProfilesSection.headers.bridge')],
                  ['facility', t('printerProfilesSection.headers.facility')],
                  ['device', t('printerProfilesSection.headers.device')],
                  ['dpi', t('printerProfilesSection.headers.dpi')],
                  ['gs1DataMatrix', t('printerProfilesSection.headers.gs1DataMatrix')],
                  ['status', t('printerProfilesSection.headers.status')],
                  ['actions', t('printerProfilesSection.headers.actions')],
                ] as const).map(([key, label]) => <th key={key} className="ps-conf-th">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map(p => (
                <tr key={p.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name">{p.printerId}</div>
                    {p.ipAddress && <div className="ps-specreq-meta">{p.ipAddress}{p.port ? `:${p.port}` : ''}</div>}
                  </td>
                  <td className="ps-conf-td">{p.model}</td>
                  <td className="ps-conf-td">{t(VENDOR_LABEL_KEY[p.vendor])}</td>
                  <td className="ps-conf-td">{t(BRIDGE_LABEL_KEY[p.bridgeType])}</td>
                  <td className="ps-conf-td">{facilityName(p.facilityId)}</td>
                  <td className="ps-conf-td">{p.equipmentId ? (equipment.find(e => e.id === p.equipmentId)?.name ?? p.equipmentId) : '—'}</td>
                  <td className="ps-conf-td">{p.dpi}</td>
                  <td className="ps-conf-td">{t(printerSupportLabelKey(p))}</td>
                  <td className="ps-conf-td">
                    <span className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${p.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${p.active ? 'ps-conf-status-text--active' : ''}`}>{p.active ? t('common.active') : t('common.inactive')}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: p })}>{t('common.edit')}</button>
                    {/* Duplicate (PS-73): same printer model at another bench/site. The
                        physical device (printer ID, IP) is not copied. */}
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'add', entry: duplicatePrinterProfile(p) })}>{t('common.duplicate')}</button>
                    <button className="ps-conf-btn-row" onClick={() => handleRemove(p.id)}>{t('common.remove')}</button>
                  </td>
                </tr>
              ))}
              {filteredProfiles.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={10}>{selectedFacilityId ? t('printerProfilesSection.emptyStateForFacility') : t('printerProfilesSection.emptyStateAll')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <EditorModal mode={modal.mode} entry={modal.entry} labs={labs} equipment={equipment} defaultFacilityId={selectedFacilityId} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default PrinterProfilesSection;
