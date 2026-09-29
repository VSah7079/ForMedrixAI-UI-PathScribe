// src/components/Common/ConfirmModal.tsx
// Reusable dark confirmation dialog — replaces window.confirm() throughout the app.
//
// i18n note: `title`/`message` are always caller-supplied — each
// caller is responsible for passing already-translated content. Only
// this component's own baked-in `confirmLabel`/`cancelLabel`
// defaults are its own UI copy; they reuse `common.confirm`/
// `common.cancel` (exact-text matches). The default can't itself
// call a hook, so it's resolved inside the component body instead of
// in destructuring (same fix as batch 215's `Dropdown.tsx`).

import React from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';

interface ConfirmModalProps {
  show: boolean;
  title?: string;
  // ReactNode, not string — PS-72: a caller whose confirmation text embeds
  // real PHI (a patient name, MRN, etc.) needs a place to hang a
  // data-phi="true" span so useScreenCapture.ts's redaction pass can find
  // it; a plain string has no DOM node to tag. A plain string still works
  // unchanged for every non-PHI caller — ReactNode accepts both.
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  show,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  if (!show) return null;
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');

  return (
    <div className="ps-overlay ps-overlay--confirm">
      <div className="ps-modal-dark ps-modal-sm">
        {title && <span className="ps-modal-dark-title ps-modal-dark-title--confirm">{title}</span>}
        <p className="ps-modal-dark-body ps-modal-dark-body--confirm">{message}</p>
        <div className="ps-modal-dark-footer">
          <button type="button" className="ps-btn-ghost-dark" onClick={onCancel}>
            {resolvedCancelLabel}
          </button>
          <button type="button" className="ps-btn-amber" onClick={onConfirm}>
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
