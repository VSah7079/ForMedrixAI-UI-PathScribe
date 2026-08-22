// src/components/Audit/BreakGlassRebindModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct confirmation, building Phase B of the
// "Interface Exception & Case-Binding Module": the restricted UI for
// mockPatientIndexService.breakGlassRebind(). Deliberately gated —
// see AuditLogPage.tsx's own admin-only render condition for this
// modal's trigger — and deliberately friction-heavy for a genuinely
// rare, exceptional real-world action: select a real, flagged
// downtime record, search for the real, confirmed patient, pick a
// real reason code, write a real justification, confirm.
//
// Every real restriction lives in the service layer
// (breakGlassRebind() itself), not just here — this modal is a human-
// driven front end for that one real operation, matching the same
// "no second, parallel implementation" posture as
// InterfaceExceptionReviewModal.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import { BREAK_GLASS_REASON_CODES, BREAK_GLASS_MIN_NOTE_LENGTH } from '@/types/patients/BreakGlassReasonCode';

interface Props {
  organisationId: string;
  performedBy: string;
  onClose: () => void;
  /** Called after a real, successful rebind, so the parent can
   *  refresh anything that depends on the real patient index. */
  onRebound: () => void;
}

const BreakGlassRebindModal: React.FC<Props> = ({ organisationId, performedBy, onClose, onRebound }) => {
  const [loading, setLoading] = useState(true);
  const [downtimeRecords, setDowntimeRecords] = useState<MasterPatientRecord[]>([]);
  const [selectedDowntimeId, setSelectedDowntimeId] = useState('');

  const [targetQuery, setTargetQuery] = useState('');
  const [targetResults, setTargetResults] = useState<MasterPatientRecord[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [searching, setSearching] = useState(false);

  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const records = await mockPatientIndexService.listDowntimeRecords(organisationId);
      if (cancelled) return;
      setDowntimeRecords(records);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organisationId]);

  const selectedDowntime = downtimeRecords.find(r => r.id === selectedDowntimeId);

  // Pre-populate the reason code from the downtime record's own
  // creation reason as a sensible default — a real rebind is often
  // for the exact same real reason the placeholder existed for, but
  // the operator can still change it (e.g. the placeholder was
  // created for EMERGENCY_TRAUMA but the rebind itself is happening
  // because of a later TYPO_DEMOGRAPHIC correction).
  useEffect(() => {
    if (selectedDowntime?.downtimeReasonCode) setReasonCode(selectedDowntime.downtimeReasonCode);
  }, [selectedDowntimeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!targetQuery.trim()) { setTargetResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      const results = await mockPatientIndexService.searchPatients(organisationId, targetQuery);
      if (cancelled) return;
      setTargetResults(results.filter(r => r.id !== selectedDowntimeId));
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [targetQuery, organisationId, selectedDowntimeId]);

  const notesValid = notes.trim().length >= BREAK_GLASS_MIN_NOTE_LENGTH;
  const canSubmit = selectedDowntimeId && selectedTargetId && reasonCode && notesValid;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const rebindResult = await mockPatientIndexService.breakGlassRebind({
      downtimePatientId: selectedDowntimeId,
      confirmedPatientId: selectedTargetId,
      reasonCode,
      notes: notes.trim(),
      performedBy,
    });
    setBusy(false);
    setConfirming(false);
    if (rebindResult.rebound) {
      setResult({ ok: true, message: `Mapped successfully — ${rebindResult.casesRepointed ?? 0} case(s) repointed: ${(rebindResult.caseIds ?? []).join(', ') || 'none'}.` });
      onRebound();
    } else {
      setResult({ ok: false, message: rebindResult.reason ?? 'Map Patient failed for an unknown reason.' });
    }
  };

  // Real, per direct feedback: this modal used ps-modal-overlay/
  // ps-iexc-modal (a real but rare, minority pattern — only 4-5 uses
  // total across the app) instead of the real, dominant standard
  // (ps-overlay/ps-modal-dark, confirmed 174/47 uses respectively) —
  // fixed to match. "Break-Glass Rebind" renamed to "Map Patient"
  // throughout every real, user-facing string (title, trigger button,
  // confirm button, result messages) — the underlying
  // breakGlassRebind() service call and its own real restrictions are
  // unchanged; only what a user actually reads was confusing, not the
  // real mechanism itself.
  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark" style={{ width: 'min(600px, 92vw)' }} onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">🔗 Map Patient — Restricted</span>
          <button onClick={onClose} className="ps-research-close">&#x2715;</button>
        </div>

        <div className="ps-modal-dark-body">
          <div className="ps-iexc-reason-banner">
            Attach a real Case created under a temporary/downtime placeholder identity to the real, confirmed EHR patient. This is a rare, restricted, fully audited action — the placeholder record will be retired, not kept active.
          </div>

          {result ? (
            <div className={result.ok ? 'ps-iexc-result-banner' : 'ps-iexc-reason-banner'}>{result.message}</div>
          ) : loading ? (
            <div className="ps-iexc-loading">Loading downtime records…</div>
          ) : (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-label" htmlFor="bg-downtime-select">Downtime / placeholder identity to resolve</label>
                <select id="bg-downtime-select" className="ps-input-dark" value={selectedDowntimeId} onChange={e => setSelectedDowntimeId(e.target.value)} disabled={busy}>
                  <option value="">
                    {downtimeRecords.length === 0 ? 'No downtime records awaiting a rebind' : 'Select a downtime record…'}
                  </option>
                  {downtimeRecords.map(r => (
                    <option key={r.id} value={r.id}>{r.lastName}, {r.firstName} — MRN {r.mrn}{r.downtimeReasonCode ? ` (${r.downtimeReasonCode})` : ''}</option>
                  ))}
                </select>
              </div>

              {selectedDowntimeId && (
                <>
                  <div className="ps-conf-form-field">
                    <label className="ps-label" htmlFor="bg-target-search">Real, confirmed target patient (search by name or MRN)</label>
                    <input
                      id="bg-target-search"
                      className="ps-input-dark"
                      value={targetQuery}
                      onChange={e => { setTargetQuery(e.target.value); setSelectedTargetId(''); }}
                      placeholder="e.g. Smith or MRN-987654"
                      disabled={busy}
                    />
                    {searching && <div className="ps-iexc-loading">Searching…</div>}
                    {!searching && targetResults.length > 0 && (
                      <div className="ps-iexc-cases-list">
                        {targetResults.map(r => (
                          <label key={r.id} className="ps-iexc-case-row">
                            <input type="radio" name="bg-target" checked={selectedTargetId === r.id} onChange={() => setSelectedTargetId(r.id)} disabled={busy} />
                            <div className="ps-iexc-case-info">
                              <div className="ps-iexc-case-id">{r.lastName}, {r.firstName}</div>
                              <div className="ps-iexc-case-detail">MRN {r.mrn} · DOB {r.dateOfBirth}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {!searching && targetQuery.trim() && targetResults.length === 0 && (
                      <div className="ps-iexc-no-cases">No matching real patients found.</div>
                    )}
                  </div>

                  <div className="ps-conf-form-field">
                    <label className="ps-label" htmlFor="bg-reason-code">Reason code</label>
                    <select id="bg-reason-code" className="ps-input-dark" value={reasonCode} onChange={e => setReasonCode(e.target.value)} disabled={busy}>
                      <option value="">Select a reason…</option>
                      {BREAK_GLASS_REASON_CODES.map(r => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="ps-conf-form-field">
                    <label className="ps-label" htmlFor="bg-notes">Justification (minimum {BREAK_GLASS_MIN_NOTE_LENGTH} characters)</label>
                    <textarea
                      id="bg-notes"
                      className="ps-input-dark"
                      rows={3}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder='e.g. "Mapped Doe_1234 to MRN 987654 per HIM Ticket #4091"'
                      disabled={busy}
                    />
                    {notes.length > 0 && !notesValid && (
                      <div className="ps-iexc-no-cases">{BREAK_GLASS_MIN_NOTE_LENGTH - notes.trim().length} more character(s) needed.</div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="ps-modal-dark-footer">
          {result ? (
            <button onClick={onClose} className="ps-conf-btn-primary">Close</button>
          ) : confirming ? (
            <>
              <span className="ps-iexc-no-cases">Confirm: this will retire the downtime record and repoint its case(s). This cannot be undone from this modal.</span>
              <button onClick={() => setConfirming(false)} disabled={busy} className="ps-conf-btn-secondary">Back</button>
              <button onClick={handleConfirm} disabled={busy} className="ps-conf-btn-primary">
                {busy ? 'Mapping…' : 'Confirm Map Patient'}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="ps-conf-btn-secondary">Cancel</button>
              <button onClick={() => setConfirming(true)} disabled={!canSubmit} className="ps-conf-btn-primary">
                Review &amp; Confirm
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BreakGlassRebindModal;
