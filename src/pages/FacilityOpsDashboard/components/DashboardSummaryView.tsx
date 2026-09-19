// src/pages/FacilityOpsDashboard/components/DashboardSummaryView.tsx
// One real, shared presentational component for all five department
// views — every compute*Summary function returns the exact same
// DashboardSummary shape (stats/queue/alerts), so the five views are
// genuinely a rendering of the same real shape, not five separately
// hand-built layouts that would drift from each other over time.
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DashboardSummary } from '@/services/facilityOpsDashboard/IFacilityOpsDashboardTypes';
import { formatSlaDuration } from '@/services/facilityOpsDashboard/computeSlaCountdown';

const DashboardSummaryView: React.FC<{ summary: DashboardSummary }> = ({ summary }) => {
  const { t } = useTranslation();

  return (
    <div>
      <div className="ps-opsdash-stat-grid">
        {summary.stats.map(s => (
          <div key={s.id} className={`ps-opsdash-stat-tile${s.state && s.state !== 'normal' ? ` ps-opsdash-stat-tile--${s.state}` : ''}`}>
            <div className="ps-opsdash-stat-value">{s.value}</div>
            <div className="ps-opsdash-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {summary.alerts.length > 0 && (
        <div className="ps-opsdash-alerts">
          {summary.alerts.map(a => (
            <div key={a.id} className={`ps-opsdash-alert-row${a.severity === 'warning' ? ' ps-opsdash-alert-row--warning' : ''}`}>
              <span className="ps-opsdash-alert-kind">{a.kind}</span>
              <div>
                <div className="ps-opsdash-alert-title">{a.title}</div>
                {a.detail && <div className="ps-opsdash-alert-detail">{a.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.queue.length === 0 ? (
        <div className="ps-opsdash-queue-empty">{t('facilityOpsDashboard.queueEmpty')}</div>
      ) : (
        <div className="ps-opsdash-queue-list">
          {summary.queue.map(item => (
            <div key={item.id} className={`ps-opsdash-queue-row${item.slaState ? ` ps-opsdash-queue-row--${item.slaState}` : item.isStat ? ' ps-opsdash-queue-row--stat' : ''}`}>
              <div>
                <span className="ps-opsdash-queue-label">
                  {item.label}
                  {item.isStat && <span className="ps-opsdash-stat-pill">{t('facilityOpsDashboard.statPill')}</span>}
                </span>
                {item.detail && <div className="ps-opsdash-queue-detail">{item.detail}</div>}
              </div>
              {item.slaState && item.remainingMinutes !== undefined ? (
                <div className={`ps-opsdash-queue-timer ps-opsdash-queue-timer--${item.slaState}`}>
                  {item.slaState === 'overdue'
                    ? t('facilityOpsDashboard.overdueBy', { duration: formatSlaDuration(item.remainingMinutes) })
                    : formatSlaDuration(item.remainingMinutes)}
                </div>
              ) : item.ageMinutes !== undefined ? (
                <div className="ps-opsdash-queue-age">{t('facilityOpsDashboard.ageLabel', { duration: formatSlaDuration(item.ageMinutes) })}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardSummaryView;
