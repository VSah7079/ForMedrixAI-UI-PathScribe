import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { stainTypeService } from '@/services';
import type { StainType } from '@/services/stains/IStainService';
import { computeCaseCodingSummary } from '@/services/billing/codeMapTable';
import type { AppliedBlockCode } from '@/types/case/Specimen';
import { SpellCheckedTextarea } from '@/components/SpellCheck/SpellCheckedTextarea';
import { SignerConfirmationFields } from '@/components/Signing/SignerConfirmationFields';
import { useSignerConfirmation } from '@/hooks/useSignerConfirmation';
import type { SignatureConfirmation } from '@/services/auth/signerConfirmation';

interface CaseSignOutModalProps {
  show: boolean;
  accession: string;
  onClose: () => void;
  /** Batch 344: runs only after the signer has been confirmed
   *  (services/auth/signerConfirmation.ts). Before, the username and
   *  password typed here were never checked. */
  onConfirm: (confirmation: SignatureConfirmation) => void;
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
  show, accession,
  onClose, onConfirm, onReject,
  isCountersign, residentName, countersignFeedback, onCountersignFeedbackChange,
  specimens, matrixBlocks = [], onAssignBaseCode,
}) => {
  const { t } = useTranslation();
  // Real fix, Piece 3: same self-contained data-fetch pattern this
  // app's other modals already use (e.g. BlockStainEditorModal.tsx),
  // rather than lifting this fetch up into the already-large parent
  // page.
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  useEffect(() => {
    if (!show) return;
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data.filter(s => s.active)); });
  }, [show]);

  // Batch 344: who is signing is confirmed here before onConfirm runs.
  const signer = useSignerConfirmation(isCountersign ? 'countersign' : 'case-sign-out', accession || null);
  const { reset: resetSigner } = signer;
  useEffect(() => { if (!show) resetSigner(); }, [show, resetSigner]);
  // Straight from the click: for SSO this opens the provider's popup.
  const confirmAndSign = () => { void signer.confirm().then(c => { if (c) onConfirm(c); }); };

  const codingSummary = specimens ? computeCaseCodingSummary(specimens, stainTypes, matrixBlocks) : [];
  const specimenIndexById = new Map((specimens ?? []).map((sp, i) => [sp.id, i]));

  if (!show) return null;

  const resolvedResidentName = residentName ?? t('caseSignOutModal.residentFallback');

  return (
    <div data-capture-hide="true" className="ps-overlay">
      <div className="ps-modal-dark ps-modal-dark--sm ps-modal-dark--centered">

        <div className="ps-modal-dark-emoji">{isCountersign ? '🎓' : '✍️'}</div>

        <div className="ps-modal-dark-header ps-modal-dark-header--center">
          <span className="ps-modal-dark-title">{isCountersign ? t('caseSignOutModal.countersignTitle') : t('caseSignOutModal.signOutCaseLabel')}</span>
        </div>

        <p className="ps-modal-dark-body ps-modal-dark-body--center">
          {isCountersign ? (
            <Trans
              i18nKey="caseSignOutModal.countersignBody"
              values={{ residentName: resolvedResidentName, accession }}
              components={{
                name: <strong className="ps-text-light" />,
                case: <strong className="ps-text-light" data-phi="accession" />,
              }}
            />
          ) : (
            <Trans
              i18nKey="caseSignOutModal.signOutBody"
              values={{ accession }}
              components={{ case: <strong className="ps-text-light" data-phi="accession" /> }}
            />
          )}
        </p>

        {isCountersign && (
          <div className="ps-conf-form-field ps-signout-feedback-field">
            <label className="ps-modal-dark-label">{t('caseSignOutModal.feedbackLabel', { name: resolvedResidentName })}</label>
            <SpellCheckedTextarea
              className="ps-conf-input ps-conf-textarea"
              value={countersignFeedback ?? ''}
              onChange={e => onCountersignFeedbackChange?.(e.target.value)}
              placeholder={t('caseSignOutModal.feedbackPlaceholder')}
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
          <div className="ps-conf-form-field ps-signout-coding-field">
            <label className="ps-modal-dark-label">{t('caseSignOutModal.codingSummaryLabel')}</label>
            <div className="ps-signout-coding-box">
              {codingSummary.map(sp => (
                <div key={sp.specimenId} className="ps-signout-coding-row">
                  <div className="ps-signout-coding-row-header">
                    <span className="ps-signout-specimen-label">{sp.specimenLabel}</span>
                    <span className={sp.hasBaseCode ? 'ps-signout-base-code' : 'ps-billing-tree-base-line--missing'}>
                      {sp.hasBaseCode ? sp.baseCptCodes.join(', ') : t('billingReviewPanel.noBaseCode')}
                    </span>
                  </div>
                  {sp.blocks.filter(b => b.appliedAncillaryCodes.length > 0 || b.unappliedSuggestions.length > 0).map(b => (
                    <div key={b.blockId} className="ps-signout-coding-subrow">
                      <span>{sp.specimenLabel}{b.blockLabel}</span>
                      <span>
                        {b.appliedAncillaryCodes.map(c => c.code).join(', ')}
                        {b.unappliedSuggestions.length > 0 && (
                          <span className="ps-billing-tree-base-line--missing">{t('caseSignOutModal.suggestedNotApplied', { codes: b.unappliedSuggestions.join(', ') })}</span>
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
                    <div key={mb.matrixBlockId} className="ps-signout-coding-subrow">
                      <span>{sp.specimenLabel}{mb.matrixBlockLabel} {t('disposalQueue.shared')}</span>
                      <span>
                        {mb.appliedAncillaryCodes.map(c => c.code).join(', ')}
                        {mb.unappliedSuggestions.length > 0 && (
                          <span className="ps-billing-tree-base-line--missing">{t('caseSignOutModal.suggestedNotApplied', { codes: mb.unappliedSuggestions.join(', ') })}</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {sp.hasAncillaryButNoBaseCode && onAssignBaseCode && (
                    <div className="ps-signout-assign-now-wrap">
                      <button
                        onClick={() => { onAssignBaseCode(sp.specimenId, specimenIndexById.get(sp.specimenId) ?? 0); onClose(); }}
                        className="ps-signout-assign-now-btn ps-billing-tree-base-line--missing"
                      >
                        ⚠ {t('caseSignOutModal.assignNowLink')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <SignerConfirmationFields signer={signer} onSubmit={confirmAndSign} />

        <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
          <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onClose}>{t('caseSignOutModal.cancelButton')}</button>
          {isCountersign && onReject && (
            <button
              onClick={onReject}
              disabled={!countersignFeedback?.trim()}
              title={!countersignFeedback?.trim() ? t('caseSignOutModal.returnRequiresFeedbackTooltip') : t('caseSignOutModal.returnToTraineeTooltip')}
              className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn"
            >
              ↩️ {t('caseSignOutModal.returnToTraineeButton')}
            </button>
          )}
          <button
            onClick={confirmAndSign}
            disabled={signer.busy || signer.method === 'unavailable'}
            className="ps-btn-green ps-modal-dark-footer__flex-btn"
          >
            ✍️ {signer.busy ? t('signerConfirmation.confirming') : t('caseSignOutModal.signOutCaseLabel')}
          </button>
        </div>

      </div>
    </div>
  );
};

export default CaseSignOutModal;
