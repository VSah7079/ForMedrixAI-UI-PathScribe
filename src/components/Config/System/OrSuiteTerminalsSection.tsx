// src/components/Config/System/OrSuiteTerminalsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct design brief on the RFP-APLIS-2026-GLOBAL
// Intraoperative/Frozen Section Dashboard — admin CRUD for
// OrSuiteTerminal. Same real list/add-edit-modal/deactivate pattern
// this app's own other dictionaries already use (DpVendorDictionarySection.tsx),
// with the same real facility→location cascade ScanStationsSection.tsx
// already established for a genuinely analogous physical-device binding.
//
// i18n sweep (batch 43): real dictionary content admins enter or that
// comes from other real records (terminal name, facility name,
// location pointOfCare/room) stays as typed/stored — same convention
// as DpVendorDictionarySection.tsx (batch 41) and every other
// dictionary in this app. Only the surrounding page/modal chrome goes
// through the new `orSuiteTerminalsSection` namespace. The two
// hand-rolled inline styles (toggle-row margin, status meta line) are
// now small `.ps-orterm__*` modifiers, matching that same batch-41
// approach.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { locationService } from '../../../services';
import { mockOrSuiteTerminalService } from '../../../services/intraopDashboard/mockOrSuiteTerminalService';
import type { OrSuiteTerminal, NewOrSuiteTerminal } from '../../../services/intraopDashboard/IOrSuiteTerminalService';
import type { Location } from '../../../services/locations/ILocationService';

type Draft = NewOrSuiteTerminal;
const emptyDraft = (): Draft => ({ name: '', locationId: '', facilityId: '', canViewMultiSuite: false, status: 'Active' });

const TerminalModal: React.FC<{ mode: 'add' | 'edit'; entry?: OrSuiteTerminal; onSave: (draft: Draft) => void; onClose: () => void }> = ({ mode, entry, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());
  const [labs, setLabs] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);
  useEffect(() => {
    if (!draft.facilityId) { setLocations([]); return; }
    locationService.listForFacility(draft.facilityId).then(res => { if (res.ok) setLocations(res.data); });
  }, [draft.facilityId]);

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? t('orSuiteTerminalsSection.modal.addTitle') : t('orSuiteTerminalsSection.modal.editTitle')}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="orterm-name">{t('orSuiteTerminalsSection.modal.nameLabel')}</label>
          <input id="orterm-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={t('orSuiteTerminalsSection.modal.namePlaceholder')} />

          <label className="ps-label" htmlFor="orterm-facility">{t('orSuiteTerminalsSection.modal.facilityLabel')}</label>
          <select id="orterm-facility" className="ps-conf-select" value={draft.facilityId}
            onChange={e => setDraft({ ...draft, facilityId: e.target.value, locationId: '' })}>
            <option value="">{t('orSuiteTerminalsSection.modal.selectFacility')}</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <label className="ps-label" htmlFor="orterm-location">{t('orSuiteTerminalsSection.modal.locationLabel')}</label>
          <select id="orterm-location" className="ps-conf-select" value={draft.locationId} disabled={!draft.facilityId}
            onChange={e => setDraft({ ...draft, locationId: e.target.value })}>
            <option value="">{t('orSuiteTerminalsSection.modal.selectLocation')}</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.pointOfCare}{l.room ? ` — ${l.room}` : ''}</option>)}
          </select>

          <label className="ps-conf-toggle-label-row">
            <input type="checkbox" checked={draft.canViewMultiSuite} onChange={e => setDraft({ ...draft, canViewMultiSuite: e.target.checked })} className="ps-conf-radio-input" />
            <span className="ps-conf-option-text">{t('orSuiteTerminalsSection.modal.multiSuiteLabel')}</span>
          </label>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('orSuiteTerminalsSection.modal.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim() || !draft.locationId}>{t('orSuiteTerminalsSection.modal.save')}</button>
        </div>
      </div>
    </div>
  );
};

const OrSuiteTerminalsSection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<OrSuiteTerminal[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: OrSuiteTerminal } | null>(null);

  const refresh = () => { mockOrSuiteTerminalService.getAll().then(res => { if (res.ok) setEntries(res.data); }); };
  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => showInactive || e.status === 'Active');

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) await mockOrSuiteTerminalService.update(modal.entry.id, draft);
    else await mockOrSuiteTerminalService.add(draft);
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: OrSuiteTerminal) => {
    if (e.status === 'Active') await mockOrSuiteTerminalService.deactivate(e.id);
    else await mockOrSuiteTerminalService.update(e.id, { status: 'Active' });
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">{t('orSuiteTerminalsSection.title')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            {t('orSuiteTerminalsSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('orSuiteTerminalsSection.addTerminal')}</button>
      </div>

      <label className="ps-conf-toggle-label-row ps-orterm__toggle-row">
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">{t('orSuiteTerminalsSection.showInactive')}</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.name}
              <span className="ps-orterm__meta">
                {e.canViewMultiSuite ? ` · ${t('orSuiteTerminalsSection.multiSuiteEligible')}` : ''}{e.status === 'Inactive' ? ` · ${t('orSuiteTerminalsSection.inactive')}` : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.status === 'Active' ? t('orSuiteTerminalsSection.actions.deactivate') : t('orSuiteTerminalsSection.actions.reactivate')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>{t('orSuiteTerminalsSection.actions.edit')}</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('orSuiteTerminalsSection.emptyRow')}</div>}
      </div>

      {modal && <TerminalModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default OrSuiteTerminalsSection;
