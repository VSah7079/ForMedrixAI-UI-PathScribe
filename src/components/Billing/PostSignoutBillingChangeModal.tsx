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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { mockReasonDictionaryService } from '@/services/reasons/mockReasonDictionaryService';
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
  const [reasonOptions, setReasonOptions] = useState<ReasonDictionaryEntry[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    let cancelled = false;
    mockReasonDictionaryService.getAll('POST_SIGNOUT_BILLING_CHANGE').then(res => {
      if (cancelled) return;
      if (res.ok) setReasonOptions(res.data.filter(r => r.status === 'Active'));
    });
    return () => { cancelled = true; };
  }, []);

  const canConfirm = reasonId !== '' && comment.trim().length > 0;

  return (
    <div className="ps-ms-overlay ps-billing-postsignout-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Post-Sign-Out Billing Change</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            This case has already signed out. Billing is one of the few things that can still change
            afterward, but it needs a real, documented reason. {summary}
          </p>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="postsignout-billing-reason">
              Reason <span className="ps-conf-required">*</span>
            </label>
            <select
              id="postsignout-billing-reason"
              className="ps-conf-select"
              value={reasonId}
              onChange={e => setReasonId(e.target.value)}
            >
              <option value="">— Select —</option>
              {reasonOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="postsignout-billing-comment">Comment <span className="ps-conf-required">*</span></label>
            <textarea
              id="postsignout-billing-comment"
              className="ps-conf-textarea"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="What changed and why — permanently attached to the credit and/or new charge."
            />
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className="ps-conf-btn-primary"
            disabled={!canConfirm}
            onClick={() => onConfirm({ reasonId, comment: comment.trim() })}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
