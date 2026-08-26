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

const NOTE_TYPES = [
  { value: 'informal_review',      label: 'Informal Review'      },
  { value: 'consultation',         label: 'Consultation'         },
  { value: 'clinical_observation', label: 'Clinical Observation' },
  { value: 'second_opinion',       label: 'Second Opinion'       },
  // Real, per direct guidance: reuses this same modal/entry point
  // rather than a new button on an already-crowded page. Routes to
  // the real billing review pool (mockCodeReviewPoolService.ts,
  // Trigger C) instead of a colleague - every branch below that reads
  // noteType checks for this value specifically.
  { value: 'code_review',          label: 'Code Review'          },
];

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

    const typeLabel = NOTE_TYPES.find(t => t.value === noteType)?.label ?? 'Review';
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
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid rgba(51,65,85,0.9)', background: 'radial-gradient(circle at top left, rgba(139,92,246,0.08), transparent 55%), #0b1120', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b', marginBottom: 4 }}>
              Informal Review Request
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>Request Colleague Review</div>
            {caseLabel && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{caseId} · {caseLabel}</div>}
          </div>
          <button onClick={onClose} className="ps-close-btn" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {status === 'sent' ? (
          /* ── Sent confirmation ── */
          <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', border: '2px solid #8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
                {isCodeReview ? 'Case sent to Code Review' : 'Review request sent'}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {isCodeReview ? (
                  <>Case <strong style={{ color: '#94a3b8' }}>{caseId}</strong> has been added to the billing review pool.</>
                ) : (
                  <><strong style={{ color: '#94a3b8' }}>{selected?.name}</strong> has been sent a message with a link to case <strong style={{ color: '#94a3b8' }}>{caseId}</strong>.</>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>
                {isCodeReview ? 'A billing specialist will review it in Quality Assurance — this does not block sign-out.' : 'They can open the case and leave an internal note when reviewed.'}
              </div>
            </div>
            <button onClick={onClose} style={{ marginTop: 8, padding: '8px 24px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 8, color: '#8B5CF6', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Review type */}
            <div>
              <div className="fm-eyebrow">Review Type</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {NOTE_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setNoteType(t.value)}
                    style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${noteType === t.value ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)'}`, background: noteType === t.value ? 'rgba(139,92,246,0.15)' : 'transparent', color: noteType === t.value ? '#a78bfa' : '#64748b', transition: 'all 0.15s' }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {isCodeReview ? (
              /* Real, per direct guidance: no colleague to pick for
                 Code Review - it routes to the billing review pool,
                 not a person. */
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M20 12V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M18 21v-6M15 18h6"/></svg>
                <span style={{ fontSize: 12, color: '#a7f3d0' }}>Routes to the billing review pool, not a colleague — a billing specialist reviews it in Quality Assurance.</span>
              </div>
            ) : (
            /* Colleague picker */
            <div>
              <div className="fm-eyebrow">Send To</div>
              <input
                type="text"
                placeholder="Search colleagues…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="ps-modal-dark-input"
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {loadingReviewers ? (
                  <div style={{ padding: '16px 12px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                    Loading colleagues…
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: '16px 12px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                    No active pathologists found{query ? ' matching your search' : ''}.
                  </div>
                ) : filtered.map(r => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${selectedId === r.id ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.06)'}`, background: selectedId === r.id ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.02)', transition: 'all 0.15s' }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: selectedId === r.id ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: selectedId === r.id ? '#a78bfa' : '#64748b', flexShrink: 0 }}>
                      {avatarInitials(r.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.role}</div>
                    </div>
                    {selectedId === r.id && (
                      <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Optional note */}
            <div>
              <div className="fm-eyebrow">Additional Context <span style={{ fontWeight: 400, color: '#334155' }}>(optional)</span></div>
              <textarea
                placeholder="e.g. Please review the deep margin — uncertain if pT1 or muscularis invasion…"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                className="ps-modal-dark-input" style={{ resize: 'vertical' }}
              />
            </div>

            {/* Info notice */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 8 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontSize: 11, color: '#a78bfa' }}>
                {isCodeReview ? 'This does not block sign-out. The case can be signed out normally regardless of review status.' : 'This does not transfer case ownership. The colleague will receive a message with a link to the case report.'}
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#64748b', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend || status === 'sending'}
                style={{ padding: '8px 20px', background: canSend ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${canSend ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, color: canSend ? '#a78bfa' : '#475569', fontSize: 13, fontWeight: 600, cursor: canSend ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {status === 'sending' ? (
                  <>
                    <div style={{ width: 12, height: 12, border: '2px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', borderRadius: '50%', animation: 'wl-spin 0.8s linear infinite' }} />
                    Sending…
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Send Request
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
