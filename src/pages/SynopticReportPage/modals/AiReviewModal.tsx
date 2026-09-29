/**
 * AiReviewModal — AI Triage / Spell-checker Flow
 * Keyboard: Space/→ = Confirm, O = Override, S = Skip, Esc = Cancel
 *
 * i18n note: `current.fieldLabel`/`.sectionTitle`/`.source`/`.aiValue`
 * (and the derived `displayValue`) are all real, AI-extracted report
 * data — never translated.
 */
import React, { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';

export interface ReviewField {
  fieldId:      string;
  fieldLabel:   string;
  sectionTitle: string;
  aiValue:      string | string[];
  confidence:   number;
  source:       string;
  verification: 'unverified' | 'verified' | 'disputed';
  /** True when this field's AI-cited source genuinely can't be located
   *  verbatim in the report text (see utils/sourceTextMatching.ts) —
   *  distinct from low confidence. A field can be flagged here even at
   *  94%+ confidence, since a confident-but-unverifiable value is
   *  arguably a bigger concern than an honestly-uncertain one, not a
   *  smaller one. */
  sourceNotFound?: boolean;
}

interface AiReviewModalProps {
  fields:          ReviewField[];
  finalizeAndNext: boolean;
  onConfirm:       (fieldId: string) => void;
  onOverride:      (fieldId: string) => void;
  onSkip:          (fieldId: string) => void;
  onComplete:      (summary: { confirmed: string[]; overridden: string[]; skipped: string[] }) => void;
  onCancel:        () => void;
}

// Dynamic — changes at runtime, must stay inline
const confTier = (c: number): 'high' | 'medium' | 'low' =>
  c >= 85 ? 'high' : c >= 60 ? 'medium' : 'low';

export const AiReviewModal: React.FC<AiReviewModalProps> = ({
  fields, finalizeAndNext, onConfirm, onOverride, onSkip, onComplete, onCancel,
}) => {
  const { t } = useTranslation();
  const [index,      setIndex]     = useState(0);
  const [skipped,    setSkipped]   = useState<string[]>([]);
  const [confirmed,  setConfirmed] = useState<string[]>([]);
  const [overridden, setOverridden]= useState<string[]>([]);

  const current = fields[index];
  const total   = fields.length;
  const isDone  = index >= total;

  const advance = useCallback(() => {
    if (index + 1 >= total) onComplete({ confirmed, overridden, skipped });
    else setIndex(i => i + 1);
  }, [index, total, onComplete, confirmed, overridden, skipped]);

  const handleConfirm  = useCallback(() => { if (!current) return; onConfirm(current.fieldId);  setConfirmed(c => [...c, current.fieldId]);  advance(); }, [current, onConfirm,  advance]);
  const handleOverride = useCallback(() => { if (!current) return; onOverride(current.fieldId); setOverridden(o => [...o, current.fieldId]); advance(); }, [current, onOverride, advance]);
  const handleSkip     = useCallback(() => { if (!current) return; onSkip(current.fieldId);     setSkipped(s => [...s, current.fieldId]);    advance(); }, [current, onSkip,     advance]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); handleConfirm(); }
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); handleOverride(); }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); handleSkip(); }
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleConfirm, handleOverride, handleSkip, onCancel]);

  useEffect(() => {
    const c = () => handleConfirm();
    const o = () => handleOverride();
    const s = () => handleSkip();
    const x = () => onCancel();
    window.addEventListener('PATHSCRIBE_AI_REVIEW_CONFIRM',  c);
    window.addEventListener('PATHSCRIBE_AI_REVIEW_OVERRIDE', o);
    window.addEventListener('PATHSCRIBE_AI_REVIEW_SKIP',     s);
    window.addEventListener('PATHSCRIBE_AI_REVIEW_CANCEL',   x);
    return () => {
      window.removeEventListener('PATHSCRIBE_AI_REVIEW_CONFIRM',  c);
      window.removeEventListener('PATHSCRIBE_AI_REVIEW_OVERRIDE', o);
      window.removeEventListener('PATHSCRIBE_AI_REVIEW_SKIP',     s);
      window.removeEventListener('PATHSCRIBE_AI_REVIEW_CANCEL',   x);
    };
  }, [handleConfirm, handleOverride, handleSkip, onCancel]);

  if (isDone) return null;

  const progress     = Math.round((index / total) * 100);
  const displayValue = Array.isArray(current.aiValue) ? current.aiValue.join(', ') : current.aiValue;
  const tier         = confTier(current.confidence);

  return (
    <div className="ps-overlay ps-overlay--ai-review">
      <div className="ps-modal-dark ps-ai-review-modal">

        <div className="ps-ai-review-header">
          <div>
            <div className="ps-ai-review-eyebrow">
              ✦ {t('aiReviewModal.eyebrowLabel')} · {finalizeAndNext ? t('preFinalisationModal.signing.finaliseAndNext') : t('headerBar.stage.finalise')}
            </div>
            <div className="ps-ai-review-title">{t('aiReviewModal.title')}</div>
          </div>
          <button onClick={onCancel} className="ps-modal-close">×</button>
        </div>

        <div className="ps-ai-review-progress-track">
          <div className="ps-ai-review-progress-fill" style={{ '--bar-pct': `${progress}%` } as React.CSSProperties} />
        </div>

        <div className="ps-ai-review-counter">
          <span className="ps-ai-review-counter-text">
            {t('aiReviewModal.counter', { index: index + 1, total })}
            {skipped.length > 0 && (
              <span className="ps-ai-review-skipped-count">
                {' '}· {t('aiReviewModal.skippedCount', { count: skipped.length })}
              </span>
            )}
          </span>
          <div className="ps-ai-review-dots">
            {fields.map((f, i) => (
              <div
                key={i}
                className={`ps-ai-review-dot${
                  i < index
                    ? (skipped.includes(f.fieldId) ? ' ps-ai-review-dot--skipped' : ' ps-ai-review-dot--done')
                    : i === index ? ' ps-ai-review-dot--current' : ''
                }`}
              />
            ))}
          </div>
        </div>

        <div className="ps-ai-review-body">
          <span className="fm-eyebrow">{current.sectionTitle}</span>
          <div className="ps-ai-review-field-label">{current.fieldLabel}</div>

          <div className="ps-ai-review-card">
            <div className="ps-ai-review-card-header">
              <span className="ps-ai-review-card-eyebrow">✦ {t('aiContributionTab.overrides.aiCol')}</span>
              <span className={`ps-ai-review-confidence ps-ai-review-confidence--${tier}`}>
                {t('aiReviewModal.confidencePercent', { percent: current.confidence })}
              </span>
            </div>
            <div className="ps-ai-review-card-value">{displayValue || '—'}</div>
            <div className="ps-ai-review-card-source">{current.source}</div>
            {current.sourceNotFound && (
              <div
                className="ps-ai-review-source-not-found"
                title={t('aiReviewModal.sourceNotFoundTooltip')}
              >
                <span aria-hidden="true">⚠</span> {t('aiReviewModal.sourceNotFoundBanner')}
              </div>
            )}
          </div>

          <div className="ps-ai-review-hints">
            {([
              { key: 'Space / →', labelKey: 'common.confirm',                                 variant: 'confirm' },
              { key: 'O',         labelKey: 'billingReviewPanel.overrideButton',               variant: 'override' },
              { key: 'S',         labelKey: 'common.skip',                                    variant: 'skip' },
              { key: 'Esc',       labelKey: 'common.cancel',                                   variant: 'cancel' },
            ] as const).map(h => (
              <div key={h.key} className={`ps-ai-review-hint ps-ai-review-hint--${h.variant}`}>
                <kbd className="ps-ai-review-hint-key">{h.key}</kbd>
                <span className="ps-ai-review-hint-label">{t(h.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ps-modal-dark-footer ps-ai-review-footer">
          <button onClick={handleSkip}     className="ps-btn-ghost-dark">{t('aiReviewModal.footerSkipButton')}</button>
          <button onClick={handleOverride} className="ps-btn-amber">{t('aiReviewModal.footerOverrideButton')}</button>
          <button onClick={handleConfirm}  className="ps-btn-primary">
            {index + 1 < total ? t('aiReviewModal.footerConfirmNextButton') : t('aiReviewModal.footerConfirmFinaliseButton')}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AiReviewModal;
