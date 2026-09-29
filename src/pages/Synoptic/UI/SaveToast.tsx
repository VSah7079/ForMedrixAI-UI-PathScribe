// src/pages/Synoptic/UI/SaveToast.tsx
// The report page's toast. Batch 349 (PS-100): shows the message's kind
// (it used to show a green check even for failures), can be closed with a
// click or its ×, and is announced to screen readers (an alert for warnings
// and errors). How long it stays is decided by useSynopticToast.
// Batch 363 (PS-72): a message marked `containsPhi` is tagged data-phi so the
// support-ticket screenshot redacts it.
import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import type { ToastKind } from '@/utils/toastPolicy';

const ICON: Record<ToastKind, string> = { success: '✓', info: 'ℹ', warning: '⚠', error: '✕' };

const SaveToast: React.FC<{ message: string; visible: boolean; kind?: ToastKind; containsPhi?: boolean; onDismiss?: () => void }> = ({ message, visible, kind = 'success', containsPhi, onDismiss }) => {
  const { t } = useTranslation();
  const urgent = kind === 'warning' || kind === 'error';
  return (
    <div
      className={`ps-save-toast ps-save-toast--${kind}${visible ? ' ps-save-toast--visible' : ''}`}
      role={urgent ? 'alert' : 'status'}
      aria-hidden={!visible}
      onClick={visible ? onDismiss : undefined}
    >
      <span className="ps-save-toast-check" aria-hidden="true">{ICON[kind]}</span>
      <span className="ps-save-toast-text" data-phi={containsPhi ? 'true' : undefined}>{message}</span>
      {visible && onDismiss && (
        <button type="button" className="ps-save-toast-close" aria-label={t('saveToast.close')} onClick={e => { e.stopPropagation(); onDismiss(); }}>×</button>
      )}
    </div>
  );
};

export { SaveToast };
