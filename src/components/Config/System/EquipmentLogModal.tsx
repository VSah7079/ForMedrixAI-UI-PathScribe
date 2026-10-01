// src/components/Config/System/EquipmentLogModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 360: one device's service log, opened from the Equipment register.
// Shows when maintenance and calibration were last done and are next due,
// flags an open malfunction, lets the user record a new entry, and lists
// the history newest first. Entries are append-only: a mistake is corrected
// by a new entry. Rules: services/equipment/equipmentLogRules.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { equipmentLogService, EQUIPMENT_LOG_OUTCOMES, EQUIPMENT_LOG_TYPES } from '../../../services';
import type { Equipment, EquipmentLogEntry, EquipmentLogOutcome, EquipmentLogType } from '../../../services';
import {
  equipmentServiceState, validateEquipmentLogEntry, type DueInfo, type EquipmentLogErrors,
} from '../../../services/equipment/equipmentLogRules';
import { formatCalendarDate } from '../../../utils/search/caseSearchCsv';

interface Props {
  item: Equipment;
  entries: EquipmentLogEntry[];
  /** The facility's date, 'YYYY-MM-DD'. */
  today: string;
  userId: string;
  userName: string;
  onAdded: () => Promise<void>;
  onClose: () => void;
}

type Draft = { type: EquipmentLogType; performedOn: string; performedBy: string; outcome: EquipmentLogOutcome; notes: string };

const EquipmentLogModal: React.FC<Props> = ({ item, entries, today, userId, userName, onAdded, onClose }) => {
  const { t, i18n } = useTranslation();
  const day = (iso: string) => formatCalendarDate(iso, i18n.language, 'UTC');
  const [draft, setDraft] = useState<Draft>({ type: 'maintenance', performedOn: today, performedBy: userName, outcome: 'pass', notes: '' });
  const [errors, setErrors] = useState<EquipmentLogErrors>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const status = equipmentServiceState(item, entries, today);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: undefined })); };

  const handleAdd = async () => {
    const e = validateEquipmentLogEntry(draft, today);
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSaving(true);
    try {
      const res = await equipmentLogService.add({ ...draft, equipmentId: item.id, recordedByUserId: userId }, today);
      setSaveFailed(!res.ok);
      if (res.ok) {
        setDraft(prev => ({ ...prev, notes: '' }));
        await onAdded();
      }
    } finally {
      setSaving(false);
    }
  };

  const dueLine = (label: string, info: DueInfo | null) => (
    <div className="ps-eqlog-due-row">
      <span className="ps-eqlog-due-label">{label}</span>
      {!info ? <span className="ps-eqlog-muted">{t('equipmentLog.modal.notScheduled')}</span> : (
        <>
          <span className={`ps-eqlog-state ps-eqlog-state--${info.state}`}>{t(`equipmentLog.state.${info.state}`)}</span>
          {info.lastDone && <span className="ps-eqlog-muted">{t('equipmentLog.modal.lastDone', { date: day(info.lastDone) })}</span>}
          {info.dueOn && <span className="ps-eqlog-muted">{t('equipmentLog.modal.dueOn', { date: day(info.dueOn) })}</span>}
        </>
      )}
    </div>
  );

  const errorText = (field: keyof EquipmentLogErrors) =>
    errors[field] ? <span className="ps-conf-error-text">{t(`equipmentLog.errors.${errors[field]}`)}</span> : null;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--medium">
        <div className="ps-ms-header-row">
          <div className="ps-ms-header">{t('equipmentLog.modal.title', { name: item.name, code: item.code })}</div>
          <button className="ps-ms-close-btn" onClick={onClose} title={t('equipmentLog.modal.close')}>✕</button>
        </div>
        <div className="ps-ms-body">
          {status.state === 'malfunction' && <div className="ps-eqlog-alert">{t('equipmentLog.modal.openMalfunction')}</div>}
          <div className="ps-eqlog-due">
            {dueLine(t('equipmentLog.types.maintenance'), status.maintenance)}
            {dueLine(t('equipmentLog.types.calibration'), status.calibration)}
          </div>

          <div className="ps-eqlog-section-title">{t('equipmentLog.modal.addTitle')}</div>
          <div className="ps-conf-form-row--3">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="eqlog-type">{t('equipmentLog.modal.typeLabel')}</label>
              <select id="eqlog-type" className="ps-conf-select" value={draft.type} onChange={e => set('type', e.target.value as EquipmentLogType)}>
                {EQUIPMENT_LOG_TYPES.map(x => <option key={x} value={x}>{t(`equipmentLog.types.${x}`)}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="eqlog-date">{t('equipmentLog.modal.dateLabel')}</label>
              <input id="eqlog-date" type="date" max={today} className={`ps-conf-input ${errors.performedOn ? 'ps-conf-input--error' : ''}`}
                value={draft.performedOn} onChange={e => set('performedOn', e.target.value)} />
              {errorText('performedOn')}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="eqlog-outcome">{t('equipmentLog.modal.outcomeLabel')}</label>
              <select id="eqlog-outcome" className="ps-conf-select" value={draft.outcome} onChange={e => set('outcome', e.target.value as EquipmentLogOutcome)}>
                {EQUIPMENT_LOG_OUTCOMES.map(x => <option key={x} value={x}>{t(`equipmentLog.outcomes.${x}`)}</option>)}
              </select>
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="eqlog-by">{t('equipmentLog.modal.performedByLabel')}</label>
            <input id="eqlog-by" className={`ps-conf-input ${errors.performedBy ? 'ps-conf-input--error' : ''}`}
              value={draft.performedBy} onChange={e => set('performedBy', e.target.value)} placeholder={t('equipmentLog.modal.performedByPlaceholder')} />
            {errorText('performedBy')}
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="eqlog-notes">{t('equipmentLog.modal.notesLabel')}</label>
            <textarea id="eqlog-notes" rows={2} className={`ps-conf-input ${errors.notes ? 'ps-conf-input--error' : ''}`}
              value={draft.notes} onChange={e => set('notes', e.target.value)} />
            {errorText('notes') ?? <span className="ps-conf-field-hint">{t('equipmentLog.modal.notesHint')}</span>}
          </div>
          {saveFailed && <span className="ps-conf-error-text">{t('equipmentLog.errors.saveFailed')}</span>}
          <div className="ps-eqlog-add-row">
            <span className="ps-eqlog-muted">{t('equipmentLog.modal.appendOnlyHint')}</span>
            <button className="ps-conf-btn-primary" disabled={saving} onClick={handleAdd}>{t('equipmentLog.modal.addButton')}</button>
          </div>

          <div className="ps-eqlog-section-title">{t('equipmentLog.modal.historyTitle')}</div>
          <div className="ps-conf-table-wrap">
            <table className="ps-conf-table">
              <thead>
                <tr>{(['date', 'type', 'outcome', 'by', 'notes'] as const).map(h => <th key={h} className="ps-conf-th">{t(`equipmentLog.headers.${h}`)}</th>)}</tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="ps-conf-tr">
                    <td className="ps-conf-td">{day(e.performedOn)}</td>
                    <td className="ps-conf-td">{t(`equipmentLog.types.${e.type}`)}</td>
                    <td className="ps-conf-td"><span className={`ps-eqlog-outcome ps-eqlog-outcome--${e.outcome}`}>{t(`equipmentLog.outcomes.${e.outcome}`)}</span></td>
                    <td className="ps-conf-td">{e.performedBy}</td>
                    <td className="ps-conf-td">{e.notes ?? '—'}</td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={5}>{t('equipmentLog.modal.historyEmpty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentLogModal;
