// src/pages/EmbeddingStationPage/components/CommentDrawer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-285's own "Unified Comment Drawer: grossing notes +
// embedding-specific observations." Self-contained copy for this
// folder (not a shared import from MicrotomyWorkstationPage) — same
// real ps-overlay/ps-modal-dark modal convention, under this page's
// own ps-embedding-* prefix. Deliberately simpler than the Microtomy
// equivalent: embedding-station comments are plain block notes with
// no "prints on label" concept (addEmbeddingBlockComment has no such
// field — see that function's own doc comment), so there's no print
// toggle here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaterialComment } from '@/types/case/MaterialComment';

export interface CommentDrawerProps {
  title: string;
  comments: MaterialComment[];
  onSubmit: (text: string) => void;
  onClose: () => void;
}

const CommentDrawer: React.FC<CommentDrawerProps> = ({ title, comments, onSubmit, onClose }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark" onClick={e => e.stopPropagation()}>
        <div className="ps-batch-modal-header">
          <div className="ps-batch-modal-title">{title}</div>
        </div>
        <div className="ps-batch-modal-body">
          <ul className="ps-embedding-comment-list">
            {comments.length === 0 && <li className="ps-embedding-comment-item">{t('embeddingStation.comments.empty')}</li>}
            {comments.map(c => (
              <li key={c.id} className="ps-embedding-comment-item">
                {c.text}
                <div className="ps-embedding-comment-meta">{c.authorName} — {new Date(c.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
          <div className="ps-embedding-comment-input-row">
            <textarea
              className="ps-embedding-comment-textarea" value={text}
              placeholder={t('embeddingStation.comments.placeholder') ?? ''}
              onChange={e => setText(e.target.value)}
            />
          </div>
        </div>
        <div className="ps-batch-modal-footer">
          <button className="ps-btn-secondary" onClick={onClose}>{t('common.close')}</button>
          <button className="ps-btn-primary" disabled={!text.trim()} onClick={() => { onSubmit(text.trim()); setText(''); }}>
            {t('embeddingStation.comments.add')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentDrawer;
