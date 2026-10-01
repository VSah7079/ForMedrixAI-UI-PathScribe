/**
 * components/EnhancementRequest/EnhancementRequestButton.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Trigger button for Enhancement Requests and QA / Testing Feedback.
 *
 * mode="enhancement"  (default)
 *   💡 lightbulb — submits a product enhancement request
 *   Routes to the product team email (ENHANCEMENT_EMAIL in config)
 *
 * mode="qa"
 *   🐛 bug — submits QA / testing feedback
 *   Routes to QA team email (QA_EMAIL in config), cc's admin
 *   Categories restricted to QA-relevant set
 *   Only rendered in non-production environments unless showInProd=true
 *
 * Drop-in path: src/components/EnhancementRequest/EnhancementRequestButton.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { EnhancementRequestModal } from './EnhancementRequestModal';

export type EnhancementButtonMode = 'enhancement' | 'qa';

interface Props {
  mode?:        EnhancementButtonMode;
  showInProd?:  boolean;  // QA button only — show in production (default: false)
}

const ENV = import.meta.env.MODE ?? 'development';  // 'development' | 'staging' | 'production'

export const EnhancementRequestButton: React.FC<Props> = ({
  mode = 'enhancement',
  showInProd = false,
}) => {
  const { t }            = useTranslation();
  const [open, setOpen] = useState(false);

  // QA button hides in production unless explicitly enabled
  if (mode === 'qa' && ENV === 'production' && !showInProd) return null;

  const isQA    = mode === 'qa';
  const icon    = isQA ? '🐛' : '💡';
  const tooltip = isQA ? t('enhancementRequestButton.qaTooltip') : t('enhancementRequestButton.enhancementTooltip');

  const handleClick = () => setOpen(true);
  const handleClose = () => setOpen(false);

  return (
    <>
      <button
        onClick={handleClick}
        title={tooltip}
        className="erb-trigger-btn"
      >
        {icon}
      </button>

      {open && (
        <EnhancementRequestModal
          mode={mode}
          onClose={handleClose}
        />
      )}
    </>
  );
};
