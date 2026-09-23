import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';

// Shared by both Case and Specimen comment modals -- one remembered
// position for "the comment dialog" generally, not split per-context.
// Same persistence pattern already used for the EMR companion window:
// load on mount, save on drag-end, clamp against the CURRENT viewport
// (not just whatever was true when it was last dragged) so it can never
// get stranded off-screen if the window/monitor changes.
const STORAGE_KEY = 'ps-cmnt-modal-pos';

interface Pos { x: number; y: number; }

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    // Offset is from viewport center. Clamp so the modal's header stays
    // reachable even if this position was saved on a larger screen.
    const maxX = window.innerWidth  * 0.35;
    const maxY = window.innerHeight * 0.35;
    return {
      x: Math.min(Math.max(parsed.x, -maxX), maxX),
      y: Math.min(Math.max(parsed.y, -maxY), maxY),
    };
  } catch {
    return null;
  }
}

function savePos(pos: Pos) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore quota errors */ }
}

const CommentModalShell: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  editorMode?: boolean;
}> = ({ title, subtitle, onClose, children, footerLeft, editorMode }) => {
  const { t } = useTranslation();
  const [pos, setPos] = React.useState<Pos | null>(() => loadPos());
  const dragging   = React.useRef(false);
  const dragStart  = React.useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragging.current = true;
    const current = pos ?? { x: 0, y: 0 };
    dragStart.current = { mx: e.clientX, my: e.clientY, px: current.x, py: current.y };
  };

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: dragStart.current.px + (e.clientX - dragStart.current.mx), y: dragStart.current.py + (e.clientY - dragStart.current.my) });
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setPos(p => { if (p) savePos(p); return p; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const isPositioned = pos !== null;

  return (
    <div
      data-capture-hide="true"
      className={`ps-cmnt-overlay${isPositioned ? '' : ' ps-cmnt-overlay--dimmed'}`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="ps-cmnt-modal"
        style={isPositioned ? {
          position: 'fixed',
          left: `calc(50% + ${pos!.x}px)`,
          top:  `calc(50% + ${pos!.y}px)`,
          transform: 'translate(-50%, -50%)',
        } : { position: 'relative' }}
      >
        {/* Header */}
        <div className="ps-cmnt-header" onMouseDown={onHeaderMouseDown}>
          <div className="ps-cmnt-header-left">
            <div className="ps-cmnt-header-title-row">
              <span className="ps-cmnt-grip">⠿</span>
              <h3 className="ps-cmnt-title">{title}</h3>
            </div>
            {subtitle && <div className="ps-cmnt-subtitle">{subtitle}</div>}
          </div>
          <button className="ps-cmnt-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className={editorMode ? 'ps-cmnt-body--editor' : 'ps-cmnt-body'}>
          {children}
        </div>

        {/* Footer */}
        {/* Real fix (PS-312 — "the Case and Specimen Comment 'Save'
            button should not be active/clickable unless there's
            actually something to save"): checked both real callers
            (CaseCommentModal.tsx, ReportCommentModal.tsx) — this
            button never actually saved anything. Every real comment
            here is an append-only thread entry, already committed the
            moment "Post Comment" is clicked (that button already has
            its own, correct disabled-while-empty guard); this footer
            button's own onClick has only ever been onClose. Labeling
            a plain close action "Save" is what actually produced the
            reported confusion — it implies a draft sitting in the
            composer gets persisted by clicking it, when it would
            really just be discarded, same as the header's own ✕. The
            honest fix is the label, not a disabled state a close
            action was never going to have: renamed to say what it
            does, matching ✕ exactly, so there's no longer a "Save"
            control here to wonder about enabling or disabling. */}
        <div className="ps-cmnt-footer">
          <div className="ps-cmnt-footer-note">{footerLeft}</div>
          <button className="ps-cmnt-save-btn" onClick={onClose}>{t('commentModalShell.close')}</button>
        </div>
      </div>
    </div>
  );
};

export { CommentModalShell };
