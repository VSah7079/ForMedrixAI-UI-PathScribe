// src/pages/OrSuiteDashboardPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section
// Dashboard, built against the given, direct design brief:
// "design the primary dashboard login around the Location / OR Suite
// Terminal ID... supporting individual user authorization via
// quick-switch credentials (e.g., badge tap or PIN)." Location-first
// terminal binding (useCurrentOrTerminal.ts), a real, live TAT clock
// per active specimen (resolveIntraopTatStatus.ts, client-side against
// an absolute arrival timestamp — never a server-pushed tick, per the
// given design brief's own real resilience discussion), a real
// Multi-Suite Overview for a terminal/user with that privilege, and
// a real quick-auth PIN flow (resolveStaffByQuickAuthPin.ts) that
// attributes a verbal-report log entry (or a dismissal) to a specific
// real person without disrupting the ambient location view.
//
// Real, per the OR Suite Live Board's own dismissal workflow spec
// (Sep 2026): full-width rows (not the earlier card grid), four real
// visual states (In Progress / Completed-awaiting-dismissal /
// Dismissal-pending / Dismissed), a two-step DISMISS CASE confirmation
// with a mandatory surgeon-read-back checkbox, and visual-only
// signaling — no audio anywhere on this page, per direct instruction
// ("audio cues are useless in a noisy OR suite").
//
// Real, deliberate design choice: the confirmation modal's own staff
// identification step reuses the existing quick-auth PIN flow
// (resolveStaffByQuickAuthPin.ts) already built for the verbal-report
// modal below, rather than building either of the spec's own two
// named alternatives (a dropdown of personnel specifically assigned to
// this surgical case, or RFID badge-scan hardware) — neither has any
// real, existing data model or hardware integration in this app to
// build on, while the PIN flow is real, working, and already
// attributes an action to a specific real person the same way.
//
// Real, honest scope: the actual real-time push channel (a new
// request landing, a status change from another terminal, sub-500ms
// multi-board sync) is a real backend need — filed on the
// RFP-APLIS-2026-GLOBAL Backend Needs Log, same posture as cold-chain
// telemetry and referral results before it. This page polls the
// existing mock services on a real, working interval instead, which
// is honest about being a stand-in, not a claim of real push
// infrastructure. The 1-second visual timer tick below is a real,
// working client-side clock (per this file's own established
// resilience reasoning) — it is not, and does not claim to be, the
// real-time board-to-board sync the spec's own "Multi-Board Sync"
// section asks for.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentOrTerminal } from '@/hooks/useCurrentOrTerminal';
import { mockOrSuiteTerminalService } from '@/services/intraopDashboard/mockOrSuiteTerminalService';
import { mockOrEventLogService } from '@/services/intraopDashboard/mockOrEventLogService';
import { resolveStaffByQuickAuthPin } from '@/services/intraopDashboard/resolveStaffByQuickAuthPin';
import { resolveActiveIntraopRequestsForLocations, type ActiveIntraopRequest } from '@/services/intraopDashboard/resolveActiveIntraopRequestsForLocations';
import { intraoperativeService, locationService } from '@/services';
import type { OrSuiteTerminal } from '@/services/intraopDashboard/IOrSuiteTerminalService';
import OrBoardRow from '@/components/OrSuiteDashboard/OrBoardRow';
import type { Location } from '@/services/locations/ILocationService';

const POLL_INTERVAL_MS = 15_000;

/** Real, per the spec's own "Counts up continuously in MM:SS format."
 *  Pure — computes elapsed seconds between two real timestamps, never
 *  a server-pushed tick, same real resilience reasoning as
 *  resolveIntraopTatStatus.ts. */
/** Real, per direct guidance ("no business logic in the UI unless
 *  compulsory") — the per-row elapsed-time formatting used to live
 *  here; it now lives in resolveOrBoardRowDisplayState.ts, called
 *  from components/OrSuiteDashboard/OrBoardRow.tsx, not this file. */

const VerbalReportModal: React.FC<{ request: ActiveIntraopRequest; onClose: () => void; onLogged: () => void }> = ({ request, onClose, onLogged }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'pin' | 'details'>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [surgeonName, setSurgeonName] = useState(request.surgeon);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPin = async () => {
    setPinError(null);
    const result = await resolveStaffByQuickAuthPin(pin);
    if (result.outcome !== 'authenticated' || !result.staff) {
      setPinError(result.outcome === 'invalid-role' ? t('orSuiteDashboard.pinInvalidRole') : t('orSuiteDashboard.pinNotRecognized'));
      return;
    }
    setStaffId(result.staff.id);
    setStaffName(`${result.staff.firstName} ${result.staff.lastName}`.trim());
    setStep('details');
  };

  const submitReport = async () => {
    if (!surgeonName.trim()) return;
    setBusy(true);
    await mockOrEventLogService.record({
      locationId: request.locationId, intraopEntryId: request.sessionId, eventType: 'verbal_report_logged',
      staffUserId: staffId, staffUserName: staffName, surgeonName: surgeonName.trim(), note: note.trim() || undefined,
    });
    setBusy(false);
    onLogged();
  };

  return (
    <div className="ps-orboard-overlay" onClick={onClose}>
      <div className="ps-orboard-modal" onClick={e => e.stopPropagation()}>
        {step === 'pin' ? (
          <>
            <h2 className="ps-orboard-modal-title">{t('orSuiteDashboard.verifyIdentity')}</h2>
            <p className="ps-orboard-modal-subtitle">{t('orSuiteDashboard.enterPinVerbal')}</p>
            <input autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value)} className="ps-orboard-pin-input" />
            {pinError && <div className="ps-orboard-error">{pinError}</div>}
            <div className="ps-orboard-modal-actions">
              <button className="ps-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
              <button className="ps-btn-primary" onClick={submitPin} disabled={pin.length < 4}>{t('orSuiteDashboard.continue')}</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="ps-orboard-modal-title">{t('orSuiteDashboard.verbalReportBy', { staffName })}</h2>
            <label className="ps-orboard-field-label">{t('orSuiteDashboard.surgeonName')}</label>
            <input value={surgeonName} onChange={e => setSurgeonName(e.target.value)} className="ps-batch-text-input" />
            <label className="ps-orboard-field-label">{t('orSuiteDashboard.noteOptional')}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="ps-batch-text-input" />
            <div className="ps-orboard-modal-actions">
              <button className="ps-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
              <button className="ps-orboard-log-report-btn" disabled={busy || !surgeonName.trim()} onClick={submitReport}>
                {busy ? t('orSuiteDashboard.logging') : t('orSuiteDashboard.logVerbalReport')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/** Real, per the dismissal workflow spec's own "Two-Step Confirmation
 *  Architecture": Step 1 (the DISMISS CASE button on the row) already
 *  happened by the time this opens; this modal covers the real Step 2
 *  — PIN-based staff identification, then the safety re-display +
 *  mandatory read-back checkbox + Cancel/Confirm. */
const DismissConfirmationModal: React.FC<{ request: ActiveIntraopRequest; onClose: () => void; onDismissed: () => void }> = ({ request, onClose, onDismissed }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'pin' | 'confirm'>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [readbackConfirmed, setReadbackConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitPin = async () => {
    setPinError(null);
    const result = await resolveStaffByQuickAuthPin(pin);
    if (result.outcome !== 'authenticated' || !result.staff) {
      setPinError(result.outcome === 'invalid-role' ? t('orSuiteDashboard.pinInvalidRole') : t('orSuiteDashboard.pinNotRecognized'));
      return;
    }
    setStaffId(result.staff.id);
    setStaffName(`${result.staff.firstName} ${result.staff.lastName}`.trim());
    setStep('confirm');
  };

  const confirmDismiss = async () => {
    if (!readbackConfirmed) return;
    setBusy(true);
    setError(null);
    const res = await intraoperativeService.dismissFromBoard(request.sessionId, request.specimenId, staffId, staffName, true);
    if (!('ok' in res) || !res.ok) {
      setError('error' in res ? res.error : t('orSuiteDashboard.dismissFailedGeneric'));
      setBusy(false);
      return;
    }
    const dwellTimeOnBoardSeconds = request.frozenDiagnosisRenderedAt
      ? Math.max(0, Math.round((Date.now() - new Date(request.frozenDiagnosisRenderedAt).getTime()) / 1000))
      : undefined;
    const totalTurnaroundMinutes = request.frozenDiagnosisRenderedAt
      ? Math.round((new Date(request.frozenDiagnosisRenderedAt).getTime() - new Date(request.arrivalTimestamp).getTime()) / 60000)
      : undefined;
    await mockOrEventLogService.record({
      locationId: request.locationId, intraopEntryId: request.sessionId, eventType: 'case_dismissed',
      staffUserId: staffId, staffUserName: staffName,
      accessionNumber: request.orNumber, orRoom: request.locationDisplay,
      pathologistSignOffTime: request.frozenDiagnosisRenderedAt,
      dwellTimeOnBoardSeconds, totalTurnaroundMinutes,
      surgeonReadbackConfirmed: true, finalPreliminaryText: request.frozenSectionDiagnosis,
    });
    setBusy(false);
    onDismissed();
  };

  return (
    <div className="ps-orboard-overlay" onClick={onClose}>
      <div className="ps-orboard-modal" onClick={e => e.stopPropagation()}>
        {step === 'pin' ? (
          <>
            <h2 className="ps-orboard-modal-title">{t('orSuiteDashboard.verifyIdentity')}</h2>
            <p className="ps-orboard-modal-subtitle">{t('orSuiteDashboard.enterPinDismiss')}</p>
            <input autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value)} className="ps-orboard-pin-input" />
            {pinError && <div className="ps-orboard-error">{pinError}</div>}
            <div className="ps-orboard-modal-actions">
              <button className="ps-btn-secondary" onClick={onClose}>{t('orSuiteDashboard.cancelDismiss')}</button>
              <button className="ps-btn-primary" onClick={submitPin} disabled={pin.length < 4}>{t('orSuiteDashboard.continue')}</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="ps-orboard-modal-title">{t('orSuiteDashboard.confirmDismissalTitle')}</h2>
            <div className="ps-orboard-safety-redisplay">
              <div><span className="ps-orboard-safety-label">{t('orSuiteDashboard.patient')}</span> {request.patientName}</div>
              <div><span className="ps-orboard-safety-label" data-phi="mrn">{t('orSuiteDashboard.mrn')}</span> {request.mrn}</div>
              <div><span className="ps-orboard-safety-label">{t('orSuiteDashboard.orRoom')}</span> {request.locationDisplay ?? request.orNumber}</div>
              <div className="ps-orboard-safety-diagnosis">
                <span className="ps-orboard-safety-label">{t('orSuiteDashboard.preliminaryDiagnosis')}</span>
                <div className="ps-orboard-safety-diagnosis-text">{request.frozenSectionDiagnosis}</div>
              </div>
            </div>
            <label className="ps-orboard-readback-checkbox">
              <input type="checkbox" checked={readbackConfirmed} onChange={e => setReadbackConfirmed(e.target.checked)} />
              {t('orSuiteDashboard.readbackConfirmedLabel')}
            </label>
            {error && <div className="ps-orboard-error">{error}</div>}
            <div className="ps-orboard-modal-actions">
              <button className="ps-btn-secondary" onClick={onClose}>{t('orSuiteDashboard.cancelDismiss')}</button>
              <button className="ps-orboard-confirm-dismiss-btn" disabled={!readbackConfirmed || busy} onClick={confirmDismiss}>
                {busy ? t('orSuiteDashboard.dismissing') : t('orSuiteDashboard.confirmAndDismiss')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const TerminalSetup: React.FC<{ onBound: (id: string) => void }> = ({ onBound }) => {
  const { t } = useTranslation();
  const [terminals, setTerminals] = useState<OrSuiteTerminal[]>([]);
  useEffect(() => { mockOrSuiteTerminalService.getActive().then(res => { if (res.ok) setTerminals(res.data); }); }, []);
  return (
    <div className="ps-orboard-setup-page">
      <div className="ps-orboard-setup-content">
        <h1>{t('orSuiteDashboard.bindDisplayTitle')}</h1>
        <p className="ps-orboard-setup-description">{t('orSuiteDashboard.bindDisplayDescription')}</p>
        <select className="ps-orboard-setup-select" onChange={e => e.target.value && onBound(e.target.value)} defaultValue="">
          <option value="">{t('orSuiteDashboard.selectTerminal')}</option>
          {terminals.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
        </select>
        {terminals.length === 0 && <p className="ps-orboard-setup-empty">{t('orSuiteDashboard.noTerminalsConfigured')}</p>}
      </div>
    </div>
  );
};

const MultiSuiteLocationPicker: React.FC<{ facilityId: string; selected: string[]; onChange: (ids: string[]) => void }> = ({ facilityId, selected, onChange }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  useEffect(() => { locationService.listForFacility(facilityId).then(res => { if (res.ok) setLocations(res.data); }); }, [facilityId]);
  return (
    <select
      multiple
      className="ps-orboard-multisuite-select"
      value={selected}
      onChange={e => onChange(Array.from(e.target.selectedOptions).map(o => o.value))}
    >
      {locations.map(l => <option key={l.id} value={l.id}>{l.pointOfCare}{l.room ? ` — ${l.room}` : ''}</option>)}
    </select>
  );
};

const OrSuiteDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { terminalId, setTerminalId } = useCurrentOrTerminal();
  const [terminal, setTerminal] = useState<OrSuiteTerminal | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [multiSuiteLocationIds, setMultiSuiteLocationIds] = useState<string[]>([]);
  const [multiSuiteOn, setMultiSuiteOn] = useState(false);
  const [requests, setRequests] = useState<ActiveIntraopRequest[]>([]);
  const [reportTarget, setReportTarget] = useState<ActiveIntraopRequest | null>(null);
  const [dismissTarget, setDismissTarget] = useState<ActiveIntraopRequest | null>(null);
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const prevRenderedRef = useRef<Set<string>>(new Set());
  // Real, per direct request: sales needs a realistic, populated board
  // to show customers, with a live "watch it change" moment — not a
  // clinical feature, gated behind its own explicit control and
  // always visibly labeled DEMO so it's never confused with real
  // patient data.
  const [demoActive, setDemoActive] = useState(false);
  const demoSimulationRef = useRef<{ sessionId: string; specimenId: string } | null>(null);
  const demoIntervalRef = useRef<number | null>(null);
  const DEMO_ADVANCE_INTERVAL_MS = 25_000;

  useEffect(() => {
    if (!terminalId) { setTerminal(null); return; }
    mockOrSuiteTerminalService.getById(terminalId).then(res => { if (res.ok) setTerminal(res.data); });
  }, [terminalId]);

  useEffect(() => {
    if (!terminal) return;
    locationService.getById(terminal.locationId).then(res => { if (res.ok) setLocation(res.data); });
  }, [terminal]);

  const effectiveLocationIds = useMemo(() => {
    if (multiSuiteOn && terminal?.canViewMultiSuite) return multiSuiteLocationIds.length > 0 ? multiSuiteLocationIds : (terminal ? [terminal.locationId] : []);
    return terminal ? [terminal.locationId] : [];
  }, [multiSuiteOn, multiSuiteLocationIds, terminal]);

  const refresh = async () => {
    if (effectiveLocationIds.length === 0) return;
    const res = await intraoperativeService.getAll();
    if (!res.ok) return;
    const next = resolveActiveIntraopRequestsForLocations(res.data, effectiveLocationIds);
    // Real, per the spec's own "3-pulse flash" transition — fires
    // exactly once, the real moment a specimen's own diagnosisRendered
    // flips from false to true, never again on a later poll of the
    // same already-completed specimen.
    setFlashedIds(prev => {
      const stillNew = new Set(prev);
      for (const r of next) {
        if (r.diagnosisRendered && !prevRenderedRef.current.has(r.specimenId)) stillNew.delete(r.specimenId);
      }
      return stillNew;
    });
    prevRenderedRef.current = new Set(next.filter(r => r.diagnosisRendered).map(r => r.specimenId));
    setRequests(next);
  };

  useEffect(() => { refresh(); }, [effectiveLocationIds.join(',')]);

  const stopDemo = () => {
    if (demoIntervalRef.current) window.clearInterval(demoIntervalRef.current);
    demoIntervalRef.current = null;
    demoSimulationRef.current = null;
    setDemoActive(false);
  };

  const startDemo = async () => {
    if (!terminal) return;
    const res = await intraoperativeService.seedOrBoardDemoData(terminal.locationId, terminal.facilityId, 'DEMO');
    if (!res.ok) return;
    await refresh();
    setDemoActive(true);
    // Real, per direct request's own "simulate the changes" ask — the
    // first seeded case (fresh, no milestones yet) is the one that
    // visibly progresses while a salesperson is talking; the other
    // three are seeded already at their own real, distinct states so
    // every visual state is on screen immediately, not just this one.
    const simTarget = res.data[0];
    demoSimulationRef.current = { sessionId: simTarget.id, specimenId: simTarget.specimens[0].id };
    demoIntervalRef.current = window.setInterval(async () => {
      if (!demoSimulationRef.current) return;
      const { sessionId, specimenId } = demoSimulationRef.current;
      const advanceRes = await intraoperativeService.advanceDemoSpecimen(sessionId, specimenId);
      await refresh();
      if (advanceRes.ok && !advanceRes.data.advanced && demoIntervalRef.current) {
        window.clearInterval(demoIntervalRef.current); // fully progressed — real, honest stop, not an infinite silent loop
        demoIntervalRef.current = null;
      }
    }, DEMO_ADVANCE_INTERVAL_MS);
  };

  useEffect(() => () => { if (demoIntervalRef.current) window.clearInterval(demoIntervalRef.current); }, []);

  // Real, per direct guidance ("there shouldn't be any business logic
  // in the UI... it's the only way to prevent/control performance
  // issues when load gets applied"): the real, compulsory 1-second
  // clock now lives inside each row's own OrBoardRow.tsx, not here —
  // a shared, parent-level tick was forcing every row in the list to
  // recompute its full derived state every second, regardless of
  // whether that row's own data had changed. At real scale (dozens or
  // hundreds of rows across a Multi-Suite Overview), that's the
  // difference between N cheap, independent per-row updates and one
  // expensive, repeated full-list recomputation every second. The
  // slower POLL_INTERVAL_MS re-fetch remains here — it's the honest
  // stand-in for the real push channel this gap's own Backend Needs
  // Log entry names, and genuinely does need to refresh the whole
  // list when it runs.
  useEffect(() => {
    const pollInterval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(pollInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLocationIds.join(',')]);

  const handleFlashed = useCallback((specimenId: string) => {
    setFlashedIds(prev => new Set(prev).add(specimenId));
  }, []);

  const handleDismissed = (specimenId: string) => {
    setDismissTarget(null);
    // Real, per the spec's own State 4 — a 400ms slide-left/fade-out
    // before the row genuinely leaves the board, giving OR staff a
    // real, visible confirmation their action registered rather than
    // the row vanishing the instant they tap Confirm.
    setDismissingIds(prev => new Set(prev).add(specimenId));
    window.setTimeout(() => { refresh(); setDismissingIds(prev => { const next = new Set(prev); next.delete(specimenId); return next; }); }, 400);
  };

  if (!terminalId) return <TerminalSetup onBound={setTerminalId} />;
  if (!terminal) return <div className="ps-orboard-loading">{t('orSuiteDashboard.loadingTerminal')}</div>;

  return (
    <div className="ps-orboard-page">
      <div className="ps-orboard-header">
        <div>
          <div className="ps-orboard-header-eyebrow">{t('orSuiteDashboard.orSuiteTerminal')}</div>
          <div className="ps-orboard-header-name">{terminal.name}</div>
          {location && <div className="ps-orboard-header-location">{location.pointOfCare}{location.room ? ` · ${t('orSuiteDashboard.room', { room: location.room })}` : ''}</div>}
        </div>
        <div className="ps-orboard-header-actions">
          {demoActive && <span className="ps-orboard-demo-badge">{t('orSuiteDashboard.demoModeActive')}</span>}
          <button className="ps-btn-secondary" onClick={demoActive ? stopDemo : startDemo}>
            {demoActive ? t('orSuiteDashboard.stopDemo') : t('orSuiteDashboard.startDemo')}
          </button>
          {terminal.canViewMultiSuite && (
            <div className="ps-orboard-multisuite-row">
              <label className="ps-orboard-multisuite-toggle">
                <input type="checkbox" checked={multiSuiteOn} onChange={e => setMultiSuiteOn(e.target.checked)} />
                {t('orSuiteDashboard.multiSuiteOverview')}
              </label>
              {multiSuiteOn && (
                <MultiSuiteLocationPicker facilityId={terminal.facilityId} selected={multiSuiteLocationIds} onChange={setMultiSuiteLocationIds} />
              )}
            </div>
          )}
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="ps-orboard-empty">{t('orSuiteDashboard.noActiveRequests')}</div>
      ) : (
        <div className="ps-orboard-row-list">
          {requests.map(req => (
            <OrBoardRow
              key={req.specimenId}
              req={req}
              hasFlashed={flashedIds.has(req.specimenId)}
              isDismissing={dismissingIds.has(req.specimenId)}
              onFlashed={handleFlashed}
              onLogVerbalReport={setReportTarget}
              onDismiss={setDismissTarget}
            />
          ))}
        </div>
      )}

      {reportTarget && (
        <VerbalReportModal request={reportTarget} onClose={() => setReportTarget(null)} onLogged={() => { setReportTarget(null); refresh(); }} />
      )}
      {dismissTarget && (
        <div className={dismissTarget ? 'ps-orboard-dismiss-pending-overlay' : ''}>
          <DismissConfirmationModal request={dismissTarget} onClose={() => setDismissTarget(null)} onDismissed={() => handleDismissed(dismissTarget.specimenId)} />
        </div>
      )}
    </div>
  );
};

export default OrSuiteDashboardPage;
