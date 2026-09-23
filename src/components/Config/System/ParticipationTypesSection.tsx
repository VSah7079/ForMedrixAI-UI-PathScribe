// src/components/Config/System/ParticipationTypesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// System-level master list of case participation types.
// Admins define types here; roles then select which types they can serve as.
//
// July 2026 consolidation: this screen used to maintain its OWN separate
// local list (BUILT_IN_PARTICIPATION_TYPES + a localStorage key with no
// _v2 suffix) that had drifted to contain different types entirely from
// services/participationTypes/mockParticipationTypeService.ts -- the real
// service CaseTeamModal actually uses. This screen's "● System Live Sync"
// footer label used to be actively misleading (nothing was actually
// synced with the real feature); it's genuinely true now that this reads
// and writes through the real service directly.
//
// i18n sweep (batch 57): converted alongside its own child modal
// (TypeModal.tsx) - same coupled-sweep treatment as RuleModal.tsx/
// RoutingRulesSection.tsx in batches 48-49. Real data (t.label,
// t.abbreviation, t.description, t.color) stays exactly as entered/stored;
// only page chrome, capability labels, and status text are translated.
// The row/Edit-button onMouseEnter/onMouseLeave imperative style handlers
// are gone - replaced with the same .ps-routingrules__tr:hover CSS rule
// already used by the structurally identical RoutingRulesSection.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import TypeModal from './TypeModal';
import { mockParticipationTypeService } from '../../../services/participationTypes/mockParticipationTypeService';
import type { ParticipationTypeRecord as ParticipationType, NewParticipationType } from '../../../services/participationTypes/IParticipationTypeService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { getActivePerformingLabs } from '../../../utils/performingLabs';

export type { ParticipationType };

// ─── Attribute chip ───────────────────────────────────────────────────────────

const AttrChip: React.FC<{ label: string; value?: boolean; onColor?: string }> = ({ label, value, onColor = '#22c55e' }) => (
  <span
    className="ps-participationtypes__attr-chip"
    style={{
      background: value ? onColor + '18' : 'rgba(255,255,255,0.04)',
      color: value ? onColor : '#4b5563',
      border: `1px solid ${value ? onColor + '33' : 'rgba(255,255,255,0.06)'}`,
    }}
  >
    {value ? '✓' : '—'} {label}
  </span>
);

// ─── Modal draft type ─────────────────────────────────────────────────────────

type Draft = Omit<ParticipationType, 'id' | 'isSystem'>;

const ParticipationTypesSection: React.FC = () => {
  const { t } = useTranslation();
  const [types,   setTypes]   = useState<ParticipationType[]>([]);
  const [labs,    setLabs]    = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<'all' | 'active' | 'inactive'>('all');
  const [modal,   setModal]   = useState<{ mode: 'add' | 'edit'; type?: ParticipationType } | null>(null);
  const [saving,  setSaving]  = useState(false);

  const refresh = () => {
    setLoading(true);
    mockParticipationTypeService.getAll().then(res => {
      if (res.ok) setTypes(res.data);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); getActivePerformingLabs().then(setLabs); }, []);

  const handleSave = async (draft: Draft) => {
    setSaving(true);
    try {
      if (modal?.mode === 'add') {
        await mockParticipationTypeService.add(draft as NewParticipationType);
      } else if (modal?.type) {
        await mockParticipationTypeService.update(modal.type.id, draft);
      }
      refresh();
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const filtered = types.filter(pt => {
    const matchSearch = !search || pt.label.toLowerCase().includes(search.toLowerCase()) || (pt.abbreviation ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'active' ? pt.active : !pt.active);
    return matchSearch && matchFilter;
  });

  const tableHeaders = [
    t('participationTypesSection.table.type'),
    t('participationTypesSection.table.description'),
    t('participationTypesSection.table.capabilities'),
    t('participationTypesSection.table.status'),
    '',
  ];

  return (
    <div className="ps-participationtypes__page">

      {/* Header */}
      <div className="ps-participationtypes__header">
        <div>
          <h1 className="ps-routingrules__title">{t('participationTypesSection.title')}</h1>
          <p className="ps-routingrules__subtitle">
            {t('participationTypesSection.subtitle')}
          </p>
        </div>
        <button className="ps-section-add-btn" onClick={() => setModal({ mode: 'add' })}>
          {t('participationTypesSection.addTypeBtn')}
        </button>
      </div>

      {/* Search + filter */}
      <div className="ps-participationtypes__filters">
        <input
          type="text"
          placeholder={t('participationTypesSection.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ps-routingrules__search-input"
        />
        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          className="ps-conf-select">
          <option value="all">{t('participationTypesSection.filterAll')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="ps-routingrules__table-wrap">
        <div className="ps-participationtypes__scroll">
          <table className="ps-routingrules__table">
            <thead>
              <tr className="ps-routingrules__thead-row">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="ps-participationtypes__th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="ps-routingrules__empty-row">{t('common.loading')}</td></tr>
              )}
              {!loading && filtered.map((pt, i) => (
                <tr key={pt.id}
                  className={i < filtered.length - 1 ? 'ps-routingrules__tr ps-routingrules__tr--divider' : 'ps-routingrules__tr'}
                >
                  {/* Type chip */}
                  <td className="ps-participationtypes__td">
                    <div className="ps-participationtypes__type-cell">
                      <span
                        className="ps-participationtypes__abbr-chip"
                        style={{ background: pt.color + '22', color: pt.color, border: `1px solid ${pt.color}44` }}
                      >
                        {pt.abbreviation}
                      </span>
                      <div>
                        <div className="ps-participationtypes__type-label">{pt.label}</div>
                        {pt.isSystem && <div className="ps-participationtypes__type-builtin">{t('participationTypesSection.builtInBadge')}</div>}
                      </div>
                    </div>
                  </td>
                  {/* Description */}
                  <td className="ps-participationtypes__td-desc">
                    <span className="ps-routingrules__note-clamp">
                      {pt.description || '—'}
                    </span>
                  </td>
                  {/* Capabilities */}
                  <td className="ps-participationtypes__td">
                    <div className="ps-routingrules__keyword-chips">
                      <AttrChip label={t('participationTypesSection.capFinalize')}   value={pt.canFinalize}           onColor="#22c55e" />
                      <AttrChip label={t('participationTypesSection.capCountersign')} value={pt.requiresCountersign}   onColor="#f59e0b" />
                      <AttrChip label={t('participationTypesSection.capTemplate')}    value={pt.canBeAssignedTemplate} onColor="#8AB4F8" />
                      <AttrChip label={t('participationTypesSection.capFullView')}    value={pt.canViewWholeCase}      onColor="#8AB4F8" />
                      <AttrChip label={t('participationTypesSection.capMulti')}       value={pt.allowsMultiple}        onColor="#a78bfa" />
                    </div>
                  </td>
                  {/* Status */}
                  <td className="ps-participationtypes__td">
                    <div className="ps-participationtypes__status-cell">
                      <span className={pt.active ? 'ps-participationtypes__status-dot ps-participationtypes__status-dot--active' : 'ps-participationtypes__status-dot ps-participationtypes__status-dot--inactive'} />
                      <span className={pt.active ? 'ps-participationtypes__status-text--active' : 'ps-participationtypes__status-text--inactive'}>
                        {pt.active ? t('common.active') : t('common.inactive')}
                      </span>
                    </div>
                  </td>
                  {/* Edit */}
                  <td className="ps-participationtypes__td ps-participationtypes__td--right">
                    <button onClick={() => setModal({ mode: 'edit', type: pt })} className="ps-participationtypes__edit-btn">
                      {t('common.edit')}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="ps-routingrules__empty-row">{t('participationTypesSection.emptyFilter')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer count */}
      <div className="ps-participationtypes__footer">
        <div className="ps-routingrules__footer-autosave">
          <span className="ps-routingrules__footer-dot">●</span> {t('participationTypesSection.liveSync')}
        </div>
        <div>{t('participationTypesSection.footerCount', { active: types.filter(pt => pt.active).length, total: types.length })}</div>
      </div>

      {modal && (
        <TypeModal
          mode={modal.mode}
          type={modal.type}
          existingEntries={types}
          labs={labs}
          isBuiltIn={modal.type?.isSystem ?? false}
          onSave={handleSave}
          onClose={() => !saving && setModal(null)}
        />
      )}
    </div>
  );
};

export default ParticipationTypesSection;
