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
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import '../../../pathscribe.css';
import {
  isBiometricAvailable,
  isBiometricCurrentForUser,
  verifyBiometric,
  getCredentialForUser,
  getDeviceName,
  getBiometricPolicy,
} from '@/services/biometric/mockBiometricService';

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
  userId:           string;
  userDisplayName:  string;
  userCredentials:  string;
  finalizeAndNext?:  boolean;
  onJumpToField?:    (instanceId: string, fieldKey: string) => void;
  onConfirm:         (orderedInstanceIds: string[], excludedInstanceIds: string[]) => void;
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

const ordinal = (i: number) =>
  ['First','Second','Third','Fourth','Fifth','Sixth'][i] ?? `${i+1}th`;

// ── Q&A Preview (right pane) ──────────────────────────────────────────────────

const ReportPreview: React.FC<{ staged: StagedSpecimen[] }> = ({ staged }) => {
  const included = staged.flatMap(sp =>
    sp.synoptics.map(s => ({ ...s, sp }))
  );

  if (included.length === 0) {
    return (
      <div className="ps-prefin-preview-empty">
        No synoptic reports to transmit.
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
              <div className="ps-prefin-preview-empty-fields">No fields completed</div>
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
  userId:          string;
  userDisplayName: string;
  userCredentials: string;
  totalCount:      number;
  finalizeAndNext: boolean;
  onSign:          () => void;
  onCancel:        () => void;
}> = ({ userId, userDisplayName, userCredentials, totalCount, finalizeAndNext, onSign, onCancel }) => {
  const [showBio,    setShowBio]    = React.useState(false);
  const [bioStep,    setBioStep]    = React.useState<BioStep>('idle');
  const [deviceName, setDeviceName] = React.useState('Biometric');
  const [password,   setPassword]   = React.useState('');
  const [pwError,    setPwError]    = React.useState('');
  const [bioFailMsg, setBioFailMsg] = React.useState('');
  const pwRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const policy = getBiometricPolicy();
    if (!policy.enabled) { setTimeout(() => pwRef.current?.focus(), 100); return; }
    if (isBiometricCurrentForUser(userId)) { setBioStep('verified'); setTimeout(onSign, 400); return; }
    isBiometricAvailable().then(avail => {
      const enrolled = !!getCredentialForUser(userId) && avail;
      setShowBio(enrolled);
      setDeviceName(getDeviceName());
      if (!enrolled) setTimeout(() => pwRef.current?.focus(), 100);
    });
  }, [userId, onSign]);

  const handleBio = async () => {
    setBioStep('pending'); setBioFailMsg('');
    const r = await verifyBiometric(userId);
    if (r.ok) { setBioStep('verified'); setTimeout(onSign, 400); }
    else { setBioStep('failed'); setBioFailMsg('Biometric didn\'t recognise you — please use your password.'); setTimeout(() => pwRef.current?.focus(), 100); }
  };

  const handlePw = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) { setPwError('Password is required.'); return; }
    if (password.length < 3) { setPwError('Incorrect password.'); return; }
    setPwError(''); onSign();
  };

  return (
    <div className="ps-prefin-signing">
      {bioFailMsg && <div className="ps-prefin-signing-biofail">⚠ {bioFailMsg}</div>}
      <div className="ps-prefin-signing-row">
        <div className="ps-prefin-signing-identity">
          <p className="ps-prefin-signing-name">
            Signing as {userDisplayName}{userCredentials ? ` · ${userCredentials}` : ''}
          </p>
          <p className="ps-prefin-signing-meta">
            {totalCount} synoptic{totalCount !== 1 ? 's' : ''} transmitted
            {finalizeAndNext && <span className="ps-prefin-signing-next"> · next case queued</span>}
          </p>
        </div>

        {showBio && bioStep !== 'failed' && (
          <>
            <button
              onClick={handleBio}
              disabled={bioStep === 'pending' || bioStep === 'verified'}
              className={`ps-prefin-bio-btn${bioStep === 'verified' ? ' ps-prefin-bio-btn--verified' : ''}`}
            >
              <span>{bioStep === 'verified' ? '✓' : bioStep === 'pending' ? '⏳' : '👆'}</span>
              {bioStep === 'verified' ? 'Verified' : bioStep === 'pending' ? 'Verifying…' : deviceName}
            </button>
            <span className="ps-prefin-signing-or">or</span>
          </>
        )}

        <form onSubmit={handlePw} className="ps-prefin-pw-form">
          <div>
            <input
              ref={pwRef}
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setPwError(''); }}
              placeholder={showBio ? 'Password fallback' : 'Password'}
              autoComplete="current-password"
              className={`ps-prefin-pw-input${pwError ? ' ps-prefin-pw-input--error' : ''}`}
            />
            {pwError && <p className="ps-prefin-pw-error">{pwError}</p>}
          </div>
          <button type="submit" className="ps-btn-primary" style={{ whiteSpace: 'nowrap' }}>
            {finalizeAndNext ? 'Finalise & Next →' : 'Finalise now 🔒'}
          </button>
        </form>

        <button onClick={onCancel} className="ps-btn-ghost-dark">Cancel</button>
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
  synoptics, userId, userDisplayName, userCredentials,
  finalizeAndNext = false, onJumpToField, onConfirm, onCancel,
}) => {
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

  const handleSign = () => {
    const ordered = staged.flatMap(sp => sp.synoptics.map(s => s.instanceId));
    onConfirm(ordered, []);
  };

  return (
    <div className="ps-prefin-overlay">
      <div className="ps-prefin-shell">

        {/* ── Header ── */}
        <div className="ps-prefin-header">
          <div className="ps-prefin-header-left">
            <div className="ps-prefin-header-row">
              <h2 className="ps-prefin-title">Review before finalising</h2>
              <span className={`ps-prefin-mode-badge${reportingMode === 'assisted' ? ' ps-prefin-mode-badge--copilot' : ' ps-prefin-mode-badge--pathscribe'}`}>
                {reportingMode === 'assisted' ? 'Assist mode' : 'Orchestration mode'}
              </span>
            </div>
            <p className="ps-prefin-header-meta">{caseAccession} · {patientName}</p>
          </div>
          <div className="ps-prefin-header-hint">
            <div>Drag specimens to set transmission order</div>
            <div>Synoptics are locked to their specimen</div>
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
                  className={`ps-prefin-specimen-card${spDragOver ? ' ps-prefin-specimen-card--dragover' : ''}`}
                  style={{ opacity: dragSrc?.type === 'specimen' && dragSrc.si === si ? 0.4 : 1 }}
                >
                  {/* Specimen header */}
                  <div className="ps-prefin-specimen-header">
                    <DragHandle />
                    <div className="ps-prefin-specimen-avatar">{sp.specimenLabel}</div>
                    <div>
                      <p className="ps-prefin-specimen-name">Specimen {sp.specimenLabel} — {sp.specimenDesc}</p>
                      <p className="ps-prefin-specimen-order">Transmits {ordinal(si).toLowerCase()}</p>
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
                        className={`ps-prefin-synoptic-row${synDragOver ? ' ps-prefin-synoptic-row--dragover' : ''}`}
                        style={{ opacity: dragSrc?.si === si && dragSrc?.syi === syi && dragSrc?.type === 'synoptic' ? 0.3 : 1 }}
                      >
                        <div className="ps-prefin-synoptic-header">
                          <div className="ps-prefin-synoptic-info">
                            <p className="ps-prefin-synoptic-name">{syn.templateName}</p>
                            <p className="ps-prefin-synoptic-meta">
                              {syn.answeredCount}/{syn.totalCount} fields
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
                                      <span>🔴 {emptyRequired.length} required field{emptyRequired.length !== 1 ? 's' : ''} incomplete — sign-out blocked</span>
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
                                      ⚠ {emptyOptional.length} optional field{emptyOptional.length !== 1 ? 's' : ''} empty:&nbsp;
                                      {emptyOptional.slice(0, 3).map(k => syn.fieldLabels[k] || k).join(', ')}
                                      {emptyOptional.length > 3 && ` +${emptyOptional.length - 3} more`}
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
              <span className="ps-prefin-preview-title">Preview — as transmitted to LIS</span>
            </div>
            <div className="ps-prefin-preview-scroll">
              <ReportPreview staged={staged} />
            </div>
          </div>
        </div>

        {/* ── Signing panel ── */}
        <SigningPanel
          userId={userId}
          userDisplayName={userDisplayName}
          userCredentials={userCredentials}
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
