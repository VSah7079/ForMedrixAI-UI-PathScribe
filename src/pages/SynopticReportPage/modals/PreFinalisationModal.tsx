// src/pages/SynopticReportPage/modals/PreFinalisationModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen pre-finalisation review.
//
// Layout:
//   Header (case + mode)
//   ┌─── LEFT (38%) ──────┬─── RIGHT (62%) ─────────────────────┐
//   │ Specimens (draggable)│ Report preview — as sent to LIS     │
//   │ Synoptic ordering   │ Q&A format, updates on reorder       │
//   └─────────────────────┴──────────────────────────────────────┘
//   Signing panel (biometric → password fallback)
//
// Batch 344 (PS-60 follow-up): the signing panel now confirms who is
// signing through services/auth/signerConfirmation.ts. Before, any password
// of three characters or more was accepted, and the panel named the case's
// assigned pathologist rather than the person actually signed in. It now
// names the signed-in user, checks the password (or, for an SSO session,
// has the identity provider ask again), and offers the biometric button only
// in demo builds, because the WebAuthn check is still simulated. The
// biometric "cadence" shortcut that signed with no action at all is gone: a
// signature always takes a deliberate click.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { biometricService } from '@/services';
import { useAuth } from '@/contexts/AuthContext';
import { SignerConfirmationFields } from '@/components/Signing/SignerConfirmationFields';
import { useSignerConfirmation } from '@/hooks/useSignerConfirmation';
import type { SignatureConfirmation } from '@/services/auth/signerConfirmation';
import { formatOrdinal } from '@/utils/formatOrdinal';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SynopticForReview {
  instanceId:    string;
  templateName:  string;
  specimenId:    string;
  specimenLabel: string;
  specimenDesc:  string;
  answers:       Record<string, string | string[]>;
  fieldLabels:   Record<string, string>;
  fieldOrder:    string[];
  /** Real CAP/RCPath section structure (Specimen/Tumor/Margins/...),
   *  same grouping the main editor's tabs use. Optional — falls back to
   *  a flat list if a template's sections couldn't be loaded. */
  sections?:       { title: string; fieldKeys: string[] }[];
  answeredCount:   number;
  totalCount:      number;
  requiredFields?: string[];   // field keys marked required — empty fields here block sign-out
  status:          string;
}

interface StagedSpecimen {
  specimenId:    string;
  specimenLabel: string;
  specimenDesc:  string;
  synoptics:     StagedSynoptic[];
}

interface StagedSynoptic {
  instanceId:    string;
  templateName:  string;
  answeredCount:   number;
  totalCount:      number;
  requiredFields?: string[];
  answers:       Record<string, string | string[]>;
  fieldLabels:   Record<string, string>;
  fieldOrder:    string[];
  sections?:     { title: string; fieldKeys: string[] }[];
}

interface Props {
  show:             boolean;
  caseAccession:    string;
  patientName:      string;
  reportingMode:    'assisted' | 'pathscribe';
  synoptics:        SynopticForReview[];
  finalizeAndNext?:  boolean;
  onJumpToField?:    (instanceId: string, fieldKey: string) => void;
  /** Runs only after the signer has been confirmed (Batch 344). */
  onConfirm:         (orderedInstanceIds: string[], excludedInstanceIds: string[], confirmation: SignatureConfirmation) => void;
  onCancel:          () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildStaged(synoptics: SynopticForReview[]): StagedSpecimen[] {
  const map = new Map<string, StagedSpecimen>();
  synoptics.forEach(syn => {
    if (!map.has(syn.specimenId)) {
      map.set(syn.specimenId, {
        specimenId:    syn.specimenId,
        specimenLabel: syn.specimenLabel,
        specimenDesc:  syn.specimenDesc,
        synoptics:     [],
      });
    }
    map.get(syn.specimenId)!.synoptics.push({
      instanceId:    syn.instanceId,
      templateName:  syn.templateName,
      answeredCount:   syn.answeredCount,
      totalCount:      syn.totalCount,
      requiredFields:  syn.requiredFields ?? [],
      answers:       syn.answers,
      fieldLabels:   syn.fieldLabels,
      fieldOrder:    syn.fieldOrder,
      sections:      syn.sections,
    });
  });
  return Array.from(map.values());
}

function fmt(val: string | string[] | undefined): string {
  if (!val || val === '') return '—';
  if (Array.isArray(val)) return val.length ? val.join(', ') : '—';
  return String(val);
}

// Real, persisted case-level mode — 'pathscribe' means Orchestration
// (PathScribe owns the report); "Orchestration" itself is treated as
// the fixed PathScribe module name elsewhere in the app (e.g.
// staffTab's own Orchestration Access strings) and stays literal in
// every locale, while "mode" translates around it.
const REPORTING_MODE_LABEL_KEY: Record<Props['reportingMode'], string> = {
  assisted:   'preFinalisationModal.mode.assisted',
  pathscribe: 'preFinalisationModal.mode.orchestration',
};

// ── Q&A Preview (right pane) ──────────────────────────────────────────────────

const ReportPreview: React.FC<{ staged: StagedSpecimen[] }> = ({ staged }) => {
  const { t } = useTranslation();
  const included = staged.flatMap(sp =>
    sp.synoptics.map(s => ({ ...s, sp }))
  );

  if (included.length === 0) {
    return (
      <div className="ps-prefin-preview-empty">
        {t('preFinalisationModal.preview.noReports')}
      </div>
    );
  }

  return (
    <div className="ps-prefin-preview-content">
      {included.map(({ sp, ...syn }) => {
        const answeredFields = new Set(
          syn.fieldOrder.filter(fid => syn.answers[fid] !== undefined && syn.answers[fid] !== '')
        );
        // Group by real section structure when available; fall back to
        // one flat "unsectioned" group only if a template's sections
        // genuinely couldn't be loaded (see buildSynopticsForReview).
        const groups: { title: string | null; fieldKeys: string[] }[] =
          syn.sections && syn.sections.length > 0
            ? syn.sections.map(s => ({ title: s.title, fieldKeys: s.fieldKeys.filter(k => answeredFields.has(k)) }))
            : [{ title: null, fieldKeys: syn.fieldOrder.filter(k => answeredFields.has(k)) }];
        const anyAnswered = groups.some(g => g.fieldKeys.length > 0);
        return (
          <div key={syn.instanceId} className="ps-prefin-preview-report">
            <div className="ps-prefin-preview-report-header">
              <span className="ps-prefin-preview-specimen-badge">{sp.specimenLabel}</span>
              <div>
                <div className="ps-prefin-preview-report-name">{syn.templateName}</div>
                <div className="ps-prefin-preview-report-specimen">{sp.specimenDesc}</div>
              </div>
            </div>
            {!anyAnswered ? (
              <div className="ps-prefin-preview-empty-fields">{t('preFinalisationModal.preview.noFieldsCompleted')}</div>
            ) : groups.filter(g => g.fieldKeys.length > 0).map(group => (
              <div key={group.title ?? '_flat'} className="ps-prefin-preview-section">
                {group.title && (
                  <div className="ps-prefin-preview-section-title">{group.title}</div>
                )}
                <div className="ps-prefin-preview-qa">
                  {group.fieldKeys.map((fid, i) => (
                    <div key={fid} className={`ps-prefin-preview-qa-row${i < group.fieldKeys.length - 1 ? '' : ' ps-prefin-preview-qa-row--last'}`}>
                      <span className="ps-prefin-preview-qa-label">
                        {syn.fieldLabels[fid] ?? fid.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}
                      </span>
                      <span className="ps-prefin-preview-qa-value">{fmt(syn.answers[fid])}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// ── Signing panel ─────────────────────────────────────────────────────────────

type BioStep = 'idle' | 'pending' | 'failed' | 'verified';

const SigningPanel: React.FC<{
  caseRef:         string;
  totalCount:      number;
  finalizeAndNext: boolean;
  onSign:          (confirmation: SignatureConfirmation) => void;
  onCancel:        () => void;
}> = ({ caseRef, totalCount, finalizeAndNext, onSign, onCancel }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const signer = useSignerConfirmation('report-finalize', caseRef || null);
  const [showBio,    setShowBio]    = React.useState(false);
  const [bioStep,    setBioStep]    = React.useState<BioStep>('idle');
  const [deviceName, setDeviceName] = React.useState(t('preFinalisationModal.signing.biometricDefault'));
  const [bioFailMsg, setBioFailMsg] = React.useState('');
  const userId = user?.id ?? '';

  // Biometric is offered only in demo builds (simulated WebAuthn), only when
  // the institution has turned it on, and only if this user is enrolled.
  React.useEffect(() => {
    if (!signer.biometricAllowed || !userId || !biometricService.getBiometricPolicy().enabled) return;
    let live = true;
    biometricService.isBiometricAvailable().then(avail => {
      if (!live) return;
      setShowBio(!!biometricService.getCredentialForUser(userId) && avail);
      setDeviceName(biometricService.getDeviceName());
    });
    return () => { live = false; };
  }, [signer.biometricAllowed, userId]);

  const handleBio = () => {
    setBioStep('pending'); setBioFailMsg('');
    void signer.confirmBiometric().then(c => {
      if (c) { setBioStep('verified'); setTimeout(() => onSign(c), 400); }
      else { setBioStep('failed'); setBioFailMsg(t('preFinalisationModal.signing.bioNotRecognised')); }
    });
  };

  // Straight from the click: for SSO this opens the provider's popup.
  const handleConfirm = () => { void signer.confirm().then(c => { if (c) onSign(c); }); };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); handleConfirm(); };

  return (
    <div className="ps-prefin-signing">
      {bioFailMsg && <div className="ps-prefin-signing-biofail">⚠ {bioFailMsg}</div>}
      <div className="ps-prefin-signing-row">
        <div className="ps-prefin-signing-identity">
          <p className="ps-prefin-signing-meta">
            {t('preFinalisationModal.signing.synopticsTransmitted', { count: totalCount })}
            {finalizeAndNext && <span className="ps-prefin-signing-next"> · {t('preFinalisationModal.signing.nextCaseQueued')}</span>}
          </p>
        </div>

        {showBio && bioStep !== 'failed' && (
          <>
            <button
              type="button"
              onClick={handleBio}
              disabled={bioStep === 'pending' || bioStep === 'verified'}
              className={`ps-prefin-bio-btn${bioStep === 'verified' ? ' ps-prefin-bio-btn--verified' : ''}`}
            >
              <span>{bioStep === 'verified' ? '✓' : bioStep === 'pending' ? '⏳' : '👆'}</span>
              {bioStep === 'verified' ? t('preFinalisationModal.signing.verified') : bioStep === 'pending' ? t('preFinalisationModal.signing.verifying') : deviceName}
            </button>
            <span className="ps-prefin-signing-or">{t('preFinalisationModal.signing.or')}</span>
          </>
        )}

        <form onSubmit={handleSubmit} className="ps-prefin-pw-form">
          <SignerConfirmationFields signer={signer} onSubmit={handleConfirm} variant="inline" />
          <button type="submit" className="ps-btn-primary ps-prefin-nowrap" disabled={signer.busy || signer.method === 'unavailable'}>
            {signer.busy
              ? t('signerConfirmation.confirming')
              : finalizeAndNext ? `${t('preFinalisationModal.signing.finaliseAndNext')} →` : `${t('preFinalisationModal.signing.finaliseNow')} 🔒`}
          </button>
        </form>

        <button type="button" onClick={onCancel} className="ps-btn-ghost-dark">{t('common.cancel')}</button>
      </div>
    </div>
  );
};

// ── Drag handle ───────────────────────────────────────────────────────────────

const DragHandle = () => (
  <div className="ps-prefin-drag-handle">
    {[0,1,2].map(i => <div key={i} className="ps-prefin-drag-handle-bar" />)}
  </div>
);

// ── Main modal ────────────────────────────────────────────────────────────────

export const PreFinalisationModal: React.FC<Props> = ({
  show, caseAccession, patientName, reportingMode,
  synoptics,
  finalizeAndNext = false, onJumpToField, onConfirm, onCancel,
}) => {
  const { t, i18n } = useTranslation();
  const [staged, setStaged] = React.useState<StagedSpecimen[]>([]);
  const [dragSrc, setDragSrc] = React.useState<{ type: 'specimen' | 'synoptic'; si: number; syi: number } | null>(null);
  const [dragOver, setDragOver] = React.useState<{ si: number; syi: number } | null>(null);

  React.useEffect(() => { if (show) setStaged(buildStaged(synoptics)); }, [show, synoptics]);

  if (!show) return null;

  const all = staged.flatMap(sp => sp.synoptics);
  const totalCount    = all.length;

  const onDragStart = (e: React.DragEvent, type: 'specimen' | 'synoptic', si: number, syi: number) => {
    setDragSrc({ type, si, syi }); e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent, si: number, syi: number) => {
    if (!dragSrc) return;
    if (dragSrc.type === 'synoptic' && dragSrc.si !== si) return;
    e.preventDefault(); setDragOver({ si, syi });
  };
  const onDrop = (e: React.DragEvent, si: number, syi: number) => {
    e.preventDefault();
    if (!dragSrc) return;
    setStaged(prev => {
      const next = prev.map(sp => ({ ...sp, synoptics: [...sp.synoptics] }));
      if (dragSrc.type === 'specimen' && si !== dragSrc.si) {
        const [m] = next.splice(dragSrc.si, 1); next.splice(si, 0, m);
      } else if (dragSrc.type === 'synoptic' && dragSrc.si === si && syi !== dragSrc.syi) {
        const syns = next[si].synoptics;
        const [m] = syns.splice(dragSrc.syi, 1); syns.splice(syi, 0, m);
      }
      return next;
    });
    setDragSrc(null); setDragOver(null);
  };
  const onDragEnd = () => { setDragSrc(null); setDragOver(null); };

  const handleSign = (confirmation: SignatureConfirmation) => {
    const ordered = staged.flatMap(sp => sp.synoptics.map(s => s.instanceId));
    onConfirm(ordered, [], confirmation);
  };

  return (
    <div className="ps-prefin-overlay">
      <div className="ps-prefin-shell">

        {/* ── Header ── */}
        <div className="ps-prefin-header">
          <div className="ps-prefin-header-left">
            <div className="ps-prefin-header-row">
              <h2 className="ps-prefin-title">{t('preFinalisationModal.header.title')}</h2>
              <span className={`ps-prefin-mode-badge${reportingMode === 'assisted' ? ' ps-prefin-mode-badge--copilot' : ' ps-prefin-mode-badge--pathscribe'}`}>
                {t(REPORTING_MODE_LABEL_KEY[reportingMode])}
              </span>
            </div>
            <p className="ps-prefin-header-meta" data-phi="true">{caseAccession} · {patientName}</p>
          </div>
          <div className="ps-prefin-header-hint">
            <div>{t('preFinalisationModal.header.dragHint')}</div>
            <div>{t('preFinalisationModal.header.lockedHint')}</div>
          </div>
        </div>

        {/* ── Two-pane body ── */}
        <div className="ps-prefin-body">

          {/* LEFT — specimen/synoptic controls */}
          <div className="ps-prefin-left">
            {staged.map((sp, si) => {
              const spDragOver = dragOver?.si === si && dragOver?.syi === -1 && dragSrc?.type === 'specimen';
              return (
                <div
                  key={sp.specimenId}
                  draggable
                  onDragStart={e => onDragStart(e, 'specimen', si, -1)}
                  onDragOver={e => onDragOver(e, si, -1)}
                  onDrop={e => onDrop(e, si, -1)}
                  onDragEnd={onDragEnd}
                  className={`ps-prefin-specimen-card${spDragOver ? ' ps-prefin-specimen-card--dragover' : ''}${dragSrc?.type === 'specimen' && dragSrc.si === si ? ' ps-prefin-specimen-card--dragging' : ''}`}
                >
                  {/* Specimen header */}
                  <div className="ps-prefin-specimen-header">
                    <DragHandle />
                    <div className="ps-prefin-specimen-avatar">{sp.specimenLabel}</div>
                    <div>
                      <p className="ps-prefin-specimen-name">{t('preFinalisationModal.specimen.nameLine', { label: sp.specimenLabel, desc: sp.specimenDesc })}</p>
                      <p className="ps-prefin-specimen-order">{t('preFinalisationModal.specimen.transmitsOrder', { ordinal: formatOrdinal(si + 1, i18n.language) })}</p>
                    </div>
                  </div>

                  {/* Synoptics */}
                  {sp.synoptics.map((syn, syi) => {
                    const synDragOver = dragOver?.si === si && dragOver?.syi === syi && dragSrc?.type === 'synoptic';
                    return (
                      <div
                        key={syn.instanceId}
                        draggable={sp.synoptics.length > 1}
                        onDragStart={e => { e.stopPropagation(); onDragStart(e, 'synoptic', si, syi); }}
                        onDragOver={e => { e.stopPropagation(); onDragOver(e, si, syi); }}
                        onDrop={e => { e.stopPropagation(); onDrop(e, si, syi); }}
                        className={`ps-prefin-synoptic-row${synDragOver ? ' ps-prefin-synoptic-row--dragover' : ''}${dragSrc?.si === si && dragSrc?.syi === syi && dragSrc?.type === 'synoptic' ? ' ps-prefin-synoptic-row--dragging' : ''}`}
                      >
                        <div className="ps-prefin-synoptic-header">
                          <div className="ps-prefin-synoptic-info">
                            <p className="ps-prefin-synoptic-name">{syn.templateName}</p>
                            <p className="ps-prefin-synoptic-meta">
                              {t('preFinalisationModal.synoptic.fieldsCount', { answered: syn.answeredCount, total: syn.totalCount })}
                            </p>
                            {(() => {
                              const emptyRequired = (syn.requiredFields ?? []).filter(k => {
                                const v = syn.answers[k];
                                return v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0);
                              });
                              const emptyOptional = syn.fieldOrder.filter(k => {
                                const v = syn.answers[k];
                                const isEmpty = v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0);
                                return isEmpty && !(syn.requiredFields ?? []).includes(k);
                              });
                              return (
                                <>
                                  {emptyRequired.length > 0 && (
                                    <div className="ps-prefin-fields-warn ps-prefin-fields-warn--required">
                                      <span>🔴 {t('preFinalisationModal.fields.requiredIncomplete', { count: emptyRequired.length })}</span>
                                      {onJumpToField && (
                                        <div className="ps-prefin-field-list">
                                          {emptyRequired.map(k => (
                                            <button key={k} className="ps-prefin-field-jump-btn"
                                              onClick={() => { onJumpToField!(syn.instanceId, k); onCancel(); }}>
                                              ↗ {syn.fieldLabels[k] ?? k}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {emptyOptional.length > 0 && emptyRequired.length === 0 && (
                                    <p className="ps-prefin-fields-warn ps-prefin-fields-warn--optional">
                                      ⚠ {t('preFinalisationModal.fields.optionalEmpty', { count: emptyOptional.length })}&nbsp;
                                      {emptyOptional.slice(0, 3).map(k => syn.fieldLabels[k] || k).join(', ')}
                                      {emptyOptional.length > 3 && ` ${t('preFinalisationModal.fields.moreCount', { count: emptyOptional.length - 3 })}`}
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* RIGHT — live report preview */}
          <div className="ps-prefin-right">
            <div className="ps-prefin-preview-header">
              <span className="ps-prefin-preview-title">{t('preFinalisationModal.preview.title')}</span>
            </div>
            <div className="ps-prefin-preview-scroll">
              <ReportPreview staged={staged} />
            </div>
          </div>
        </div>

        {/* ── Signing panel ── */}
        <SigningPanel
          caseRef={caseAccession}
          totalCount={totalCount}
          finalizeAndNext={finalizeAndNext}
          onSign={handleSign}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
};

export default PreFinalisationModal;
