// src/components/Config/System/CytotechCompetencyAssignmentsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("We also should account for Cytotecs
// trained and new staff while we are here") — the real admin UI to
// actually CREATE and manage an instance of the New Cytotechnologist
// Competency Assessment supervision type (CYTOTECH_COMPETENCY_ACTIVITY_TYPE_ID
// — see mockQaSupervisionAssignmentService.ts's own doc comment for the
// full CLIA '88 Subpart M rationale and this archetype's honest scope
// boundary). Without this, the new type and the countersign-gate
// extension in resolveResidentCountersignRequired.ts would have nowhere
// an admin could actually assign a real Cytotechnologist to — real,
// unreachable plumbing, not a finished feature.
//
// Real, deliberate: built directly against the generic
// qaSupervisionAssignmentService/qaSupervisionAssignmentTypeService
// from the start — unlike FppeAssignmentsSection.tsx, there is no
// legacy FppeAssignment-shaped system for this brand-new type to
// shadow-write into, so this component carries none of that
// migration-era complexity. Deliberately its own, separate section
// rather than a generalization of FppeAssignmentsSection.tsx itself:
// that component's own list view still reads the OLD, FPPE-specific
// fppeAssignmentService (see its header and IQaSupervisionAssignmentService.ts's
// own doc comment) — folding a second, generic-only type into its
// create form would silently create real assignments its own list
// could never show, a real, confusing gap. Migrating that list view
// onto the generic service for every supervision type is real,
// separate, larger work (the rest of PS-114's own migration), not
// bundled into this pass.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { userService, subspecialtyService, qaSupervisionAssignmentService } from '@/services';
import { CYTOTECH_COMPETENCY_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaSupervisionAssignmentService';
import type { StaffUser, Subspecialty, Facility } from '@/services';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import type { QaSupervisionAssignment } from '@/types/quality/QaSupervisionAssignment';

const CytotechCompetencyAssignmentsSection: React.FC = () => {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<QaSupervisionAssignment[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  const [facilityFilter, setFacilityFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [superviseeUserId, setSuperviseeUserId] = useState('');
  const [supervisorUserId, setSupervisorUserId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [subspecialtyId, setSubspecialtyId] = useState('');
  // Real, per direct follow-up's own confirmed CLIA rule this
  // archetype actually covers ("twice in year one") — defaults to a
  // 2-assessment threshold rather than FPPE's own case-count/duration
  // defaults, since a competency assessment isn't a case review count.
  // Still editable — a real lab's own documented competency plan may
  // reasonably require more than the CLIA floor.
  const [assessmentCountThreshold, setAssessmentCountThreshold] = useState('2');
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    setLoading(true);
    Promise.all([qaSupervisionAssignmentService.getAll(), userService.getAll(), subspecialtyService.getAll()]).then(([aRes, uRes, sRes]) => {
      if (aRes.ok) setAssignments(aRes.data.filter(a => a.activityTypeId === CYTOTECH_COMPETENCY_ACTIVITY_TYPE_ID));
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
  const subspecialtyName = (id?: string) => id ? (subspecialties.find(s => s.id === id)?.name ?? id) : t('cytotechCompetencyAssignmentsSection.allSubspecialties');
  const facilityName = (id: string) => labs.find(l => l.id === id)?.name ?? id;

  const canCreate = superviseeUserId && supervisorUserId && superviseeUserId !== supervisorUserId
    && +assessmentCountThreshold > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    await qaSupervisionAssignmentService.create({
      activityTypeId: CYTOTECH_COMPETENCY_ACTIVITY_TYPE_ID,
      superviseeUserId, superviseeUserName: userName(superviseeUserId),
      supervisorUserId, supervisorUserName: userName(supervisorUserId),
      subspecialtyId: subspecialtyId || undefined,
      facilityId: facilityId || undefined,
      endCondition: { type: 'case_count', threshold: +assessmentCountThreshold },
    });
    setCreating(false);
    setShowForm(false);
    setSuperviseeUserId(''); setSupervisorUserId(''); setSubspecialtyId(''); setFacilityId('');
    refresh();
  };

  const handleGraduate = async (id: string) => {
    await qaSupervisionAssignmentService.graduate(id);
    refresh();
  };

  const progressLabel = (a: QaSupervisionAssignment) => {
    if (a.endCondition.type === 'case_count') return t('cytotechCompetencyAssignmentsSection.progress.assessmentsCount', { count: a.casesReviewedCount, threshold: a.endCondition.threshold });
    if (a.endCondition.type === 'duration_days') {
      const daysSince = Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 86400000);
      return t('cytotechCompetencyAssignmentsSection.progress.dayCount', { daysSince, threshold: a.endCondition.threshold });
    }
    const daysSince = Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 86400000);
    return t('cytotechCompetencyAssignmentsSection.progress.combined', {
      count: a.casesReviewedCount, caseThreshold: a.endCondition.caseCountThreshold,
      daysSince, durationThreshold: a.endCondition.durationDaysThreshold,
    });
  };

  if (loading) return <div className="ps-conf-loading">{t('cytotechCompetencyAssignmentsSection.loading')}</div>;

  const facilityFiltered = facilityFilter ? assignments.filter(a => a.facilityId === facilityFilter) : assignments;
  const active = facilityFiltered.filter(a => a.status === 'active');
  const completed = facilityFiltered.filter(a => a.status === 'completed');

  return (
    <div className="ps-mt-32">
      <div className="ps-defic-page-header">
        <h2 className="ps-defic-page-title">{t('cytotechCompetencyAssignmentsSection.title')}</h2>
        <p className="ps-defic-page-subtitle">
          {t('cytotechCompetencyAssignmentsSection.subtitle')}
        </p>
      </div>

      {labs.length > 0 && (
        <div className="ps-conf-form-row ps-mb-16">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cytotechCompetencyAssignmentsSection.filter.label')}</label>
            <select className="ps-conf-select" value={facilityFilter} onChange={e => setFacilityFilter(e.target.value)}>
              <option value="">{t('cytotechCompetencyAssignmentsSection.filter.allFacilities')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <button className="ps-conf-btn-primary ps-mb-16" onClick={() => setShowForm(s => !s)}>
        {showForm ? t('common.cancel') : t('cytotechCompetencyAssignmentsSection.newButton')}
      </button>

      {showForm && (
        <div className="ps-conf-table-wrap ps-cytocomp-form-wrap">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="cyto-comp-supervisee">{t('cytotechCompetencyAssignmentsSection.form.superviseeLabel')}</label>
            <select id="cyto-comp-supervisee" className="ps-conf-select" value={superviseeUserId} onChange={e => setSuperviseeUserId(e.target.value)}>
              <option value="">{t('cytotechCompetencyAssignmentsSection.form.selectPlaceholder')}</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="cyto-comp-supervisor">{t('cytotechCompetencyAssignmentsSection.form.supervisorLabel')}</label>
            <select id="cyto-comp-supervisor" className="ps-conf-select" value={supervisorUserId} onChange={e => setSupervisorUserId(e.target.value)}>
              <option value="">{t('cytotechCompetencyAssignmentsSection.form.selectPlaceholder')}</option>
              {users.filter(u => u.id !== superviseeUserId).map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="cyto-comp-facility">{t('cytotechCompetencyAssignmentsSection.form.facilityLabel')}</label>
            <select id="cyto-comp-facility" className="ps-conf-select" value={facilityId} onChange={e => setFacilityId(e.target.value)}>
              <option value="">{t('cytotechCompetencyAssignmentsSection.form.notFacilityScoped')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="cyto-comp-subspecialty">{t('cytotechCompetencyAssignmentsSection.form.subspecialtyLabel')}</label>
            <select id="cyto-comp-subspecialty" className="ps-conf-select" value={subspecialtyId} onChange={e => setSubspecialtyId(e.target.value)}>
              <option value="">{t('cytotechCompetencyAssignmentsSection.allSubspecialties')}</option>
              {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cytotechCompetencyAssignmentsSection.form.assessmentsRequiredLabel')}</label>
            <input className="ps-conf-input" type="number" min={1} value={assessmentCountThreshold} onChange={e => setAssessmentCountThreshold(e.target.value)} />
          </div>
          <button className="ps-conf-btn-primary" disabled={!canCreate || creating} onClick={handleCreate}>{t('cytotechCompetencyAssignmentsSection.form.createButton')}</button>
        </div>
      )}

      <div className="ps-defic-review-banner ps-mb-8">
        <span className="ps-defic-review-banner-label">{t('cytotechCompetencyAssignmentsSection.banners.active', { count: active.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.cytotechnologist')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.supervisor')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.performingLab')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.scope')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.progress')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.started')}</th>
            <th className="ps-conf-th"></th>
          </tr></thead>
          <tbody>
            {active.length === 0 && <tr><td className="ps-conf-td" colSpan={7}>{facilityFilter ? t('cytotechCompetencyAssignmentsSection.table.noActiveForFacility') : t('cytotechCompetencyAssignmentsSection.table.noActiveAll')}</td></tr>}
            {active.map(a => (
              <tr key={a.id}>
                <td className="ps-conf-td">{a.superviseeUserName}</td>
                <td className="ps-conf-td">{a.supervisorUserName}</td>
                <td className="ps-conf-td">{a.facilityId ? facilityName(a.facilityId) : '—'}</td>
                <td className="ps-conf-td">{subspecialtyName(a.subspecialtyId)}</td>
                <td className="ps-conf-td">{progressLabel(a)}</td>
                <td className="ps-conf-td">{new Date(a.startedAt).toLocaleDateString()}</td>
                <td className="ps-conf-td"><button className="ps-conf-btn-secondary" onClick={() => handleGraduate(a.id)}>{t('cytotechCompetencyAssignmentsSection.table.graduateButton')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ps-defic-review-banner ps-mt-20 ps-mb-8">
        <span className="ps-defic-review-banner-label">{t('cytotechCompetencyAssignmentsSection.banners.completed', { count: completed.length })}</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.cytotechnologist')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.supervisor')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.performingLab')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.assessmentsRecorded')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.completed')}</th>
            <th className="ps-conf-th">{t('cytotechCompetencyAssignmentsSection.table.headers.reason')}</th>
          </tr></thead>
          <tbody>
            {completed.length === 0 && <tr><td className="ps-conf-td" colSpan={6}>{facilityFilter ? t('cytotechCompetencyAssignmentsSection.table.noCompletedForFacility') : t('cytotechCompetencyAssignmentsSection.table.noCompletedAll')}</td></tr>}
            {completed.map(a => (
              <tr key={a.id}>
                <td className="ps-conf-td">{a.superviseeUserName}</td>
                <td className="ps-conf-td">{a.supervisorUserName}</td>
                <td className="ps-conf-td">{a.facilityId ? facilityName(a.facilityId) : '—'}</td>
                <td className="ps-conf-td">{a.casesReviewedCount}</td>
                <td className="ps-conf-td">{a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ''}</td>
                <td className="ps-conf-td">
                  {a.completedReason === 'manually_graduated'
                    ? t('cytotechCompetencyAssignmentsSection.completedReason.graduatedEarly')
                    : a.completedReason === 'case_count_met'
                    ? t('cytotechCompetencyAssignmentsSection.completedReason.assessmentCountReached')
                    : t('cytotechCompetencyAssignmentsSection.completedReason.durationElapsed')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CytotechCompetencyAssignmentsSection;
