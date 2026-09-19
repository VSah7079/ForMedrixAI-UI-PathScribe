// src/components/Config/System/DisplayProfilesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-288 — admin CRUD for DisplayProfile, the data-only device
// registry for the five real Facility Ops Dashboard wall displays.
// Same real list/add-edit-modal/deactivate pattern as
// OrSuiteTerminalsSection.tsx, for a genuinely analogous real entity
// (a wall-mounted display bound to a profile rather than a per-user
// login). Built with i18n from the start, per this session's own
// standing multi-language instruction.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import '../../../pathscribe.css';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import { mockDisplayProfileService } from '../../../services/facilityOpsDashboard/mockDisplayProfileService';
import { DASHBOARD_VIEW_IDS } from '../../../services/facilityOpsDashboard/IDisplayProfileService';
import type { DisplayProfile, NewDisplayProfile, DashboardViewId } from '../../../services/facilityOpsDashboard/IDisplayProfileService';

type Draft = NewDisplayProfile;
const emptyDraft = (): Draft => ({ name: '', facilityId: '', assignedViews: [], carouselIntervalSeconds: undefined, deviceToken: '', status: 'Active' });

const VIEW_LABEL_KEYS: Record<DashboardViewId, string> = {
  grossing_intake: 'facilityOpsDashboard.views.grossingIntake',
  embedding_microtomy: 'facilityOpsDashboard.views.embeddingMicrotomy',
  staining_ihc: 'facilityOpsDashboard.views.stainingIhc',
  sendout_reference: 'facilityOpsDashboard.views.sendoutReference',
  diagnostic_signout: 'facilityOpsDashboard.views.diagnosticSignout',
};

const ProfileModal: React.FC<{ mode: 'add' | 'edit'; entry?: DisplayProfile; onSave: (draft: Draft) => void; onClose: () => void }> = ({ mode, entry, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());
  const [labs, setLabs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);

  const toggleView = (v: DashboardViewId) => {
    setDraft(d => ({ ...d, assignedViews: d.assignedViews.includes(v) ? d.assignedViews.filter(x => x !== v) : [...d.assignedViews, v] }));
  };

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? t('displayProfiles.addTitle') : t('displayProfiles.editTitle')}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="dispprof-name">{t('displayProfiles.nameLabel')}</label>
          <input id="dispprof-name" className="ps-conf-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={t('displayProfiles.namePlaceholder')} />

          <label className="ps-label" htmlFor="dispprof-facility">{t('displayProfiles.facilityLabel')}</label>
          <select id="dispprof-facility" className="ps-conf-select" value={draft.facilityId}
            onChange={e => setDraft({ ...draft, facilityId: e.target.value })}>
            <option value="">{t('displayProfiles.selectFacility')}</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <label className="ps-label">{t('displayProfiles.assignedViewsLabel')}</label>
          {DASHBOARD_VIEW_IDS.map(v => (
            <label key={v} className="ps-conf-toggle-label-row">
              <input type="checkbox" checked={draft.assignedViews.includes(v)} onChange={() => toggleView(v)} className="ps-conf-radio-input" />
              <span className="ps-conf-option-text">{t(VIEW_LABEL_KEYS[v])}</span>
            </label>
          ))}

          {draft.assignedViews.length > 1 && (
            <>
              <label className="ps-label" htmlFor="dispprof-carousel">{t('displayProfiles.carouselIntervalLabel')}</label>
              <input id="dispprof-carousel" type="number" min={5} className="ps-conf-input"
                value={draft.carouselIntervalSeconds ?? ''}
                onChange={e => setDraft({ ...draft, carouselIntervalSeconds: e.target.value ? Number(e.target.value) : undefined })}
                placeholder={t('displayProfiles.carouselIntervalPlaceholder')} />
            </>
          )}

          <label className="ps-label" htmlFor="dispprof-token">{t('displayProfiles.deviceTokenLabel')}</label>
          <input id="dispprof-token" className="ps-conf-input" value={draft.deviceToken ?? ''} onChange={e => setDraft({ ...draft, deviceToken: e.target.value })} placeholder={t('displayProfiles.deviceTokenPlaceholder')} />
          <p className="ps-conf-section-subtitle">{t('displayProfiles.deviceTokenNote')}</p>
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.name.trim() || !draft.facilityId || draft.assignedViews.length === 0}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
};

const DisplayProfilesSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<DisplayProfile[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: DisplayProfile } | null>(null);

  const refresh = () => { mockDisplayProfileService.getAll().then(res => { if (res.ok) setEntries(res.data); }); };
  useEffect(() => { refresh(); }, []);

  const visible = entries.filter(e => showInactive || e.status === 'Active');

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) await mockDisplayProfileService.update(modal.entry.id, draft);
    else await mockDisplayProfileService.add(draft);
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: DisplayProfile) => {
    if (e.status === 'Active') await mockDisplayProfileService.deactivate(e.id);
    else await mockDisplayProfileService.update(e.id, { status: 'Active' });
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">{t('displayProfiles.sectionTitle')}</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">{t('displayProfiles.sectionSubtitle')}</p>
        </div>
        {/* Real, per "Homepage Changes part 1" (direct request): "Move
            Facilities Ops Dashboards under Configuration." The kiosk
            page itself (/facility-ops-dashboard) is unchanged — this
            is simply its new, real discovery path, replacing the Home
            tile that used to link to it. Same route Home's own former
            tile navigated to. */}
        <button className="ps-conf-btn-primary" onClick={() => navigate('/facility-ops-dashboard')}>{t('displayProfiles.launchDashboardButton')}</button>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>{t('displayProfiles.addButton')}</button>
      </div>

      <label className="ps-conf-toggle-label-row" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="ps-conf-radio-input" />
        <span className="ps-conf-option-text">{t('displayProfiles.showInactive')}</span>
      </label>

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.name}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                {' · '}{e.assignedViews.map(v => t(VIEW_LABEL_KEYS[v])).join(', ')}
                {e.status === 'Inactive' ? ` · ${t('displayProfiles.inactive')}` : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.status === 'Active' ? t('displayProfiles.deactivate') : t('displayProfiles.reactivate')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>{t('common.edit')}</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">{t('displayProfiles.emptyRow')}</div>}
      </div>

      {modal && <ProfileModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default DisplayProfilesSection;
