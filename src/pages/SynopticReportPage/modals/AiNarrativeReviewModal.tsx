/**
 * AiNarrativeReviewModal — real, per direct guidance's own confirmed
 * PS-275 scope: generated PROSE has no confidence score the way a
 * discrete field value does, so this is deliberately its own, simpler
 * design rather than a reuse of AiReviewModal.tsx's own keyboard-driven,
 * per-field triage flow. The one real principle carried over from
 * AiReviewModal: AI-generated content never lands in the real report
 * silently — the pathologist reviews (and can freely edit) it here
 * first, every time.
 */

// i18n note: the eyebrow star (\u2726) and close-button (\u00d7) symbols were
// literal, broken `\u2726`/`\u00d7` escape-sequence TEXT in JSX
// children (JSX text isn't a JS string literal, so those six
// characters rendered on screen as-is rather than as the intended
// symbols) \u2014 fixed to the actual characters as part of this
// conversion, matching the sibling AiReviewModal.tsx's own \u2726/\u00d7 usage.
// The three target-field labels reuse existing exact-text keys
// (`leftReportPanel.sections.grossDescription`/`.ancillaryStudies`,
// `patientHistoryModal.field.microscopicDescription`) rather than
// duplicating strings that already name the same real report fields
// elsewhere.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { SpellCheckedTextarea } from '@/components/SpellCheck/SpellCheckedTextarea';

export type NarrativeTargetField = 'gross' | 'microscopic' | 'ancillary';

interface AiNarrativeReviewModalProps {
  narrativeText: string;
  defaultTargetField: NarrativeTargetField;
  onAccept: (finalText: string, targetField: NarrativeTargetField) => void;
  onCancel: () => void;
}

const TARGET_FIELD_OPTIONS: { value: NarrativeTargetField; labelKey: string }[] = [
  { value: 'gross', labelKey: 'leftReportPanel.sections.grossDescription' },
  { value: 'microscopic', labelKey: 'patientHistoryModal.field.microscopicDescription' },
  { value: 'ancillary', labelKey: 'leftReportPanel.sections.ancillaryStudies' },
];

export const AiNarrativeReviewModal: React.FC<AiNarrativeReviewModalProps> = ({
  narrativeText, defaultTargetField, onAccept, onCancel,
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState(narrativeText);
  const [targetField, setTargetField] = useState<NarrativeTargetField>(defaultTargetField);

  return (
    <div className="ps-overlay ps-overlay--ai-review">
      <div className="ps-modal-dark ps-ai-review-modal">

        <div className="ps-ai-review-header">
          <div>
            <div className="ps-ai-review-eyebrow">\u2726 {t('aiNarrativeReviewModal.eyebrow')}</div>
            <div className="ps-ai-review-title">{t('aiNarrativeReviewModal.title')}</div>
          </div>
          <button onClick={onCancel} className="ps-modal-close">\u00d7</button>
        </div>

        <div className="ps-ai-review-body">
          <span className="fm-eyebrow">{t('aiNarrativeReviewModal.insertIntoLabel')}</span>
          <div className="ps-flex-row-gap-8 ps-mt-6 ps-mb-14">
            {TARGET_FIELD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTargetField(opt.value)}
                className={`ps-ai-narrative-target-btn ${targetField === opt.value ? 'ps-btn-primary' : 'ps-btn-ghost-dark'}`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>

          <span className="fm-eyebrow">{t('aiNarrativeReviewModal.generatedTextLabel')}</span>
          <SpellCheckedTextarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            rows={12}
            className="ps-amendment-textarea ps-mt-6"
          />
        </div>

        <div className="ps-modal-dark-footer ps-ai-review-footer">
          <button onClick={onCancel} className="ps-btn-ghost-dark">{t('aiNarrativeReviewModal.discardButton')}</button>
          <button
            onClick={() => onAccept(text, targetField)}
            className="ps-btn-primary"
            disabled={text.trim().length === 0}
          >
            {t('aiNarrativeReviewModal.insertIntoButton', { field: t(TARGET_FIELD_OPTIONS.find(o => o.value === targetField)!.labelKey) })}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AiNarrativeReviewModal;
