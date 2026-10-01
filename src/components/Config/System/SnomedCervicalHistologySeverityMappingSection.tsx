// src/components/Config/System/SnomedCervicalHistologySeverityMappingSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "Implement a real settings layer for the
// mapping table." Same real, established admin-dictionary pattern
// this app already uses elsewhere (CytologyCategoriesSection.tsx,
// ParticipationTypesSection.tsx) — a real, new subtab under System
// configuration, not a new, separate configuration surface.
//
// Real, honest empty state matches this codebase's own established
// policy: no seed data exists, and none ever should — every real
// mapping here is entered by a real admin/customer who has real
// SNOMED CT terminology access (Case.ts's own syntheticAbnormalCoding
// doc comment; resolveEmbeddedCoding.ts's own "empty until a
// confirmed license" default).
//
// i18n sweep (batch 47): real dictionary content admins enter
// (snomedCode, description, createdBy.userName — a real SNOMED CT
// code/term and a real person's name) stays as typed/stored. Only the
// surrounding page chrome (headers, labels, buttons, messages) goes
// through the new `snomedCervicalHistologySeverityMappingSection`
// namespace.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockSnomedCervicalHistologySeverityMappingService } from '../../../services/cytology/mockSnomedCervicalHistologySeverityMappingService';
import type { SnomedCervicalHistologySeverityMappingEntry } from '../../../services/cytology/ISnomedCervicalHistologySeverityMappingService';
import { getSessionUser } from '../../../services/auth/caseAccessControl';
import type { ServiceResult } from '../../../services/types';

interface Draft { snomedCode: string; description: string; severityRank: string }
const emptyDraft: Draft = { snomedCode: '', description: '', severityRank: '' };

const SnomedCervicalHistologySeverityMappingSection: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SnomedCervicalHistologySeverityMappingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    mockSnomedCervicalHistologySeverityMappingService.getAll().then(res => {
      if (res.ok) setEntries([...res.data].sort((a, b) => a.severityRank - b.severityRank));
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    setError(null);
    const rank = Number(draft.severityRank);
    if (!draft.snomedCode.trim() || !draft.description.trim() || Number.isNaN(rank)) {
      setError(t('snomedCervicalHistologySeverityMappingSection.requiredFieldsError'));
      return;
    }
    const session = getSessionUser();
    const sessionName = session ? `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim() || session.id : undefined;
    const res: ServiceResult<SnomedCervicalHistologySeverityMappingEntry> = await mockSnomedCervicalHistologySeverityMappingService.add({
      snomedCode: draft.snomedCode.trim(),
      description: draft.description.trim(),
      severityRank: rank,
      createdBy: session ? { userId: session.id, userName: sessionName ?? session.id } : undefined,
    });
    if ('error' in res) { setError(res.error); return; }
    setDraft(emptyDraft);
    refresh();
  };

  const startEdit = (entry: SnomedCervicalHistologySeverityMappingEntry) => {
    setEditingId(entry.id);
    setEditDraft({ snomedCode: entry.snomedCode, description: entry.description, severityRank: String(entry.severityRank) });
  };

  const handleSaveEdit = async (id: string) => {
    const rank = Number(editDraft.severityRank);
    if (!editDraft.description.trim() || Number.isNaN(rank)) return;
    await mockSnomedCervicalHistologySeverityMappingService.update(id, { description: editDraft.description.trim(), severityRank: rank });
    setEditingId(null);
    refresh();
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm(t('snomedCervicalHistologySeverityMappingSection.removeConfirm'))) return;
    await mockSnomedCervicalHistologySeverityMappingService.remove(id);
    refresh();
  };

  return (
    <div>
      <h3 className="ps-snomed-severity__title">{t('snomedCervicalHistologySeverityMappingSection.title')}</h3>
      <p className="ps-snomed-severity__subtitle">
        {t('snomedCervicalHistologySeverityMappingSection.subtitle')}
      </p>

      <div className="ps-conf-table-wrap ps-snomed-severity__table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{t('snomedCervicalHistologySeverityMappingSection.columns.snomedCode')}</th>
                <th className="ps-conf-th">{t('snomedCervicalHistologySeverityMappingSection.columns.description')}</th>
                <th className="ps-conf-th">{t('snomedCervicalHistologySeverityMappingSection.columns.severityRank')}</th>
                <th className="ps-conf-th">{t('snomedCervicalHistologySeverityMappingSection.columns.added')}</th>
                <th className="ps-conf-th"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td className="ps-conf-empty-row" colSpan={5}>{t('snomedCervicalHistologySeverityMappingSection.loading')}</td></tr>)}
              {!loading && entries.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>{t('snomedCervicalHistologySeverityMappingSection.emptyRow')}</td></tr>
              )}
              {!loading && entries.map(entry => (
                <tr key={entry.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{entry.snomedCode}</td>
                  <td className="ps-conf-td">
                    {editingId === entry.id
                      ? <input className="ps-input-dark" value={editDraft.description} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} />
                      : entry.description}
                  </td>
                  <td className="ps-conf-td">
                    {editingId === entry.id
                      ? <input className="ps-input-dark ps-snomed-severity__rank-input" type="number" min={0} max={5} value={editDraft.severityRank} onChange={e => setEditDraft(d => ({ ...d, severityRank: e.target.value }))} />
                      : entry.severityRank}
                  </td>
                  <td className="ps-conf-td ps-snomed-severity__added-cell">
                    {new Date(entry.createdAt).toLocaleDateString()}{entry.createdBy ? ` — ${entry.createdBy.userName}` : ''}
                  </td>
                  <td className="ps-conf-td">
                    {editingId === entry.id ? (
                      <>
                        <button className="ps-btn-small" onClick={() => handleSaveEdit(entry.id)}>{t('snomedCervicalHistologySeverityMappingSection.save')}</button>
                        <button className="ps-btn-small" onClick={() => setEditingId(null)}>{t('snomedCervicalHistologySeverityMappingSection.cancel')}</button>
                      </>
                    ) : (
                      <>
                        <button className="ps-btn-small" onClick={() => startEdit(entry)}>{t('snomedCervicalHistologySeverityMappingSection.edit')}</button>
                        <button className="ps-btn-small" onClick={() => handleRemove(entry.id)}>{t('snomedCervicalHistologySeverityMappingSection.remove')}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ps-snomed-severity__add-card">
        <h4 className="ps-snomed-severity__add-title">{t('snomedCervicalHistologySeverityMappingSection.addMapping')}</h4>
        <div className="ps-snomed-severity__add-row">
          <div>
            <label className="ps-label" htmlFor="snomed-map-code">{t('snomedCervicalHistologySeverityMappingSection.columns.snomedCode')}</label>
            <input id="snomed-map-code" className="ps-input-dark" value={draft.snomedCode} onChange={e => setDraft(d => ({ ...d, snomedCode: e.target.value }))} placeholder={t('snomedCervicalHistologySeverityMappingSection.codePlaceholder')} />
          </div>
          <div className="ps-snomed-severity__desc-field">
            <label className="ps-label" htmlFor="snomed-map-desc">{t('snomedCervicalHistologySeverityMappingSection.columns.description')}</label>
            <input id="snomed-map-desc" className="ps-input-dark ps-snomed-severity__desc-input" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder={t('snomedCervicalHistologySeverityMappingSection.descPlaceholder')} />
          </div>
          <div>
            <label className="ps-label" htmlFor="snomed-map-rank">{t('snomedCervicalHistologySeverityMappingSection.columns.severityRank')}</label>
            <input id="snomed-map-rank" className="ps-input-dark ps-snomed-severity__rank-input-wide" type="number" min={0} max={5} value={draft.severityRank} onChange={e => setDraft(d => ({ ...d, severityRank: e.target.value }))} />
          </div>
          <button className="ps-btn-small" onClick={handleAdd}>{t('snomedCervicalHistologySeverityMappingSection.add')}</button>
        </div>
        {error && <div className="ps-snomed-severity__error">{error}</div>}
      </div>
    </div>
  );
};

export default SnomedCervicalHistologySeverityMappingSection;
