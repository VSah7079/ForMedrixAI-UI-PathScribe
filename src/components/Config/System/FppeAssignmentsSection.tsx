// src/components/Config/System/FppeAssignmentsSection.tsx
import React, { useEffect, useState } from 'react';
import '../../../pathscribe.css';
import { userService, subspecialtyService, fppeAssignmentService, qaSupervisionAssignmentService } from '@/services';
import { FPPE_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaSupervisionAssignmentService';
import type { StaffUser, Subspecialty, Facility } from '@/services';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import type { FppeAssignment, FppeEndCondition } from '@/types/case/FppeAssignment';

type EndConditionType = 'case_count' | 'duration_days' | 'either';

const FppeAssignmentsSection: React.FC = () => {
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
  const subspecialtyName = (id?: string) => id ? (subspecialties.find(s => s.id === id)?.name ?? id) : 'All subspecialties';
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

  const endConditionLabel = (a: FppeAssignment) => {
    if (a.endCondition.type === 'case_count') return `${a.casesReviewedCount} / ${a.endCondition.threshold} cases`;
    if (a.endCondition.type === 'duration_days') {
      const daysSince = Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 86400000);
      return `Day ${daysSince} / ${a.endCondition.threshold}`;
    }
    const daysSince = Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 86400000);
    return `${a.casesReviewedCount} / ${a.endCondition.caseCountThreshold} cases · Day ${daysSince} / ${a.endCondition.durationDaysThreshold}`;
  };

  if (loading) return <div className="ps-conf-loading">Loading FPPE assignments…</div>;

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
        <h2 className="ps-defic-page-title">🪪 FPPE Assignments</h2>
        <p className="ps-defic-page-subtitle">
          Focused Professional Practice Evaluation — proctoring assignments for new hires, distinct from resident/
          attending oversight. Each assignment has a real, bounded review period (case count, duration, or
          whichever comes first), unlike residency training which has no natural end condition to track.
        </p>
      </div>

      {labs.length > 0 && (
        <div className="ps-conf-form-row" style={{ marginBottom: 16 }}>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Performing Lab</label>
            <select className="ps-conf-select" value={facilityFilter} onChange={e => setFacilityFilter(e.target.value)}>
              <option value="">All Facilities</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <button className="ps-conf-btn-primary" onClick={() => setShowForm(s => !s)} style={{ marginBottom: 16 }}>
        {showForm ? 'Cancel' : '+ New FPPE Assignment'}
      </button>

      {showForm && (
        <div className="ps-conf-table-wrap" style={{ padding: 20, marginBottom: 20 }}>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-provisional">Provisional Hire</label>
            <select id="fppe-provisional" className="ps-conf-select" value={provisionalUserId} onChange={e => setProvisionalUserId(e.target.value)}>
              <option value="">Select…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-proctor">Proctor</label>
            <select id="fppe-proctor" className="ps-conf-select" value={proctorUserId} onChange={e => setProctorUserId(e.target.value)}>
              <option value="">Select…</option>
              {users.filter(u => u.id !== provisionalUserId).map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-facility">Performing Lab <span className="ps-conf-required">*</span></label>
            <select id="fppe-facility" className="ps-conf-select" value={facilityId} onChange={e => setFacilityId(e.target.value)}>
              <option value="">Select…</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-subspecialty">Subspecialty scope — optional</label>
            <select id="fppe-subspecialty" className="ps-conf-select" value={subspecialtyId} onChange={e => setSubspecialtyId(e.target.value)}>
              <option value="">All subspecialties</option>
              {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="fppe-end-condition">Review period ends when</label>
            <select id="fppe-end-condition" className="ps-conf-select" value={endConditionType} onChange={e => setEndConditionType(e.target.value as EndConditionType)}>
              <option value="either">Case count OR duration, whichever is sooner</option>
              <option value="case_count">Case count reached</option>
              <option value="duration_days">Duration elapsed</option>
            </select>
          </div>
          {(endConditionType === 'case_count' || endConditionType === 'either') && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Case count threshold</label>
              <input className="ps-conf-input" type="number" min={1} value={caseCountThreshold} onChange={e => setCaseCountThreshold(e.target.value)} />
            </div>
          )}
          {(endConditionType === 'duration_days' || endConditionType === 'either') && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Duration threshold (days)</label>
              <input className="ps-conf-input" type="number" min={1} value={durationDaysThreshold} onChange={e => setDurationDaysThreshold(e.target.value)} />
            </div>
          )}
          <button className="ps-conf-btn-primary" disabled={!canCreate || creating} onClick={handleCreate}>Create Assignment</button>
        </div>
      )}

      <div className="ps-defic-review-banner" style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Active ({active.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">Provisional Hire</th><th className="ps-conf-th">Proctor</th><th className="ps-conf-th">Performing Lab</th><th className="ps-conf-th">Scope</th><th className="ps-conf-th">Progress</th><th className="ps-conf-th">Started</th><th className="ps-conf-th"></th></tr></thead>
          <tbody>
            {active.length === 0 && <tr><td className="ps-conf-td" colSpan={7}>No active FPPE assignments{facilityFilter ? ' for this facility' : ''}.</td></tr>}
            {active.map(a => (
              <tr key={a.id}>
                <td className="ps-conf-td">{a.provisionalUserName}</td>
                <td className="ps-conf-td">{a.proctorUserName}</td>
                <td className="ps-conf-td">{facilityName(a.facilityId)}</td>
                <td className="ps-conf-td">{subspecialtyName(a.subspecialtyId)}</td>
                <td className="ps-conf-td">{endConditionLabel(a)}</td>
                <td className="ps-conf-td">{new Date(a.startedAt).toLocaleDateString()}</td>
                <td className="ps-conf-td"><button className="ps-conf-btn-secondary" onClick={() => handleGraduate(a.id)}>Graduate Now</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ps-defic-review-banner" style={{ marginTop: 20, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Completed ({completed.length})</span>
      </div>
      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead><tr><th className="ps-conf-th">Provisional Hire</th><th className="ps-conf-th">Proctor</th><th className="ps-conf-th">Performing Lab</th><th className="ps-conf-th">Cases Reviewed</th><th className="ps-conf-th">Completed</th><th className="ps-conf-th">Reason</th></tr></thead>
          <tbody>
            {completed.length === 0 && <tr><td className="ps-conf-td" colSpan={6}>No completed FPPE assignments yet{facilityFilter ? ' for this facility' : ''}.</td></tr>}
            {completed.map(a => (
              <tr key={a.id}>
                <td className="ps-conf-td">{a.provisionalUserName}</td>
                <td className="ps-conf-td">{a.proctorUserName}</td>
                <td className="ps-conf-td">{facilityName(a.facilityId)}</td>
                <td className="ps-conf-td">{a.casesReviewedCount}</td>
                <td className="ps-conf-td">{a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ''}</td>
                <td className="ps-conf-td">{a.completedReason === 'manually_graduated' ? 'Graduated early' : a.completedReason === 'case_count_met' ? 'Case count reached' : 'Duration elapsed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FppeAssignmentsSection;
