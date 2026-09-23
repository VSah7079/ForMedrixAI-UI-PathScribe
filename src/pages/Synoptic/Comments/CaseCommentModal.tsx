import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import PathScribeEditor from '../../../components/Editor/PathScribeEditor';
import { CommentModalShell } from './CommentModalShell';
import { OriginBadge } from './OriginBadge';
import type { CaseComment } from '../../../types/case/CaseComment';

interface CaseCommentModalProps {
  accession: string;
  comments: CaseComment[];
  currentUserId: string;
  currentUserName: string;
  onAddComment: (text: string) => void;
  onClose: () => void;
}

const formatTimestamp = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    });
  } catch { return iso; }
};

const CaseCommentModal: React.FC<CaseCommentModalProps> = ({
  accession, comments, currentUserId: _currentUserId, currentUserName, onAddComment, onClose,
  // _currentUserId: genuine prop, no consumer yet — no delete/edit-own-
  // comment logic exists in this modal at all today (checked). Likely
  // intended for a future authorship permission check ("can this user
  // edit/delete their own comment"), not dead code to remove.
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const isDraftEmpty = !draft.trim() || draft === '<p></p>';

  const handlePost = () => {
    if (isDraftEmpty) return;
    onAddComment(draft);
    setDraft('');
  };

  // Newest first — the most relevant thing when opening a case is the
  // latest update, not the oldest. Each entry still shows its own
  // timestamp, so chronological order is never ambiguous.
  const sorted = [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <CommentModalShell
      title={`📋 ${t('caseCommentModal.title')}`}
      subtitle={<>{t('caseCommentModal.subtitlePrefix')} <span data-phi="accession">{accession}</span> {t('caseCommentModal.subtitleSuffix')}</>}
      onClose={onClose}
      footerLeft={t('caseCommentModal.commentsOnCase', { count: comments.length })}
    >
      {/* ── New comment composer ── */}
      <div className="ps-cmnt-thread-composer">
        <div className="ps-cmnt-role-header">
          <span className="ps-cmnt-thread-author">{currentUserName}</span>
          <span className="ps-cmnt-role-note">{t('synopticComments.newCommentNote')}</span>
        </div>
        <PathScribeEditor
          key="modal-case-comment-composer"
          content={draft}
          placeholder={t('caseCommentModal.composerPlaceholder')}
          onChange={setDraft}
          minHeight="220px"
          theme="dark"
          allowThemeToggle
          showRulerDefault={false}
          macros={[]}
          approvedFonts={['Arial', 'Times New Roman', 'Calibri', 'Courier New']}
        />
        <button className="ps-cmnt-post-btn" onClick={handlePost} disabled={isDraftEmpty}>
          {t('synopticComments.postComment')}
        </button>
      </div>

      {/* ── Existing thread — append-only, nothing here is ever edited or
          deleted once posted. Each entry is its own record: real author,
          real timestamp, never silently overwritten by a later save. ── */}
      <div className="ps-cmnt-thread-list">
        {sorted.length === 0 && (
          <div className="ps-cmnt-thread-empty">{t('caseCommentModal.emptyThread')}</div>
        )}
        {sorted.map(c => (
          <div key={c.id} className="ps-cmnt-thread-item">
            <div className="ps-cmnt-role-header">
              <span className="ps-cmnt-thread-author">{c.authorName}</span>
              <span className="ps-cmnt-thread-timestamp">{formatTimestamp(c.createdAt)}</span>
              <OriginBadge comment={c} />
            </div>
            <div className="ps-cmnt-thread-text" dangerouslySetInnerHTML={{ __html: c.text }} />
          </div>
        ))}
      </div>
    </CommentModalShell>
  );
};

export { CaseCommentModal };
export type { CaseCommentModalProps };
