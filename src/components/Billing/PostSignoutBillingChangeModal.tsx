// src/components/Billing/PostSignoutBillingChangeModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own follow-up: billing is one of the few
// things that can genuinely change after a case signs out, and when it
// does, a real, structured reason plus a required comment is needed -
// not just a background audit log entry. This is a standalone,
// sequential confirmation step (Cancel/Confirm, its own modal) for
// call sites where the reason+comment gate comes AFTER the person has
// already committed to an action (e.g. clicking Save in the Codes
// manager). QualityAssurancePage.tsx's own CODE_CORRECTED resolution
// modal deliberately keeps its own inline reason+comment fields rather
// than nesting this component inside it - that flow needs the
// corrected code and the post-signout context captured together in
// one single form/submit, not as two sequential steps. Both share the
// same real reason dictionary (category: 'POST_SIGNOUT_BILLING_CHANGE')
// and the same field-level requirements; only the surrounding
// interaction shape differs.
//
// Batch 382 (PS-359): the reason and the comment come from the
// organisation's Field Requirements (both locked; reportPageChecks.
// billingChangeMissing). The modal shows "Still required: …" and marks
// the required labels, and Confirm can be said ("confirm billing change",
// POST_SIGNOUT_BILLING_CONFIRM).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { actionRegistryService, billingChangeMissing, reasonDictionaryService, reportFieldRequired } from '@/services';
import { useFieldRequirements } from '@/hooks/useFieldRequirements';
import { formatList } from '@/utils/formatList';
import type { ReasonDictionaryEntry } from '@/types/reasons/ReasonDictionaryEntry';

export interface PostSignoutBillingChangeModalProps {
  /** A short, real description of what's changing, e.g. "2 codes
   *  added, 1 removed" - shown to orient the person, never fabricated
   *  detail beyond what the caller genuinely knows at this point. */
  summary: string;
  onConfirm: (context: { reasonId: string; comment: string }) => void;
  onCancel: () => void;
}

export const PostSignoutBillingChangeModal: React.FC<PostSignoutBillingChangeModalProps> = ({ summary, onConfirm, onCancel }) => {
  const { t, i18n } = useTranslation();
  const requirements = useFieldRequirements('report');
  const [reasonOptions, setReasonOptions] = useState<ReasonDictionaryEntry[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    let cancelled = false;
    reasonDictionaryService.getAll('POST_SIGNOUT_BILLING_CHANGE').then(res => {
      if (cancelled) return;
      if (res.ok) setReasonOptions(res.data.filter(r => r.status === 'Active'));
    });
    return () => { cancelled = true; };
  }, []);

  const missing = billingChangeMissing(reasonId, comment, requirements);
  const canConfirm = missing.length === 0;
  const star = (id: string) => reportFieldRequired(requirements, id) && <span className="ps-conf-required">*</span>;
  const confirm = () => { if (canConfirm) onConfirm({ reasonId, comment: comment.trim() }); };

  // Voice/keyboard "confirm billing change": the same Confirm, with the same check.
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  useEffect(() => actionRegistryService.onAction((actionId: string) => {
    if (actionId === 'POST_SIGNOUT_BILLING_CONFIRM') confirmRef.current();
  }), []);

  return (
    <div className="ps-ms-overlay ps-billing-postsignout-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{t('postSignoutBillingChangeModal.header')}</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {t('postSignoutBillingChangeModal.intro', { summary })}
          </p>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="postsignout-billing-reason">
              {t('postSignoutBillingChangeModal.reasonLabel')} {star('postSignoutBillingReason')}
            </label>
            <select
              id="postsignout-billing-reason"
              className="ps-conf-select"
              value={reasonId}
              onChange={e => setReasonId(e.target.value)}
            >
              <option value="">{t('postSignoutBillingChangeModal.selectOption')}</option>
              {reasonOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="postsignout-billing-comment">{t('postSignoutBillingChangeModal.commentLabel')} {star('postSignoutBillingComment')}</label>
            <textarea
              id="postsignout-billing-comment"
              className="ps-conf-textarea"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('postSignoutBillingChangeModal.commentPlaceholder')}
            />
          </div>
          {missing.length > 0 && (
            <p className="ps-field-still-required" role="status">
              {t('fieldRequirements.stillRequired', { fields: formatList(missing.map(id => t(`fieldRequirements.fields.report.${id}`)), i18n.language) })}
            </p>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onCancel}>{t('postSignoutBillingChangeModal.cancel')}</button>
          <button
            className="ps-conf-btn-primary"
            disabled={!canConfirm}
            onClick={confirm}
          >
            {t('postSignoutBillingChangeModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
