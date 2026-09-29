// src/pages/MicrotomyWorkstationPage/components/CommentDrawer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284's own "3. Comment Systems: Unified Comment Drawer,
// badge showing active comment count." Reuses ps-overlay/ps-modal-dark
// — the same real modal convention GrossingScreenPage's own confirm
// dialogs and BlockStainEditorModal already use — rather than a new,
// bespoke slide-out panel treatment.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaterialComment } from '@/types/case/MaterialComment';

export interface CommentDrawerProps {
  title: string;
  comments: MaterialComment[];
  showPrintToggle: boolean;
  onSubmit: (text: string, printsOnLabel: boolean) => void;
  onClose: () => void;
}

const CommentDrawer: React.FC<CommentDrawerProps> = ({ title, comments, showPrintToggle, onSubmit, onClose }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [printsOnLabel, setPrintsOnLabel] = useState(false);

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark" onClick={e => e.stopPropagation()}>
        <div className="ps-batch-modal-header">
          <div className="ps-batch-modal-title">{title}</div>
        </div>
        <div className="ps-batch-modal-body">
          <ul className="ps-microtomy-comment-list">
            {comments.length === 0 && <li className="ps-microtomy-comment-item">{t('microtomyWorkstation.comments.empty')}</li>}
            {comments.map(c => (
              <li key={c.id} className="ps-microtomy-comment-item">
                {c.text}
                <div className="ps-microtomy-comment-meta">{c.authorName} — {new Date(c.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
          <div className="ps-microtomy-comment-input-row">
            <textarea
              className="ps-microtomy-comment-textarea" value={text}
              placeholder={t('microtomyWorkstation.comments.placeholder') ?? ''}
              onChange={e => setText(e.target.value)}
            />
          </div>
          {showPrintToggle && (
            <label className="ps-microtomy-checkbox-label ps-mt-8">
              <input type="checkbox" checked={printsOnLabel} onChange={e => setPrintsOnLabel(e.target.checked)} />
              {t('microtomyWorkstation.comments.printOnLabel')}
            </label>
          )}
        </div>
        <div className="ps-batch-modal-footer">
          <button className="ps-btn-secondary" onClick={onClose}>{t('common.close')}</button>
          <button className="ps-btn-primary" disabled={!text.trim()} onClick={() => { onSubmit(text.trim(), printsOnLabel); setText(''); }}>
            {t('microtomyWorkstation.comments.add')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentDrawer;
