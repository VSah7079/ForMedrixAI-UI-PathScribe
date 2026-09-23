// src/components/Config/System/ExternalResourcesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real admin management for external reference links (CAP protocols, WHO
// classification, internal LIS/lab systems, etc.) — replaces the
// hardcoded object that used to live directly in
// pages/WorklistPage/WorklistPage.tsx, found broken when the CAP URL
// 404'd and there was no way for anyone to fix it without a code change.
//
// Named "External Resources" specifically to match the existing label
// already used in components/NavBar/NavBar.tsx's own eyebrow text for
// this feature — not a new name invented for this screen.
//
// Two real scope levels, same shape as this codebase's other org
// -default + per-facility-override settings (idle-session-timeout, the AI
// orchestrator toggle): 'enterprise' resources are visible to everyone
// in the organisation; 'lab' resources layer on top, visible only at
// the specific performing lab they're tied to. Per a direct requirement:
// the actual viewer-facing resolution (services/externalResources/
// mockExternalResourceService.ts's resolveForViewer) only ever returns
// what's relevant to a given viewer — this admin screen intentionally
// shows everything for the organisation regardless of scope, since an
// admin managing the list needs to see the whole picture, not the
// filtered viewer's-eye view.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockExternalResourceService } from '@/services/externalResources/mockExternalResourceService';
import type { ExternalResource, ExternalResourceCategory, ExternalResourceScope } from '@/services/externalResources/IExternalResourceService';
import type { Facility } from '@/services/facilities/IFacilityService';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import ConfirmModal from '../../Common/ConfirmModal';

const CATEGORY_LABEL_KEY: Record<ExternalResourceCategory, string> = {
  protocols: 'externalResourcesSection.categoryLabels.protocols',
  references: 'externalResourcesSection.categoryLabels.references',
  systems: 'externalResourcesSection.categoryLabels.systems',
};

const CATEGORY_IDS: ExternalResourceCategory[] = ['protocols', 'references', 'systems'];

interface DraftState {
  id: string | null;
  title: string;
  url: string;
  category: ExternalResourceCategory;
  scope: ExternalResourceScope;
  facilityId: string;
}

const emptyDraft: DraftState = { id: null, title: '', url: '', category: 'protocols', scope: 'enterprise', facilityId: '' };

const ExternalResourcesSection: React.FC = () => {
  const { t } = useTranslation();
  const session = getSessionUser();
  const organisationId = session?.organisationId ?? '';

  const [resources, setResources] = useState<ExternalResource[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExternalResource | null>(null);

  const loadResources = React.useCallback(async () => {
    if (!organisationId) { setLoading(false); return; }
    setLoading(true);
    const list = await mockExternalResourceService.listForOrganisation(organisationId);
    setResources(list);
    setLoading(false);
  }, [organisationId]);

  useEffect(() => {
    loadResources();
    // Same real, shared query every dictionary needing lab-scoping now
    // uses — see utils/performingLabs.ts's own header (this file's own
    // version of this query was the one confirmed and extracted from).
    getActivePerformingLabs().then(setLabs);
  }, [loadResources]);

  const openNewForm = () => { setDraft(emptyDraft); setError(null); setShowForm(true); };
  const openEditForm = (r: ExternalResource) => {
    setDraft({ id: r.id, title: r.title, url: r.url, category: r.category, scope: r.scope, facilityId: r.facilityId ?? '' });
    setError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!draft.title.trim()) { setError(t('externalResourcesSection.errors.titleRequired')); return; }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(draft.url.trim());
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') throw new Error('not http(s)');
    } catch {
      setError(t('externalResourcesSection.errors.invalidUrl'));
      return;
    }
    if (draft.scope === 'lab' && !draft.facilityId) { setError(t('externalResourcesSection.errors.labRequired')); return; }

    if (draft.id) {
      await mockExternalResourceService.update(draft.id, {
        title: draft.title.trim(),
        url: parsedUrl.toString(),
        category: draft.category,
        scope: draft.scope,
        facilityId: draft.scope === 'lab' ? draft.facilityId : undefined,
      });
    } else {
      await mockExternalResourceService.create({
        title: draft.title.trim(),
        url: parsedUrl.toString(),
        category: draft.category,
        scope: draft.scope,
        organisationId,
        facilityId: draft.scope === 'lab' ? draft.facilityId : undefined,
      });
    }
    setShowForm(false);
    loadResources();
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    await mockExternalResourceService.remove(deleteTarget.id);
    setDeleteTarget(null);
    loadResources();
  };

  const labName = (facilityId?: string) => labs.find(l => l.id === facilityId)?.name ?? facilityId ?? t('externalResourcesSection.noLabName');

  const grouped: Record<ExternalResourceCategory, ExternalResource[]> = { protocols: [], references: [], systems: [] };
  resources.forEach(r => grouped[r.category].push(r));

  return (
    <div className="ps-extres">
      <div className="ps-extres-header">
        <div>
          <h1 className="ps-extres-title">{t('externalResourcesSection.title')}</h1>
          <p className="ps-extres-subtitle">
            {t('externalResourcesSection.subtitle')}
          </p>
        </div>
        <button type="button" className="ps-conf-btn-primary" onClick={openNewForm}>{t('externalResourcesSection.addResourceButton')}</button>
      </div>

      {loading ? (
        <div className="ps-extres-loading">{t('externalResourcesSection.loading')}</div>
      ) : resources.length === 0 ? (
        <div className="ps-extres-empty">
          {t('externalResourcesSection.emptyState')}
        </div>
      ) : (
        CATEGORY_IDS.map(cat => (
          grouped[cat].length === 0 ? null : (
            <div key={cat} className="ps-extres-group">
              <div className="ps-extres-category-label">
                {t(CATEGORY_LABEL_KEY[cat])}
              </div>
              <div className="ps-extres-list">
                {grouped[cat].map(r => (
                  <div key={r.id} className="ps-extres-row">
                    <div>
                      <div className="ps-extres-row-title">{r.title}</div>
                      <div className="ps-extres-row-url">{r.url}</div>
                      <div className="ps-extres-row-scope">
                        {r.scope === 'enterprise' ? t('externalResourcesSection.scopeEnterpriseWide') : t('externalResourcesSection.scopeLab', { labName: labName(r.facilityId) })}
                      </div>
                    </div>
                    <div className="ps-extres-row-actions">
                      <button type="button" className="ps-conf-btn-secondary" onClick={() => openEditForm(r)}>{t('common.edit')}</button>
                      <button type="button" className="ps-conf-btn-secondary" onClick={() => setDeleteTarget(r)}>{t('common.delete')}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ))
      )}

      {showForm && (
        <div className="ps-overlay" onClick={() => setShowForm(false)}>
          <div className="ps-modal-dark ps-modal-dark--extres" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-dark-header">
              <span className="ps-modal-dark-title">{draft.id ? t('externalResourcesSection.modal.headerEdit') : t('externalResourcesSection.modal.headerAdd')}</span>
            </div>
            <div className="ps-extres-modal-body">
              <div>
                <label className="ps-conf-label ps-conf-label--block">{t('externalResourcesSection.modal.titleField')}</label>
                <input
                  className="ps-conf-input"
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder={t('externalResourcesSection.modal.titlePlaceholder')}
                />
              </div>
              <div>
                <label className="ps-conf-label ps-conf-label--block">{t('externalResourcesSection.modal.urlField')}</label>
                <input
                  className="ps-conf-input"
                  value={draft.url}
                  onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                  placeholder={t('externalResourcesSection.modal.urlPlaceholder')}
                />
              </div>
              <div>
                <label className="ps-conf-label ps-conf-label--block" htmlFor="extres-category">{t('externalResourcesSection.modal.categoryField')}</label>
                <select
                  id="extres-category"
                  className="ps-conf-select ps-conf-select--full"
                  value={draft.category}
                  onChange={e => setDraft(d => ({ ...d, category: e.target.value as ExternalResourceCategory }))}
                >
                  {CATEGORY_IDS.map(c => (
                    <option key={c} value={c}>{t(CATEGORY_LABEL_KEY[c])}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ps-conf-label ps-conf-label--block" htmlFor="extres-scope">{t('externalResourcesSection.modal.scopeField')}</label>
                <select
                  id="extres-scope"
                  className="ps-conf-select ps-conf-select--full"
                  value={draft.scope}
                  onChange={e => setDraft(d => ({ ...d, scope: e.target.value as ExternalResourceScope }))}
                >
                  <option value="enterprise">{t('externalResourcesSection.modal.scopeEnterpriseOption')}</option>
                  <option value="lab">{t('externalResourcesSection.modal.scopeLabOption')}</option>
                </select>
              </div>
              {draft.scope === 'lab' && (
                <div>
                  <label className="ps-conf-label ps-conf-label--block" htmlFor="extres-facility">{t('externalResourcesSection.modal.performingLabField')}</label>
                  <select
                    id="extres-facility"
                    className="ps-conf-select ps-conf-select--full"
                    value={draft.facilityId}
                    onChange={e => setDraft(d => ({ ...d, facilityId: e.target.value }))}
                  >
                    <option value="">{t('externalResourcesSection.modal.labPlaceholder')}</option>
                    {labs.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {error && <div className="ps-extres-error">{error}</div>}
            </div>
            <div className="ps-extres-modal-footer">
              <button type="button" className="ps-conf-btn-secondary" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
              <button type="button" className="ps-conf-btn-primary" onClick={handleSave}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        show={!!deleteTarget}
        title={t('externalResourcesSection.deleteModal.title')}
        message={deleteTarget ? t('externalResourcesSection.deleteModal.message', { title: deleteTarget.title }) : ''}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ExternalResourcesSection;
