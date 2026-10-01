// src/components/Contribution/MentorTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the resident/mentor differentiator review
// ("I would like the Residents to know how they are doing relative to the
// expectations... Same for the mentors. Maybe a separate mentor tab?").
//
// Gated on real, active supervision only — a pathologist with no current
// supervisees sees an honest empty state, never a placeholder roster.
// Same "only show what's real" posture ContributionDashboardPage.tsx
// already applies to My Teaching Cases.
//
// Deliberately reports real case-mix COVERAGE, never a judgment of
// "enough" or "the right types" by default — no expected/target case
// mix existed anywhere in this app's data model when this tab was first
// built (confirmed directly before building it), and inventing one
// would have been exactly the kind of fabrication this whole review has
// been checking against elsewhere. See caseMixCalculations.ts's own
// header for the full reasoning.
//
// Update — a real, admin-configured target now can exist
// (QaSupervisionAssignmentType.expectedCaseMix, org-wide per type, set
// in the QA Configuration Center). When a supervisee's assignment type
// has one, applyExpectedCaseMix layers it onto the same real coverage
// numbers; when it doesn't, this renders exactly as it did before —
// real coverage, no judgment.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { qaSupervisionAssignmentService, qaSupervisionAssignmentTypeService, qaActivityRecordService, countersignService, subspecialtyService } from '@/services';
import { useAuth } from '@contexts/AuthContext';
import type { Subspecialty } from '@/services';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from '@/services';
import type { QaSupervisionAssignment } from '@/types/quality/QaSupervisionAssignment';
import type { QaSupervisionAssignmentType } from '@/types/quality/QaSupervisionAssignmentType';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { CountersignRecord } from '@/types/case/CountersignRecord';
import { buildSubspecialtyBreakdown, describeSupervisionProgress, applyExpectedCaseMix } from './caseMixCalculations';

const MentorTab: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [supervisees, setSupervisees] = useState<QaSupervisionAssignment[]>([]);
  const [supervisionTypes, setSupervisionTypes] = useState<QaSupervisionAssignmentType[]>([]);
  const [teachingRecords, setTeachingRecords] = useState<QaActivityRecord[]>([]);
  const [countersignRecords, setCountersignRecords] = useState<CountersignRecord[]>([]);
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      qaSupervisionAssignmentService.getAll(),
      qaSupervisionAssignmentTypeService.getAll(),
      qaActivityRecordService.getAll(),
      countersignService.getAll(),
      subspecialtyService.getAll(),
    ]).then(([assignRes, typeRes, teachRes, csRes, subRes]) => {
      const active = assignRes.ok ? assignRes.data.filter(a => a.supervisorUserId === user.id && a.status === 'active') : [];
      setSupervisees(active);
      setSupervisionTypes(typeRes.ok ? typeRes.data : []);
      const superviseeIds = new Set(active.map(a => a.superviseeUserId));
      setTeachingRecords(
        teachRes.ok
          ? teachRes.data.filter(r => r.activityTypeId === FROZEN_FINAL_ACTIVITY_TYPE_ID && r.draftedBy?.userId && superviseeIds.has(r.draftedBy.userId))
          : []
      );
      setCountersignRecords(
        csRes.ok ? csRes.data.filter(r => r.status === 'countersigned' && superviseeIds.has(r.residentId)) : []
      );
      setSubspecialties(subRes.ok ? subRes.data : []);
      setLoaded(true);
    });
  }, [user?.id]);

  if (!loaded) return null;

  if (supervisees.length === 0) {
    return (
      <div className="ps-contrib-mentor-empty">
        {t('mentorTab.noActiveSupervisees')}
      </div>
    );
  }

  return (
    <div className="ps-contrib-mentor-grid">
      {supervisees.map(assignment => {
        const progress = describeSupervisionProgress(assignment);
        const superviseeTeaching = teachingRecords.filter(r => r.draftedBy?.userId === assignment.superviseeUserId);
        const superviseeCountersigns = countersignRecords.filter(r => r.residentId === assignment.superviseeUserId);
        // Real target config, when one exists — scoped to this
        // assignment's own subspecialty when it has one (a
        // single-subspecialty assignment showing an unrelated
        // subspecialty's target would be a real mismatch, not a
        // useful signal).
        const type = supervisionTypes.find(st => st.id === assignment.activityTypeId);
        const targets = (type?.expectedCaseMix ?? []).filter(t => !assignment.subspecialtyId || t.subspecialtyId === assignment.subspecialtyId);
        const breakdown = applyExpectedCaseMix(buildSubspecialtyBreakdown(superviseeTeaching, subspecialties), targets, subspecialties);

        return (
          <div key={assignment.id} className="ps-contrib-tile">
            <div className="ps-contrib-tile-header">
              <div>
                <div className="ps-contrib-mentor-card-name">{assignment.superviseeUserName}</div>
                <div className="ps-contrib-mentor-card-sub">
                  {t('mentorTab.countersignedCount', { count: superviseeCountersigns.length })}
                  {assignment.subspecialtyId && ` · ${t('mentorTab.subspecialtyOnly', { name: subspecialties.find(s => s.id === assignment.subspecialtyId)?.name ?? assignment.subspecialtyId })}`}
                </div>
              </div>
            </div>

            <div className="ps-contrib-progress-wrap">
              <div className="ps-contrib-progress-label">
                <span>{t('mentorTab.progressTowardGraduation')}</span>
                <span>{progress.label}</span>
              </div>
              <div className="ps-contrib-progress-track">
                <div className="ps-contrib-progress-fill ps-contrib-progress-fill--pct" style={{ '--bar-pct': `${progress.pct}%` } as React.CSSProperties} />
              </div>
            </div>

            {breakdown.length > 0 && (
              <div className="ps-contrib-teaching-breakdown">
                {breakdown.map(b => (
                  <div key={b.id} className="ps-contrib-teaching-row">
                    <span className="ps-contrib-teaching-row-name">{b.name} ({b.total})</span>
                    {b.target !== undefined ? (
                      <span className={`ps-contrib-teaching-row-rate ${b.metTarget ? 'ps-contrib-teaching-row-rate--ok' : 'ps-contrib-teaching-row-rate--low'}`}>
                        {t('mentorTab.ofExpected', { total: b.total, target: b.target })}
                      </span>
                    ) : (
                      <span className={`ps-contrib-teaching-row-rate ${b.rate < 90 ? 'ps-contrib-teaching-row-rate--low' : 'ps-contrib-teaching-row-rate--ok'}`}>{b.rate.toFixed(0)}%</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {breakdown.length === 0 && (
              <div className="ps-contrib-tile-subtitle mt-noRecords">
                {t('mentorTab.noFrozenSectionRecords')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MentorTab;
