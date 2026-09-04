// src/pages/CytologyWorklistPage/CytologyWorklistPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real Cytotech worklist — "their assigned cases and pool worklist,"
// per direct guidance. Deliberately NOT a second worklist destination
// for Pathologists — cytology cases needing pathologist review are
// real, separate, later work to surface within the existing
// /worklist instead (per direct guidance's own explicit constraint:
// "I do not want to send the Pathologist to multiple worklist").
//
// Real, per direct follow-up: three real tiles, matching the existing
// WorklistPage.tsx's own real stat-tile pattern (a colored, glowing,
// count-bearing tile row) more closely than this page's earlier,
// plainer tab design — My Worklist (default), Pool, and a genuinely
// new third tile, QC, for cases already flagged for mandatory QC and
// awaiting that specific review. QC is a real, distinct pool from the
// general one: a never-yet-screened case sits in Pool; a case
// already screened but flagged for mandatory rescreen sits in QC —
// conflating them would hide exactly the cases CLIA/CAP most need
// visible and actionable.
//
// Real, deliberate reuse rather than a parallel system: case
// visibility via caseRouter.listCasesForUser (the same real, secure,
// tenant-scoped entry point WorklistPage.tsx uses), assignment via the
// same real Case.order.assignedTo/CaseStatus.pool fields, and pool
// claim/pass via the same real claimPoolCase/acceptPoolCase/passPoolCase
// service functions WorklistPage.tsx's own PoolClaimModal calls.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../pathscribe.css';
import { useAuth } from '@contexts/AuthContext';
import { caseRouter } from '@/services/cases/CaseRouter';
import { processInboundHpvResultEvent } from '@/services/hl7/processInboundHpvResultEvent';
import { claimPoolCase, acceptPoolCase, passPoolCase } from '@/services/cases/mockCaseService';
import { mockSpecimenDictionaryService } from '@/services/specimenDictionary/mockSpecimenDictionaryService';
import { mockCytologyRoutingSettingsService } from '@/services/cytology/mockCytologyRoutingSettingsService';
import { mockFacilityCytologyRoutingOverrideService } from '@/services/cytology/mockFacilityCytologyRoutingOverrideService';
import { mockCytologyScreeningStrategyService } from '@/services/cytology/mockCytologyScreeningStrategyService';
import { mockFacilityCytologyScreeningStrategyOverrideService } from '@/services/cytology/mockFacilityCytologyScreeningStrategyOverrideService';
import { mockCytologyReviewRecordService } from '@/services/cytology/mockCytologyReviewRecordService';
import { resolveEffectiveCytologyRoutingSettings } from '@/services/cytology/resolveEffectiveCytologyRoutingSettings';
import { resolveEffectiveCytologyScreeningStrategy } from '@/services/cytology/resolveEffectiveCytologyScreeningStrategy';
import { resolveCaseCytologyWorklistMembership } from '@/services/cytology/resolveCaseCytologyWorklistMembership';
import { resolveCaseCytologyTriagePendingMembership } from '@/services/cytology/resolveCaseCytologyTriagePendingMembership';
import { resolveCaseCytologyRecallNeededMembership } from '@/services/cytology/resolveCaseCytologyRecallNeededMembership';
import { resolveCytologyQcPoolMembership } from '@/services/cytology/resolveCytologyQcPoolMembership';
import type { Case } from '@/types/case/Case';
import type { NonGynCytologyRouting } from '@/services/cytology/ICytologyRoutingSettingsService';
import { formatFullDisplayName } from '@/utils/personName';

type Tab = 'assigned' | 'pool' | 'qc' | 'hpv_triage' | 'recall_needed';

const TILES: { key: Tab; label: string; color: string }[] = [
  { key: 'assigned',      label: 'My Worklist',    color: '#009E73' },
  { key: 'pool',          label: 'Pool',           color: '#F97316' },
  { key: 'qc',            label: 'QC',             color: '#EF4444' },
  { key: 'hpv_triage',    label: 'HPV Triage',     color: '#8B5CF6' },
  { key: 'recall_needed', label: 'Recall Needed',  color: '#DC2626' },
];

interface CytologyWorklistCase {
  caseData: Case;
  specimenId: string | null;
  isQcPending: boolean;
}

const CytologyWorklistPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows]             = useState<CytologyWorklistCase[]>([]);
  const [triageRows, setTriageRows] = useState<Case[]>([]);
  const [recallRows, setRecallRows] = useState<Case[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<Tab>('assigned');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [allCases, dictRes, enterpriseRes, enterpriseStrategyRes] = await Promise.all([
        caseRouter.listCasesForUser(user.id),
        mockSpecimenDictionaryService.getAll(),
        mockCytologyRoutingSettingsService.get(),
        mockCytologyScreeningStrategyService.get(),
      ]);
      const dictionary = dictRes.ok ? dictRes.data : [];
      const enterpriseDefault = enterpriseRes.ok ? enterpriseRes.data : { nonGynCytologyRouting: 'surgical_pathology_worklist' as NonGynCytologyRouting };
      const enterpriseStrategyDefault = enterpriseStrategyRes.ok ? enterpriseStrategyRes.data : { screeningStrategy: 'co_testing' as const };

      // Real, per-case effective routing: resolve every distinct real
      // facilityId present just once each, not once per case.
      const facilityIds = Array.from(new Set(allCases.map(c => c.order?.facilityId).filter((id): id is string => !!id)));
      const overrideEntries = await Promise.all(
        facilityIds.map(async id => [id, await mockFacilityCytologyRoutingOverrideService.getForFacility(id)] as const)
      );
      const overridesByFacility = new Map(overrideEntries.map(([id, res]) => [id, res.ok ? res.data : null]));

      // Real, per-case effective screening strategy — same real,
      // per-facility resolution pattern as routing, above.
      const strategyOverrideEntries = await Promise.all(
        facilityIds.map(async id => [id, await mockFacilityCytologyScreeningStrategyOverrideService.getForFacility(id)] as const)
      );
      const strategyOverridesByFacility = new Map(strategyOverrideEntries.map(([id, res]) => [id, res.ok ? res.data : null]));

      const dictById = new Map(dictionary.map(e => [e.id, e]));

      const cytologyCases = allCases.filter(c => {
        const facilityId = c.order?.facilityId;
        const facilityOverride = facilityId ? overridesByFacility.get(facilityId) ?? null : null;
        const effective = resolveEffectiveCytologyRoutingSettings(enterpriseDefault, facilityOverride);
        const facilityStrategyOverride = facilityId ? strategyOverridesByFacility.get(facilityId) ?? null : null;
        const effectiveStrategy = resolveEffectiveCytologyScreeningStrategy(enterpriseStrategyDefault, facilityStrategyOverride);
        return resolveCaseCytologyWorklistMembership(c.specimens as any, dictionary, effective.nonGynCytologyRouting, effectiveStrategy.screeningStrategy);
      });

      // Real, per direct guidance's own "HPV-First" triage — a real,
      // separate set of cases: genuinely different from cytologyCases
      // above, which only ever contains cases eligible for screening.
      const triagePendingCases = allCases.filter(c => {
        const facilityId = c.order?.facilityId;
        const facilityOverride = facilityId ? overridesByFacility.get(facilityId) ?? null : null;
        const effective = resolveEffectiveCytologyRoutingSettings(enterpriseDefault, facilityOverride);
        const facilityStrategyOverride = facilityId ? strategyOverridesByFacility.get(facilityId) ?? null : null;
        const effectiveStrategy = resolveEffectiveCytologyScreeningStrategy(enterpriseStrategyDefault, facilityStrategyOverride);
        return resolveCaseCytologyTriagePendingMembership(c.specimens as any, dictionary, effective.nonGynCytologyRouting, effectiveStrategy.screeningStrategy);
      });
      setTriageRows(triagePendingCases);

      // Real, per direct guidance's own Australia/NZ NCSP information:
      // a real, distinct set of cases — a positive result on a
      // self-collected specimen, needing patient recall for a new,
      // clinician-collected specimen, never eligible for cytology
      // screening from the specimen already on hand.
      const recallNeededCases = allCases.filter(c => {
        const facilityId = c.order?.facilityId;
        const facilityOverride = facilityId ? overridesByFacility.get(facilityId) ?? null : null;
        const effective = resolveEffectiveCytologyRoutingSettings(enterpriseDefault, facilityOverride);
        const facilityStrategyOverride = facilityId ? strategyOverridesByFacility.get(facilityId) ?? null : null;
        const effectiveStrategy = resolveEffectiveCytologyScreeningStrategy(enterpriseStrategyDefault, facilityStrategyOverride);
        return resolveCaseCytologyRecallNeededMembership(c.specimens as any, dictionary, effective.nonGynCytologyRouting, effectiveStrategy.screeningStrategy);
      });
      setRecallRows(recallNeededCases);

      // Real, per-case QC pool membership — needs each qualifying
      // specimen's own real review history to resolve.
      const withQcStatus = await Promise.all(cytologyCases.map(async c => {
        const cytoSpecimen = c.specimens?.find((sp: any) => {
          const entry = sp.specimenDictionaryEntryId ? dictById.get(sp.specimenDictionaryEntryId) : undefined;
          return entry && (entry.type === 'Cytology' || entry.type === 'FNA');
        }) as any;
        const specimenId = cytoSpecimen?.id ?? null;
        let isQcPending = false;
        if (specimenId && cytoSpecimen?.cytologyScreening?.qcFlag) {
          const reviewsRes = await mockCytologyReviewRecordService.getBySpecimenId(specimenId);
          const reviews = reviewsRes.ok ? reviewsRes.data : [];
          isQcPending = resolveCytologyQcPoolMembership(cytoSpecimen.cytologyScreening.qcFlag, reviews);
        }
        return { caseData: c, specimenId, isQcPending };
      }));

      setRows(withQcStatus);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const assigned = rows.filter(r => r.caseData.order?.assignedTo === user?.id && !r.isQcPending);
  const pool     = rows.filter(r => r.caseData.status === 'pool' && !r.isQcPending);
  const qc       = rows.filter(r => r.isQcPending);
  const visible  = activeTab === 'assigned' ? assigned : activeTab === 'pool' ? pool : qc;
  const counts: Record<Tab, number> = { assigned: assigned.length, pool: pool.length, qc: qc.length, hpv_triage: triageRows.length, recall_needed: recallRows.length };

  // Real, per direct correction: "for the molecular platform they
  // would be sending results through your engine which would
  // transform that into a json payload... no one is resulting an HPV
  // in the application." This button does not mutate the specimen
  // itself — it builds the real, already-translated
  // HpvResultEventPayload a real interface engine would deliver, and
  // routes it through the exact same processInboundHpvResultEvent
  // this app would use for a genuine, external delivery (services/hl7/).
  // The button exists because no real, external molecular platform is
  // actually connected in this environment — it simulates the
  // delivery, not the result itself.
  const handleRecordHpvResult = async (c: Case, result: 'Positive' | 'Negative') => {
    const cytoSpecimen = (c.specimens as any[])?.find(sp => sp.specimenDictionaryEntryId);
    if (!cytoSpecimen) return;
    await processInboundHpvResultEvent({
      messageId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      organisationId: (c as any).originEnterpriseId ?? 'unknown',
      internalCaseId: c.id,
      accessionNumber: c.accession?.fullAccession ?? c.id,
      specimenLetter: cytoSpecimen.label,
      hrHpvResult: result,
      abnormalFlag: result === 'Positive' ? 'A' : 'N',
    });
    await load();
  };

  const handleClaim = async (caseId: string) => {
    if (!user?.id) return;
    setClaimingId(caseId);
    try {
      const claim = await claimPoolCase(caseId, user.id);
      if (claim.success) {
        await acceptPoolCase(caseId, user.id, user.name);
        await load();
      }
    } finally {
      setClaimingId(null);
    }
  };

  const handlePass = async (caseId: string) => {
    if (!user?.id) return;
    setClaimingId(caseId);
    try {
      const claim = await claimPoolCase(caseId, user.id);
      if (claim.success) {
        await passPoolCase(caseId);
        await load();
      }
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="ps-page ps-page--loaded">
      <div className="ps-page-bg" />
      <div className="ps-page-gradient" />
      <div className="ps-page-content">
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Cytology Worklist</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
            Your assigned GYN cytology cases, the shared pool, and cases flagged for mandatory QC.
          </p>

          {/* Real, three-tile row — matches the existing WorklistPage.tsx's own real stat-tile pattern */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {TILES.map(tile => {
              const active = activeTab === tile.key;
              return (
                <button key={tile.key} onClick={() => setActiveTab(tile.key)}
                  style={{
                    flex: 1, padding: '16px 18px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: active ? `${tile.color}18` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? tile.color : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: active ? `0 0 12px ${tile.color}40` : 'none',
                  }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: active ? tile.color : '#e5e7eb' }}>{counts[tile.key]}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? tile.color : '#9ca3af', marginTop: 4 }}>{tile.label}</div>
                </button>
              );
            })}
          </div>

          {loading && <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Loading…</div>}

          {!loading && activeTab === 'hpv_triage' && (
            triageRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No cases currently awaiting a primary hrHPV result.</div>
            ) : (
              <div style={{ border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
                {triageRows.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: i < triageRows.length - 1 ? '1px solid #111827' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{formatFullDisplayName(c.patient as any) || c.patient?.mrn || 'Unknown Patient'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Case {c.id} · MRN {c.patient?.mrn ?? '—'}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#8B5CF618', color: '#8B5CF6', border: '1px solid #8B5CF633' }}>Awaiting hrHPV Result</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleRecordHpvResult(c, 'Negative')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#9ca3af', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>Record Negative</button>
                      <button onClick={() => handleRecordHpvResult(c, 'Positive')} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#0a0a0a', background: '#8B5CF6', border: 'none', borderRadius: 7, cursor: 'pointer' }}>Record Positive</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Real, per direct guidance's own Australia/NZ NCSP recall rule —
              a positive self-collected result can never itself produce a
              screenable slide; this tile is the real, visible surface for
              the recall recommendation instead of the case silently
              vanishing from every real cytology tile. */}
          {!loading && activeTab === 'recall_needed' && (
            recallRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No cases currently need a recall for clinician-collected LBC.</div>
            ) : (
              <div style={{ border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
                {recallRows.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: i < recallRows.length - 1 ? '1px solid #111827' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{formatFullDisplayName(c.patient as any) || c.patient?.mrn || 'Unknown Patient'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Case {c.id} · MRN {c.patient?.mrn ?? '—'}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#DC262618', color: '#DC2626', border: '1px solid #DC262633' }}>
                      Positive (Self-Collected) — Recall for Clinician-Collected LBC
                    </span>
                  </div>
                ))}
              </div>
            )
          )}

          {!loading && activeTab !== 'hpv_triage' && activeTab !== 'recall_needed' && visible.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
              {activeTab === 'assigned' && 'No cases currently assigned to you.'}
              {activeTab === 'pool' && 'No cases in the pool right now.'}
              {activeTab === 'qc' && 'No cases currently flagged for QC.'}
            </div>
          )}

          {!loading && activeTab !== 'hpv_triage' && activeTab !== 'recall_needed' && visible.length > 0 && (
            <div style={{ border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
              {visible.map((row, i) => {
                const c = row.caseData;
                const hasFinalDiagnosis = c.specimens?.some((sp: any) => sp.cytologyScreening?.finalDiagnosis);
                return (
                  <div key={c.id}
                    onClick={() => activeTab !== 'pool' && navigate(`/cytology-worklist/${c.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px',
                      borderBottom: i < visible.length - 1 ? '1px solid #111827' : 'none',
                      cursor: activeTab !== 'pool' ? 'pointer' : 'default',
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
                        {formatFullDisplayName(c.patient as any) || c.patient?.mrn || 'Unknown Patient'}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        Case {c.id} · MRN {c.patient?.mrn ?? '—'}
                      </div>
                    </div>
                    {activeTab === 'qc' && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444433' }}>
                        {(c.specimens as any[])?.find(sp => sp.id === row.specimenId)?.cytologyScreening?.qcFlag?.reason === 'targeted_high_risk' ? 'High-Risk QC' : 'Random QC'}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                      background: hasFinalDiagnosis ? '#22c55e18' : '#f59e0b18',
                      color: hasFinalDiagnosis ? '#22c55e' : '#f59e0b',
                      border: `1px solid ${hasFinalDiagnosis ? '#22c55e33' : '#f59e0b33'}`,
                    }}>
                      {hasFinalDiagnosis ? 'Final Diagnosis Recorded' : 'Awaiting Review'}
                    </span>
                    {activeTab === 'pool' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); handlePass(c.id); }} disabled={claimingId === c.id}
                          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#9ca3af', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>
                          Pass
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleClaim(c.id); }} disabled={claimingId === c.id}
                          style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#0a0a0a', background: '#009E73', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                          {claimingId === c.id ? 'Claiming…' : 'Claim'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default CytologyWorklistPage;
