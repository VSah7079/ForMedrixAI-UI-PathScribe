import React, { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { logEvent } from "../../audit/auditLogger";

interface Comment {
  id: string;
  author: string;
  text: string;
  resolved: boolean;
}

interface InlineCommentThreadProps {
  questionId:  string;
  templateId:  string;   // passed from parent — no longer hardcoded to DCIS
  currentUser?: string;
}

const COMMENTS_KEY_PREFIX = "ps_comments_";

export const InlineCommentThread: React.FC<InlineCommentThreadProps> = ({
  questionId,
  templateId,
  currentUser = "Dr. Reviewer"
}) => {
  const { t } = useTranslation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");

  const storageKey = `${COMMENTS_KEY_PREFIX}${templateId}_${questionId}`;

  // Load comments from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        setComments(JSON.parse(raw) as Comment[]);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  const persist = (next: Comment[]) => {
    setComments(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  // -----------------------------
  // Add Comment
  // -----------------------------
  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;

    const newComment: Comment = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      author: currentUser,
      text,
      resolved: false
    };

    const next = [...comments, newComment];
    persist(next);
    setDraft("");

    logEvent({
      user: currentUser,
      category: "user",
      action: "add_comment",
      templateId,
      questionId,
      commentId: newComment.id,
      newValue: text,
      detail: `Added comment: ${text}`,
    });
  };

  // -----------------------------
  // Resolve / Reopen Comment
  // -----------------------------
  const toggleResolved = (id: string) => {
    const next = comments.map(c =>
      c.id === id ? { ...c, resolved: !c.resolved } : c
    );
    persist(next);

    const updated = next.find(c => c.id === id);

    logEvent({
      user: currentUser,
      category: "user",
      action: updated?.resolved ? "resolve_comment" : "reopen_comment",
      templateId,
      questionId,
      commentId: id,
      detail: updated?.resolved ? "Comment resolved" : "Comment reopened",
    });
  };

  // -----------------------------
  // Render
  //
  // The "no comments yet" case and the "has comments" case share the
  // same comment-entry input — rendered once below, with the existing-
  // comments list shown only when there's something to show.
  // -----------------------------

  return (
    <div className="ps-inlinecomment-wrap">
      {comments.length > 0 && (
        <div className="ps-inlinecomment-list">
          {comments.map(c => (
            <div
              key={c.id}
              className={`ps-inlinecomment-row${c.resolved ? ' ps-inlinecomment-row--resolved' : ''}`}
            >
              <div>
                <strong>{c.author}</strong>: {c.text}
                {c.resolved && (
                  <span className="ps-inlinecomment-resolved-badge">
                    {t('inlineCommentThread.resolvedBadge')}
                  </span>
                )}
              </div>

              <button
                onClick={() => toggleResolved(c.id)}
                className="ps-inlinecomment-resolve-btn"
              >
                {c.resolved ? t('inlineCommentThread.reopenButton') : t('deliveryRulesSection.testPanel.resolveButton')}
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder={t('inlineCommentThread.addCommentPlaceholder')}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") handleAdd();
        }}
        className="ps-inlinecomment-input"
      />
    </div>
  );
};
