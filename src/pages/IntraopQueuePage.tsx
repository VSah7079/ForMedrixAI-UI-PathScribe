// src/pages/IntraopQueuePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The Intraop tile's actual destination — both halves of the feature live
// here: starting a new session at the bench (this page IS the mobile
// capture surface, reached via phone browser same as desktop — no
// separate app), and the desktop merge queue for sessions still unlinked
// to a formal case.
//
// Session != specimen — one patient, one OR, one surgeon can send
// multiple specimens to the same consult. Patient/OR/surgeon are
// captured once; each specimen underneath gets its own label, Quick
// Gross, and frozen diagnosis. "Next Specimen" reuses the session,
// "Close and Save" ends it.
//
// The scan button is the first, primary thing shown — no intermediate
// "Start New" button, no modal. Selecting it (or falling back to manual
// entry) is understood as starting a frozen.
//
// Milestone timeline stays informational once logged — real timestamps,
// skip reasons visible inline, no second gate at review time. The real
// gate lives in the service layer's addMilestone: Quick Gross is a hard,
// per-specimen requirement before Touch Prep or Frozen Section Cut can
// be logged for that specimen (no clinical scenario skips basic
// measurements the way touch prep itself can be skipped for dense,
// fibrotic tissue).
//
// Patient match is honestly limited to manual entry and a labeled
// "simulated" barcode affordance — no real camera/barcode library exists
// anywhere in this app (checked directly), and pretending otherwise here
// would be dishonest about what's actually wired.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../pathscribe.css';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useAuth } from '@/contexts/AuthContext';
import { intraoperativeService, facilityService, locationService } from '@/services';
import { mockActionRegistryService } from '../services/actionRegistry/mockActionRegistryService';
import type { IntraoperativeEntry, IntraopSpecimen, MatchCandidate, MilestoneType, SkipReason, FrozenCategory, PreparationType } from '@/types/intraop/IntraoperativeEntry';
import type { Facility } from '@/services/facilities/IFacilityService';
import type { Location } from '@/services/locations/ILocationService';
import { shouldRestrictToMobileWorkflow, setDesktopViewOverride, isConstrainedMobileDevice } from '@/utils/deviceDetection';
import BarcodeScanner from '@/components/BarcodeScanner/BarcodeScanner';
import { formatDateLong } from '@/utils/formatDate';
import { VOICE_CONTEXT } from '@/constants/systemActions';
import { useVoice } from '@/contexts/VoiceProvider';

const MILESTONE_LABEL: Record<MilestoneType, string> = {
  gross_logged: 'Gross Logged',
  touch_prep_performed: 'Touch Prep Performed',
  touch_prep_skipped: 'Touch Prep Skipped',
  frozen_section_cut: 'Frozen Section Cut',
};

const SKIP_REASON_LABEL: Record<string, string> = {
  fibrotic_scant: 'Fibrotic / Scant',
  direct_to_frozen: 'Direct to Frozen',
  other: 'Other',
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ─── New session form — scan leads, session info once, specimens loop ─────────
// Scan/manual -> patient identified -> demographics + OR/surgeon (creates
// the session) -> specimen label + Quick Gross + frozen dx -> Next
// Specimen (same session, back to specimen step) or Close and Save.
const NewEntryForm: React.FC<{
  performedBy: { userId: string; userName: string };
  onSessionSaved: () => void;
  onRequestReset: () => void;
}> = ({ performedBy, onSessionSaved, onRequestReset }) => {
  const [step, setStep] = useState<'scan' | 'demographics' | 'specimen'>('scan');
  const [patientName, setPatientName] = useState('');
  const [mrn, setMrn] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [source, setSource] = useState<'barcode' | 'adt_match'>('barcode');
  const [adtMatched, setAdtMatched] = useState(false);
  // Real fix for a genuine, reported gap: "confirm before proceeding" was
  // only ever advisory text - Continue to Specimen was enabled the moment
  // patientName+mrn happened to be non-empty, with no actual, active
  // confirmation that a person read and verified the three identifiers.
  // This makes it a real, required, deliberate action instead of a
  // passive display someone could glance past.
  const [patientConfirmed, setPatientConfirmed] = useState(false);
  const [orNumber, setOrNumber] = useState('');
  const [surgeon, setSurgeon] = useState('');
  // Real feature, per direct confirmation: "Let's wire in Facility and
  // Location (Room) for Intraop." Same facility-scoped Location
  // pattern already established on AccessionPage.tsx — locations
  // reload and locationId resets whenever the selected facility
  // changes.
  const [clients, setClients] = useState<Facility[]>([]);
  const [clientId, setClientId] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  useEffect(() => {
    facilityService.getAll().then(res => { if (res.ok) setClients(res.data.filter(c => c.status === 'Active')); });
  }, []);
  useEffect(() => {
    if (!clientId) { setLocations([]); setLocationId(''); return; }
    let cancelled = false;
    (async () => {
      const res = await locationService.listForFacility(clientId);
      if (cancelled) return;
      const list = res.ok ? res.data.filter(l => l.status !== 'Inactive') : [];
      setLocations(list);
      setLocationId(prev => (list.some(l => l.id === prev) ? prev : ''));
    })();
    return () => { cancelled = true; };
  }, [clientId]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [specimenLabel, setSpecimenLabel] = useState('');
  const [quickGross, setQuickGross] = useState('');
  const [frozenDx, setFrozenDx] = useState('');
  const [frozenCategory, setFrozenCategory] = useState<FrozenCategory | ''>('');
  const [specimenCount, setSpecimenCount] = useState(0);
  const [busy, setBusy] = useState(false);
  // Real fix for a genuine, reported gap: "Start New Entry" (voice or
  // otherwise) used to reset immediately, no matter what step the form
  // was on - a stray or misheard voice trigger (already documented
  // elsewhere in this file as genuinely unreliable on iOS) could
  // silently wipe an in-progress, unsaved patient/specimen session with
  // zero confirmation. Only shown when there's actually real progress to
  // lose (step !== 'scan') - an essentially-empty form resets
  // immediately, no need to interrupt for nothing.
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Real "tap + mic" dictation wiring for Intraop's text fields -
  // replicates the exact pattern already proven for SynopticReportPage's
  // report editor (see OrchestratorSectionEditor.tsx): focus a field,
  // press the mic, dictation starts into that field. Deliberately NOT a
  // "say the field's name to jump to it" mechanism - confirmed directly
  // that pattern doesn't exist working anywhere in this app, so this
  // doesn't pretend otherwise. dateOfBirth is deliberately excluded - a
  // native date picker doesn't have a meaningful free-text dictation
  // target the way these do.
  const [focusedFieldId, setFocusedFieldId] = useState<string | null>(null);
  const { startDictation, phase, dictationTarget } = useVoice();

  const registerDictationTarget = useCallback((fieldId: string) => {
    const fieldMap: Record<string, { label: string; context: string; setValue: (updater: (prev: string) => string) => void }> = {
      patientName:   { label: 'Patient Name',    context: 'patient name',              setValue: setPatientName },
      orNumber:      { label: 'OR Number',       context: 'operating room number',     setValue: setOrNumber },
      surgeon:       { label: 'Surgeon',         context: 'surgeon name',              setValue: setSurgeon },
      specimenLabel: { label: 'Specimen Label',  context: 'specimen label',            setValue: setSpecimenLabel },
      quickGross:    { label: 'Quick Gross',     context: 'gross description',         setValue: setQuickGross },
      frozenDx:      { label: 'Frozen Diagnosis', context: 'frozen section diagnosis', setValue: setFrozenDx },
    };
    const field = fieldMap[fieldId];
    if (!field) return;
    startDictation({
      fieldId,
      label: field.label,
      context: field.context,
      onText: (text: string, isInterim?: boolean) => {
        // Waits for finalized phrases only - unlike the rich-text editor
        // case this pattern was built for, a plain controlled input has
        // no cursor position to preview interim results into.
        if (isInterim) return;
        field.setValue(prev => (prev ? `${prev} ${text}`.trim() : text.trim()));
      },
    });
  }, [startDictation]);

  useEffect(() => {
    if (phase !== 'dictate' || dictationTarget || !focusedFieldId) return;
    registerDictationTarget(focusedFieldId);
  }, [phase, dictationTarget, focusedFieldId, registerDictationTarget]);

  const [manualMrn, setManualMrn] = useState('');
  const [showManualMrn, setShowManualMrn] = useState(false);

  const lookupPatient = async (mrnValue: string, matchSource: 'barcode' | 'adt_match') => {
    setBusy(true);
    setMrn(mrnValue);
    setSource(matchSource);
    setPatientConfirmed(false);
    const res = await intraoperativeService.lookupAdtRecord(mrnValue);
    setBusy(false);
    if (res.ok && res.data) {
      setPatientName(res.data.patientName);
      setDateOfBirth(res.data.dateOfBirth);
      setAdtMatched(true);
    } else {
      setPatientName(''); setDateOfBirth('');
      setAdtMatched(false);
    }
    setStep('demographics');
  };

  const simulateScan = () => {
    // Honest simulation, not a real camera read — see file header. A
    // real wristband scan would decode an actual MRN; here a random one
    // is generated, then genuinely checked against the same ADT lookup
    // manual entry uses — not a coin flip pretending to be a match.
    lookupPatient(`MRN-${Math.floor(10000 + Math.random() * 89999)}`, 'barcode');
  };

  // Real camera scan — replaces the line above wherever it's actually
  // triggered from the UI (see the button below). Kept simulateScan()
  // itself in place, unused but not deleted, in case a demo/offline
  // environment without camera access still needs a way to exercise
  // this flow — a real, deliberate choice, not leftover dead code.
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const handleBarcodeDecoded = (text: string) => {
    setShowBarcodeScanner(false);
    setScannerError(null);
    // The decoded payload is fed straight into the same real ADT lookup
    // manual MRN entry already uses. Today this treats the whole decoded
    // string as the MRN directly - the real, per-client label-format
    // decompose (extracting MRN/name/encounter# from a single combined
    // payload) is real, separate, sequenced work, not yet built.
    lookupPatient(text.trim(), 'barcode');
  };

  // Voice command for starting a fresh capture — real caveat, not
  // glossed over: reliability on iOS Safari is genuinely inconsistent
  // (checked directly — real, recent reports of recognition silently
  // failing or never stopping); this should degrade to tapping the
  // scan button, not be depended on. Per-milestone voice commands were
  // removed with the session/specimen restructuring — "log touch prep
  // performed" needs a specific specimen in view to make sense, and
  // there's no reliable way to infer which one from voice alone; those
  // stay tap-only on the specimen card itself for now.
  //
  // Real fix for a genuine, reported gap: this used to reset
  // immediately and unconditionally. Now checks real, local progress
  // (step !== 'scan' means a patient has at least been matched) - an
  // essentially-empty form resets right away, since there's nothing to
  // lose; real in-progress work requires an explicit, tap-based
  // confirmation instead, deliberately not another voice command, since
  // a misheard trigger shouldn't be able to confirm its own mistake.
  useEffect(() => {
    const onStartNewEntry = () => {
      if (step === 'scan') { onRequestReset(); return; }
      setShowResetConfirm(true);
    };
    window.addEventListener('PATHSCRIBE_INTRAOP_START_NEW_ENTRY', onStartNewEntry);
    return () => window.removeEventListener('PATHSCRIBE_INTRAOP_START_NEW_ENTRY', onStartNewEntry);
  }, [step, onRequestReset]);

  const patientIdentified = patientName.trim() && mrn.trim();

  const startSession = async () => {
    if (!patientIdentified || !orNumber.trim() || !surgeon.trim()) return;
    setBusy(true);
    const res = await intraoperativeService.createSession({
      patientMatch: { source, patientName: patientName.trim(), mrn: mrn.trim(), dateOfBirth: dateOfBirth.trim() || undefined },
      performedBy, orNumber: orNumber.trim(), surgeon: surgeon.trim(),
      clientId: clientId || undefined, locationId: locationId || undefined,
    });
    setBusy(false);
    if (res.ok) { setSessionId(res.data.id); setStep('specimen'); }
  };

  const saveSpecimen = async (andContinue: boolean) => {
    if (!sessionId || !specimenLabel.trim() || !quickGross.trim()) return;
    setBusy(true);
    const specRes = await intraoperativeService.addSpecimen(sessionId, specimenLabel);
    if (!specRes.ok) { setBusy(false); return; }
    const newSpecimen = specRes.data.specimens[specRes.data.specimens.length - 1];
    await intraoperativeService.addMilestone(sessionId, newSpecimen.id, 'gross_logged', undefined, undefined, quickGross);
    if (frozenDx.trim()) {
      await intraoperativeService.addMilestone(sessionId, newSpecimen.id, 'frozen_section_cut');
      await intraoperativeService.setFrozenSectionDiagnosis(sessionId, newSpecimen.id, frozenDx, frozenCategory || undefined);
    }
    setBusy(false);
    setSpecimenCount(c => c + 1);
    setSpecimenLabel(''); setQuickGross(''); setFrozenDx(''); setFrozenCategory('');
    if (andContinue) {
      // Same session — patient/OR/surgeon already captured, straight
      // back to the specimen step for the next one.
    } else {
      onSessionSaved();
    }
  };

  if (showResetConfirm) {
    return (
      <div className="ps-intraop-capture-step1">
        <div className="ps-intraop-identified-banner ps-intraop-identified-banner--warn ps-intraop-identified-banner--stacked">
          <div className="ps-intraop-id-heading">Discard current entry?</div>
          <p className="ps-intraop-discard-body">
            {patientName ? `${patientName}'s in-progress entry` : 'This in-progress entry'} has not been saved.
            Starting a new entry will discard it.
          </p>
        </div>
        <button
          type="button"
          className="ps-conf-btn-primary ps-intraop-scan-btn"
          onClick={() => { setShowResetConfirm(false); onRequestReset(); }}
        >
          Discard and Start New
        </button>
        <button
          type="button"
          className="ps-conf-btn-row"
          onClick={() => setShowResetConfirm(false)}
        >
          Cancel — keep working
        </button>
      </div>
    );
  }

  if (step === 'scan') {
    if (showBarcodeScanner) {
      return (
        <div className="ps-intraop-capture-step1">
          <BarcodeScanner
            onDecode={handleBarcodeDecoded}
            onError={setScannerError}
            onCancel={() => setShowBarcodeScanner(false)}
          />
          {scannerError && <p className="ps-intraop-scan-hint ps-intraop-scan-hint--error">{scannerError}</p>}
        </div>
      );
    }
    return (
      <div className="ps-intraop-capture-step1">
        <button className="ps-conf-btn-primary ps-intraop-scan-btn" disabled={busy} onClick={() => { setScannerError(null); setShowBarcodeScanner(true); }} type="button">
          📷 Scan Patient Barcode
        </button>
        <button className="ps-intraop-manual-link" onClick={simulateScan} type="button">
          Simulate scan (no camera)
        </button>

        {!showManualMrn ? (
          <button className="ps-intraop-manual-link" onClick={() => setShowManualMrn(true)} type="button">
            No barcode? Enter MRN manually
          </button>
        ) : (
          <div className="ps-intraop-manual-fields">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">MRN</label>
              <input className="ps-conf-input" value={manualMrn} onChange={e => setManualMrn(e.target.value)} placeholder="e.g. 12345" autoFocus />
            </div>
            <button className="ps-conf-btn-row" disabled={busy || !manualMrn.trim()} onClick={() => lookupPatient(manualMrn.trim(), 'adt_match')}>
              Look Up Patient
            </button>
          </div>
        )}
      </div>
    );
  }

  if (step === 'demographics') {
    return (
      <div className="ps-intraop-capture-step2">
        {adtMatched ? (
          <div className="ps-intraop-identified-banner ps-intraop-identified-banner--stacked">
            <div className="ps-intraop-id-heading">Matched via ADT — confirm before proceeding</div>
            <div className="ps-intraop-id-row"><span className="ps-intraop-id-label">Name</span><span className="ps-intraop-id-value" data-phi="name">{patientName}</span></div>
            <div className="ps-intraop-id-row"><span className="ps-intraop-id-label">DOB</span><span className="ps-intraop-id-value" data-phi="dob">{formatDateLong(dateOfBirth)}</span></div>
            <div className="ps-intraop-id-row"><span className="ps-intraop-id-label">MRN</span><span className="ps-intraop-id-value" data-phi="mrn">{mrn}</span></div>
          </div>
        ) : (
          <>
            <div className="ps-intraop-identified-banner ps-intraop-identified-banner--warn">
              No ADT match — MRN {mrn} from barcode only. Enter name and date of birth.
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Patient name (Last, First)</label>
              <input className="ps-conf-input" value={patientName} onChange={e => { setPatientName(e.target.value); setPatientConfirmed(false); }} onFocus={() => setFocusedFieldId('patientName')} placeholder="Ibarra, Consuelo" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Date of birth</label>
              <input className="ps-conf-input" type="date" value={dateOfBirth} onChange={e => { setDateOfBirth(e.target.value); setPatientConfirmed(false); }} />
            </div>
          </>
        )}
        {patientIdentified && (
          <label className="ps-intraop-confirm-row">
            <input
              type="checkbox"
              checked={patientConfirmed}
              onChange={e => setPatientConfirmed(e.target.checked)}
            />
            I have verified this is the correct patient
          </label>
        )}
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">OR number</label>
          <input className="ps-conf-input" value={orNumber} onChange={e => setOrNumber(e.target.value)} onFocus={() => setFocusedFieldId('orNumber')} placeholder="OR-3" />
        </div>
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">Surgeon</label>
          <input className="ps-conf-input" value={surgeon} onChange={e => setSurgeon(e.target.value)} onFocus={() => setFocusedFieldId('surgeon')} placeholder="Dr. Reyes" />
        </div>
        {/* Real feature, per direct confirmation: "Let's wire in
            Facility and Location (Room) for Intraop." Optional — a
            session can genuinely be started before the facility/
            location is known. */}
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">Submitting facility (optional)</label>
          <select className="ps-conf-input" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">Select facility…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">Location — ward / room / bed (optional)</label>
          <select className="ps-conf-input" value={locationId} onChange={e => setLocationId(e.target.value)} disabled={!clientId}>
            <option value="">
              {!clientId ? 'Select a facility first' : locations.length === 0 ? 'No locations configured for this facility' : 'None specified'}
            </option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{[l.pointOfCare, l.room, l.bed].filter(Boolean).join(' / ')}</option>
            ))}
          </select>
        </div>
        <button
          className="ps-conf-btn-primary ps-intraop-scan-btn"
          disabled={busy || !patientIdentified || !patientConfirmed || !orNumber.trim() || !surgeon.trim()}
          onClick={startSession}
        >
          Continue to Specimen
        </button>
        <button type="button" className="ps-conf-btn-row" onClick={() => setShowResetConfirm(true)}>
          Cancel
        </button>
      </div>
    );
  }

  // step === 'specimen'
  return (
    <div className="ps-intraop-capture-step2">
      <div className="ps-intraop-identified-banner">
        {patientName} · {mrn} · {orNumber} · {surgeon}
        {clientId ? ` · ${clients.find(c => c.id === clientId)?.name ?? ''}` : ''}
        {locationId ? ` · ${(() => { const l = locations.find(l => l.id === locationId); return l ? [l.pointOfCare, l.room, l.bed].filter(Boolean).join(' / ') : ''; })()}` : ''}
        {specimenCount > 0 ? ` · ${specimenCount} specimen${specimenCount === 1 ? '' : 's'} saved` : ''}
      </div>
      <div className="ps-conf-form-field">
        <label className="ps-conf-label">Specimen label</label>
        <input className="ps-conf-input" value={specimenLabel} onChange={e => setSpecimenLabel(e.target.value)} onFocus={() => setFocusedFieldId('specimenLabel')} placeholder="Specimen A: Left breast, margins" />
      </div>
      <div className="ps-conf-form-field">
        <label className="ps-conf-label">Quick Gross — dimensions, blocks frozen, orientation</label>
        <textarea className="ps-conf-input ps-conf-textarea" value={quickGross} onChange={e => setQuickGross(e.target.value)} onFocus={() => setFocusedFieldId('quickGross')}
          placeholder="e.g. Received a 2.5 cm core of tan-pink tissue. Block FS1 cut from fatty margin. Superior suture placed by surgeon." />
      </div>
      <div className="ps-conf-form-field">
        <label className="ps-conf-label">Frozen section diagnosis (optional here — can be added later from the log)</label>
        <textarea className="ps-conf-input ps-conf-textarea" value={frozenDx} onChange={e => setFrozenDx(e.target.value)} onFocus={() => setFocusedFieldId('frozenDx')}
          placeholder="e.g. Invasive carcinoma, margins negative." />
      </div>
      <div className="ps-conf-form-field">
        <label className="ps-conf-label" htmlFor="intraop-preliminary-category">Preliminary category</label>
        <select id="intraop-preliminary-category" className="ps-conf-select" value={frozenCategory} onChange={e => setFrozenCategory(e.target.value as FrozenCategory | '')}>
          <option value="">Select…</option>
          <option value="benign">Benign</option>
          <option value="malignant">Malignant</option>
          <option value="atypical_suspicious">Atypical / Suspicious</option>
          <option value="deferred">Deferred</option>
        </select>
        <p className="ps-intraop-scan-hint">This category, not the diagnosis text, is what gets compared against the final category at sign-out.</p>
      </div>
      <div className="ps-intraop-specimen-actions">
        <button className="ps-conf-btn-row" disabled={busy || !specimenLabel.trim() || !quickGross.trim()} onClick={() => saveSpecimen(true)}>
          Save & Next Specimen
        </button>
        <button className="ps-conf-btn-primary ps-intraop-scan-btn" disabled={busy || !specimenLabel.trim() || !quickGross.trim()} onClick={() => saveSpecimen(false)}>
          Save & Close
        </button>
        <button type="button" className="ps-conf-btn-row" onClick={() => setShowResetConfirm(true)}>
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Skip-reason micro-menu ─────────────────────────────────────────────────
const SkipReasonMenu: React.FC<{ onPick: (reason: SkipReason, note?: string) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const [otherNote, setOtherNote] = useState('');
  const [showOther, setShowOther] = useState(false);
  return (
    <div className="ps-intraop-skipmenu">
      <button className="ps-conf-btn-row" onClick={() => onPick('fibrotic_scant')}>Fibrotic / Scant</button>
      <button className="ps-conf-btn-row" onClick={() => onPick('direct_to_frozen')}>Direct to Frozen</button>
      {!showOther ? (
        <button className="ps-conf-btn-row" onClick={() => setShowOther(true)}>Other…</button>
      ) : (
        <div className="ps-intraop-skipmenu-other">
          <input className="ps-conf-input ps-intraop-skipmenu-other-input" value={otherNote} onChange={e => setOtherNote(e.target.value)} placeholder="Reason" autoFocus />
          <button className="ps-conf-btn-row" onClick={() => onPick('other', otherNote.trim() || undefined)}>OK</button>
        </div>
      )}
      <button className="ps-conf-btn-row ps-intraop-skipmenu-cancel" onClick={onClose}>Cancel</button>
    </div>
  );
};

const PREPARATION_TYPE_LABEL: Record<PreparationType, string> = {
  frozen_block: 'Frozen Block(s)',
  touch_prep: 'Touch Prep / Smear',
  squash_prep: 'Squash Prep',
  cytology_fluid: 'Cytology / Fluid Evaluation',
  gross_only: 'Gross Only / Intraoperative Consultation',
};
const PREPARATION_TYPES: PreparationType[] = ['frozen_block', 'touch_prep', 'squash_prep', 'cytology_fluid', 'gross_only'];

/** Real, new component, per direct guidance — the real bench-facing
 *  entry point for addPreparationOutput() (services/intraop/), closing
 *  the loop on PS-82's own data-model fix. Block Count is real,
 *  dynamic — only meaningful (shown, defaulted to 1) for Frozen
 *  Block(s); every other preparation type logs exactly one real
 *  output per "Log" click, matching the real, given spec ("hides or
 *  zeroes block count" for Touch Prep/Smear). Deliberately separate
 *  from, not a replacement for, the existing Quick Gross/Touch Prep
 *  milestone gate above — milestones[] still tracks the real workflow
 *  sequence (did touch prep happen at all, when); this is the real,
 *  itemized, repeatable record of what was actually produced, which a
 *  single milestone tap could never represent (a specimen can have
 *  both touch preps AND multiple frozen blocks). Stays visible/
 *  re-usable after logging — a real bench workflow may add
 *  preparations progressively, not all in one submission. */
const PreparationLogger: React.FC<{ sessionId: string; specimen: IntraopSpecimen; onLogged: () => void; voiceEligible: boolean }> = ({ sessionId, specimen, onLogged, voiceEligible }) => {
  const [type, setType] = useState<PreparationType>('frozen_block');
  const [blockCount, setBlockCount] = useState('1');
  const [busy, setBusy] = useState(false);

  const handleLog = useCallback(async (loggedType: PreparationType) => {
    setBusy(true);
    const count = loggedType === 'frozen_block' ? Math.max(1, Number(blockCount) || 1) : 1;
    for (let i = 0; i < count; i++) {
      // Sequential, not parallel — each real call needs the PRIOR
      // call's own persisted state (via generatePreparationIdentifier's
      // real sequence count) to correctly number the next real output;
      // firing these concurrently would race and could produce
      // duplicate identifiers.
      // eslint-disable-next-line no-await-in-loop
      await intraoperativeService.addPreparationOutput(sessionId, specimen.id, loggedType);
    }
    // Real, deliberate: also logs the corresponding workflow milestone
    // on the FIRST real output of that type only — preserves the
    // existing TAT-tracking/audit value of milestones[] (frozen-section
    // TAT calculation reads frozen_section_cut's own timestamp) without
    // creating a redundant milestone entry for every additional block.
    const hasTouchPrepStep = specimen.milestones.some(m => m.milestone === 'touch_prep_performed' || m.milestone === 'touch_prep_skipped');
    const hasFrozenCut = specimen.milestones.some(m => m.milestone === 'frozen_section_cut');
    if (loggedType === 'touch_prep' && !hasTouchPrepStep) {
      await intraoperativeService.addMilestone(sessionId, specimen.id, 'touch_prep_performed');
    } else if (loggedType === 'frozen_block' && !hasFrozenCut) {
      await intraoperativeService.addMilestone(sessionId, specimen.id, 'frozen_section_cut');
    }
    setBusy(false);
    onLogged();
  }, [sessionId, specimen, blockCount, onLogged]);

  // Real, per direct guidance: voice logs exactly ONE real output per
  // utterance, never parsing a spoken count — "log a frozen block" said
  // twice produces two real, correctly-sequenced blocks (FS-A1, FS-A2),
  // same as tapping the button twice. Reuses the two REAL,
  // already-defined action ids/trigger phrases from the action registry
  // (INTRAOP_FROZEN_SECTION_CUT: "frozen section cut" etc.,
  // INTRAOP_TOUCH_PREP_PERFORMED: "touch prep performed" etc.) rather
  // than inventing new ones for these two types — the existing phrases
  // already say exactly what's needed. Three genuinely new action ids
  // added for the three preparation types with no existing analog.
  // Gated on voiceEligible (single-specimen session only) - see this
  // file's own comment at the real entry.specimens.map call site for
  // why: a bare spoken phrase can't disambiguate which specimen when
  // more than one could be listening.
  useEffect(() => {
    if (!voiceEligible) return;
    const unsubscribe = mockActionRegistryService.onAction((actionId: string) => {
      if (busy) return;
      if (actionId === 'INTRAOP_FROZEN_SECTION_CUT') handleLog('frozen_block');
      else if (actionId === 'INTRAOP_TOUCH_PREP_PERFORMED') handleLog('touch_prep');
      else if (actionId === 'INTRAOP_LOG_SQUASH_PREP') handleLog('squash_prep');
      else if (actionId === 'INTRAOP_LOG_CYTOLOGY_FLUID') handleLog('cytology_fluid');
      else if (actionId === 'INTRAOP_LOG_GROSS_ONLY') handleLog('gross_only');
    });
    return unsubscribe;
  }, [voiceEligible, busy, handleLog]);

  return (
    <div className="ps-intraop-action-block">
      {(specimen.preparations ?? []).length > 0 && (
        <div className="ps-intraop-timeline">
          {(specimen.preparations ?? []).map(p => (
            <div key={p.id} className="ps-intraop-timeline-row">
              <span className="ps-intraop-timeline-dot" />
              <span className="ps-intraop-timeline-label">{PREPARATION_TYPE_LABEL[p.type]} — {p.identifier}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ps-conf-form-row">
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">Preparation Type</label>
          <select className="ps-conf-select" value={type} onChange={e => setType(e.target.value as PreparationType)}>
            {PREPARATION_TYPES.map(t => <option key={t} value={t}>{PREPARATION_TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        {type === 'frozen_block' && (
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Block Count</label>
            <input className="ps-conf-input" type="number" min="1" value={blockCount} onChange={e => setBlockCount(e.target.value)} />
          </div>
        )}
      </div>
      <button className="ps-conf-btn-primary" disabled={busy} onClick={() => handleLog(type)}>
        Log {type === 'frozen_block' ? `${Math.max(1, Number(blockCount) || 1)} Frozen Block${Number(blockCount) === 1 ? '' : 's'}` : PREPARATION_TYPE_LABEL[type]}
      </button>
      {voiceEligible && (
        <p className="ps-intraop-gate-note">
          Voice: "frozen section cut" / "touch prep performed" logs one real output — repeat to log another. Block Count above is for tap/type entry only.
        </p>
      )}
    </div>
  );
};

// ─── Milestone action controls — per specimen, not per session ────────────────
const MilestoneActions: React.FC<{ sessionId: string; specimen: IntraopSpecimen; onLogged: () => void; voiceEligible: boolean }> = ({ sessionId, specimen, onLogged, voiceEligible }) => {
  const [quickGrossDraft, setQuickGrossDraft] = useState('');
  const [showSkipMenu, setShowSkipMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const { startDictation, phase, dictationTarget } = useVoice();
  const [grossFocused, setGrossFocused] = useState(false);

  const hasGrossLogged = specimen.milestones.some(m => m.milestone === 'gross_logged') && !!specimen.quickGrossDictation?.trim();
  const hasTouchPrepStep = specimen.milestones.some(m => m.milestone === 'touch_prep_performed' || m.milestone === 'touch_prep_skipped');

  const log = useCallback(async (milestone: MilestoneType, skipReason?: SkipReason, skipReasonNote?: string, quickGrossText?: string) => {
    setBusy(true);
    const res = await intraoperativeService.addMilestone(sessionId, specimen.id, milestone, skipReason, skipReasonNote, quickGrossText);
    setBusy(false);
    if (res.ok) { onLogged(); setShowSkipMenu(false); setQuickGrossDraft(''); }
  }, [sessionId, specimen.id, onLogged]);

  // Real dictation for this specimen's own Quick Gross field — same
  // real mechanism (startDictation/dictationTarget) already used for
  // the session-creation form's own fields, scoped here to THIS
  // specimen's local quickGrossDraft instead. Explicit focus-then-
  // speak, same as that existing usage — never ambiguous regardless of
  // how many specimens are in the session, unlike the discrete voice
  // actions below.
  useEffect(() => {
    if (phase !== 'dictate' || dictationTarget || !grossFocused) return;
    startDictation({
      fieldId: `quickGross-${specimen.id}`,
      label: 'Quick Gross',
      context: 'gross description, blocks frozen, orientation',
      onText: (text: string, isInterim?: boolean) => {
        if (isInterim) return;
        setQuickGrossDraft(prev => (prev ? `${prev} ${text}`.trim() : text.trim()));
      },
    });
  }, [phase, dictationTarget, grossFocused, specimen.id, startDictation]);

  // Real, discrete voice actions for the touch prep gate — reuses the
  // two REAL, already-defined action ids (INTRAOP_TOUCH_PREP_PERFORMED,
  // INTRAOP_TOUCH_PREP_SKIP) that already had real voiceTriggers
  // defined in the action registry but were never actually listened
  // for anywhere in this page - confirmed directly before wiring this.
  // Skip defaults to 'direct_to_frozen' - the one skip reason already
  // present as one of INTRAOP_TOUCH_PREP_SKIP's own real trigger
  // phrases ("direct to frozen"); the tap-based Skip Reason menu
  // remains available for any other reason. Gated on voiceEligible -
  // same reasoning as PreparationLogger's own listener.
  useEffect(() => {
    if (!voiceEligible || hasTouchPrepStep) return;
    const unsubscribe = mockActionRegistryService.onAction((actionId: string) => {
      if (busy) return;
      if (actionId === 'INTRAOP_TOUCH_PREP_PERFORMED') log('touch_prep_performed');
      else if (actionId === 'INTRAOP_TOUCH_PREP_SKIP') log('touch_prep_skipped', 'direct_to_frozen');
    });
    return unsubscribe;
  }, [voiceEligible, hasTouchPrepStep, busy, log]);

  if (!hasGrossLogged) {
    return (
      <div className="ps-intraop-action-block">
        <label className="ps-conf-label">Quick Gross — dimensions, blocks frozen, orientation</label>
        <textarea className="ps-conf-input ps-conf-textarea" value={quickGrossDraft} onChange={e => setQuickGrossDraft(e.target.value)}
          onFocus={() => setGrossFocused(true)} onBlur={() => setGrossFocused(false)}
          placeholder="e.g. Received a 2.5 cm core of tan-pink tissue. Block FS1 cut from fatty margin. Superior suture placed by surgeon." />
        <button className="ps-conf-btn-primary" disabled={busy || !quickGrossDraft.trim()} onClick={() => log('gross_logged', undefined, undefined, quickGrossDraft)}>
          Log Quick Gross
        </button>
        <p className="ps-intraop-gate-note">Required before Touch Prep or Frozen Section can be logged — no override. Focus this field and press the mic to dictate.</p>
      </div>
    );
  }

  if (!hasTouchPrepStep) {
    return (
      <div className="ps-intraop-action-block">
        <button className="ps-conf-btn-primary" disabled={busy} onClick={() => log('touch_prep_performed')}>Log Touch Prep Performed</button>
        <button className="ps-conf-btn-row" disabled={busy} onClick={() => setShowSkipMenu(true)}>Skip Touch Prep</button>
        {showSkipMenu && (
          <SkipReasonMenu
            onClose={() => setShowSkipMenu(false)}
            onPick={(reason, note) => log('touch_prep_skipped', reason, note)}
          />
        )}
        {voiceEligible && <p className="ps-intraop-gate-note">Voice: "touch prep performed" or "skip touch prep" (defaults to direct-to-frozen).</p>}
      </div>
    );
  }

  // Real, dynamic — replaces the old, single-tap "Log Frozen Section
  // Cut" (once-only, then nothing left to action) with the real
  // Preparation Type selector + dynamic Block Count entry, per direct
  // guidance. Stays available for repeated use, not a one-shot terminal
  // state — a real bench workflow may log additional preparations
  // (another block, a second touch prep) over time.
  return <PreparationLogger sessionId={sessionId} specimen={specimen} onLogged={onLogged} voiceEligible={voiceEligible} />;
};

// ─── Merge modal ────────────────────────────────────────────────────────────
const MergeModal: React.FC<{
  entry: IntraoperativeEntry;
  candidates: MatchCandidate[];
  onConfirm: (caseId: string) => void;
  onClose: () => void;
}> = ({ entry, candidates, onConfirm, onClose }) => {
  const [selected, setSelected] = useState(candidates[0]?.caseId ?? '');
  const [manualCaseId, setManualCaseId] = useState('');
  const finalCaseId = selected === '__manual__' ? manualCaseId.trim() : selected;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Merge Mobile Intake Data</div>
        <div className="ps-ms-body">
          {/* The one legitimate place this reveals real PHI — the card
              in the list stays redacted (🔒 Pending Match); this modal
              only opens when a pathologist has actually chosen to
              review/claim this specific entry, which is the moment
              they have a real reason to see who it's for. */}
          <p className="ps-intraop-merge-patient">{entry.patientMatch.patientName} · {entry.patientMatch.mrn}</p>
          <p className="ps-intraop-merge-intro">
            Appends dictation to Gross Description / Clinical History and attaches mobile photos to the case's media gallery, once merged.
          </p>

          {candidates.length > 0 ? (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Matched case</label>
              {candidates.map(c => (
                <label key={c.caseId} className="ps-intraop-candidate-row">
                  <input type="radio" name="matchCandidate" checked={selected === c.caseId} onChange={() => setSelected(c.caseId)} />
                  <span className="ps-intraop-candidate-case" data-phi="accession">{c.caseId}</span>
                  <span className={`ps-intraop-candidate-badge ps-intraop-candidate-badge--${c.confidence}`}>
                    {c.matchType === 'mrn_exact' ? 'MRN match' : `Fuzzy · ${c.confidence}`}
                  </span>
                  <span className="ps-intraop-candidate-reason">{c.matchReason}</span>
                </label>
              ))}
              <label className="ps-intraop-candidate-row">
                <input type="radio" name="matchCandidate" checked={selected === '__manual__'} onChange={() => setSelected('__manual__')} />
                <span className="ps-intraop-candidate-case">Enter case ID manually</span>
              </label>
            </div>
          ) : (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">No automatic match found — enter the case ID</label>
            </div>
          )}

          {(selected === '__manual__' || candidates.length === 0) && (
            <div className="ps-conf-form-field">
              <input className="ps-conf-input" placeholder="e.g. O26-0021" value={manualCaseId} onChange={e => setManualCaseId(e.target.value)} />
            </div>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" disabled={!finalCaseId} onClick={() => finalCaseId && onConfirm(finalCaseId)}>
            Merge into {finalCaseId || '…'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Specimen card — one per specimen, nested inside the session's entry card ──
const SpecimenCard: React.FC<{ sessionId: string; specimen: IntraopSpecimen; onRefresh: () => void; voiceEligible: boolean }> = ({ sessionId, specimen, onRefresh, voiceEligible }) => (
  <div className="ps-intraop-specimen-card">
    <div className="ps-intraop-specimen">{specimen.specimenLabel}</div>

    {specimen.milestones.length > 0 && (
      <div className="ps-intraop-timeline">
        {specimen.milestones.map(m => (
          <div key={m.id} className="ps-intraop-timeline-row">
            <span className="ps-intraop-timeline-time">{formatTime(m.timestamp)}</span>
            <span className={`ps-intraop-timeline-dot ${m.milestone === 'touch_prep_skipped' ? 'ps-intraop-timeline-dot--skip' : ''}`} />
            <span className="ps-intraop-timeline-label">{MILESTONE_LABEL[m.milestone]}</span>
            {m.skipReason && (
              <span className="ps-intraop-timeline-reason">
                {SKIP_REASON_LABEL[m.skipReason]}{m.skipReasonNote ? ` — ${m.skipReasonNote}` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    )}

    <MilestoneActions sessionId={sessionId} specimen={specimen} onLogged={onRefresh} voiceEligible={voiceEligible} />

    {specimen.preliminaryCytologyDictation && (
      <div className="ps-intraop-note">
        <span className="ps-intraop-note-label">Preliminary cytology</span>
        {specimen.preliminaryCytologyDictation}
      </div>
    )}
    {specimen.quickGrossDictation && (
      <div className="ps-intraop-note">
        <span className="ps-intraop-note-label">Quick Gross</span>
        {specimen.quickGrossDictation}
      </div>
    )}
    {specimen.frozenSectionDiagnosis && (
      <div className="ps-intraop-note ps-intraop-note--diagnosis">
        <span className="ps-intraop-note-label">Frozen section diagnosis</span>
        {specimen.frozenSectionDiagnosis}
      </div>
    )}
  </div>
);

// ─── Entry (session) card — one per session, holds every specimen under it ────
const EntryCard: React.FC<{
  entry: IntraoperativeEntry;
  onMergeClick: () => void;
  onRefresh: () => void;
}> = ({ entry, onMergeClick, onRefresh }) => {
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const handleReportToSurgeon = React.useCallback(async () => {
    setBusy(true);
    await intraoperativeService.recordVerbalReport(entry.id, note);
    setBusy(false);
    setReporting(false);
    setNote('');
    onRefresh();
  }, [entry.id, note, onRefresh]);

  // Voice: INTRAOP_LOG_SURGEON_REPORT. Only listened for while this
  // specific card's reporting form is open (reporting === true) — same
  // pattern as PoolClaimModal.tsx's POOL_ACCEPT_CASE: the action only
  // ever means something with exactly this one form open, so there's
  // never a "which entry" ambiguity to resolve. Gated on !busy so a
  // stray recognition can't double-fire while the write is in flight.
  useEffect(() => {
    if (!reporting) return;
    const unsubscribe = mockActionRegistryService.onAction((actionId: string) => {
      if (busy) return;
      if (actionId === 'INTRAOP_LOG_SURGEON_REPORT') handleReportToSurgeon();
    });
    return unsubscribe;
  }, [reporting, busy, note, handleReportToSurgeon]);

  return (
  <div className="ps-intraop-card">
    <div className="ps-intraop-card-header">
      <div>
        {/* Redacted the same way WorklistTable redacts pediatric/
            orchestration/pool cases — nobody has a specific right to
            this patient's PHI until the entry is actually claimed via
            merge. Only non-identifying operational context (OR number,
            surgeon, match source) stays visible; name and MRN don't. */}
        <div className="ps-intraop-card-patient">🔒 Pending Match</div>
        <div className="ps-intraop-card-sub">
          {entry.orNumber} · {entry.surgeon}{entry.clientName ? ` · ${entry.clientName}` : ''}{entry.locationDisplay ? ` · ${entry.locationDisplay}` : ''} · {entry.performedBy.userName} · matched via {entry.patientMatch.source === 'barcode' ? 'barcode scan (simulated)' : 'manual / ADT entry'}
        </div>
      </div>
      <button className="ps-conf-btn-primary" onClick={onMergeClick}>Merge Mobile Intake Data</button>
    </div>

    {/* Real, deliberate scope boundary: discrete voice-triggered
        actions (touch prep / preparation logging) are only enabled
        when this session has exactly one specimen — the same
        never-ambiguous-target principle already established for
        INTRAOP_LOG_SURGEON_REPORT above. A multi-specimen session
        (a real, working case — see intraop-002's own seed data) stays
        tap-only for these actions; there's no reliable way to know
        which specimen a bare spoken phrase like "frozen section cut"
        should apply to when more than one could be listening.
        Dictation (Quick Gross) is unaffected by this — it's
        explicit focus-then-speak, never ambiguous regardless of
        specimen count. */}
    {entry.specimens.map(spec => (
      <SpecimenCard key={spec.id} sessionId={entry.id} specimen={spec} onRefresh={onRefresh} voiceEligible={entry.specimens.length === 1} />
    ))}

    {entry.verbalReportLog ? (
      <div className="ps-intraop-note">
        <span className="ps-intraop-note-label">Verbal report to surgeon — {formatTime(entry.verbalReportLog.timestamp)}</span>
        {entry.verbalReportLog.note}
      </div>
    ) : reporting ? (
      <div className="ps-intraop-note">
        <span className="ps-intraop-note-label">Report to surgeon</span>
        <input
          className="ps-conf-input"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What was said (optional) — e.g. margins clear, frozen pending"
          autoFocus
        />
        <div className="ps-intraop-report-actions">
          <button className="ps-conf-btn-primary" disabled={busy} onClick={handleReportToSurgeon}>Log Now</button>
          <button className="ps-conf-btn-secondary" disabled={busy} onClick={() => { setReporting(false); setNote(''); }}>Cancel</button>
        </div>
      </div>
    ) : (
      // The real, deliberate capture point this whole TAT metric
      // depends on — the moment of verbal communication to the surgeon
      // can't be inferred from any system event, unlike merge; a
      // pathologist has to actively log it. Timestamped at the moment
      // this button is pressed, not backdated or editable afterward —
      // matches the same "immutable event, captured at the moment"
      // principle as recordAiFeedback and the merge audit log.
      <button className="ps-conf-btn-secondary" onClick={() => setReporting(true)}>📞 Report to Surgeon Now</button>
    )}
  </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const IntraopQueuePage: React.FC = () => {
  const { pushCrumb } = useBreadcrumb();
  const { user } = useAuth();
  const [entries, setEntries] = useState<IntraoperativeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergeTarget, setMergeTarget] = useState<{ entry: IntraoperativeEntry; candidates: MatchCandidate[] } | null>(null);

  // Real, confirmed gap being closed: this page never called
  // setCurrentContext at all, unlike SynopticReportPage (which had this
  // exact same bug, already fixed there) - meaning context-scoped voice
  // commands could never correctly activate here. Same one-line pattern
  // every other real page feature already uses.
  useEffect(() => {
    mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.INTRAOP);
    return () => { mockActionRegistryService.setCurrentContext(VOICE_CONTEXT.WORKLIST); };
  }, []);

  // Below this width, the page is almost certainly a phone at the bench,
  // not a desktop workstation reviewing the queue — default the log to
  // hidden so the capture form is what's actually in view. Desktop
  // defaults to showing the log, matching how it's always worked.
  const [showLog, setShowLog] = useState(() => !isConstrainedMobileDevice());
  const navigate = useNavigate();
  const [formResetKey, setFormResetKey] = useState(0);

  useEffect(() => { pushCrumb('Intraop Queue', '/intraop-queue'); }, [pushCrumb]);

  const load = () => {
    intraoperativeService.getPending().then(res => {
      if (res.ok) setEntries(res.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const onSessionSaved = () => {
    load();
    setShowLog(true);
    setFormResetKey(k => k + 1);
  };

  const openMerge = async (entry: IntraoperativeEntry) => {
    const res = await intraoperativeService.getMatchCandidates(entry.id);
    setMergeTarget({ entry, candidates: res.ok ? res.data : [] });
  };

  const confirmMerge = async (caseId: string) => {
    if (!mergeTarget) return;
    // The modal only returns the final caseId, not which path produced
    // it — inferred here instead of changing MergeModal's prop signature:
    // if caseId matches one of the offered candidates, that candidate's
    // real matchType/confidence apply; otherwise it was typed manually.
    // wasManualOverride is true specifically when real candidates WERE
    // offered but the user typed something else instead — not simply
    // "no candidates existed at all," which isn't an override of anything.
    const matchedCandidate = mergeTarget.candidates.find(c => c.caseId === caseId);
    const res = await intraoperativeService.merge(mergeTarget.entry.id, caseId, {
      matchType: matchedCandidate?.matchType ?? 'manual',
      confidence: matchedCandidate?.confidence ?? null,
      wasManualOverride: !matchedCandidate && mergeTarget.candidates.length > 0,
      performedBy: user?.name ?? 'Unknown User',
    });
    if (res.ok) setEntries(prev => prev.filter(e => e.id !== mergeTarget.entry.id));
    setMergeTarget(null);
  };

  if (loading) return <div className="ps-conf-loading">Loading intraoperative entries…</div>;

  return (
    <div className="ps-intraop-page">
      <div className="ps-intraop-page-header">
        <div className="ps-intraop-header-row">
          <div>
            <h1 className="ps-intraop-page-title">Intraoperative Entries</h1>
            <p className="ps-intraop-page-subtitle">
              Scan the patient to start — OR/surgeon once per session, then each specimen gets its own Quick Gross and frozen diagnosis.
            </p>
          </div>
          <div className="ps-intraop-header-actions">
            <button className="ps-conf-btn-row" onClick={() => setShowLog(v => !v)}>
              {showLog ? 'Hide Log' : 'View Log'}{entries.length > 0 ? ` (${entries.length})` : ''}
            </button>
            {shouldRestrictToMobileWorkflow() && (
              <button
                type="button"
                onClick={() => { setDesktopViewOverride(); navigate('/'); }}
                className="ps-intraop-desktop-switch-link"
              >
                Switch to Full Desktop View
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="ps-intraop-capture-inline">
        <NewEntryForm
          key={formResetKey}
          performedBy={{ userId: user?.id ?? 'unknown', userName: user?.name ?? 'Unknown User' }}
          onSessionSaved={onSessionSaved}
          onRequestReset={() => setFormResetKey(k => k + 1)}
        />
      </div>

      {showLog && (
        entries.length === 0 ? (
          <div className="ps-intraop-empty">No unlinked intraoperative entries — everything captured has been merged.</div>
        ) : (
          <div className="ps-intraop-list">
            {entries.map(entry => (
              <EntryCard key={entry.id} entry={entry} onMergeClick={() => openMerge(entry)} onRefresh={load} />
            ))}
          </div>
        )
      )}

      {mergeTarget && (
        <MergeModal
          entry={mergeTarget.entry}
          candidates={mergeTarget.candidates}
          onConfirm={confirmMerge}
          onClose={() => setMergeTarget(null)}
        />
      )}
    </div>
  );
};

export default IntraopQueuePage;
