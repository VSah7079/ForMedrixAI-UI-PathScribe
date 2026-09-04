import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { stainTypeService } from '@/services';
import type { StainType } from '@/services/stains/IStainService';
import { computeCaseCodingSummary } from '@/services/billing/codeMapTable';
import type { AppliedBlockCode } from '@/types/case/Specimen';

interface CaseSignOutModalProps {
  show: boolean;
  accession: string;
  signOutUser: string;
  signOutPassword: string;
  signOutError: string;
  onClose: () => void;
  onUserChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirm: () => void;
  /** True when this case was released by a resident and is now
   *  genuinely being countersigned, not just a routine sign-out. */
  isCountersign?: boolean;
  residentName?: string;
  countersignFeedback?: string;
  onCountersignFeedbackChange?: (value: string) => void;
  /** Real, per direct guidance ("Yes we should scope 'Return to
   *  Trainee'/'Reject with Notes'"): the attending's real alternative
   *  to countersigning — sends the case back for revision instead.
   *  Only ever rendered when isCountersign is true. */
  onReject?: () => void;
  /** Real fix, Piece 3 of the workflow-friction plan: this case's real
   *  specimens (with their real, current coding/blocks/stains), used
   *  to compute a live pre-signout coding summary right where a person
   *  is already stopping to review, rather than requiring a separate
   *  trip through the codes modal to find out. Optional - a case
   *  without a real, populated specimen list simply shows no summary,
   *  same as before this feature existed. */
  specimens?: { id: string; label: string; coding?: { cpt?: string[] }; blocks?: { id: string; label: string; stains?: { stainName: string }[]; coding?: { cpt?: AppliedBlockCode[] } }[]; matrixBlockCoding?: { matrixBlockId: string; cpt?: AppliedBlockCode[]; rejectedCpt?: AppliedBlockCode[] }[] }[];
  /** Real, per direct billing-expert guidance (PS-93) — see
   *  BillingReviewPanel.tsx's own identical prop for the full
   *  reasoning. Defaults to [] — a case with no Biopsy Arrays renders
   *  exactly as it always did before this feature existed. */
  matrixBlocks?: { id: string; label: string; participants: { specimenId: string; positionInBlock: number }[]; slides: { id?: string; stainName: string; evaluatedSpecimenIds?: string[] }[] }[];
  /** Real fix: lets the soft warning's "Assign" link jump straight to
   *  the real, contextual codes modal for the specific specimen that's
   *  missing its base code - the same real callback MaterialTreePanel's
   *  own "+Code" button already uses (Piece 1), reused here rather than
   *  duplicated. */
  onAssignBaseCode?: (specimenId: string, specimenIndex: number) => void;
}

const CaseSignOutModal: React.FC<CaseSignOutModalProps> = ({
  show, accession, signOutUser, signOutPassword, signOutError,
  onClose, onUserChange, onPasswordChange, onConfirm, onReject,
  isCountersign, residentName, countersignFeedback, onCountersignFeedbackChange,
  specimens, matrixBlocks = [], onAssignBaseCode,
}) => {
  // Real fix, Piece 3: same self-contained data-fetch pattern this
  // app's other modals already use (e.g. BlockStainEditorModal.tsx),
  // rather than lifting this fetch up into the already-large parent
  // page.
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  useEffect(() => {
    if (!show) return;
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data.filter(s => s.active)); });
  }, [show]);

  const codingSummary = specimens ? computeCaseCodingSummary(specimens, stainTypes, matrixBlocks) : [];
  const specimenIndexById = new Map((specimens ?? []).map((sp, i) => [sp.id, i]));

  if (!show) return null;

  return (
    <div data-capture-hide="true" className="ps-overlay">
      <div className="ps-modal-dark ps-modal-dark--sm ps-modal-dark--centered">

        <div className="ps-modal-dark-emoji">{isCountersign ? '🎓' : '✍️'}</div>

        <div className="ps-modal-dark-header ps-modal-dark-header--center">
          <span className="ps-modal-dark-title">{isCountersign ? 'Countersign Case' : 'Sign Out Case'}</span>
        </div>

        <p className="ps-modal-dark-body ps-modal-dark-body--center">
          {isCountersign
            ? <>Released by <strong className="ps-text-light">{residentName ?? 'the resident'}</strong> for your countersign — <strong className="ps-text-light" data-phi="accession">Case {accession}</strong>.</>
            : <>All synoptic reports for <strong className="ps-text-light" data-phi="accession">Case {accession}</strong> have been finalized.</>}
        </p>
        <p className="ps-modal-dark-hint ps-modal-dark-hint--center">
          Enter your username and password to sign out this case from PathScribe.
        </p>

        {isCountersign && (
          <div className="ps-conf-form-field" style={{ marginBottom: 12 }}>
            <label className="ps-modal-dark-label">Feedback for {residentName ?? 'the resident'} — optional to countersign, required to return</label>
            <textarea
              className="ps-conf-input ps-conf-textarea"
              value={countersignFeedback ?? ''}
              onChange={e => onCountersignFeedbackChange?.(e.target.value)}
              placeholder="Targeted feedback — captured here at countersign, not a separate note later."
            />
          </div>
        )}

        {/* Real fix, Piece 3 of the workflow-friction plan: a real,
            live pre-signout coding summary - specimen base codes next
            to block ancillary codes, right at the point a person is
            already stopping to review before finalizing. Soft warning
            only - never blocks the Sign Out button below; matches
            Pete's own "soft warning... quick link to resolve" spec. */}
        {codingSummary.length > 0 && (
          <div className="ps-conf-form-field" style={{ marginBottom: 14, textAlign: 'left' }}>
            <label className="ps-modal-dark-label">Coding Summary</label>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px' }}>
              {codingSummary.map(sp => (
                <div key={sp.specimenId} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{sp.specimenLabel}</span>
                    <span style={{ color: sp.hasBaseCode ? '#94a3b8' : '#f59e0b' }}>
                      {sp.hasBaseCode ? sp.baseCptCodes.join(', ') : 'No base code'}
                    </span>
                  </div>
                  {sp.blocks.filter(b => b.appliedAncillaryCodes.length > 0 || b.unappliedSuggestions.length > 0).map(b => (
                    <div key={b.blockId} style={{ display: 'flex', justifyContent: 'space-between', marginLeft: 12, color: '#64748b' }}>
                      <span>{sp.specimenLabel}{b.blockLabel}</span>
                      <span>
                        {b.appliedAncillaryCodes.map(c => c.code).join(', ')}
                        {b.unappliedSuggestions.length > 0 && (
                          <span style={{ color: '#f59e0b' }}> (suggested, not applied: {b.unappliedSuggestions.join(', ')})</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {/* Real, per direct billing-expert guidance (PS-93) —
                      this specimen's own real contribution from a
                      shared Biopsy Array block it participates in.
                      Labeled "(shared)" since, unlike an ordinary
                      block above, this one physical cassette also
                      belongs to other specimens — see
                      SpecimenCodingSummary.matrixBlockContributions's
                      own doc comment (services/billing/codeMapTable.ts)
                      for the full reasoning. */}
                  {sp.matrixBlockContributions.filter(mb => mb.appliedAncillaryCodes.length > 0 || mb.unappliedSuggestions.length > 0).map(mb => (
                    <div key={mb.matrixBlockId} style={{ display: 'flex', justifyContent: 'space-between', marginLeft: 12, color: '#64748b' }}>
                      <span>{sp.specimenLabel}{mb.matrixBlockLabel} (shared)</span>
                      <span>
                        {mb.appliedAncillaryCodes.map(c => c.code).join(', ')}
                        {mb.unappliedSuggestions.length > 0 && (
                          <span style={{ color: '#f59e0b' }}> (suggested, not applied: {mb.unappliedSuggestions.join(', ')})</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {sp.hasAncillaryButNoBaseCode && onAssignBaseCode && (
                    <div style={{ marginTop: 3 }}>
                      <button
                        onClick={() => { onAssignBaseCode(sp.specimenId, specimenIndexById.get(sp.specimenId) ?? 0); onClose(); }}
                        style={{ fontSize: 11, color: '#f59e0b', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                      >
                        ⚠ This specimen has ancillary codes but no base code — Assign now
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ps-modal-dark-fields">
          <div>
            <label className="ps-modal-dark-label">Username</label>
            <input
              type="text"
              autoFocus
              value={signOutUser}
              onChange={e => onUserChange(e.target.value)}
              placeholder="Your username"
              className={`ps-modal-dark-input${signOutError ? ' ps-modal-dark-input--error' : ''}`}
            />
          </div>
          <div>
            <label className="ps-modal-dark-label">Password</label>
            <input
              type="password"
              value={signOutPassword}
              onChange={e => onPasswordChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onConfirm()}
              placeholder="Your password"
              className={`ps-modal-dark-input${signOutError ? ' ps-modal-dark-input--error' : ''}`}
            />
          </div>
          {signOutError && <p className="ps-modal-dark-field-error">{signOutError}</p>}
        </div>

        <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
          <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onClose}>Cancel</button>
          {isCountersign && onReject && (
            <button
              onClick={onReject}
              disabled={!countersignFeedback?.trim()}
              title={!countersignFeedback?.trim() ? 'Feedback is required to return a case to the trainee' : 'Return this case to the trainee for revision'}
              className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn"
            >
              ↩️ Return to Trainee
            </button>
          )}
          <button onClick={onConfirm} className="ps-btn-green ps-modal-dark-footer__flex-btn">✍️ Sign Out Case</button>
        </div>

      </div>
    </div>
  );
};

export default CaseSignOutModal;
