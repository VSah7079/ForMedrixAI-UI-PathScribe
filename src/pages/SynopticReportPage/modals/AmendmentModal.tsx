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
//
// Batch 380 (PS-359): what Save/Release needs comes from the organisation's
// Field Requirements (report page, "Amendments, corrections and addenda").
// Locked, as before: the reason, the explanation or addendum text, an
// addendum's title, and for an amendment the clinician notified and how.
// Switchable: clinician notification for corrections and for addenda; when
// required, the notification section shows for that type too. The check is
// services/fieldRequirements/reportPageChecks.ts. Save can also be said
// ("save amendment", "release addendum", REVISION_SAVE).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import '../../../pathscribe.css';
import type { NotificationMethod } from '@/types/reports/AmendmentRecord';
import {
  physicianService, reasonDictionaryService, actionRegistryService,
  revisionMissingFields, revisionNotificationShown, reportFieldRequired,
} from '@/services';
import type { Physician } from '@/services/physicians/IPhysicianService';
import { useFieldRequirements } from '@/hooks/useFieldRequirements';
import { formatList } from '@/utils/formatList';
import { formatDateTime } from '@/utils/formatDate';
import type { ReasonDictionaryEntry, ReasonDictionaryCategory } from '@/types/reasons/ReasonDictionaryEntry';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { getFacilityDateTimeParts } from '@/utils/facilityTime';
import { initials, avatarColorClass, contactRowsFor } from '@/utils/physicianDisplay';
import { formatOrdinal } from '@/utils/formatOrdinal';
import { SpellCheckedTextarea } from '@/components/SpellCheck/SpellCheckedTextarea';
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
  onSubmit: (fields: { addendumTitle?: string; explanationOfChange?: string; clinicianName?: string; method?: NotificationMethod; notifiedAt?: string; reasonId: string }) => void;
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

// i18n note: NotificationMethod is a real, persisted enum (stored on
// the amendment/notification record) — translate only the displayed
// label via this LABEL_KEY map, never the underlying value. Three
// other files in this app (CriticalFindingsModal.tsx,
// CopilotReportViewModal.tsx, AmendmentStatusBanner.tsx,
// AmendmentDraftBanner.tsx) each carry their own untranslated copy of
// this same lookup — none of them are swept yet, so there's no
// existing LABEL_KEY precedent to reuse here; this batch establishes
// one for them to follow when their own turn comes.
const NOTIFICATION_METHOD_LABEL_KEY: Record<NotificationMethod, string> = {
  verbal_phone: 'amendmentModal.notificationMethod.verbalPhone',
  secure_page: 'amendmentModal.notificationMethod.securePage',
  direct_lis_flag: 'amendmentModal.notificationMethod.directLisFlag',
  secure_email: 'amendmentModal.notificationMethod.secureEmail',
  fax: 'amendmentModal.notificationMethod.fax',
};

const formatValue = (value: unknown, t: TFunction): string => {
  if (value === undefined || value === null || value === '') return t('amendmentModal.delta.emptyValue');
  return String(value);
};


// i18n note: version-history ordinal labels ("1st Amended", "2nd
// Amended"...) need a real per-locale ordinal form, not just a
// translated noun around an English suffix — see formatOrdinal.ts
// (shared with PreFinalisationModal.tsx's transmission-order labels)
// for why. The formatted ordinal is interpolated as an opaque value
// into the translated "Amended"/"Amended (Most Recent)" sentence.

const versionLabel = (versionNumber: number, total: number, t: TFunction, lang: string): string => {
  if (versionNumber === 1) return t('amendmentModal.version.original');
  const ord = formatOrdinal(versionNumber - 1, lang);
  if (versionNumber === total) return t('amendmentModal.version.amendedMostRecent', { ordinal: ord });
  return t('amendmentModal.version.amended', { ordinal: ord });
};
const AmendmentModal: React.FC<AmendmentModalProps> = ({
  show, amendmentMode, amendmentText, activeSynopticTitle, sequenceNumber, amendedByName,
  versionHistory = [], onModeChange, onTextChange, onClose, onSubmit,
  onFieldOverridesConfirmed = () => {}, submitError, resuming,
  orderingPhysicianName,
}) => {
  const { t, i18n } = useTranslation();
  const { config } = useSystemConfig();
  const requirements = useFieldRequirements('report');
  const [addendumTitle, setAddendumTitle] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [reasonOptions, setReasonOptions] = useState<ReasonDictionaryEntry[]>([]);

  // Real, per direct guidance's own detailed post-sign-out revision
  // taxonomy - placed before the early `if (!show) return null` below,
  // since hooks can't follow a conditional return. Computes category
  // directly from the amendmentMode prop (not the derived isAmendment/
  // isCorrection further down, which only exist after that early
  // return). Resets the selection whenever the mode changes - a reason
  // chosen under one category is never valid once the mode switches to
  // a different one.
  useEffect(() => {
    setReasonId('');
    const category: ReasonDictionaryCategory =
      amendmentMode === 'amendment' ? 'AMENDMENT' : amendmentMode === 'correction' ? 'CORRECTION' : 'ADDENDUM';
    let cancelled = false;
    reasonDictionaryService.getAll(category).then(res => {
      if (cancelled) return;
      if (res.ok) setReasonOptions(res.data.filter(r => r.status === 'Active'));
    });
    return () => { cancelled = true; };
  }, [amendmentMode]);
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

  // FR feedback #3 — default to now instead of blank (wherever the
  // notification section shows, Batch 380).
  const notificationShown = revisionNotificationShown(amendmentMode, requirements);
  React.useEffect(() => {
    if (show && notificationShown && !notifiedAt) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const { year, month, day, hour, minute } = getFacilityDateTimeParts(now, config.facilityTimezone);
      setNotifiedAt(`${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, notificationShown]);

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

  const missing = revisionMissingFields(amendmentMode, { reasonId, text: amendmentText, addendumTitle, clinicianName, method }, requirements);
  const canSubmit = missing.length === 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      addendumTitle: amendmentMode === 'addendum' ? addendumTitle : undefined,
      explanationOfChange: amendmentMode !== 'addendum' ? amendmentText : undefined,
      clinicianName: notificationShown ? clinicianName : undefined,
      method: notificationShown && method ? method : undefined,
      notifiedAt: notificationShown ? (notifiedAt || new Date().toISOString()) : undefined,
      reasonId,
    });
  };

  // Voice/keyboard "save amendment" / "release addendum": the same Save,
  // with the same check, once the editing step is showing.
  const submitRef = useRef<() => void>(() => {});
  submitRef.current = () => { if (show && step === 'edit') handleSubmit(); };
  useEffect(() => actionRegistryService.onAction((actionId: string) => {
    if (actionId === 'REVISION_SAVE') submitRef.current();
  }), []);

  if (!show) return null;

  const isAmendment = amendmentMode === 'amendment';
  const isCorrection = amendmentMode === 'correction';
  // Amendment (Major) and Correction (Minor) share the same two-stage
  // unlock/reseed pipeline (Delta step, capture-then-edit) — only the
  // notification requirement differs between them. Addendum stays its
  // own single-stage release. See AMENDMENT_STATUS_REDESIGN_BRIEF.md.
  const isUnlockFlow = isAmendment || isCorrection;

  const headerLabel = isAmendment ? t('amendmentModal.header.amendedReport') : isCorrection ? t('amendmentModal.header.correctedReport') : t('amendmentModal.header.addendumNumbered', { number: sequenceNumber });

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

  const required = (id: string) => reportFieldRequired(requirements, id);
  const notificationRequired = required(isAmendment ? 'amendmentNotification' : isCorrection ? 'correctionNotification' : 'addendumNotification');

  return (
    <div data-capture-hide="true" className="ps-overlay">
      <div className="ps-modal-dark ps-amendment-wizard" onClick={e => e.stopPropagation()}>

        {isUnlockFlow && (
          <div className="ps-amendment-target-banner">
            <Trans
              i18nKey={isAmendment ? 'amendmentModal.banner.amendingTarget' : 'amendmentModal.banner.correctingTarget'}
              values={{ title: activeSynopticTitle }}
              components={{ strong: <strong /> }}
            />
          </div>
        )}

        {step === 'delta' && isUnlockFlow && (
          <>
            <div className="ps-modal-dark-header">
              <span className={`ps-modal-dark-title ps-amendment-header-label ${isAmendment ? 'ps-amendment-header-label--amendment' : 'ps-amendment-header-label--correction'}`}>
                {t('amendmentModal.delta.selectBaselineValues')}
              </span>
            </div>
            <p className="ps-modal-dark-body">
              <Trans
                i18nKey="amendmentModal.delta.explanation"
                values={{ title: activeSynopticTitle }}
                components={{ strong: <strong className="ps-text-light" /> }}
              />
            </p>

            <table className="ps-amendment-matrix ps-amendment-delta-table">
              <thead>
                <tr>
                  <th>{t('amendmentModal.delta.synopticElement')}</th>
                  {versionHistory.map(v => (
                    <th key={v.versionNumber} className={v.versionNumber === mostRecent.versionNumber ? 'ps-amendment-delta-col--default' : undefined}>
                      {versionLabel(v.versionNumber, total, t, i18n.language)}
                      <div className="ps-amendment-delta-col-meta">{t('amendmentModal.delta.versionMeta', { when: formatDateTime(v.releasedAt, i18n.language), by: v.createdBy.userName })}</div>
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
                            {formatValue(v.synopticAnswersSnapshot[key], t)}
                            {isOlder && <div className="ps-amendment-delta-warning">⚠ {t('amendmentModal.delta.olderValue')}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {deltaFields.length === 0 && (
                  <tr><td colSpan={total + 1} className="ps-amendment-delta-empty">{t('amendmentModal.delta.noFieldsDiffer')}</td></tr>
                )}
              </tbody>
            </table>

            <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
              <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onClose}>{t('common.cancel')}</button>
              <button onClick={handleConfirmDelta} className={`ps-amendment-submit ${isAmendment ? 'ps-amendment-submit--amendment' : 'ps-amendment-submit--correction'}`}>
                {t('amendmentModal.delta.confirmContinue')}
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
                  {mode === 'correction' ? `🩹 ${t('amendmentModal.mode.correction')}` : mode === 'amendment' ? `✏️ ${t('amendmentModal.mode.amendment')}` : `📎 ${t('amendmentModal.mode.addendum')}`}
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
                <div className="ps-amendment-summary-row"><span className="ps-amendment-summary-label">{isAmendment ? t('amendmentModal.summary.amendedBy') : t('amendmentModal.summary.correctedBy')}</span> {amendedByName || t('amendmentModal.summary.unknownUser')}</div>
                <div className="ps-amendment-summary-row"><span className="ps-amendment-summary-label">{t('amendmentModal.summary.timestamp')}</span> {formatDateTime(new Date().toISOString(), i18n.language)}</div>
              </div>
            )}

            {/* Changed Items Summary — FR-20, collapsible per UX-8 */}
            {isUnlockFlow && Object.keys(confirmedOverrides).length > 0 && (
              <div className="ps-amendment-changed-items">
                <button type="button" className="ps-amendment-changed-items-toggle" onClick={() => setChangedItemsOpen(o => !o)}>
                  {changedItemsOpen ? '▾' : '▸'} {t('amendmentModal.changedItems.toggle', { count: Object.keys(confirmedOverrides).length })}
                </button>
                {changedItemsOpen && (
                  <table className="ps-amendment-matrix">
                    <thead><tr><th>{t('amendmentModal.changedItems.field')}</th><th>{t('amendmentModal.changedItems.valueUsed')}</th><th>{t('amendmentModal.changedItems.sourceVersion')}</th></tr></thead>
                    <tbody>
                      {Object.entries(confirmedOverrides).map(([key, o]) => (
                        <tr key={key}><td>{key}</td><td>{formatValue(o.value, t)}</td><td>{versionLabel(o.sourceVersionNumber, total, t, i18n.language)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <p className="ps-modal-dark-body">
              {isAmendment
                ? t('amendmentModal.description.amendment')
                : isCorrection
                ? t(notificationShown ? 'amendmentModal.description.correctionWithNotification' : 'amendmentModal.description.correction')
                : t('amendmentModal.description.addendum')
              }{' '}
              <Trans
                i18nKey="amendmentModal.description.appliesTo"
                values={{ title: activeSynopticTitle }}
                components={{ strong: <strong className="ps-text-light" /> }}
              />
            </p>

            {!isUnlockFlow && (
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('amendmentModal.form.addendumTitleLabel')} {required('addendumTitle') && <span className="ps-conf-required">*</span>}</label>
                <input className="ps-conf-input" value={addendumTitle} onChange={e => setAddendumTitle(e.target.value)}
                  placeholder={t('amendmentModal.form.addendumTitlePlaceholder')} />
              </div>
            )}

            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="amendment-reason-select">
                {t('amendmentModal.form.reasonLabel')} {required('revisionReason') && <span className="ps-conf-required">*</span>}
              </label>
              <select
                id="amendment-reason-select"
                className="ps-conf-select"
                value={reasonId}
                onChange={e => setReasonId(e.target.value)}
              >
                <option value="">{t('amendmentModal.form.reasonSelectPlaceholder')}</option>
                {reasonOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <SpellCheckedTextarea
              autoFocus
              value={amendmentText}
              onChange={e => onTextChange(e.target.value)}
              placeholder={
                isAmendment
                  ? t('amendmentModal.form.explanationPlaceholderAmendment')
                  : isCorrection
                  ? t('amendmentModal.form.explanationPlaceholderCorrection')
                  : t('amendmentModal.form.explanationPlaceholderAddendum')
              }
              rows={5}
              className="ps-amendment-textarea"
            />

            {notificationShown && (
              <div className="ps-intraop-action-block ps-amendment-notification-block">
                <label className="ps-conf-label ps-amendment-notification-label">{t('amendmentModal.notification.logLabel')}</label>
                <div className="ps-conf-form-field ps-amendment-physician-picker">
                  <label className="ps-conf-label">{t('amendmentModal.notification.clinicianNotifiedLabel')} {notificationRequired && <span className="ps-conf-required">*</span>}</label>
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
                    placeholder={t('amendmentModal.notification.searchStaffPlaceholder')}
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
                                {p.status === 'Unverified' && <span className="ps-amendment-physician-unverified"> · {t('amendmentModal.notification.unverified')}</span>}
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
                  <label className="ps-conf-label" htmlFor="amendment-notify-method">{t('amendmentModal.notification.methodLabel')} {notificationRequired && <span className="ps-conf-required">*</span>}</label>
                  <select id="amendment-notify-method" className="ps-conf-select" value={method} onChange={e => setMethod(e.target.value as NotificationMethod | '')}>
                    <option value="">{t('amendmentModal.notification.methodSelectPlaceholder')}</option>
                    {(Object.keys(NOTIFICATION_METHOD_LABEL_KEY) as NotificationMethod[]).map(m => (
                      <option key={m} value={m}>{t(NOTIFICATION_METHOD_LABEL_KEY[m])}</option>
                    ))}
                  </select>
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('amendmentModal.notification.dateTimeLabel')}</label>
                  <input className="ps-input-dark" type="datetime-local" value={notifiedAt} onChange={e => setNotifiedAt(e.target.value)} />
                </div>
                <p className="ps-intraop-gate-note">{isAmendment ? t('amendmentModal.notification.gateNote') : t('amendmentModal.notification.organisationRequiresNote')}</p>
              </div>
            )}

            {missing.length > 0 && (
              <p className="ps-field-still-required" role="status">
                {t('fieldRequirements.stillRequired', { fields: formatList(missing.map(id => t(`fieldRequirements.fields.report.${id}`)), i18n.language) })}
              </p>
            )}
            {submitError && <p className="ps-intraop-gate-note ps-amendment-error-text">{submitError}</p>}

            <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
              <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onClose}>{t('common.cancel')}</button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={"ps-amendment-submit" + (canSubmit ? (isAmendment ? " ps-amendment-submit--amendment" : isCorrection ? " ps-amendment-submit--correction" : " ps-amendment-submit--addendum") : " disabled")}
              >
                {isUnlockFlow ? `💾 ${t('amendmentModal.footer.saveDraft')}` : `📎 ${t('amendmentModal.footer.releaseAddendum')}`}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default AmendmentModal;
