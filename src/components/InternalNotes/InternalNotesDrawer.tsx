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
import '../../pathscribe.css';
import { internalNoteService, INTERNAL_NOTE_TYPE_LABELS, informalReviewService } from '../../services';
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
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1199 }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0,
        width: '420px', height: '100vh',
        background: '#0F172A',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        zIndex: 1200,
        display: 'flex', flexDirection: 'column',
        animation: 'internalNoteSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0891B2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
              internal notes
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }} data-phi="accession">{accession}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px', marginTop: '2px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Internal Only Banner ── */}
        <div style={{ padding: '8px 20px', background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#F59E0B' }}>
            Internal use only — not included in the formatted patient report
          </span>
        </div>

        {/* ── Add Note Button / Form ── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#0891B2', border: 'none', color: '#FFF', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Internal Note
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Note type */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                  Note Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {(Object.entries(INTERNAL_NOTE_TYPE_LABELS) as [InternalNoteType, string][]).map(([type, label]) => {
                    const colors = NOTE_TYPE_COLORS[type];
                    const active = noteType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setNoteType(type)}
                        style={{
                          padding: '7px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                          background: active ? colors.bg : 'rgba(255,255,255,0.03)',
                          border: active ? `1px solid ${colors.border}` : '1px solid rgba(255,255,255,0.07)',
                          color: active ? colors.color : '#94a3b8',
                          transition: 'all 0.15s',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note body */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                  Note
                </label>
                <textarea
                  ref={textareaRef}
                  autoFocus
                  value={noteBody}
                  onChange={e => { committedNoteRef.current = e.target.value; setIsInterimNote(false); setNoteBody(e.target.value); }}
                  onBlur={e => reportDictationCorrection(e.target.value)}
                  placeholder="Enter your clinical note — avoid patient names, DOB, or MRN"
                  rows={4}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isInterimNote ? 'rgba(8,145,178,0.6)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '8px', padding: '10px 12px', color: '#f1f5f9',
                    fontSize: '14px', lineHeight: 1.6, resize: 'vertical', outline: 'none',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                    transition: 'border-color 0.2s',
                  }}
                />
                <div style={{ fontSize: '11px', marginTop: '-4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isInterimNote ? (
                    <span style={{ color: '#0891b2', fontWeight: 600 }}>● Listening…</span>
                  ) : (
                    <span style={{ color: '#475569' }}>
                      These notes are part of the clinical record but will not appear in the formatted patient report.
                    </span>
                  )}
                </div>
              </div>

              {/* Visibility */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Visibility</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['shared', 'private'] as InternalNoteVisibility[]).map(v => (
                    <button
                      key={v}
                      onClick={() => setNoteVisibility(v)}
                      style={{
                        padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        background: noteVisibility === v ? 'rgba(8,145,178,0.15)' : 'rgba(255,255,255,0.03)',
                        border: noteVisibility === v ? '1px solid rgba(8,145,178,0.4)' : '1px solid rgba(255,255,255,0.07)',
                        color: noteVisibility === v ? '#0891B2' : '#64748b',
                        transition: 'all 0.15s',
                      }}
                    >
                      {v === 'shared' ? '👥 Shared' : '🔒 Private'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message thread link indicator */}
              {messageThreadId && (
                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  Linked to message thread
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  onClick={handleCancel}
                  style={{ flex: 1, padding: '9px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!noteBody.trim() || submitting}
                  style={{ flex: 2, padding: '9px', borderRadius: '8px', background: noteBody.trim() ? '#0891B2' : 'rgba(255,255,255,0.05)', border: 'none', color: noteBody.trim() ? '#FFF' : '#64748b', fontWeight: 600, fontSize: '13px', cursor: noteBody.trim() ? 'pointer' : 'default', transition: 'background 0.15s' }}
                >
                  {submitting ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Notes List ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', paddingTop: '40px' }}>Loading notes...</div>
          ) : notes.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#334155' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
              <p style={{ fontSize: '14px', margin: 0 }}>No internal notes yet for this case</p>
            </div>
          ) : (
            notes.map(note => {
              const colors  = NOTE_TYPE_COLORS[note.type];
              const isOwner = note.authorId === userId;
              return (
                <div
                  key={note.id}
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                >
                  {/* Note header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}>
                        {INTERNAL_NOTE_TYPE_LABELS[note.type]}
                      </span>
                      {note.visibility === 'private' && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>🔒 Private</span>
                      )}
                      {note.messageThreadId && (
                        <span title="Linked to message thread" style={{ fontSize: '11px', color: '#64748b' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ verticalAlign: 'middle' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </span>
                      )}
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingId === note.id}
                        title="Delete note"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: '2px', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#FF453A'}
                        onMouseLeave={e => e.currentTarget.style.color = '#334155'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Note body */}
                  <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6 }}>{note.body}</p>

                  {/* Note footer */}
                  <div style={{ fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{note.authorName}</span>
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
        title="Delete Note"
        message="Delete this note? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
};

export default InternalNotesDrawer;
