// src/components/Config/System/EquipmentSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 358: the equipment register (Configuration → System → Workstation &
// Hardware → Equipment). Pete chose to centralise equipment: this screen
// holds every device's identity (code, name, kind, make, model, serial
// number), where it is (performing lab, scan station) and status. Workflow
// settings stay on their own screens (Printer Profiles, Grossing Hardware)
// and point at an entry here.
//
// Took over Batch 356's InstrumentsSection.tsx: molecular batches target the
// active analysers. Deactivate rather than delete, since batches and printed
// labels carry the code. The rules are services/equipment/equipmentRules.ts.
//
// Batch 360 added the Service column and log; Batch 361 shows a device in red
// when it has an open malfunction or is past due.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { equipmentService, equipmentLogService, scanStationService, printerProfileService, grossingHardwareProfileService, EQUIPMENT_KINDS } from '../../../services';
import type { EquipmentLogEntry } from '../../../services';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { useAuth } from '@/contexts/AuthContext';
import { getFacilityIsoDate } from '../../../utils/facilityTime';
import { formatCalendarDate } from '../../../utils/search/caseSearchCsv';
import { earliestDue, equipmentServiceState, groupLogByEquipment, isServiceAlert } from '../../../services/equipment/equipmentLogRules';
import EquipmentLogModal from './EquipmentLogModal';
import type { Equipment, EquipmentDraft, EquipmentKind, Facility, GrossingHardwareProfile, PrinterProfile, ScanStation } from '../../../services';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import {
  filterEquipment, normaliseEquipmentCode, settingsLinksByEquipment, stationsForEquipment, validateEquipmentDraft, type EquipmentDraftErrors,
} from '../../../services/equipment/equipmentRules';

type Draft = Omit<EquipmentDraft, 'status'> & { active: boolean };
const emptyDraft: Draft = { code: '', name: '', kind: 'analyser', make: '', model: '', serialNumber: '', facilityId: '', scanStationId: '', active: true };

/** An interval field's text as days; empty = not scheduled. */
const toDays = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));

interface ModalProps {
  mode: 'add' | 'edit';
  item?: Equipment;
  items: Equipment[];
  labs: Facility[];
  stations: ScanStation[];
  defaultFacilityId?: string;
  onSave: (draft: Draft) => Promise<boolean>;
  onClose: () => void;
}

const EquipmentModal: React.FC<ModalProps> = ({ mode, item, items, labs, stations, defaultFacilityId, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(
    item
      ? {
          code: item.code, name: item.name, kind: item.kind, make: item.make ?? '', model: item.model ?? '', serialNumber: item.serialNumber ?? '',
          facilityId: item.facilityId, scanStationId: item.scanStationId ?? '', active: item.status === 'Active',
          maintenanceIntervalDays: item.maintenanceIntervalDays, calibrationIntervalDays: item.calibrationIntervalDays,
        }
      : { ...emptyDraft, facilityId: defaultFacilityId ?? '' },
  );
  const [errors, setErrors] = useState<EquipmentDraftErrors>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const stationOptions = stationsForEquipment(stations, draft.facilityId);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft(prev => ({ ...prev, [k]: v, ...(k === 'facilityId' ? { scanStationId: '' } : {}) }));
    setErrors(prev => ({ ...prev, [k]: undefined }));
  };

  const handleSave = async () => {
    const e = validateEquipmentDraft(draft, { existing: items, stations, editingId: item?.id });
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSaveFailed(!(await onSave(draft)));
  };

  const errorText = (field: keyof EquipmentDraftErrors) =>
    errors[field] ? <span className="ps-conf-error-text">{t(`equipmentSection.errors.${errors[field]}`)}</span> : null;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'add' ? t('equipmentSection.modal.addTitle') : t('equipmentSection.modal.editTitle', { name: item?.name })}
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="eq-name">{t('equipmentSection.modal.nameLabel')} <span className="ps-conf-required">*</span></label>
            <input id="eq-name" className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder={t('equipmentSection.modal.namePlaceholder')} />
            {errorText('name')}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="eq-code">{t('equipmentSection.modal.codeLabel')} <span className="ps-conf-required">*</span></label>
            <input id="eq-code" className={`ps-conf-input ${errors.code ? 'ps-conf-input--error' : ''}`}
              value={draft.code} disabled={mode === 'edit'}
              onChange={e => set('code', normaliseEquipmentCode(e.target.value))} placeholder={t('equipmentSection.modal.codePlaceholder')} />
            {errorText('code') ?? <span className="ps-conf-field-hint">{mode === 'edit' ? t('equipmentSection.modal.codeLockedHint') : t('equipmentSection.modal.codeHint')}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="eq-kind">{t('equipmentSection.modal.kindLabel')} <span className="ps-conf-required">*</span></label>
            <select id="eq-kind" className={`ps-conf-select ${errors.kind ? 'ps-conf-input--error' : ''}`}
              value={draft.kind} onChange={e => set('kind', e.target.value as EquipmentKind)}>
              {EQUIPMENT_KINDS.map(k => <option key={k} value={k}>{t(`equipmentKinds.${k}`)}</option>)}
            </select>
            {errorText('kind') ?? (draft.kind === 'analyser' && <span className="ps-conf-field-hint">{t('equipmentSection.modal.analyserHint')}</span>)}
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="eq-make">{t('equipmentSection.modal.makeLabel')}</label>
              <input id="eq-make" className="ps-conf-input" value={draft.make ?? ''} onChange={e => set('make', e.target.value)} placeholder={t('equipmentSection.modal.makePlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="eq-model">{t('equipmentSection.modal.modelLabel')}</label>
              <input id="eq-model" className="ps-conf-input" value={draft.model ?? ''} onChange={e => set('model', e.target.value)} placeholder={t('equipmentSection.modal.modelPlaceholder')} />
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="eq-serial">{t('equipmentSection.modal.serialLabel')}</label>
            <input id="eq-serial" className="ps-conf-input" value={draft.serialNumber ?? ''} onChange={e => set('serialNumber', e.target.value)} placeholder={t('equipmentSection.modal.serialPlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="eq-facility">{t('equipmentSection.modal.facilityLabel')} <span className="ps-conf-required">*</span></label>
            <select id="eq-facility" className={`ps-conf-select ${errors.facilityId ? 'ps-conf-input--error' : ''}`}
              value={draft.facilityId} onChange={e => set('facilityId', e.target.value)}>
              <option value="">{t('equipmentSection.modal.facilityNoneOption')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {errorText('facilityId')}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="eq-station">{t('equipmentSection.modal.stationLabel')}</label>
            <select id="eq-station" className={`ps-conf-select ${errors.scanStationId ? 'ps-conf-input--error' : ''}`}
              value={draft.scanStationId ?? ''} disabled={!draft.facilityId} onChange={e => set('scanStationId', e.target.value)}>
              <option value="">{t('equipmentSection.modal.stationNoneOption')}</option>
              {stationOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {errorText('scanStationId') ?? <span className="ps-conf-field-hint">{t('equipmentSection.modal.stationHint')}</span>}
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="eq-maint">{t('equipmentSection.modal.maintenanceIntervalLabel')}</label>
              <input id="eq-maint" type="number" min={1} className={`ps-conf-input ${errors.maintenanceIntervalDays ? 'ps-conf-input--error' : ''}`}
                value={draft.maintenanceIntervalDays ?? ''} onChange={e => set('maintenanceIntervalDays', toDays(e.target.value))} placeholder={t('equipmentSection.modal.intervalPlaceholder')} />
              {errorText('maintenanceIntervalDays')}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="eq-calib">{t('equipmentSection.modal.calibrationIntervalLabel')}</label>
              <input id="eq-calib" type="number" min={1} className={`ps-conf-input ${errors.calibrationIntervalDays ? 'ps-conf-input--error' : ''}`}
                value={draft.calibrationIntervalDays ?? ''} onChange={e => set('calibrationIntervalDays', toDays(e.target.value))} placeholder={t('equipmentSection.modal.intervalPlaceholder')} />
              {errorText('calibrationIntervalDays')}
            </div>
          </div>
          <span className="ps-conf-field-hint">{t('equipmentSection.modal.intervalHint')}</span>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('equipmentSection.modal.statusLabel')}</label>
            <div className="ps-conf-toggle-row">
              <button type="button" aria-pressed={draft.active} onClick={() => set('active', !draft.active)}
                className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <span className="ps-conf-toggle-thumb" />
              </button>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? t('common.active') : t('common.inactive')}</span>
            </div>
          </div>
          {saveFailed && <span className="ps-conf-error-text">{t('equipmentSection.errors.saveFailed')}</span>}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? t('equipmentSection.modal.addButton') : t('equipmentSection.modal.saveButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

const EquipmentSection: React.FC<{ selectedFacilityId?: string }> = ({ selectedFacilityId }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<Equipment[]>([]);
  const [stations, setStations] = useState<ScanStation[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Equipment['status']>('All');
  const [kindFilter, setKindFilter] = useState<'All' | EquipmentKind>('All');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Equipment } | null>(null);
  // Batch 360: service log and due status.
  const { config } = useSystemConfig();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const today = getFacilityIsoDate(new Date(), config.facilityTimezone);
  const [logEntries, setLogEntries] = useState<EquipmentLogEntry[]>([]);
  const [logFor, setLogFor] = useState<Equipment | null>(null);
  const logByDevice = useMemo(() => groupLogByEquipment(logEntries), [logEntries]);
  const reloadLog = () => equipmentLogService.list().then(res => { if (res.ok) setLogEntries(res.data); });
  // Batch 359: which settings records point at each device (printer profiles, grossing hardware).
  const [printerProfiles, setPrinterProfiles] = useState<PrinterProfile[]>([]);
  const [grossingProfiles, setGrossingProfiles] = useState<GrossingHardwareProfile[]>([]);
  const settingsLinks = useMemo(() => settingsLinksByEquipment(printerProfiles, grossingProfiles), [printerProfiles, grossingProfiles]);

  const reload = () => equipmentService.getAll().then(res => { if (res.ok) setItems(res.data); });
  useEffect(() => {
    Promise.all([
      reload(),
      scanStationService.getAll().then(res => { if (res.ok) setStations(res.data); }),
      getActivePerformingLabs().then(setLabs),
      printerProfileService.getAll().then(res => { if (res.ok) setPrinterProfiles(res.data); }),
      reloadLog(),
      grossingHardwareProfileService.getAll().then(res => { if (res.ok) setGrossingProfiles(res.data); }),
    ])
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(
    () => filterEquipment(items, { search, status: statusFilter, kind: kindFilter, facilityId: selectedFacilityId }),
    [items, search, statusFilter, kindFilter, selectedFacilityId],
  );

  const handleSave = async (draft: Draft): Promise<boolean> => {
    const { active, ...rest } = draft;
    const status: Equipment['status'] = active ? 'Active' : 'Inactive';
    const res = modal?.mode === 'edit' && modal.item
      ? await equipmentService.update(modal.item.id, {
          name: rest.name, kind: rest.kind, make: rest.make, model: rest.model, serialNumber: rest.serialNumber,
          facilityId: rest.facilityId, scanStationId: rest.scanStationId, status,
          maintenanceIntervalDays: rest.maintenanceIntervalDays, calibrationIntervalDays: rest.calibrationIntervalDays,
        })
      : await equipmentService.create({ ...rest, status });
    if (!res.ok) return false;
    await reload();
    setModal(null);
    return true;
  };

  const toggleStatus = async (i: Equipment) => {
    await (i.status === 'Active' ? equipmentService.deactivate(i.id) : equipmentService.reactivate(i.id));
    await reload();
  };

  if (loading) return <div className="ps-conf-loading">{t('equipmentSection.loading')}</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('equipmentSection.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('equipmentSection.subtitle')}</p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('equipmentSection.addButton')}</button>
      </div>

      <div className="ps-conf-form-row--3">
        <input type="text" className="ps-conf-search" placeholder={t('equipmentSection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
        <select className="ps-conf-select" aria-label={t('equipmentSection.kindFilterLabel')} value={kindFilter} onChange={e => setKindFilter(e.target.value as 'All' | EquipmentKind)}>
          <option value="All">{t('equipmentSection.kindFilterAll')}</option>
          {EQUIPMENT_KINDS.map(k => <option key={k} value={k}>{t(`equipmentKinds.${k}`)}</option>)}
        </select>
        <select className="ps-conf-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'All' | Equipment['status'])}>
          <option value="All">{t('equipmentSection.statusFilterAll')}</option>
          <option value="Active">{t('common.active')}</option>
          <option value="Inactive">{t('common.inactive')}</option>
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {(['item', 'code', 'kind', 'makeModel', 'facility', 'station', 'settings', 'service', 'status', 'actions'] as const).map(h => (
                  <th key={h} className="ps-conf-th">{t(`equipmentSection.headers.${h}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(i => {
                const svc = equipmentServiceState(i, logByDevice.get(i.id) ?? [], today);
                const due = earliestDue(today, svc.maintenance, svc.calibration);
                return (
                // Batch 361: a device with an open malfunction or past due is shown in red (flagged, not blocked).
                <tr key={i.id} className={`ps-conf-tr ${isServiceAlert(svc.state) ? 'ps-eqlog-row--alert' : ''}`}>
                  <td className="ps-conf-td"><div className="ps-conf-identity-name">{i.name}</div></td>
                  <td className="ps-conf-td"><code>{i.code}</code></td>
                  <td className="ps-conf-td">{t(`equipmentKinds.${i.kind}`)}</td>
                  <td className="ps-conf-td">{[i.make, i.model].filter(Boolean).join(' ') || '—'}</td>
                  <td className="ps-conf-td">{labs.find(l => l.id === i.facilityId)?.name ?? i.facilityId}</td>
                  <td className="ps-conf-td">{i.scanStationId ? (stations.find(s => s.id === i.scanStationId)?.name ?? i.scanStationId) : '—'}</td>
                  <td className="ps-conf-td">
                    {(settingsLinks.get(i.id) ?? []).map((l, n) => <div key={n} className="ps-specreq-meta">{t(`equipmentSection.settingsLink.${l.type}`, { name: l.label })}</div>)}
                    {!settingsLinks.has(i.id) && '—'}
                  </td>
                  <td className="ps-conf-td">
                    <span className={`ps-eqlog-state ps-eqlog-state--${svc.state}`}>{t(`equipmentLog.state.${svc.state}`)}</span>
                    {due && <div className="ps-specreq-meta">{t(due.overdue ? 'equipmentSection.wasDue' : 'equipmentSection.nextDue', { date: formatCalendarDate(due.date, i18n.language, 'UTC') })}</div>}
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${i.status === 'Active' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${i.status === 'Active' ? 'ps-conf-status-text--active' : ''}`}>{i.status === 'Active' ? t('common.active') : t('common.inactive')}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', item: i })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => setLogFor(i)}>{t('equipmentSection.logButton')}</button>
                      <button className="ps-conf-btn-row" onClick={() => toggleStatus(i)}>{i.status === 'Active' ? t('common.deactivate') : t('common.reactivate')}</button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {shown.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={10}>{t('equipmentSection.emptyRow')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {logFor && (
        <EquipmentLogModal item={logFor} entries={logByDevice.get(logFor.id) ?? []} today={today}
          userId={user?.id ?? 'unknown'} userName={user?.name ?? ''} onAdded={reloadLog} onClose={() => setLogFor(null)} />
      )}
      {modal && (
        <EquipmentModal mode={modal.mode} item={modal.item} items={items} labs={labs} stations={stations}
          defaultFacilityId={selectedFacilityId} onSave={handleSave} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default EquipmentSection;
