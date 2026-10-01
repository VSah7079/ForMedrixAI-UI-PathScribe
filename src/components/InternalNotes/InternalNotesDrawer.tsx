/**
 * components/InternalNotes/InternalNotesDrawer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Slide-in drawer for viewing and adding internal notes.
 * Reusable — drop into FullReportPage or SynopticReportPage.
 *
 * Props:
 *   accession      — case accession number (e.g. 'S26-4401')
 *   userId         — current user's ID
 *   userName       — current user's display name
 *   messageThreadId — optional, pre-links note to a message thread
 *   onClose        — called when drawer is dismissed
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { internalNoteService, informalReviewService } from '../../services';
import type { InternalNote, InternalNoteType, InternalNoteVisibility } from '../../services';
import { useVoice, reportDictationCorrection } from '../../contexts/VoiceProvider';
import ConfirmModal from '../Common/ConfirmModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  accession: string;
  userId: string;
  userName: string;
  messageThreadId?: string;
  onClose: () => void;
  /** When true, opens the add-note form and wires voice dictation into the body field */
  autoStartDictation?: boolean;
  /** Callback used to inject dictated text into noteBody */
  onDictateText?: (appendText: (t: string) => void, onDone: () => void) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (date: Date) => {
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const NOTE_TYPE_COLORS: Record<InternalNoteType, { bg: string; color: string; border: string }> = {
  informal_review:      { bg: 'rgba(8,145,178,0.12)',   color: '#0891B2', border: 'rgba(8,145,178,0.3)'   },
  clinical_observation: { bg: 'rgba(16,185,129,0.12)',  color: '#10B981', border: 'rgba(16,185,129,0.3)'  },
  consultation:         { bg: 'rgba(139,92,246,0.12)',  color: '#8B5CF6', border: 'rgba(139,92,246,0.3)'  },
  addendum_request:     { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B', border: 'rgba(245,158,11,0.3)'  },
  other:                { bg: 'rgba(100,116,139,0.12)', color: '#64748b', border: 'rgba(100,116,139,0.3)' },
};

// The real InternalNoteType value stays untouched (used for the color
// lookup above and as the underlying data); this maps it to a
// translated display label instead of the previously-imported
// IInternalNoteService.ts's own INTERNAL_NOTE_TYPE_LABELS (which was
// English-only and used nowhere else in the app) — same label-key-map
// pattern used elsewhere in this sweep.
const NOTE_TYPE_LABEL_KEY: Record<InternalNoteType, string> = {
  informal_review:      'internalNotesDrawer.noteType.informalReview',
  clinical_observation: 'internalNotesDrawer.noteType.clinicalObservation',
  consultation:          'internalNotesDrawer.noteType.consultation',
  addendum_request:      'internalNotesDrawer.noteType.addendumRequest',
  other:                 'internalNotesDrawer.noteType.other',
};

// ─── Component ────────────────────────────────────────────────────────────────

const InternalNotesDrawer: React.FC<Props> = ({
  accession,
  userId,
  userName,
  messageThreadId,
  onClose,
  autoStartDictation = false,
  onDictateText,
}) => {
  const { t } = useTranslation();
  const [notes, setNotes]             = useState<InternalNote[]>([]);
  const [loading, setLoading]         = useState(true);
  const [isAdding, setIsAdding]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  // ─── Form state ─────────────────────────────────────────────────────────────
  const [noteType, setNoteType]           = useState<InternalNoteType>('informal_review');
  const [noteBody, setNoteBody]           = useState('');
  const [noteVisibility, setNoteVisibility] = useState<InternalNoteVisibility>('shared');

  const { startDictation, stopDictation } = useVoice();
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const [isInterimNote, setIsInterimNote] = useState(false);
  const committedNoteRef = useRef('');

  // ─── Load notes ─────────────────────────────────────────────────────────────
  const loadNotes = useCallback(async () => {
    setLoading(true);
    const result = await internalNoteService.getForCase(accession, userId);
    if (result.ok) setNotes(result.data);
    setLoading(false);
  }, [accession, userId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Auto-open add form and start dictation when requested by parent
  useEffect(() => {
    if (!autoStartDictation || !onDictateText) return;
    setIsAdding(true);
    // Give the textarea a frame to render with autoFocus, then start dictation
    setTimeout(() => {
      onDictateText(
        (t) => setNoteBody(prev => prev + t),
        () => { /* dictation ended — note body already populated */ }
      );
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once on mount

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!noteBody.trim()) return;
    setSubmitting(true);
    const result = await internalNoteService.add({
      accession,
      authorId:        userId,
      authorName:      userName,
      type:            noteType,
      body:            noteBody.trim(),
      visibility:      noteVisibility,
      messageThreadId: messageThreadId ?? undefined,
    });
    if (result.ok) {
      setNotes(prev => [result.data, ...prev]);
      // Real feature, per direct follow-up: "when those cases are
      // selected it opens to that intermediate page where they can
      // publish their review." An informal_review note IS the act of
      // publishing — if there's a real, pending InformalReviewRequest
      // for this case where the current user is the actual, intended
      // reviewer, mark it published, linking the real note just
      // created. Never guesses/force-matches — a note added with no
      // matching real request (e.g. someone just leaving a note on
      // their own case) correctly does nothing here.
      if (noteType === 'informal_review') {
        informalReviewService.getForCase(accession).then(reqRes => {
          if (!reqRes.ok) return;
          const match = reqRes.data.find(r => r.status === 'pending' && r.toUserId === userId);
          if (match) informalReviewService.publish(match.id, result.data.id).catch(() => {});
        }).catch(() => {});
      }
      setNoteBody('');
      setNoteType('informal_review');
      setNoteVisibility('shared');
      setIsAdding(false);
    }
    setSubmitting(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setNoteBody('');
    setNoteType('informal_review');
    setNoteVisibility('shared');
  };

  // ─── Voice command listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const addNote         = () => { setIsAdding(true); setTimeout(() => textareaRef.current?.focus(), 100); };
    const dictate         = () => {
      if (!isAdding) setIsAdding(true);
      committedNoteRef.current = noteBody;
      setTimeout(() => {
        startDictation({
          fieldId:  'internal-note-body',
          label:    'Internal Note',
          context:  'clinical note',
          onText:   (t, isInterim) => {
            if (isInterim) {
              setIsInterimNote(true);
              setNoteBody(committedNoteRef.current + t);
            } else {
              setIsInterimNote(false);
              committedNoteRef.current = committedNoteRef.current + t;
              setNoteBody(committedNoteRef.current);
            }
          },
          onDone:       () => { setIsInterimNote(false); stopDictation(); },
          onCorrection: (_raw, corrected) => reportDictationCorrection(corrected),
        });
      }, 350);
    };
    const visPrivate      = () => setNoteVisibility('private');
    const visShared       = () => setNoteVisibility('shared');
    const saveNote        = () => handleAdd();
    const cancelNote      = () => { handleCancel(); };
    const closeDrawer     = () => onClose();

    window.addEventListener('PATHSCRIBE_NOTE_ADD',              addNote);
    window.addEventListener('PATHSCRIBE_NOTE_DICTATE',          dictate);
    window.addEventListener('PATHSCRIBE_NOTE_VISIBILITY_PRIVATE', visPrivate);
    window.addEventListener('PATHSCRIBE_NOTE_VISIBILITY_SHARED',  visShared);
    window.addEventListener('PATHSCRIBE_NOTE_SAVE',             saveNote);
    window.addEventListener('PATHSCRIBE_NOTE_CANCEL',           cancelNote);
    window.addEventListener('PATHSCRIBE_NOTE_CLOSE',            closeDrawer);

    return () => {
      window.removeEventListener('PATHSCRIBE_NOTE_ADD',               addNote);
      window.removeEventListener('PATHSCRIBE_NOTE_DICTATE',           dictate);
      window.removeEventListener('PATHSCRIBE_NOTE_VISIBILITY_PRIVATE', visPrivate);
      window.removeEventListener('PATHSCRIBE_NOTE_VISIBILITY_SHARED',  visShared);
      window.removeEventListener('PATHSCRIBE_NOTE_SAVE',              saveNote);
      window.removeEventListener('PATHSCRIBE_NOTE_CANCEL',            cancelNote);
      window.removeEventListener('PATHSCRIBE_NOTE_CLOSE',             closeDrawer);
    };
  }, [isAdding, startDictation, stopDictation, handleAdd, handleCancel, onClose]);

  // Real fix: was window.confirm() — replaced with the shared ConfirmModal.
  // Needs pending-delete state since ConfirmModal is async/UI-driven
  // rather than a blocking call.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setDeletingId(id);
    const result = await internalNoteService.remove(id, userId);
    if (result.ok) setNotes(prev => prev.filter(n => n.id !== id));
    setDeletingId(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="ind-backdrop"
      />

      {/* Drawer */}
      <div className="ind-drawer">

        {/* ── Header ── */}
        <div className="ind-header">
          <div>
            <div className="ind-header-eyebrow">
              {t('internalNotesDrawer.title')}
            </div>
            <div className="ind-header-accession" data-phi="accession">{accession}</div>
          </div>
          <button
            onClick={onClose}
            className="ind-close-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Internal Only Banner ── */}
        <div className="ind-banner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" className="ind-banner-icon">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="ind-banner-text">
            {t('internalNotesDrawer.internalUseOnly')}
          </span>
        </div>

        {/* ── Add Note Button / Form ── */}
        <div className="ind-add-section">
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="ind-add-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {t('internalNotesDrawer.addNote')}
            </button>
          ) : (
            <div className="ind-form">

              {/* Note type */}
              <div>
                <label className="ind-form-label">
                  {t('internalNotesDrawer.noteTypeLabel')}
                </label>
                <div className="ind-note-type-grid">
                  {(Object.keys(NOTE_TYPE_LABEL_KEY) as InternalNoteType[]).map(type => {
                    const colors = NOTE_TYPE_COLORS[type];
                    const active = noteType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setNoteType(type)}
                        className="ind-note-type-btn"
                        style={{
                          '--ind-type-bg':     active ? colors.bg : 'rgba(255,255,255,0.03)',
                          '--ind-type-border': active ? colors.border : 'rgba(255,255,255,0.07)',
                          '--ind-type-color':  active ? colors.color : '#94a3b8',
                        } as React.CSSProperties}
                      >
                        {t(NOTE_TYPE_LABEL_KEY[type])}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note body */}
              <div>
                <label className="ind-form-label">
                  {t('internalNotesDrawer.noteLabel')}
                </label>
                <textarea
                  ref={textareaRef}
                  autoFocus
                  value={noteBody}
                  onChange={e => { committedNoteRef.current = e.target.value; setIsInterimNote(false); setNoteBody(e.target.value); }}
                  onBlur={e => reportDictationCorrection(e.target.value)}
                  placeholder={t('internalNotesDrawer.notePlaceholder')}
                  rows={4}
                  className="ind-textarea"
                  style={{ '--ind-textarea-border': isInterimNote ? 'rgba(8,145,178,0.6)' : 'rgba(255,255,255,0.1)' } as React.CSSProperties}
                />
                <div className="ind-note-hint-row">
                  {isInterimNote ? (
                    <span className="ind-listening-indicator">{t('internalNotesDrawer.listening')}</span>
                  ) : (
                    <span className="ind-note-hint">
                      {t('internalNotesDrawer.notInReportHint')}
                    </span>
                  )}
                </div>
              </div>

              {/* Visibility */}
              <div className="ind-visibility-row">
                <label className="ind-form-label ind-form-label--inline">{t('internalNotesDrawer.visibilityLabel')}</label>
                <div className="ind-visibility-btns">
                  {(['shared', 'private'] as InternalNoteVisibility[]).map(v => (
                    <button
                      key={v}
                      onClick={() => setNoteVisibility(v)}
                      className="ind-visibility-btn"
                      style={{
                        '--ind-vis-bg':     noteVisibility === v ? 'rgba(8,145,178,0.15)' : 'rgba(255,255,255,0.03)',
                        '--ind-vis-border': noteVisibility === v ? 'rgba(8,145,178,0.4)' : 'rgba(255,255,255,0.07)',
                        '--ind-vis-color':  noteVisibility === v ? '#0891B2' : '#64748b',
                      } as React.CSSProperties}
                    >
                      {v === 'shared' ? t('internalNotesDrawer.sharedOption') : t('internalNotesDrawer.privateOption')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message thread link indicator */}
              {messageThreadId && (
                <div className="ind-thread-indicator">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  {t('internalNotesDrawer.linkedToThread')}
                </div>
              )}

              {/* Actions */}
              <div className="ind-actions-row">
                <button
                  onClick={handleCancel}
                  className="ind-cancel-btn"
                >
                  {t('internalNotesDrawer.cancel')}
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!noteBody.trim() || submitting}
                  className="ind-save-btn"
                  style={{
                    '--ind-save-bg':     noteBody.trim() ? '#0891B2' : 'rgba(255,255,255,0.05)',
                    '--ind-save-color':  noteBody.trim() ? '#FFF' : '#64748b',
                    '--ind-save-cursor': noteBody.trim() ? 'pointer' : 'default',
                  } as React.CSSProperties}
                >
                  {submitting ? t('internalNotesDrawer.saving') : t('internalNotesDrawer.saveNote')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Notes List ── */}
        <div className="ind-notes-list">
          {loading ? (
            <div className="ind-loading">{t('internalNotesDrawer.loadingNotes')}</div>
          ) : notes.length === 0 ? (
            <div className="ind-empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
              <p className="ind-empty-text">{t('internalNotesDrawer.noNotesYet')}</p>
            </div>
          ) : (
            notes.map(note => {
              const colors  = NOTE_TYPE_COLORS[note.type];
              const isOwner = note.authorId === userId;
              return (
                <div
                  key={note.id}
                  className="ind-note-card"
                >
                  {/* Note header */}
                  <div className="ind-note-card-header">
                    <div className="ind-note-card-badges">
                      <span
                        className="ind-note-type-badge"
                        style={{ '--ind-badge-bg': colors.bg, '--ind-badge-color': colors.color, '--ind-badge-border': colors.border } as React.CSSProperties}
                      >
                        {t(NOTE_TYPE_LABEL_KEY[note.type])}
                      </span>
                      {note.visibility === 'private' && (
                        <span className="ind-private-badge">{t('internalNotesDrawer.privateOption')}</span>
                      )}
                      {note.messageThreadId && (
                        <span title={t('internalNotesDrawer.linkedToThread')} className="ind-thread-icon">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </span>
                      )}
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingId === note.id}
                        title={t('internalNotesDrawer.deleteNote')}
                        className="ind-delete-btn"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Note body */}
                  <p className="ind-note-body">{note.body}</p>

                  {/* Note footer */}
                  <div className="ind-note-footer">
                    <span className="ind-note-author">{note.authorName}</span>
                    <span>{formatDate(note.timestamp)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <style>{`
        @keyframes internalNoteSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      <ConfirmModal
        show={!!pendingDeleteId}
        title={t('internalNotesDrawer.deleteNoteTitle')}
        message={t('internalNotesDrawer.deleteNoteConfirm')}
        confirmLabel={t('internalNotesDrawer.delete')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
};

export default InternalNotesDrawer;
