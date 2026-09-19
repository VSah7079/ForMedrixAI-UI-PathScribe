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
import React, { useState } from 'react';
import '../../../pathscribe.css';

export type NarrativeTargetField = 'gross' | 'microscopic' | 'ancillary';

interface AiNarrativeReviewModalProps {
  narrativeText: string;
  defaultTargetField: NarrativeTargetField;
  onAccept: (finalText: string, targetField: NarrativeTargetField) => void;
  onCancel: () => void;
}

const TARGET_FIELD_OPTIONS: { value: NarrativeTargetField; label: string }[] = [
  { value: 'gross', label: 'Gross Description' },
  { value: 'microscopic', label: 'Microscopic Description' },
  { value: 'ancillary', label: 'Ancillary Studies' },
];

export const AiNarrativeReviewModal: React.FC<AiNarrativeReviewModalProps> = ({
  narrativeText, defaultTargetField, onAccept, onCancel,
}) => {
  const [text, setText] = useState(narrativeText);
  const [targetField, setTargetField] = useState<NarrativeTargetField>(defaultTargetField);

  return (
    <div className="ps-overlay" style={{ zIndex: 9500 }}>
      <div className="ps-modal-dark ps-ai-review-modal">

        <div className="ps-ai-review-header">
          <div>
            <div className="ps-ai-review-eyebrow">\u2726 AI-Generated Narrative</div>
            <div className="ps-ai-review-title">Review and edit before inserting into the report</div>
          </div>
          <button onClick={onCancel} className="ps-modal-close">\u00d7</button>
        </div>

        <div className="ps-ai-review-body">
          <span className="fm-eyebrow">Insert into</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 14 }}>
            {TARGET_FIELD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTargetField(opt.value)}
                className={targetField === opt.value ? 'ps-btn-primary' : 'ps-btn-ghost-dark'}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="fm-eyebrow">Generated Text \u2014 edit freely before accepting</span>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            rows={12}
            className="ps-amendment-textarea"
            style={{ marginTop: 6 }}
          />
        </div>

        <div className="ps-modal-dark-footer ps-ai-review-footer">
          <button onClick={onCancel} className="ps-btn-ghost-dark">Discard</button>
          <button
            onClick={() => onAccept(text, targetField)}
            className="ps-btn-primary"
            disabled={text.trim().length === 0}
          >
            Insert into {TARGET_FIELD_OPTIONS.find(o => o.value === targetField)?.label}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AiNarrativeReviewModal;
