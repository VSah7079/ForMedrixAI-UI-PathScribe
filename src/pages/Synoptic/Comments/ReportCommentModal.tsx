import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import PathScribeEditor from '../../../components/Editor/PathScribeEditor';
import { CommentModalShell } from './CommentModalShell';
import { OriginBadge } from './OriginBadge';
import type { CaseComment } from '../../../types/case/CaseComment';

interface ReportCommentModalProps {
  specimenName: string;     // full breadcrumb string, e.g. "Left Breast Mastectomy › Breast — Invasive Carcinoma"
  specimenId: string;
  comments: CaseComment[];
  isFinalized: boolean;
  currentUserId: string;
  currentUserName: string;
  onAddComment: (text: string) => void;
  onClose: () => void;
}

const formatTimestamp = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
};

const ReportCommentModal: React.FC<ReportCommentModalProps> = ({
  specimenName, specimenId, comments, isFinalized, currentUserId: _currentUserId, currentUserName, onAddComment, onClose,
  // _currentUserId: same as CaseCommentModal.tsx — genuine prop, no
  // authorship-permission consumer built yet.
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const isDraftEmpty = !draft.trim() || draft === '<p></p>';
  const parts = specimenName.split(' › ');
  const titleName = parts[0] ?? specimenName;

  const handlePost = () => {
    if (isDraftEmpty || isFinalized) return;
    onAddComment(draft);
    setDraft('');
  };

  const sorted = [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <CommentModalShell
      title={`💬 ${titleName}`}
      subtitle={
        <div className="ps-cmnt-subtitle-row">
          {parts.length > 1 && <span className="ps-cmnt-subtitle-context">{parts.slice(1).join(' › ')}</span>}
          {isFinalized
            ? <span className="ps-cmnt-status-finalized">🔒 {t('reportCommentModal.finalizedReadOnly')}</span>
            : <span className="ps-cmnt-status-saved">{t('reportCommentModal.commentsCount', { count: comments.length })}</span>
          }
        </div>
      }
      onClose={onClose}
      editorMode
      footerLeft={t('reportCommentModal.footerNote')}
    >
      {!isFinalized && (
        <div className="ps-cmnt-thread-composer">
          <div className="ps-cmnt-role-header">
            <span className="ps-cmnt-thread-author">{currentUserName}</span>
            <span className="ps-cmnt-role-note">{t('synopticComments.newCommentNote')}</span>
          </div>
          <PathScribeEditor
            key={`modal-report-comment-composer-${specimenId}`}
            content={draft}
            placeholder={t('reportCommentModal.composerPlaceholder', { titleName })}
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
      )}

      <div className="ps-cmnt-thread-list">
        {sorted.length === 0 && (
          <div className="ps-cmnt-thread-empty">{t('reportCommentModal.emptyThread')}</div>
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

export { ReportCommentModal };
export type { ReportCommentModalProps };
