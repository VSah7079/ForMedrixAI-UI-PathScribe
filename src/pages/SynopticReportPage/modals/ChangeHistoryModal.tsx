// src/pages/SynopticReportPage/modals/ChangeHistoryModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 368 (PS-353): the report's change history. One entry per save:
// who, when, from which workstation, and each field changed. Short values
// show old → new; long text shows a word-level diff (removed words struck
// through, added words highlighted), with the full texts behind it. Anyone
// who can open the case can read it. Exporting it to CSV needs the capability
// report:change-history:export (PS-355, Batch 369): without it the button is
// greyed out, and the export service checks again and audits. What is
// recorded, and how, is in services/reportChangeLog/.
//
// Values can be patient data (a demographics change, a diagnosis), so every
// value is tagged data-phi and support-ticket screenshots redact it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import type { ReportChangeArea, ReportChangeEntry, ReportFieldChange } from '@/services';
import { AREA_ROOT_KEYS, isLongText, wordDiff } from '@/services/reportChangeLog/reportChangeRules';
import { CapabilityButton } from '@/components/Common/CapabilityButton';
import type { CapabilityContext } from '@/services/authorization/evaluateCapability';
import type { ChangeLogExportLabels } from '@/services/reportChangeLog/exportChangeLog';
import { formatDateTime } from '@/utils/formatDate';

const AREAS: ReportChangeArea[] = ['synoptic', 'narrative', 'codes', 'specimens', 'case'];

interface Props {
  entries: ReportChangeEntry[];
  /** PS-356: the case and its facility, so the Export button reflects facility scope. */
  exportContext: CapabilityContext;
  /** Receives the translated CSV labels; the page exports (and audits) through the service. */
  onExport: (labels: ChangeLogExportLabels) => void;
  onClose: () => void;
}

const ChangeValue: React.FC<{ change: ReportFieldChange }> = ({ change }) => {
  const { t } = useTranslation();
  const none = <span className="ps-chghist-none">{t('changeHistoryModal.noValue')}</span>;
  if (change.kind === 'changed' && change.before !== null && change.after !== null && isLongText(change.before, change.after)) {
    return (
      <div className="ps-chghist-diff" data-phi="true">
        {wordDiff(change.before, change.after).map((p, i) =>
          p.op === 'same' ? <span key={i}>{p.text}</span>
          : p.op === 'removed' ? <del key={i} className="ps-chghist-del">{p.text}</del>
          : <ins key={i} className="ps-chghist-ins">{p.text}</ins>)}
      </div>
    );
  }
  return (
    <div className="ps-chghist-values">
      <span className={`ps-chghist-before${change.before === null ? ' ps-chghist-before--empty' : ''}`} data-phi="true">{change.before ?? none}</span>
      <span className="ps-chghist-arrow" aria-hidden="true">→</span>
      <span className="ps-chghist-after" data-phi="true">{change.after ?? none}</span>
    </div>
  );
};

export const ChangeHistoryModal: React.FC<Props> = ({ entries, exportContext, onExport, onClose }) => {
  const { t, i18n } = useTranslation();
  const [area, setArea] = useState<ReportChangeArea | 'all'>('all');
  const newestFirst = useMemo(() => [...entries].reverse(), [entries]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(AREAS.map(a => [a, 0])) as Record<ReportChangeArea, number>;
    entries.forEach(e => e.changes.forEach(ch => { c[ch.area] += 1; }));
    return c;
  }, [entries]);
  const shown = newestFirst
    .map(e => ({ ...e, changes: area === 'all' ? e.changes : e.changes.filter(c => c.area === area) }))
    .filter(e => e.changes.length > 0);

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide ps-chghist-modal">
        <div className="ps-ms-header">📝 {t('changeHistoryModal.header')}</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">{t('changeHistoryModal.intro', { count: entries.length })}</p>

          <div className="ps-chghist-filters" role="group" aria-label={t('changeHistoryModal.filterLabel')}>
            <button type="button" className={`ps-chghist-filter${area === 'all' ? ' ps-chghist-filter--active' : ''}`} onClick={() => setArea('all')}>
              {t('changeHistoryModal.areas.all')}
            </button>
            {AREAS.map(a => (
              <button key={a} type="button" disabled={counts[a] === 0}
                className={`ps-chghist-filter${area === a ? ' ps-chghist-filter--active' : ''}`} onClick={() => setArea(a)}>
                {t(`changeHistoryModal.areas.${a}`)} <span className="ps-chghist-filter-count">{counts[a]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 && <div className="ps-cmnt-thread-empty">{t('changeHistoryModal.emptyState')}</div>}

          {shown.map(e => (
            <div key={e.id} className="ps-chghist-entry">
              <div className="ps-chghist-entry-header">
                <strong>{formatDateTime(e.at, i18n.language)}</strong>
                <span>{e.userName}</span>
                {e.stationId && <span className="ps-chghist-station">{t('changeHistoryModal.station', { station: e.stationId })}</span>}
                <span className="ps-chghist-count">{t('changeHistoryModal.fieldCount', { count: e.changes.length })}</span>
              </div>
              <ul className="ps-chghist-changes">
                {e.changes.map((c, i) => (
                  <li key={i} className="ps-chghist-change">
                    <div className="ps-chghist-field">
                      <span className={`ps-chghist-area ps-chghist-area--${c.area}`}>{t(`changeHistoryModal.areas.${c.area}`)}</span>
                      <span className="ps-chghist-path" data-phi="true">{(c.path.length > 1 && AREA_ROOT_KEYS.has(c.path[0]) ? c.path.slice(1) : c.path).join(' › ')}</span>
                      {c.kind !== 'changed' && <span className={`ps-chghist-kind ps-chghist-kind--${c.kind}`}>{t(`changeHistoryModal.kinds.${c.kind}`)}</span>}
                    </div>
                    <ChangeValue change={c} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="ps-ms-footer">
          {entries.length > 0 && (
            <CapabilityButton capability="report:change-history:export" context={exportContext} className="ps-ms-btn-cancel" onClick={() => onExport({
              columns: {
                savedAt: t('changeHistoryModal.csv.savedAt'), user: t('changeHistoryModal.csv.user'), workstation: t('changeHistoryModal.csv.workstation'),
                area: t('changeHistoryModal.csv.area'), field: t('changeHistoryModal.csv.field'), change: t('changeHistoryModal.csv.change'),
                before: t('changeHistoryModal.csv.before'), after: t('changeHistoryModal.csv.after'),
              },
              area: a => t(`changeHistoryModal.areas.${a}`),
              kind: k => t(`changeHistoryModal.kinds.${k}`),
            })}>{t('changeHistoryModal.exportCsv')}</CapabilityButton>
          )}
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
};
