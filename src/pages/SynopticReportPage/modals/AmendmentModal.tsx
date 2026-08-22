// src/pages/SynopticReportPage/modals/AmendmentModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Folded wizard per the Synoptic Amendment Workflow DRS v1.1:
//   Step DELTA (conditional) — only rendered when the active instance
//   has 2+ prior released versions (i.e. this is at least the 2nd
//   amendment). On the very first amendment there's only one version
//   to start from, so there's nothing to pick between — the existing
//   in-place unlock (Stage 1 captureFields) already IS the correct
//   "reseed from most recent" behavior in that case. Skipping straight
//   past this step then is deliberate, not a missing feature.
//   Step EDIT — the original capture/notification form, now with an
//   "Amended by" line and a collapsible Changed Items Summary showing
//   any field overrides selected in the Delta step.
//
// DR-2 (field-level lineage) is produced here for delta fields only —
// see FieldLineage.ts for the reasoning. `onFieldOverridesConfirmed`
// hands the parent {fieldKey: {value, sourceVersionNumber}} for exactly
// the fields the pathologist chose to pull from an older version; the
// parent patches those onto the live instance's answers and builds the
// FieldLineageEntry records before the existing unlock/captureFields
// flow proceeds unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from 'react';
import '../../../pathscribe.css';
import type { NotificationMethod } from '@/types/reports/AmendmentRecord';
import { physicianService } from '@/services';
import type { Physician } from '@/services/physicians/IPhysicianService';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { getFacilityDateTimeParts } from '@/utils/facilityTime';
import { initials, avatarColorClass, contactRowsFor } from '@/utils/physicianDisplay';
// NOTE: verify this import path resolves in your build — your last tsc
// output showed src/index.ts failing on a physician service import one
// directory level different from this. If physicianService isn't found,
// the notification log falls back to nothing rendering rather than
// crashing (see the empty-array guard below), but the picker won't work
// until that's fixed.

export interface VersionHistoryEntry {
  versionNumber: number;
  releasedAt: string;
  createdBy: { userId: string; userName: string };
  synopticAnswersSnapshot: Record<string, unknown>;
}

export interface FieldOverride {
  value: unknown;
  sourceVersionNumber: number;
}

interface AmendmentModalProps {
  show: boolean;
  amendmentMode: 'amendment' | 'correction' | 'addendum';
  amendmentText: string;
  activeSynopticTitle: string;
  sequenceNumber: number;
  amendedByName: string;
  /** Full released-version history for the active instance, oldest
   *  first. Length <= 1 means "first amendment" — the Delta step is
   *  skipped entirely and behavior is identical to before. */
  versionHistory: VersionHistoryEntry[];
  onModeChange: (mode: 'amendment' | 'correction' | 'addendum') => void;
  onTextChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (fields: { addendumTitle?: string; explanationOfChange?: string; clinicianName?: string; method?: NotificationMethod; notifiedAt?: string }) => void;
  /** Fired once, when the Delta step is confirmed — before the editor
   *  step opens. Empty object if no fields were overridden (baseline
   *  accepted as-is) or if the Delta step was skipped. */
  onFieldOverridesConfirmed: (overrides: Record<string, FieldOverride>) => void;
  submitError?: string | null;
  /** Resuming an existing draft (re-opening to edit reason/notification)
   *  rather than starting fresh. When set, the Delta step is skipped
   *  entirely — field sources were already chosen once when the draft
   *  was first opened, and re-running that choice would be confusing,
   *  not helpful, on a second visit to the same in-progress amendment. */
  resuming?: {
    clinicianName?: string;
    method?: NotificationMethod;
    notifiedAt?: string;
  };
  /** The case's ordering/referring physician — the likely contact for
   *  clinical notification. Defaults the field on a FRESH amendment
   *  only (never overrides a resumed draft's actual saved value). */
  orderingPhysicianName?: string;
}

const NOTIFICATION_METHOD_LABEL: Record<NotificationMethod, string> = {
  verbal_phone: 'Verbal / Phone Call',
  secure_page: 'Secure Page',
  direct_lis_flag: 'Direct LIS Flag',
};

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '(empty)';
  return String(value);
};

const formatDateTime = (iso?: string) => iso ? new Date(iso).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '';

const ordinal = (n: number): string => {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
};

const versionLabel = (versionNumber: number, total: number): string => {
  if (versionNumber === 1) return 'Original';
  if (versionNumber === total) return `${ordinal(versionNumber - 1)} Amended (Most Recent)`;
  return `${ordinal(versionNumber - 1)} Amended`;
};
const AmendmentModal: React.FC<AmendmentModalProps> = ({
  show, amendmentMode, amendmentText, activeSynopticTitle, sequenceNumber, amendedByName = 'Unknown User',
  versionHistory = [], onModeChange, onTextChange, onClose, onSubmit,
  onFieldOverridesConfirmed = () => {}, submitError, resuming,
  orderingPhysicianName,
}) => {
  const { config } = useSystemConfig();
  const [addendumTitle, setAddendumTitle] = useState('');
  const [clinicianName, setClinicianName] = useState('');
  const [physicianQuery, setPhysicianQuery] = useState('');
  const [filteredPhysicians, setFilteredPhysicians] = useState<Physician[]>([]);
  const [showPhysicianDropdown, setShowPhysicianDropdown] = useState(false);
  const [selectedPhysician, setSelectedPhysician] = useState<Physician | undefined>(undefined);
  const [method, setMethod] = useState<NotificationMethod | ''>('');
  const [notifiedAt, setNotifiedAt] = useState('');
  const [changedItemsOpen, setChangedItemsOpen] = useState(false);

  // Debounced server-side search — was previously fetching the ENTIRE
  // physician table on every modal open and filtering client-side. That
  // was invisible with ~7 seed physicians but wouldn't scale to a real
  // hospital-system directory (hundreds to thousands of entries), and
  // IPhysicianService had no way to ask for a filtered subset at all.
  // search() now does that server-side (mock: in-memory) filtering, and
  // this only ever fetches ~8 results at a time, debounced 300ms so
  // fast typing doesn't fire a request per keystroke.
  React.useEffect(() => {
    if (!showPhysicianDropdown) return;
    const handle = setTimeout(() => {
      physicianService.search(physicianQuery).then(res => {
        if (res.ok) setFilteredPhysicians(res.data);
      }).catch(() => setFilteredPhysicians([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [physicianQuery, showPhysicianDropdown]);

  // Default the notified clinician to the case's ordering/referring
  // physician — the likely contact — on a fresh amendment only. Never
  // overrides a resumed draft's actual saved notification.
  React.useEffect(() => {
    if (show && !resuming && !clinicianName && orderingPhysicianName) {
      setClinicianName(orderingPhysicianName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, resuming, orderingPhysicianName]);

  // Best-effort resolve the current clinicianName against the directory
  // so the contact-info card can render without the dropdown being open.
  // A defaulted/resumed name (e.g. an outside referring physician who
  // may not be in the internal directory at all) can legitimately fail
  // to match — that's honest, not a bug: an unmatched name just shows
  // no contact card instead of a false one.
  React.useEffect(() => {
    if (!clinicianName.trim()) { setSelectedPhysician(undefined); return; }
    let cancelled = false;
    physicianService.search(clinicianName).then(res => {
      if (cancelled || !res.ok) return;
      const strippedClinicianName = clinicianName.trim().toLowerCase().replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|miss)\s+/, '');
      const exact = res.data.find(p => `${p.givenNames} ${p.familyNames}`.toLowerCase() === strippedClinicianName);
      setSelectedPhysician(exact);
    }).catch(() => { if (!cancelled) setSelectedPhysician(undefined); });
    return () => { cancelled = true; };
  }, [clinicianName]);

  // FR feedback #3 — default to now instead of blank.
  React.useEffect(() => {
    if (show && amendmentMode === 'amendment' && !notifiedAt) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const { year, month, day, hour, minute } = getFacilityDateTimeParts(now, config.facilityTimezone);
      setNotifiedAt(`${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, amendmentMode]);

  const hasDeltaHistory = versionHistory.length >= 2 && !resuming;
  const [step, setStep] = useState<'delta' | 'edit'>(hasDeltaHistory ? 'delta' : 'edit');
  const [selectedSource, setSelectedSource] = useState<Record<string, number>>({});
  const [confirmedOverrides, setConfirmedOverrides] = useState<Record<string, FieldOverride>>({});

  React.useEffect(() => {
    if (show && resuming) {
      setStep('edit');
      setClinicianName(resuming.clinicianName ?? '');
      setMethod(resuming.method ?? '');
      setNotifiedAt(resuming.notifiedAt ?? '');
    }
  }, [show, resuming]);

  React.useEffect(() => {
    if (show) {
      setStep(hasDeltaHistory ? 'delta' : 'edit');
      setSelectedSource({});
      setConfirmedOverrides({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const mostRecent = versionHistory[versionHistory.length - 1];
  const total = versionHistory.length;

  // FR-9A/B — only fields where at least one version differs from the
  // most-recent (baseline) value.
  const deltaFields = useMemo(() => {
    if (!hasDeltaHistory) return [];
    const allKeys = Array.from(new Set(versionHistory.flatMap(v => Object.keys(v.synopticAnswersSnapshot))));
    return allKeys.filter(key => {
      const baseline = JSON.stringify(mostRecent?.synopticAnswersSnapshot[key]);
      return versionHistory.some(v => JSON.stringify(v.synopticAnswersSnapshot[key]) !== baseline);
    }).sort();
  }, [versionHistory, hasDeltaHistory, mostRecent]);

  if (!show) return null;

  const isAmendment = amendmentMode === 'amendment';
  const isCorrection = amendmentMode === 'correction';
  // Amendment (Major) and Correction (Minor) share the same two-stage
  // unlock/reseed pipeline (Delta step, capture-then-edit) — only the
  // notification requirement differs between them. Addendum stays its
  // own single-stage release. See AMENDMENT_STATUS_REDESIGN_BRIEF.md.
  const isUnlockFlow = isAmendment || isCorrection;

  const canSubmit = isAmendment
    ? amendmentText.trim().length > 0 && clinicianName.trim().length > 0 && !!method
    : isCorrection
    ? amendmentText.trim().length > 0
    : amendmentText.trim().length > 0 && addendumTitle.trim().length > 0;

  const headerLabel = isAmendment ? 'AMENDED REPORT' : isCorrection ? 'CORRECTED REPORT' : `ADDENDUM ${sequenceNumber}`;

  const handleConfirmDelta = () => {
    const overrides: Record<string, FieldOverride> = {};
    for (const key of deltaFields) {
      const chosenVersion = selectedSource[key] ?? mostRecent.versionNumber;
      if (chosenVersion !== mostRecent.versionNumber) {
        const source = versionHistory.find(v => v.versionNumber === chosenVersion);
        overrides[key] = { value: source?.synopticAnswersSnapshot[key], sourceVersionNumber: chosenVersion };
      }
    }
    setConfirmedOverrides(overrides);
    onFieldOverridesConfirmed(overrides); // FR-9H — nothing reseeds before this fires
    setStep('edit');
  };

  const handleSubmit = () => {
    onSubmit({
      addendumTitle: !isUnlockFlow ? addendumTitle : undefined,
      explanationOfChange: isUnlockFlow ? amendmentText : undefined,
      clinicianName: isAmendment ? clinicianName : undefined,
      method: isAmendment && method ? method : undefined,
      notifiedAt: isAmendment ? (notifiedAt || new Date().toISOString()) : undefined,
    });
  };

  return (
    <div data-capture-hide="true" className="ps-overlay">
      <div className="ps-modal-dark ps-amendment-wizard" onClick={e => e.stopPropagation()}>

        {isUnlockFlow && (
          <div className="ps-amendment-target-banner">
            {isAmendment ? 'Amending' : 'Correcting'}: <strong>{activeSynopticTitle}</strong>
          </div>
        )}

        {step === 'delta' && isUnlockFlow && (
          <>
            <div className="ps-modal-dark-header">
              <span className={`ps-modal-dark-title ps-amendment-header-label ${isAmendment ? 'ps-amendment-header-label--amendment' : 'ps-amendment-header-label--correction'}`}>
                SELECT BASELINE VALUES
              </span>
            </div>
            <p className="ps-modal-dark-body">
              <strong className="ps-text-light">{activeSynopticTitle}</strong> has been amended before. The most
              recent version is used by default for every field — click a cell below to pull an older value
              instead for that specific field only.
            </p>

            <table className="ps-amendment-matrix ps-amendment-delta-table">
              <thead>
                <tr>
                  <th>Synoptic Element</th>
                  {versionHistory.map(v => (
                    <th key={v.versionNumber} className={v.versionNumber === mostRecent.versionNumber ? 'ps-amendment-delta-col--default' : undefined}>
                      {versionLabel(v.versionNumber, total)}
                      <div className="ps-amendment-delta-col-meta">{formatDateTime(v.releasedAt)} — {v.createdBy.userName}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deltaFields.map(key => {
                  const chosen = selectedSource[key] ?? mostRecent.versionNumber;
                  return (
                    <tr key={key}>
                      <td>{key}</td>
                      {versionHistory.map(v => {
                        const isSelected = chosen === v.versionNumber;
                        const isOlder = isSelected && v.versionNumber !== mostRecent.versionNumber;
                        return (
                          <td
                            key={v.versionNumber}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedSource(prev => ({ ...prev, [key]: v.versionNumber }))}
                            className={`ps-amendment-delta-cell${isSelected ? ' ps-amendment-delta-cell--selected' : ''}`}
                          >
                            {formatValue(v.synopticAnswersSnapshot[key])}
                            {isOlder && <div className="ps-amendment-delta-warning">⚠ older value</div>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {deltaFields.length === 0 && (
                  <tr><td colSpan={total + 1} className="ps-amendment-delta-empty">No fields differ across prior versions — proceeding uses the most recent values for everything.</td></tr>
                )}
              </tbody>
            </table>

            <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
              <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onClose}>Cancel</button>
              <button onClick={handleConfirmDelta} className={`ps-amendment-submit ${isAmendment ? 'ps-amendment-submit--amendment' : 'ps-amendment-submit--correction'}`}>
                Confirm & Continue
              </button>
            </div>
          </>
        )}

        {step === 'edit' && (
          <>
            <div className="ps-amendment-mode-row">
              {(['correction', 'amendment', 'addendum'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => onModeChange(mode)}
                  className={`ps-amendment-mode-btn${amendmentMode === mode ? ' active' : ''} ps-amendment-mode-btn--${mode}`}
                >
                  {mode === 'correction' ? '🩹 Minor Amendment' : mode === 'amendment' ? '✏️ Major Amendment' : '📎 Addendum'}
                </button>
              ))}
            </div>

            <div className="ps-modal-dark-header">
              <span className={`ps-modal-dark-title ps-amendment-header-label ${isAmendment ? 'ps-amendment-header-label--amendment' : isCorrection ? 'ps-amendment-header-label--correction' : 'ps-amendment-header-label--addendum'}`}>
                {headerLabel}
              </span>
            </div>

            {/* Amendment Summary Box — FR-19 */}
            {isUnlockFlow && (
              <div className="ps-amendment-summary-box">
                <div className="ps-amendment-summary-row"><span className="ps-amendment-summary-label">{isAmendment ? 'Amended by' : 'Corrected by'}</span> {amendedByName}</div>
                <div className="ps-amendment-summary-row"><span className="ps-amendment-summary-label">Timestamp</span> {formatDateTime(new Date().toISOString())}</div>
              </div>
            )}

            {/* Changed Items Summary — FR-20, collapsible per UX-8 */}
            {isUnlockFlow && Object.keys(confirmedOverrides).length > 0 && (
              <div className="ps-amendment-changed-items">
                <button type="button" className="ps-amendment-changed-items-toggle" onClick={() => setChangedItemsOpen(o => !o)}>
                  {changedItemsOpen ? '▾' : '▸'} Changed Items Summary ({Object.keys(confirmedOverrides).length} field{Object.keys(confirmedOverrides).length === 1 ? '' : 's'} pulled from an earlier version)
                </button>
                {changedItemsOpen && (
                  <table className="ps-amendment-matrix">
                    <thead><tr><th>Field</th><th>Value used</th><th>Source version</th></tr></thead>
                    <tbody>
                      {Object.entries(confirmedOverrides).map(([key, o]) => (
                        <tr key={key}><td>{key}</td><td>{formatValue(o.value)}</td><td>{versionLabel(o.sourceVersionNumber, total)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <p className="ps-modal-dark-body">
              {isAmendment
                ? 'A Major Amendment is a diagnostic or clinical revision to a finalized report — staging, classification, or interpretation is changing. Requires a Clinical Notification Log.'
                : isCorrection
                ? 'A Minor Amendment (correction) fixes an administrative or clerical error — a specimen label, a misspelled name — without changing the diagnosis. No clinical notification required, but the explanation below is still the required audit trail.'
                : 'An addendum is new, additional information appended to a finalized report (e.g. IHC, molecular/FISH results, outside consultation) that does not change the original diagnostic text. The original report remains entirely untouched.'
              }{' '}
              Applies to <strong className="ps-text-light">{activeSynopticTitle}</strong>.
            </p>

            {!isUnlockFlow && (
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Addendum title <span className="ps-conf-required">*</span></label>
                <input className="ps-conf-input" value={addendumTitle} onChange={e => setAddendumTitle(e.target.value)}
                  placeholder="e.g. Addendum: Immunohistochemical Staining Results" />
              </div>
            )}

            <textarea
              autoFocus
              value={amendmentText}
              onChange={e => onTextChange(e.target.value)}
              placeholder={
                isAmendment
                  ? 'Explanation of revision — describe the exact nature of the diagnostic change, e.g. "Amended to change diagnostic classification from adenoma to adenocarcinoma after department consensus review."'
                  : isCorrection
                  ? 'Explanation of correction — describe the clerical/administrative error being fixed, e.g. "Corrected specimen site label from left to right per accession record."'
                  : 'Describe the new clinical or diagnostic data being appended…'
              }
              rows={5}
              className="ps-amendment-textarea"
            />

            {isAmendment && (
              <div className="ps-intraop-action-block ps-amendment-notification-block">
                <label className="ps-conf-label ps-amendment-notification-label">Clinical Notification Log — required to release</label>
                <div className="ps-conf-form-field ps-amendment-physician-picker">
                  <label className="ps-conf-label">Clinician notified</label>
                  <input
                    className="ps-amendment-physician-search"
                    value={clinicianName || physicianQuery}
                    onChange={e => { setPhysicianQuery(e.target.value); setClinicianName(''); setShowPhysicianDropdown(true); }}
                    onFocus={e => {
                      // Seed the search with whatever's actually loaded in
                      // the field (default/resumed name), so the dropdown
                      // reflects that instead of an unrelated generic list —
                      // and select the text so typing immediately replaces it.
                      if (clinicianName) { setPhysicianQuery(clinicianName); setClinicianName(''); }
                      setShowPhysicianDropdown(true);
                      e.target.select();
                    }}
                    onBlur={() => setTimeout(() => setShowPhysicianDropdown(false), 150)}
                    placeholder="Search staff…"
                  />
                  {showPhysicianDropdown && filteredPhysicians.length > 0 && (
                    <div className="ps-amendment-physician-dropdown">
                      {filteredPhysicians.map(p => {
                        const fullName = `${p.givenNames} ${p.familyNames}`;
                        const contactRows = contactRowsFor(p);
                        return (
                          <div
                            key={p.id}
                            className="ps-amendment-physician-option"
                            onMouseDown={() => { setClinicianName(fullName); setSelectedPhysician(p); setPhysicianQuery(''); setShowPhysicianDropdown(false); }}
                          >
                            <span className={`ps-amendment-physician-avatar ${avatarColorClass(fullName)}`}>
                              {initials(p.givenNames, p.familyNames)}
                            </span>
                            <span className="ps-amendment-physician-info">
                              <span className="ps-amendment-physician-name">
                                {fullName}
                                {p.status === 'Unverified' && <span className="ps-amendment-physician-unverified"> · unverified</span>}
                              </span>
                              <span className="ps-amendment-physician-specialty">{p.specialty}</span>
                              {contactRows.length > 0 && (
                                <span className="ps-amendment-physician-contact">
                                  {contactRows.map((c, i) => (
                                    <span key={i} className={c.isPreferred ? 'ps-amendment-physician-contact-preferred' : undefined}>
                                      {c.icon} {c.value}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Persistent contact card for whoever's currently set —
                      visible without opening the dropdown, per feedback. */}
                  {!showPhysicianDropdown && selectedPhysician && (
                    <div className="ps-amendment-physician-selected-card">
                      <span className={`ps-amendment-physician-avatar ${avatarColorClass(clinicianName)}`}>
                        {initials(selectedPhysician.givenNames, selectedPhysician.familyNames)}
                      </span>
                      <span className="ps-amendment-physician-info">
                        <span className="ps-amendment-physician-specialty">{selectedPhysician.specialty}</span>
                        <span className="ps-amendment-physician-contact">
                          {contactRowsFor(selectedPhysician).map((c, i) => (
                            <span key={i} className={c.isPreferred ? 'ps-amendment-physician-contact-preferred' : undefined}>
                              {c.icon} {c.value}
                            </span>
                          ))}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label" htmlFor="amendment-notify-method">Method</label>
                  <select id="amendment-notify-method" className="ps-conf-select" value={method} onChange={e => setMethod(e.target.value as NotificationMethod | '')}>
                    <option value="">Select…</option>
                    {(Object.keys(NOTIFICATION_METHOD_LABEL) as NotificationMethod[]).map(m => (
                      <option key={m} value={m}>{NOTIFICATION_METHOD_LABEL[m]}</option>
                    ))}
                  </select>
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Date / time notified</label>
                  <input className="ps-input-dark" type="datetime-local" value={notifiedAt} onChange={e => setNotifiedAt(e.target.value)} />
                </div>
                <p className="ps-intraop-gate-note">This report cannot be released without who was notified and how — required for accreditation (CAP/RCPath) proof of clinical communication.</p>
              </div>
            )}

            {submitError && <p className="ps-intraop-gate-note ps-amendment-error-text">{submitError}</p>}

            <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
              <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onClose}>Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={"ps-amendment-submit" + (canSubmit ? (isAmendment ? " ps-amendment-submit--amendment" : isCorrection ? " ps-amendment-submit--correction" : " ps-amendment-submit--addendum") : " disabled")}
              >
                {isUnlockFlow ? '💾 Save Draft (unlocks for editing)' : '📎 Release Addendum'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default AmendmentModal;
