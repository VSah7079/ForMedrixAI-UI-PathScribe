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
import '../../../pathscribe.css';
import { mockExternalResourceService } from '@/services/externalResources/mockExternalResourceService';
import type { ExternalResource, ExternalResourceCategory, ExternalResourceScope } from '@/services/externalResources/IExternalResourceService';
import type { Facility } from '@/services/facilities/IFacilityService';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import ConfirmModal from '../../Common/ConfirmModal';

const CATEGORY_LABELS: Record<ExternalResourceCategory, string> = {
  protocols: 'Protocols',
  references: 'References',
  systems: 'Systems',
};

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
    if (!draft.title.trim()) { setError('Title is required.'); return; }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(draft.url.trim());
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') throw new Error('not http(s)');
    } catch {
      setError('Enter a valid URL, including https://');
      return;
    }
    if (draft.scope === 'lab' && !draft.facilityId) { setError('Select a performing lab for a lab-scoped resource.'); return; }

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

  const labName = (facilityId?: string) => labs.find(l => l.id === facilityId)?.name ?? facilityId ?? '—';

  const grouped: Record<ExternalResourceCategory, ExternalResource[]> = { protocols: [], references: [], systems: [] };
  resources.forEach(r => grouped[r.category].push(r));

  return (
    <div style={{ width: '100%', maxWidth: 800 }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>External Resources</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, maxWidth: 560 }}>
            Reference links shown in the Resources panel — CAP protocols, WHO
            classification, internal lab systems, and similar. Enterprise-wide
            links are visible to everyone; lab-scoped links are visible only at
            the specific performing lab they're tied to.
          </p>
        </div>
        <button type="button" className="ps-conf-btn-primary" onClick={openNewForm}>+ Add Resource</button>
      </div>

      {loading ? (
        <div style={{ color: '#6b7280', fontSize: 13, padding: '24px 0' }}>Loading…</div>
      ) : resources.length === 0 ? (
        <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 24, color: '#6b7280', fontSize: 13 }}>
          No external resources configured yet.
        </div>
      ) : (
        (Object.keys(CATEGORY_LABELS) as ExternalResourceCategory[]).map(cat => (
          grouped[cat].length === 0 ? null : (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {CATEGORY_LABELS[cat]}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grouped[cat].map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px' }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 600 }}>{r.title}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{r.url}</div>
                      <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>
                        {r.scope === 'enterprise' ? 'Enterprise-wide' : `Lab: ${labName(r.facilityId)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button type="button" className="ps-conf-btn-secondary" onClick={() => openEditForm(r)}>Edit</button>
                      <button type="button" className="ps-conf-btn-secondary" onClick={() => setDeleteTarget(r)}>Delete</button>
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
          <div className="ps-modal-dark" style={{ width: 'min(480px, 92vw)' }} onClick={e => e.stopPropagation()}>
            <div className="ps-modal-dark-header">
              <span className="ps-modal-dark-title">{draft.id ? 'Edit Resource' : 'Add Resource'}</span>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="ps-conf-label" style={{ display: 'block', marginBottom: 4 }}>Title</label>
                <input
                  className="ps-conf-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder="CAP Cancer Protocols"
                />
              </div>
              <div>
                <label className="ps-conf-label" style={{ display: 'block', marginBottom: 4 }}>URL</label>
                <input
                  className="ps-conf-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={draft.url}
                  onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="ps-conf-label" style={{ display: 'block', marginBottom: 4 }} htmlFor="extres-category">Category</label>
                <select
                  id="extres-category"
                  className="ps-conf-select"
                  style={{ width: '100%' }}
                  value={draft.category}
                  onChange={e => setDraft(d => ({ ...d, category: e.target.value as ExternalResourceCategory }))}
                >
                  {(Object.keys(CATEGORY_LABELS) as ExternalResourceCategory[]).map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ps-conf-label" style={{ display: 'block', marginBottom: 4 }} htmlFor="extres-scope">Scope</label>
                <select
                  id="extres-scope"
                  className="ps-conf-select"
                  style={{ width: '100%' }}
                  value={draft.scope}
                  onChange={e => setDraft(d => ({ ...d, scope: e.target.value as ExternalResourceScope }))}
                >
                  <option value="enterprise">Enterprise-wide</option>
                  <option value="lab">Specific performing lab</option>
                </select>
              </div>
              {draft.scope === 'lab' && (
                <div>
                  <label className="ps-conf-label" style={{ display: 'block', marginBottom: 4 }} htmlFor="extres-facility">Performing Lab</label>
                  <select
                    id="extres-facility"
                    className="ps-conf-select"
                    style={{ width: '100%' }}
                    value={draft.facilityId}
                    onChange={e => setDraft(d => ({ ...d, facilityId: e.target.value }))}
                  >
                    <option value="">Select a lab…</option>
                    {labs.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {error && <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button type="button" className="ps-conf-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="button" className="ps-conf-btn-primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        show={!!deleteTarget}
        title="Delete resource"
        message={deleteTarget ? `Delete "${deleteTarget.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ExternalResourcesSection;
