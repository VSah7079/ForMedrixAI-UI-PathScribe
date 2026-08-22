// src/components/QualityAssurance/PatientMatchReviewSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real review queue for the MPI's 'ambiguous' outcomes — every record
// resolveOrCreatePatient() couldn't confidently match one way or the
// other, per services/patients/IPatientIndexService.ts's own reasoning:
// a deterministic matcher that only ever auto-matches or auto-creates,
// with nothing routed to a human, would either silently merge two
// different people's histories or silently fragment one person's
// history across duplicate records — either is a real patient-safety
// problem, not a cosmetic one. This is the screen that closes the loop:
// without it, an ambiguous match gets flagged and then never actually
// looked at by anyone.
//
// Lives here, not Config/System/ (where it was first placed, and
// correctly relocated after a direct question) — this isn't a
// "configure once" settings screen the way TAT Configuration or Session
// Security are. It's a recurring work queue of flagged items needing
// real, ongoing human review and action — exactly the same shape as
// every other tab in this folder (Countersign Turnaround, Drift
// Correction, FPPE), not the shape of an admin settings screen.
//
// Scoped the same way as the other QA tabs' cross-tenant access
// (services/auth/caseAccessControl.ts's canViewCrossTenantQaData) — a
// standard user reviews their own organisation's queue only; a
// cross-tenant-permitted admin can pick any organisation.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import '../../pathscribe.css';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import { listOrganisations } from '@/services/organisation/organisationService';
import type { Organisation } from '@/services/organisation/organisationService';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import { caseRouter } from '@/services/cases/CaseRouter';
import ConfirmModal from '../Common/ConfirmModal';
import { exportQaReportRows } from './qaReportUtils';

const ALL_ORGS_VALUE = '__all__';

export const PatientMatchReviewSection: React.FC = () => {
  const session = getSessionUser();
  const crossTenant = canViewCrossTenantQaData(session);

  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(session?.organisationId ?? '');
  const [pending, setPending] = useState<MasterPatientRecord[]>([]);
  const [candidateDetails, setCandidateDetails] = useState<Record<string, MasterPatientRecord>>({});
  /** Real accession context per provisional record — the actual case(s)
   *  that triggered the ambiguous flag. Without this, a reviewer is
   *  comparing two bare demographic records with nothing to help judge
   *  whether they're genuinely the same person: which specimen, which
   *  referring physician, when. Keyed by provisional record id. */
  const [caseContext, setCaseContext] = useState<Record<string, { accession?: string; specimen?: string; provider?: string; accessionedAt?: string; accessionedBy?: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [mergeTarget, setMergeTarget] = useState<{ provisional: MasterPatientRecord; candidate: MasterPatientRecord } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ provisional: MasterPatientRecord; candidate: MasterPatientRecord } | null>(null);
  const [confirmNewTarget, setConfirmNewTarget] = useState<MasterPatientRecord | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [lastMergeCount, setLastMergeCount] = useState<number | null>(null);

  useEffect(() => {
    if (crossTenant) {
      listOrganisations().then(orgs => setOrganisations(orgs.filter(o => o.active)));
    }
  }, [crossTenant]);

  const loadQueue = React.useCallback(async () => {
    if (!selectedOrgId) { setPending([]); setLoading(false); return; }
    setLoading(true);
    // Real fix, item #92: cross-tenant admins previously had to switch
    // between organisations one at a time to see pending reviews across
    // the whole system - a real "See All" sentinel, aggregating across
    // every active org, closes that gap.
    const records = selectedOrgId === ALL_ORGS_VALUE
      ? (await Promise.all(organisations.map(o => mockPatientIndexService.listPendingReview(o.id)))).flat()
      : await mockPatientIndexService.listPendingReview(selectedOrgId);
    setPending(records);
    // Real candidate detail lookup — the queue needs to show WHO each
    // flagged record might actually be (name, MRN, DOB), not just an
    // opaque id, or a reviewer has nothing to actually compare against.
    const ids = Array.from(new Set(records.flatMap(r => r.reviewCandidateIds ?? [])));
    const details: Record<string, MasterPatientRecord> = {};
    await Promise.all(ids.map(async id => {
      const rec = await mockPatientIndexService.getById(id);
      if (rec) details[id] = rec;
    }));
    setCandidateDetails(details);

    // Real accession context — one bulk fetch, grouped by provisional
    // patient id client-side, rather than one search per record.
    const casesRes = await caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: true } as any);
    const contextByRecord: Record<string, { accession?: string; specimen?: string; provider?: string; accessionedAt?: string; accessionedBy?: string }[]> = {};
    if (casesRes.ok) {
      const recordIds = new Set(records.map(r => r.id));
      (casesRes.data as any[]).forEach(c => {
        const pid = c?.patient?.id;
        if (!pid || !recordIds.has(pid)) return;
        if (!contextByRecord[pid]) contextByRecord[pid] = [];
        contextByRecord[pid].push({
          accession: c?.fullAccession ?? c?.accession?.fullAccession,
          specimen: c?.specimens?.[0]?.description,
          provider: c?.order?.requestingProvider,
          accessionedAt: c?.accession?.accessionedAt,
          accessionedBy: c?.accession?.accessionedBy,
        });
      });
    }
    setCaseContext(contextByRecord);
    setLoading(false);
  }, [selectedOrgId, organisations]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleConfirmNewClick = (record: MasterPatientRecord) => {
    setConfirmNewTarget(record);
  };

  const handleConfirmNewConfirmed = async () => {
    if (!confirmNewTarget) return;
    setActionInFlight(confirmNewTarget.id);
    await mockPatientIndexService.confirmAsNewPatient(confirmNewTarget.id);
    setActionInFlight(null);
    setConfirmNewTarget(null);
    loadQueue();
  };

  const handleMergeConfirmed = async () => {
    if (!mergeTarget) return;
    setActionInFlight(mergeTarget.provisional.id);
    const result = await mockPatientIndexService.mergeIntoExistingPatient(mergeTarget.provisional.id, mergeTarget.candidate.id);
    setActionInFlight(null);
    setLastMergeCount(result.casesRepointed);
    setMergeTarget(null);
    loadQueue();
  };

  const handleLinkConfirmed = async () => {
    if (!linkTarget) return;
    setActionInFlight(linkTarget.provisional.id);
    await mockPatientIndexService.linkPatients(
      linkTarget.provisional.id,
      linkTarget.candidate.id,
      session?.id ?? 'unknown',
      linkTarget.provisional.reviewReason,
    );
    setActionInFlight(null);
    setLinkTarget(null);
    loadQueue();
  };

  // "Just the working rows" — the queue currently on screen, not a
  // complete historical record (there isn't one for this queue the way
  // there is for deficiencies; a resolved match doesn't stay queryable
  // here once it's merged/linked/confirmed).
  const handleExport = () => {
    const rows = pending.map(record => {
      const candidates = (record.reviewCandidateIds ?? [])
        .map(id => candidateDetails[id])
        .filter((c): c is MasterPatientRecord => !!c)
        .map(c => `${c.lastName}, ${c.firstName} (MRN ${c.mrn})`)
        .join('; ');
      const context = (caseContext[record.id] ?? [])
        .map(ctx => ctx.accession ?? '')
        .filter(Boolean)
        .join('; ');
      return {
        'Record': `${record.lastName}, ${record.firstName}`,
        'MRN': record.mrn,
        'DOB': new Date(record.dateOfBirth).toLocaleDateString(),
        'Flagged': record.createdAt,
        'Reason': record.reviewReason,
        'From Accession(s)': context,
        'Possible Matches': candidates || 'none',
      };
    });
    exportQaReportRows(rows, `patient-match-review-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div style={{ width: '100%', maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Patient Match Review</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Cases where a new patient's MRN, name, or date of birth partially matched an
          existing record — never auto-resolved, since a wrong guess here means
          showing one patient's history against another's case. Each one needs a
          real decision: confirm this is genuinely a new patient, or merge it into
          the existing record it likely belongs to.
        </p>
      </div>

      {crossTenant && (
        <div style={{ marginBottom: 16 }}>
          <label className="ps-conf-label" htmlFor="pmr-organisation-select" style={{ display: 'block', marginBottom: 6 }}>Organisation</label>
          <select
            id="pmr-organisation-select"
            value={selectedOrgId}
            onChange={e => setSelectedOrgId(e.target.value)}
            className="ps-conf-select"
            style={{ width: 320 }}
          >
            <option value="">Select an organisation…</option>
            <option value={ALL_ORGS_VALUE}>— See All Organisations —</option>
            {organisations.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="ps-qa-tab-toolbar">
        <button className="ps-conf-btn-secondary" onClick={handleExport}>Export</button>
      </div>

      {lastMergeCount !== null && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, fontSize: 13, color: '#4ade80' }}>
          ✓ Merged — {lastMergeCount} case{lastMergeCount === 1 ? '' : 's'} repointed to the confirmed patient record.
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6b7280', fontSize: 13, padding: '24px 0' }}>Loading review queue…</div>
      ) : !selectedOrgId ? (
        <div style={{ color: '#6b7280', fontSize: 13, padding: '24px 0' }}>Select an organisation to review its pending matches.</div>
      ) : pending.length === 0 ? (
        <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 24, color: '#6b7280', fontSize: 13 }}>
          Nothing pending review for this organisation.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pending.map(record => (
            <div key={record.id} style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb' }}>
                    {record.lastName}, {record.firstName}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    MRN {record.mrn} · DOB {new Date(record.dateOfBirth).toLocaleDateString()} · Flagged {new Date(record.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="ps-conf-status-cell">
                  <span className="ps-conf-status-dot ps-conf-status-dot--pending" />
                  <span className="ps-conf-status-text ps-conf-status-text--pending">Needs Review</span>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
                {record.reviewReason}
              </div>

              {(caseContext[record.id] ?? []).length > 0 && (
                <div style={{ marginBottom: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    From this accession
                  </div>
                  {(caseContext[record.id] ?? []).map((ctx, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                      {ctx.accession && <span data-phi="accession">{ctx.accession}</span>}
                      {ctx.specimen && <span> · {ctx.specimen}</span>}
                      {ctx.provider && <span> · Referring: {ctx.provider}</span>}
                      {ctx.accessionedBy && <span> · Accessioned by {ctx.accessionedBy}</span>}
                      {ctx.accessionedAt && <span> on {new Date(ctx.accessionedAt).toLocaleDateString()}</span>}
                    </div>
                  ))}
                </div>
              )}

              {(record.reviewCandidateIds ?? []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Possible existing match{(record.reviewCandidateIds ?? []).length === 1 ? '' : 'es'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(record.reviewCandidateIds ?? []).map(candId => {
                      const cand = candidateDetails[candId];
                      if (!cand) return null;
                      return (
                        <div key={candId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px' }}>
                          <div>
                            <div style={{ fontSize: 13, color: '#e5e7eb' }}>{cand.lastName}, {cand.firstName}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>MRN {cand.mrn} · DOB {new Date(cand.dateOfBirth).toLocaleDateString()}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="ps-conf-btn-secondary"
                              disabled={actionInFlight === record.id}
                              onClick={() => setLinkTarget({ provisional: record, candidate: cand })}
                              title="Confirm this is the same real person WITHOUT merging - both records stay active, e.g. the same patient referred by two different EMR systems"
                            >
                              Link — same patient, different source
                            </button>
                            <button
                              type="button"
                              className="ps-conf-btn-secondary"
                              disabled={actionInFlight === record.id}
                              onClick={() => setMergeTarget({ provisional: record, candidate: cand })}
                            >
                              Merge into this patient
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="ps-conf-btn-secondary"
                  disabled={actionInFlight === record.id}
                  onClick={() => handleConfirmNewClick(record)}
                >
                  Confirm as new patient
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        show={!!confirmNewTarget}
        title="Confirm as new patient"
        message={confirmNewTarget
          ? `This confirms ${confirmNewTarget.lastName}, ${confirmNewTarget.firstName} (MRN ${confirmNewTarget.mrn}) is genuinely a different person from every candidate record shown${(confirmNewTarget.reviewCandidateIds?.length ?? 0) > 0 ? ` (${confirmNewTarget.reviewCandidateIds!.length} candidate${confirmNewTarget.reviewCandidateIds!.length === 1 ? '' : 's'})` : ''}. This dismisses the review flag — getting this wrong leaves two separate identities for what may be the same patient.`
          : ''}
        confirmLabel="Confirm as new"
        cancelLabel="Cancel"
        onConfirm={handleConfirmNewConfirmed}
        onCancel={() => setConfirmNewTarget(null)}
      />

      <ConfirmModal
        show={!!mergeTarget}
        title="Merge patient records"
        message={mergeTarget
          ? `This will merge ${mergeTarget.provisional.lastName}, ${mergeTarget.provisional.firstName} (MRN ${mergeTarget.provisional.mrn}) into the existing record for ${mergeTarget.candidate.lastName}, ${mergeTarget.candidate.firstName} (MRN ${mergeTarget.candidate.mrn}). Every case currently on the provisional record will be repointed to the confirmed one. This cannot be undone from this screen.`
          : ''}
        confirmLabel="Merge"
        cancelLabel="Cancel"
        onConfirm={handleMergeConfirmed}
        onCancel={() => setMergeTarget(null)}
      />

      <ConfirmModal
        show={!!linkTarget}
        title="Link patient records"
        message={linkTarget
          ? `This confirms ${linkTarget.provisional.lastName}, ${linkTarget.provisional.firstName} (MRN ${linkTarget.provisional.mrn}) and ${linkTarget.candidate.lastName}, ${linkTarget.candidate.firstName} (MRN ${linkTarget.candidate.mrn}) are the same real person — for example, referred to this lab by two different, unrelated EMR systems. Unlike a merge, BOTH records stay fully active and will keep matching their own future orders under their own MRN. Patient History will show cases from both going forward.`
          : ''}
        confirmLabel="Link"
        cancelLabel="Cancel"
        onConfirm={handleLinkConfirmed}
        onCancel={() => setLinkTarget(null)}
      />
    </div>
  );
};
