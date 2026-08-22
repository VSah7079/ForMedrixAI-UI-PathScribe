/**
 * PoolClaimModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown when a pathologist clicks a pool case.
 * They must explicitly Accept (assigns to them) or Pass (returns to pool).
 * The case is status-locked to 'claimed' while this modal is open.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '@/pathscribe.css';
import { claimPoolCase, acceptPoolCase, passPoolCase } from '../../services/cases/mockCaseService';
import { mockActionRegistryService } from '../../services/actionRegistry/mockActionRegistryService';
import { sendAccessRequestToAdmins } from '@/utils/accessRequests';

interface PoolClaimModalProps {
  isOpen:            boolean;
  caseId:            string | null;
  caseSummary?:      string;
  poolName?:         string;
  currentUserId:     string;
  currentUserName:   string;
  // Real feature, per direct product decision: pool-restricted cases
  // stay visible with a real request-access path, the same as
  // Pediatric, rather than being hidden entirely. Needed for
  // sendAccessRequestToAdmins' own org-scoping — see that function's
  // own header comment for why an unrelated hospital's admin
  // shouldn't be the one granted this request by default.
  currentUserOrganisationId?: string;
  continueToReport?: boolean;
  fromFilter?:       string;
  onAccepted:        () => void;
  onPassed:          () => void;
  onClose:           () => void;
}

type Step = 'claiming' | 'ready' | 'blocked' | 'access-denied' | 'accepting' | 'passing';

export const PoolClaimModal: React.FC<PoolClaimModalProps> = ({
  isOpen, caseId, caseSummary, poolName,
  currentUserId, currentUserName, currentUserOrganisationId,
  continueToReport = false,
  fromFilter,
  onAccepted, onPassed, onClose,
}) => {
  const navigate = useNavigate();
  const [step,      setStep]      = useState<Step>('claiming');
  const [blockedBy, setBlockedBy] = useState<string | null>(null);
  // Real feature, per direct product decision: pool-restricted cases
  // stay visible with a real request-access path, mirroring the
  // Pediatric Access modal's own tracked-per-restriction pattern
  // (pedRequestedIds in WorklistTable.tsx). Scoped to the POOL, not
  // the individual case — the real thing being requested is
  // membership in that pool, so having asked once already covers
  // every other case sitting in the same restricted pool, not just
  // this one.
  const [accessRequestedPools, setAccessRequestedPools] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('pathscribe_pool_access_requested');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const markAccessRequested = (pool: string) => {
    setAccessRequestedPools(prev => {
      const next = new Set(prev).add(pool);
      try { localStorage.setItem('pathscribe_pool_access_requested', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const accessAlreadyRequested = poolName ? accessRequestedPools.has(poolName) : false;

  const handleViewReport = () => {
    if (!caseId) return;
    navigate(`/report/${caseId}`, { state: { fromFilter: 'pool' } });
    onClose();
  };

  useEffect(() => {
    if (!isOpen || !caseId) return;
    setStep('claiming');
    setBlockedBy(null);

    // claimPoolCase takes (caseId, userId) — name is resolved by the service
    claimPoolCase(caseId, currentUserId).then(result => {
      if (result.success) {
        setStep('ready');
      } else if ((result as any).claimedBy) {
        // Someone else is actively reviewing it right now — real,
        // temporary contention, not a permissions question.
        setBlockedBy((result as any).claimedBy);
        setStep('blocked');
      } else {
        // Real feature, per direct product decision: pool-restricted
        // cases stay visible with a real request-access path, the same
        // as Pediatric, rather than being hidden entirely. No
        // claimedBy means this is canUserClaimPoolCase's own
        // membership rejection, not a concurrent-claim race — a
        // genuinely different situation needing a genuinely different
        // (actionable) response, not the same "try again later" copy.
        setStep('access-denied');
      }
    });

    // Release claim if modal closes without action
    return () => { if (caseId) passPoolCase(caseId).catch(() => {}); };
  }, [isOpen, caseId, currentUserId, currentUserName]);

  const handleAccept = async () => {
    if (!caseId) return;
    setStep('accepting');
    await acceptPoolCase(caseId, currentUserId, currentUserName);
    if (continueToReport) {
      navigate(`/case/${caseId}/synoptic`);
    }
    onAccepted();
  };

  const handlePass = async () => {
    if (!caseId) return;
    setStep('passing');
    await passPoolCase(caseId);
    onPassed();
    navigate('/worklist', { state: { restoreFilter: fromFilter ?? 'pool' } });
  };

  // Voice: POOL_ACCEPT_CASE / POOL_PASS_CASE. These were tagged category
  // SYNOPTIC in the action registry but genuinely belong here — accepting
  // or passing a pool case only ever happens with this modal open, never
  // inside an already-open Synoptic Report. Self-contained, matching
  // DelegateModal.tsx's own pattern, rather than the parent Worklist page
  // trying to reach into this modal's internal accept/pass logic from
  // outside. Gated on isOpen/busy so a stray recognition doesn't fire
  // twice or act on a modal that isn't actually showing.
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = mockActionRegistryService.onAction((actionId: string) => {
      if (step === 'accepting' || step === 'passing') return;
      if (actionId === 'POOL_ACCEPT_CASE') handleAccept();
      else if (actionId === 'POOL_PASS_CASE') handlePass();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, caseId, step]);

  if (!isOpen || !caseId) return null;

  const busy = step === 'accepting' || step === 'passing';

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-pool-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ps-pool-header">
          <div className="ps-pool-header-col">
            <div className="ps-pool-eyebrow">👥 {poolName ?? 'Pool'} — Case Assignment</div>
            <div className="ps-pool-title">{caseSummary ?? caseId}</div>
            <div className="ps-pool-subtitle">{caseId}</div>
          </div>
        </div>

        {/* Body */}
        <div className={step === 'claiming' || step === 'blocked' || step === 'access-denied' ? 'ps-pool-body--centered' : 'ps-pool-body'}>

          {/* Claiming */}
          {step === 'claiming' && <>
            <div className="ps-pool-icon">⏳</div>
            Checking case availability…
          </>}

          {/* Blocked */}
          {step === 'blocked' && <>
            <div className="ps-pool-icon">🔒</div>
            <div className="ps-pool-blocked-title">Case Unavailable</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              This case is currently being reviewed by{' '}
              <strong style={{ color: '#e2e8f0' }}>{blockedBy}</strong>.
              Please try another case or check back shortly.
            </div>
            <div style={{ marginTop: 20 }}>
              <button className="ps-btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>}

          {/* Access denied — real feature, per direct product decision:
              pool-restricted cases stay visible with a real
              request-access path, mirroring the Pediatric Access
              modal's own structure and tone, rather than being hidden
              entirely (an admin oversight in pool membership shouldn't
              leave a pathologist with no way to even find out a case
              exists, let alone ask for access to it). */}
          {step === 'access-denied' && <>
            <div className="ps-pool-icon">🔒</div>
            <div className="ps-pool-blocked-title">Pool Access Required</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              This case belongs to the <strong style={{ color: '#e2e8f0' }}>{poolName ?? 'this'}</strong> pool,
              which is restricted to its own members. Your System Admin can add you via{' '}
              <strong style={{ color: '#e2e8f0' }}>Configuration → Synoptic Library → Subspecialties</strong>.
            </div>
            {accessAlreadyRequested ? (
              <div className="ps-ped-pending">
                ⏳ Access request pending — your System Admin has been notified.<br/>
                <span className="ps-ped-pending-sub">You'll receive a message when access is granted.</span>
              </div>
            ) : (
              <div className="ps-ped-info-box">
                <strong className="ps-ped-highlight">Request Pool Access</strong><br/>
                One click sends an automated request to your System Admin.
              </div>
            )}
            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="ps-btn-secondary" onClick={onClose}>Close</button>
              {!accessAlreadyRequested && (
                <button className="ps-btn-primary" onClick={async () => {
                  try {
                    await sendAccessRequestToAdmins(
                      { id: currentUserId, name: currentUserName, organisationId: currentUserOrganisationId },
                      `Pool Access Request — ${currentUserName}`,
                      `${currentUserName} needs access to the ${poolName ?? 'restricted'} pool (attempted to claim case ${caseId}).\n\nTo grant access:\n1. Go to Configuration → Synoptic Library → Subspecialties\n2. Open the ${poolName ?? ''} pool\n3. Add ${currentUserName} to its member list\n\nThis was likely an oversight when the pool was originally configured.`,
                      '/configuration?tab=synoptic-library&section=subspecialties',
                    );
                  } finally {
                    if (poolName) markAccessRequested(poolName);
                  }
                }}>
                  Request Pool Access
                </button>
              )}
            </div>
          </>}

          {/* Ready / Acting */}
          {(step === 'ready' || step === 'accepting' || step === 'passing') && <>
            <p className="ps-pool-description">
              {continueToReport
                ? <>Would you like to <strong style={{ color: '#38bdf8' }}>claim this case and continue reporting</strong>, or <strong style={{ color: '#f59e0b' }}>pass</strong> and return it to the pool?</>
                : <>Would you like to <strong style={{ color: '#38bdf8' }}>claim</strong> this case, <strong style={{ color: '#a78bfa' }}>view the report</strong> before deciding, or <strong style={{ color: '#f59e0b' }}>pass</strong> and return it to the pool?</>
              }
            </p>

            <div className="ps-pool-info-box">
              <div className="ps-pool-info-box-label">What happens next</div>
              <div className="ps-pool-info-box-items">
                {continueToReport
                  ? <>
                      <div>✅ <strong style={{ color: '#e2e8f0' }}>Claim &amp; Continue</strong> — Case moves to your worklist and opens directly in the synoptic report.</div>
                      <div>⏭️ <strong style={{ color: '#e2e8f0' }}>Pass</strong> — Case returns to the pool for another pathologist.</div>
                    </>
                  : <>
                      <div>✅ <strong style={{ color: '#e2e8f0' }}>Claim Case</strong> — Case moves to your worklist as In Progress.</div>
                      <div>🔍 <strong style={{ color: '#e2e8f0' }}>View Report</strong> — Preview the case report before deciding. You can claim or pass from there.</div>
                      <div>⏭️ <strong style={{ color: '#e2e8f0' }}>Pass</strong> — Case returns to the pool for another pathologist.</div>
                    </>
                }
              </div>
            </div>

            <div className="ps-pool-actions">
              <button className="ps-btn-secondary" onClick={handlePass} disabled={busy}>Pass</button>

              {!continueToReport && (
                <button className="ps-btn-view-report" onClick={handleViewReport} disabled={busy}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  View Report
                </button>
              )}

              <button className="ps-btn-primary" onClick={handleAccept} disabled={busy}>
                {step === 'accepting' ? 'Claiming…' : continueToReport ? 'Claim & Continue' : 'Claim Case'}
              </button>
            </div>
          </>}

        </div>
      </div>
    </div>
  );
};

export default PoolClaimModal;
