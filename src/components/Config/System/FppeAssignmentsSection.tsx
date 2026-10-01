// src/components/Config/System/FppeAssignmentsSection.tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { userService, subspecialtyService, fppeAssignmentService, qaSupervisionAssignmentService } from '@/services';
import { FPPE_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaSupervisionAssignmentService';
import type { StaffUser, Subspecialty, Facility } from '@/services';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import type { FppeAssignment, FppeEndCondition } from '@/types/case/FppeAssignment';
import { computeFppeProgress } from '@/services/cases/fppeEndCondition';

type EndConditionType = 'case_count' | 'duration_days' | 'either';

const FppeAssignmentsSection: React.FC = () => {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<FppeAssignment[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  // Real, per direct guidance: organizes which facility (performing
  // lab) each supervisee belongs to — a real gap, same shape as the
  // Workstation & Hardware redesign's own facility-scoping work,
  // confirmed directly: FppeAssignment had no facility association at
  // all before this.
  const [facilityFilter, setFacilityFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [provisionalUserId, setProvisionalUserId] = useState('');
  const [proctorUserId, setProctorUserId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [subspecialtyId, setSubspecialtyId] = useState('');
  const [endConditionType, setEndConditionType] = useState<EndConditionType>('either');
  const [caseCountThreshold, setCaseCountThreshold] = useState('20');
  const [durationDaysThreshold, setDurationDaysThreshold] = useState('90');
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    setLoading(true);
    Promise.all([fppeAssignmentService.getAll(), userService.getAll(), subspecialtyService.getAll()]).then(([aRes, uRes, sRes]) => {
      if (aRes.ok) setAssignments(aRes.data);
      if (uRes.ok) setUsers(uRes.data);
      if (sRes.ok) setSubspecialties(sRes.data);
      setLoading(false);
    });
  };
  useEffect(refresh, []);
  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);

  const userName = (id: string) => users.find(u => u.id === id)?.firstName
    ? `${users.find(u => u.id === id)?.firstName} ${users.find(u => u.id === id)?.lastName}`
    : id;
  const subspecialtyName = (id?: string) => id ? (subspecialties.find(s => s.id === id)?.name ?? id) : t('fppeAssignmentsSection.form.allSubspecialties');
  const facilityName = (id: string) => labs.find(l => l.id === id)?.name ?? id;

  const canCreate = provisionalUserId && proctorUserId && provisionalUserId !== proctorUserId && facilityId
    && (endConditionType !== 'case_count' || +caseCountThreshold > 0)
    && (endConditionType !== 'duration_days' || +durationDaysThreshold > 0)
    && (endConditionType !== 'either' || (+caseCountThreshold > 0 && +durationDaysThreshold > 0));

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    const endCondition: FppeEndCondition = endConditionType === 'case_count'
      ? { type: 'case_count', threshold: +caseCountThreshold }
      : endConditionType === 'duration_days'
      ? { type: 'duration_days', threshold: +durationDaysThreshold }
      : { type: 'either', caseCountThreshold: +caseCountThreshold, durationDaysThreshold: +durationDaysThreshold };

    const created = await fppeAssignmentService.create({
      provisionalUserId,
      provisionalUserName: userName(provisionalUserId),
      proctorUserId,
      proctorUserName: userName(proctorUserId),
      facilityId,
      subspecialtyId: subspecialtyId || undefined,
      endCondition,
    });
    // PS-114, Stage 3 — real, synchronized shadow-write. Uses the old
    // system's own real, just-generated id explicitly, so the same
    // logical assignment shares one real id across both systems -
    // what makes recordCaseReviewed/graduate below able to mirror
    // correctly later without any separate id-mapping table. Real,
    // deliberate fire-and-forget: never blocks or fails the real,
    // already-successful old-system create above. facilityId is now
    // carried through here too, same field-for-field mirroring
    // discipline as every other real field already shadow-written.
    if (created.ok) {
      qaSupervisionAssignmentService.create({
        id: created.data.id,
        activityTypeId: FPPE_ACTIVITY_TYPE_ID,
        superviseeUserId: provisionalUserId, superviseeUserName: userName(provisionalUserId),
        supervisorUserId: proctorUserId, supervisorUserName: userName(proctorUserId),
        subspecialtyId: subspecialtyId || undefined,
        facilityId,
        endCondition,
      }).catch(() => {});
    }
    setCreating(false);
    setShowForm(false);
    setProvisionalUserId(''); setProctorUserId(''); setSubspecialtyId(''); setFacilityId('');
    refresh();
  };

  const handleGraduate = async (id: string) => {
    await fppeAssignmentService.graduate(id);
    // PS-114, Stage 3 — real, synchronized shadow-write, same reasoning
    // as handleCreate above. Uses the same real id, since it was shared
    // at creation time.
    qaSupervisionAssignmentService.graduate(id).catch(() => {});
    refresh();
  };

  // Real fix, found by this app's own inline-CSS/business-logic sweep:
  // daysSince now comes from fppeEndCondition.ts's shared
  // computeFppeProgress() — the same real source of truth
  // mockFppeAssignmentService.ts's actual enforcement and
  // FppeTrackingTab.tsx's progress bar both use — instead of an
  // independently-recomputed copy of the same days-since-start math.
  const endConditionLabel = (a: FppeAssignment) => {
    const daysSince = Math.floor(computeFppeProgress(a).daysSinceStart);
    if (a.endCondition.type === 'case_count') {
      return t('fppeAssignmentsSection.progress.caseCount', { reviewed: a.casesReviewedCount, threshold: a.endCondition.threshold });
    }
    if (a.endCondition.type === 'duration_days') {
      return t('fppeAssignmentsSection.progress.duration', { daysSince, threshold: a.endCondition.threshold });
    }
    return t('fppeAssignmentsSection.progress.either', {
      reviewed: a.casesReviewedCount, caseThreshold: a.endCondition.caseCountThreshold,
      daysSince, durationThreshold: a.endCondition.durationDaysThreshold,
    });
  };

  if (loading) return <div className="ps-conf-loading">{t('fppeAssignmentsSection.loading')}</div>;

  // Real, per direct guidance: filters BOTH the active and completed
  // sections by the same selected facility — an admin narrowing to
  // their own performing lab sees a real, complete Active+Completed
  // picture for it, not just one half.
  const facilityFiltered = facilityFilter ? assignments.filter(a => a.facilityId === facilityFilter) : assignments;
  const active = facilityFiltered.filter(a => a.status === 'active');
  const completed = facilityFiltered.filter(a => a.status === 'completed');

  return (
    <div>
      <div className="ps-defic-page-header">
        <h2 className="ps-defic-page-title">🪪 {t('fppeAssignmentsSection.title')}</h2>
        <p className="ps-defic-page-subtitle">
          {t('fppeAssignmentsSection.subtitle')}
        </p>
      </div>

      {labs.length > 0 && (
        <div className="ps-conf-form-row ps-mb-16">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('fppeAssignmentsSection.facilityLabel')}</label>
            <select className="ps-conf-select" value={facilityFilter} onChange={e => setFacilityFilter(e.target.value)}>
              <option value="">{t('fppeAssignmentsSection.allFacilities')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <button className="ps-conf-btn-primary ps-mb-16" onClick={() => setShowForm(s => !s)}>
        {showForm ? t('common.cancel') : `+ ${t('fppeAssignmentsSection.newAssignmentButton')}`}
      </button>

      {showForm && (
        <div className="ps-conf-table-wrap ps-fppe-form-wrap">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-provisional">{t('fppeAssignmentsSection.form.provisionalHireLabel')}</label>
            <select id="fppe-provisional" className="ps-conf-select" value={provisionalUserId} onChange={e => setProvisionalUserId(e.target.value)}>
              <option value="">{t('fppeAssignmentsSection.form.selectPlaceholder')}</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-proctor">{t('fppeAssignmentsSection.form.proctorLabel')}</label>
            <select id="fppe-proctor" className="ps-conf-select" value={proctorUserId} onChange={e => setProctorUserId(e.target.value)}>
              <option value="">{t('fppeAssignmentsSection.form.selectPlaceholder')}</option>
              {users.filter(u => u.id !== provisionalUserId).map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-facility">{t('fppeAssignmentsSection.facilityLabel')} <span className="ps-conf-required">*</span></label>
            <select id="fppe-facility" className="ps-conf-select" value={facilityId} onChange={e => setFacilityId(e.target.value)}>
              <option value="">{t('fppeAssignmentsSection.form.selectPlaceholder')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-subspecialty">{t('fppeAssignmentsSection.form.subspecialtyLabel')}</label>
            <select id="fppe-subspecialty" className="ps-conf-select" value={subspecialtyId} onChange={e => setSubspecialtyId(e.target.value)}>
              <option value="">{t('fppeAssignmentsSection.form.allSubspecialties')}</option>
              {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-end-condition">{t('fppeAssignmentsSection.form.endConditionLabel')}</label>
            <select id="fppe-end-condition" className="ps-conf-select" value={endConditionType} onChange={e => setEndConditionType(e.target.value as EndConditionType)}>
              <option value="either">{t('fppeAssignmentsSection.form.endConditionEither')}</option>
              <option value="case_count">{t('fppeAssignmentsSection.form.endConditionCaseCount')}</option>
              <option value="duration_days">{t('fppeAssignmentsSection.form.endConditionDuration')}</option>
            </select>
          </div>
          {(endConditionType === 'case_count' || endConditionType === 'either') && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('fppeAssignmentsSection.form.caseCountThresholdLabel')}</label>
              <input className="ps-conf-input" type="number" min={1} value={caseCountThreshold} onChange={e => setCaseCountThreshold(e.target.value)} />
            </div>
          )}
          {(endConditionType === 'duration_days' || endConditionType === 'either') && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('fppeAssignmentsSection.form.durationThresholdLabel')}</label>
              <input className="ps-conf-input" type="number" min={1} value={durationDaysThreshold} onChange={e => setDurationDaysThreshold(e.target.value)} />
            </div>
          )}
          <button className="ps-conf-btn-primary" disabled={!canCreate || creating} onClick={handleCreate}>{t('fppeAssignmentsSection.form.createButton')}</button>
        </div>
      )}

      <div className="ps-defic-review-banner ps-mb-8">
        <span className="ps-defic-review-banner-label">{t('fppeAssignmentsSection.banners.active', { count: active.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">{t('fppeAssignmentsSection.form.provisionalHireLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.form.proctorLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.facilityLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.scope')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.progress')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.started')}</th><th className="ps-conf-th"></th></tr></thead>
          <tbody>
            {active.length === 0 && <tr><td className="ps-conf-td" colSpan={7}>{facilityFilter ? t('fppeAssignmentsSection.table.emptyActiveForFacility') : t('fppeAssignmentsSection.table.emptyActiveGlobal')}</td></tr>}
            {active.map(a => (
              <tr key={a.id}>
                <td className="ps-conf-td">{a.provisionalUserName}</td>
                <td className="ps-conf-td">{a.proctorUserName}</td>
                <td className="ps-conf-td">{facilityName(a.facilityId)}</td>
                <td className="ps-conf-td">{subspecialtyName(a.subspecialtyId)}</td>
                <td className="ps-conf-td">{endConditionLabel(a)}</td>
                <td className="ps-conf-td">{new Date(a.startedAt).toLocaleDateString()}</td>
                <td className="ps-conf-td"><button className="ps-conf-btn-secondary" onClick={() => handleGraduate(a.id)}>{t('fppeAssignmentsSection.table.graduateButton')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ps-defic-review-banner ps-mt-20 ps-mb-8">
        <span className="ps-defic-review-banner-label">{t('fppeAssignmentsSection.banners.completed', { count: completed.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">{t('fppeAssignmentsSection.form.provisionalHireLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.form.proctorLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.facilityLabel')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.casesReviewed')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.completed')}</th><th className="ps-conf-th">{t('fppeAssignmentsSection.table.headers.reason')}</th></tr></thead>
          <tbody>
            {completed.length === 0 && <tr><td className="ps-conf-td" colSpan={6}>{facilityFilter ? t('fppeAssignmentsSection.table.emptyCompletedForFacility') : t('fppeAssignmentsSection.table.emptyCompletedGlobal')}</td></tr>}
            {completed.map(a => (
              <tr key={a.id}>
                <td className="ps-conf-td">{a.provisionalUserName}</td>
                <td className="ps-conf-td">{a.proctorUserName}</td>
                <td className="ps-conf-td">{facilityName(a.facilityId)}</td>
                <td className="ps-conf-td">{a.casesReviewedCount}</td>
                <td className="ps-conf-td">{a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ''}</td>
                <td className="ps-conf-td">{a.completedReason === 'manually_graduated' ? t('fppeAssignmentsSection.table.completedReason.graduatedEarly') : a.completedReason === 'case_count_met' ? t('fppeAssignmentsSection.form.endConditionCaseCount') : t('fppeAssignmentsSection.form.endConditionDuration')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FppeAssignmentsSection;
