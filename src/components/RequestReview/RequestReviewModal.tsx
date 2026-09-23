// src/components/RequestReview/RequestReviewModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight "Request Informal Review" modal.
// Lets a pathologist send an internal message to a colleague with the case
// number attached so the colleague can open the report and leave a note.
// This is NOT the same as Delegate — it does not transfer case ownership.
//
// Reviewer list (FIXED July 2026): used to be a hardcoded, standalone
// REVIEWERS array whose own comment claimed it "mirrors AppShell
// INTERNAL_USERS" — it didn't. AppShell's list is a broad, non-clinical
// general-staff messaging directory (Lab Manager, IT Support, Billing,
// Archives — departments, not reviewers); this modal needs a narrow,
// clinically-appropriate subset instead, which AppShell's list was never
// meant to provide. The two were legitimately different scopes, but the
// standalone array was never actually connected to any real data source,
// which let it drift into real ID collisions with AppShell's directory
// ('u3'/'u4' meant different people in each list). Now sources from the
// real, canonical services/users/mockUserService.ts (the same directory
// StaffTab.tsx and CaseTeamModal.tsx use), filtered to active
// Pathologist-role users — a real, clinically-appropriate, collision-free
// subset instead of a second hand-maintained copy.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { mockMessageService } from '@/services/messages/mockMessageService';
import { informalReviewService } from '@/services';
import { userService, subspecialtyService } from '@/services';
import type { StaffUser } from '@/services/users/IUserService';
import type { ServiceResult } from '@/services/types';
import { getStaffSubspecialtyDisplay } from '@/utils/staffSubspecialties';
import { mockCodeReviewPoolService } from '@/services/billing/mockCodeReviewPoolService';

interface ReviewerOption { id: string; name: string; role: string; }

// Real display name/role derived from StaffUser — "Dr." prefix kept for
// consistency with existing UI copy (avatarInitials already strips it).
// Real fix, per direct confirmation: department (a free-text field) was
// used as the subtitle here — replaced with the user's real, assigned
// Subspecialty name(s), the actual data this stood in for.
const toReviewerOption = (u: StaffUser, allSubspecialties: import('@/services/subspecialties/ISubspecialtyService').Subspecialty[]): ReviewerOption => ({
  id:   u.id,
  name: `Dr. ${u.firstName} ${u.lastName}`.trim(),
  role: getStaffSubspecialtyDisplay(u.id, allSubspecialties) || 'Pathologist',
});

// `label` stays a fixed English string on every entry — it composes the
// message body/subject sent to the colleague (mockMessageService.send
// below), which is persisted data a different recipient reads later in
// their own session, not UI re-rendered per viewer's locale. Only
// `labelKey` (the on-screen type-picker button text) is translated —
// same "exported/persisted data stays English" call this sweep already
// makes for CSV headers and AI-prompt text.
const NOTE_TYPES = [
  { value: 'informal_review',      label: 'Informal Review',      labelKey: 'requestReviewModal.noteType.informalReview'      },
  { value: 'consultation',         label: 'Consultation',         labelKey: 'requestReviewModal.noteType.consultation'         },
  { value: 'clinical_observation', label: 'Clinical Observation', labelKey: 'requestReviewModal.noteType.clinicalObservation'  },
  { value: 'second_opinion',       label: 'Second Opinion',       labelKey: 'requestReviewModal.noteType.secondOpinion'        },
  // Real, per direct guidance: reuses this same modal/entry point
  // rather than a new button on an already-crowded page. Routes to
  // the real billing review pool (mockCodeReviewPoolService.ts,
  // Trigger C) instead of a colleague - every branch below that reads
  // noteType checks for this value specifically.
  { value: 'code_review',          label: 'Code Review',          labelKey: 'requestReviewModal.noteType.codeReview'           },
];

// Wraps each occurrence of the given substrings (in the order they
// appear in `text`) in a <strong> — for interpolated values placed
// inside a translated sentence. Resolves the sentence via t() first,
// then locates each value by indexOf, so it's correct regardless of a
// given locale's word order (same pattern as the clickable-link-inside-
// a-sentence case in MolecularPlateBuilderPage).
const boldSubstrings = (text: string, values: string[]): React.ReactNode => {
  const positions = values
    .filter(Boolean)
    .map(v => ({ v, i: text.indexOf(v) }))
    .filter(p => p.i !== -1)
    .sort((a, b) => a.i - b.i);
  if (positions.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  positions.forEach(({ v, i }, idx) => {
    if (i < cursor) return;
    parts.push(text.slice(cursor, i));
    parts.push(<strong key={idx} className="rrm-strong">{v}</strong>);
    cursor = i + v.length;
  });
  parts.push(text.slice(cursor));
  return parts;
};

const avatarInitials = (name: string) =>
  name.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s*/i, '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map(p => p[0]).join('').toUpperCase();

interface RequestReviewModalProps {
  isOpen:       boolean;
  caseId:       string;          // e.g. 'MFT26-8801-CR-RES'
  caseLabel?:   string;          // e.g. 'Hartley, William — Anterior resection'
  fromUserId:   string;
  fromUserName: string;
  onClose:      () => void;
  onSent?:      () => void;
}

const RequestReviewModal: React.FC<RequestReviewModalProps> = ({
  isOpen, caseId, caseLabel, fromUserId, fromUserName, onClose, onSent,
}) => {
  const { t } = useTranslation();
  const [selectedId,  setSelectedId]  = useState<string>('');
  const [noteType,    setNoteType]    = useState('informal_review');
  const [message,     setMessage]     = useState('');
  const [status,      setStatus]      = useState<'compose' | 'sending' | 'sent'>('compose');
  const [query,       setQuery]       = useState('');
  const [reviewers,   setReviewers]   = useState<ReviewerOption[]>([]);
  const [loadingReviewers, setLoadingReviewers] = useState(true);

  // Reset + fetch real reviewers when opened
  React.useEffect(() => {
    if (isOpen) {
      setSelectedId(''); setNoteType('informal_review');
      setMessage(''); setStatus('compose'); setQuery('');
      setLoadingReviewers(true);
      Promise.all([userService.getAll(), subspecialtyService.getAll()]).then(([res, subsRes]: [ServiceResult<StaffUser[]>, ServiceResult<import('@/services/subspecialties/ISubspecialtyService').Subspecialty[]>]) => {
        if (res.ok) {
          const allSubspecialties = subsRes.ok ? subsRes.data : [];
          const active = res.data
            .filter(u => u.status === 'Active' && u.roles.includes('Pathologist') && u.id !== fromUserId)
            .map(u => toReviewerOption(u, allSubspecialties));
          setReviewers(active);
        } else {
          setReviewers([]);
        }
        setLoadingReviewers(false);
      });
    }
  }, [isOpen, fromUserId]);

  const filtered = reviewers.filter(r =>
    r.name.toLowerCase().includes(query.toLowerCase()) ||
    r.role.toLowerCase().includes(query.toLowerCase())
  );

  const selected = reviewers.find(r => r.id === selectedId);
  const isCodeReview = noteType === 'code_review';
  const canSend  = isCodeReview ? true : !!selectedId;

  const handleSend = async () => {
    if (!canSend) return;
    if (isCodeReview) {
      setStatus('sending');
      await mockCodeReviewPoolService.create({
        caseId,
        caseLabel,
        source: 'MANUAL',
        flaggedBy: fromUserId,
        flaggedByName: fromUserName,
        notes: message.trim() || undefined,
      });
      setStatus('sent');
      onSent?.();
      return;
    }
    if (!selected) return;
    setStatus('sending');

    const typeLabel = NOTE_TYPES.find(nt => nt.value === noteType)?.label ?? 'Review';
    const body = message.trim()
      ? `${typeLabel} requested for case ${caseId}${caseLabel ? ` (${caseLabel})` : ''}.\n\n${message.trim()}\n\nPlease open the case link below to review the report and leave an internal note.`
      : `${typeLabel} requested for case ${caseId}${caseLabel ? ` (${caseLabel})` : ''}.\n\nPlease open the case link below to review the report and leave an internal note.`;

    await mockMessageService.send({
      senderId:      fromUserId,
      senderName:    fromUserName,
      recipientId:   selected.id,
      recipientName: selected.name,
      subject:       `${typeLabel} request — ${caseLabel ?? caseId}`,
      body,
      caseNumber:    caseId,
      timestamp:     new Date(),
      isUrgent:      false,
    });

    // Real feature, per direct follow-up: "I want informal reviews to
    // be handled differently than delegations types... queue these
    // informal requests on the worklist with a Tile." The message
    // above is still real and useful (an immediate "heads up"), but
    // it alone can't power a real, trackable Worklist tile — only
    // informal_review specifically gets this real, separate,
    // dedicated request record. Every other note type here stays
    // message-only, unchanged.
    if (noteType === 'informal_review') {
      await informalReviewService.create({
        caseId,
        caseLabel,
        fromUserId,
        fromUserName,
        toUserId:   selected.id,
        toUserName: selected.name,
        note:       message.trim() || undefined,
      });
    }

    setStatus('sent');
    onSent?.();
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      className="ps-overlay"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="ps-modal-dark ps-review-req-shell"
      >
        {/* Header */}
        <div className="rrm-header">
          <div>
            <div className="rrm-header-eyebrow">
              {t('requestReviewModal.eyebrow')}
            </div>
            <div className="rrm-header-title">{t('requestReviewModal.title')}</div>
            {caseLabel && <div className="rrm-header-case" data-phi="true">{caseId} · {caseLabel}</div>}
          </div>
          <button onClick={onClose} className="ps-close-btn" aria-label={t('requestReviewModal.close')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {status === 'sent' ? (
          /* ── Sent confirmation ── */
          <div className="rrm-sent-wrap">
            <div className="rrm-sent-icon-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div className="rrm-sent-title">
                {isCodeReview ? t('requestReviewModal.sentToCodeReview') : t('requestReviewModal.requestSent')}
              </div>
              <div className="rrm-sent-desc">
                {isCodeReview
                  ? boldSubstrings(t('requestReviewModal.addedToPool', { caseId }), [caseId])
                  : boldSubstrings(t('requestReviewModal.messageSentBody', { name: selected?.name ?? '', caseId }), [selected?.name ?? '', caseId])}
              </div>
              <div className="rrm-sent-hint">
                {isCodeReview ? t('requestReviewModal.codeReviewHint') : t('requestReviewModal.reviewSentHint')}
              </div>
            </div>
            <button onClick={onClose} className="rrm-sent-close-btn">
              {t('requestReviewModal.close')}
            </button>
          </div>
        ) : (
          <div className="rrm-body">

            {/* Review type */}
            <div>
              <div className="fm-eyebrow">{t('requestReviewModal.reviewType')}</div>
              <div className="rrm-type-row">
                {NOTE_TYPES.map(nt => (
                  <button
                    key={nt.value}
                    onClick={() => setNoteType(nt.value)}
                    className="rrm-type-btn"
                    style={{
                      '--rrm-type-border': noteType === nt.value ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)',
                      '--rrm-type-bg':     noteType === nt.value ? 'rgba(139,92,246,0.15)' : 'transparent',
                      '--rrm-type-color':  noteType === nt.value ? '#a78bfa' : '#64748b',
                    } as React.CSSProperties}
                  >
                    {t(nt.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {isCodeReview ? (
              /* Real, per direct guidance: no colleague to pick for
                 Code Review - it routes to the billing review pool,
                 not a person. */
              <div className="rrm-noreview-notice">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" className="rrm-flex-shrink0"><path d="M20 12V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M18 21v-6M15 18h6"/></svg>
                <span className="rrm-notice-text">{t('requestReviewModal.routesToPool')}</span>
              </div>
            ) : (
            /* Colleague picker */
            <div>
              <div className="fm-eyebrow">{t('requestReviewModal.sendTo')}</div>
              <input
                type="text"
                placeholder={t('requestReviewModal.searchColleagues')}
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="ps-modal-dark-input"
              />
              <div className="rrm-colleague-list">
                {loadingReviewers ? (
                  <div className="rrm-colleague-empty">
                    {t('requestReviewModal.loadingColleagues')}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rrm-colleague-empty">
                    {query ? t('requestReviewModal.noResultsMatching') : t('requestReviewModal.noResultsFound')}
                  </div>
                ) : filtered.map(r => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="rrm-colleague-row"
                    style={{
                      '--rrm-row-border': selectedId === r.id ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.06)',
                      '--rrm-row-bg':     selectedId === r.id ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.02)',
                    } as React.CSSProperties}
                  >
                    <div
                      className="rrm-avatar"
                      style={{
                        '--rrm-avatar-bg':    selectedId === r.id ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)',
                        '--rrm-avatar-color': selectedId === r.id ? '#a78bfa' : '#64748b',
                      } as React.CSSProperties}
                    >
                      {avatarInitials(r.name)}
                    </div>
                    <div className="rrm-colleague-info">
                      <div className="rrm-colleague-name">{r.name}</div>
                      <div className="rrm-colleague-role">{r.role}</div>
                    </div>
                    {selectedId === r.id && (
                      <svg className="rrm-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Optional note */}
            <div>
              <div className="fm-eyebrow">{t('requestReviewModal.additionalContext')} <span className="rrm-optional-label">{t('requestReviewModal.optional')}</span></div>
              <textarea
                placeholder={t('requestReviewModal.notePlaceholder')}
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                className="ps-modal-dark-input rrm-textarea"
              />
            </div>

            {/* Info notice */}
            <div className="rrm-info-notice">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span className="rrm-info-text">
                {isCodeReview ? t('requestReviewModal.codeReviewNotice') : t('requestReviewModal.ownershipNotice')}
              </span>
            </div>

            {/* Actions */}
            <div className="rrm-actions-row">
              <button onClick={onClose} className="rrm-cancel-btn">
                {t('requestReviewModal.cancel')}
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend || status === 'sending'}
                className="rrm-send-btn"
                style={{
                  '--rrm-send-bg':     canSend ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  '--rrm-send-border': canSend ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)',
                  '--rrm-send-color':  canSend ? '#a78bfa' : '#475569',
                  '--rrm-send-cursor': canSend ? 'pointer' : 'default',
                } as React.CSSProperties}
              >
                {status === 'sending' ? (
                  <>
                    <div className="rrm-spinner" />
                    {t('requestReviewModal.sending')}
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    {t('requestReviewModal.sendRequest')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default RequestReviewModal;
