/**
 * components/EnhancementRequest/EnhancementRequestModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Enhancement request submission modal.
 * Receives a pre-captured, PHI-redacted screenshot from EnhancementRequestButton.
 * User can approve or discard the screenshot before submitting.
 *
 * Drop-in path: src/components/EnhancementRequest/EnhancementRequestModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import ReactDOM from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  EnhancementRequestPayload,
  RequestCategory,
  RequestPriority,
  captureMetadata,
  submitEnhancementRequest,
  loadEnhancementConfig,
} from '../../services/enhancementRequestService';
import { useScreenCapture, ScreenCaptureResult } from '../../hooks/useScreenCapture';

// ─── Screenshot compression ───────────────────────────────────────────────────
// Resizes and re-encodes to JPEG to stay under EmailJS 50KB request limit.
async function compressScreenshot(dataUrl: string, maxWidth = 800, quality = 0.5): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale  = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original if it fails
    img.src = dataUrl;
  });
}

const ENHANCEMENT_CATEGORIES: RequestCategory[] = ['UI', 'Workflow', 'Reporting', 'Integrations', 'Other'];
const QA_CATEGORIES: RequestCategory[] = ['UI Bug', 'Functional Issue', 'Data Issue', 'Performance', 'Other'];
const PRIORITIES: RequestPriority[]  = ['Low', 'Medium', 'High'];

// The real category/priority values stay untouched — they're embedded in
// the emailed request payload (submitEnhancementRequest), read by the
// product/QA team in a different context. These map them to translated
// display labels only, same label-key-map pattern used elsewhere in this
// sweep.
const CATEGORY_LABEL_KEY: Record<RequestCategory, string> = {
  UI:                 'enhancementRequestModal.categories.ui',
  Workflow:           'enhancementRequestModal.categories.workflow',
  Reporting:          'enhancementRequestModal.categories.reporting',
  Integrations:       'enhancementRequestModal.categories.integrations',
  Other:              'enhancementRequestModal.categories.other',
  'UI Bug':           'enhancementRequestModal.categories.uiBug',
  'Functional Issue': 'enhancementRequestModal.categories.functionalIssue',
  'Data Issue':       'enhancementRequestModal.categories.dataIssue',
  Performance:        'enhancementRequestModal.categories.performance',
};

const PRIORITY_LABEL_KEY: Record<RequestPriority, string> = {
  Low:    'enhancementRequestModal.priorities.low',
  Medium: 'enhancementRequestModal.priorities.medium',
  High:   'enhancementRequestModal.priorities.high',
};

const PRIORITY_STYLES: Record<RequestPriority, { color: string; bg: string; border: string }> = {
  Low:    { color: '#94a3b8', bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.3)'  },
  Medium: { color: '#fbbf24', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)'   },
  High:   { color: '#f87171', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)'    },
};

// ─── Success screen ───────────────────────────────────────────────────────────

const SuccessScreen: React.FC<{ ticketUrl?: string; onClose: () => void }> = ({ ticketUrl, onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="erm-success">
      <div className="erm-success-icon">✅</div>
      <h3 className="erm-success-title">
        {t('enhancementRequestModal.submittedTitle')}
      </h3>
      <p className="erm-success-text">
        {t('enhancementRequestModal.submittedMessage')}
      </p>
      {ticketUrl && (
        <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="erm-success-link">
          {t('enhancementRequestModal.viewTicket')}
        </a>
      )}
      <button onClick={onClose} className="erm-success-done-btn">
        {t('enhancementRequestModal.done')}
      </button>
    </div>
  );
};

// ─── Screenshot preview ───────────────────────────────────────────────────────

const ScreenshotPreview: React.FC<{
  screenshot:  ScreenCaptureResult;
  included:    boolean;
  onToggle:    () => void;
}> = ({ screenshot, included, onToggle }) => {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = React.useState(false);
  return (
  <div>
    <label className="erm-label">
      {t('enhancementRequestModal.screenCaptureLabel')}
      <span className="erm-label-optional erm-shot-label-note">
        {t('enhancementRequestModal.phiAutoRedacted')}
      </span>
    </label>
    <div
      className="erm-shot-frame"
      style={{
        '--erm-shot-border':  included ? 'rgba(8,145,178,0.3)' : '#334155',
        '--erm-shot-opacity': included ? 1 : 0.4,
      } as React.CSSProperties}
      onClick={() => setLightbox(true)}
      title={t('enhancementRequestModal.clickToViewFullSize')}
    >
      <img
        src={screenshot.dataUrl}
        alt={t('enhancementRequestModal.screenCaptureAlt')}
        className="erm-shot-img"
      />
      <div className="erm-shot-expand-hint">{'🔍 '}{t('enhancementRequestModal.clickToExpand')}</div>
    </div>

    {/* Lightbox */}
    {lightbox && ReactDOM.createPortal(
      <div onClick={() => setLightbox(false)} className="erm-lightbox">
        <img
          src={screenshot.dataUrl}
          alt={t('enhancementRequestModal.screenCaptureFullSizeAlt')}
          className="erm-lightbox-img"
        />
        <button onClick={() => setLightbox(false)} className="erm-lightbox-close">
          {'✕ '}{t('enhancementRequestModal.close')}
        </button>
      </div>,
      document.body
    )}

    <div className="erm-shot-meta-row">
      <div className="erm-shot-meta-text">
        {(screenshot.redactedCount > 0 || screenshot.pdfRedactedCount > 0) ? (
          <>
            🔒{' '}
            {screenshot.redactedCount > 0 && t('enhancementRequestModal.phiFieldCount', { count: screenshot.redactedCount })}
            {screenshot.redactedCount > 0 && screenshot.pdfRedactedCount > 0 && ' · '}
            {screenshot.pdfRedactedCount > 0 && t('enhancementRequestModal.pdfReportMasked', { count: screenshot.pdfRedactedCount })}
            {' '}{t('enhancementRequestModal.redactedSuffix')}
          </>
        ) : `✓ ${t('enhancementRequestModal.noPhiDetected')}`}
        {' · '}{t('enhancementRequestModal.capturedAt', { time: new Date(screenshot.timestamp).toLocaleTimeString() })}
      </div>
      <button onClick={onToggle} className="erm-shot-toggle-btn"
        style={{ '--erm-shot-toggle-color': included ? '#f87171' : '#0891B2' } as React.CSSProperties}
      >
        {included ? t('enhancementRequestModal.remove') : t('enhancementRequestModal.include')}
      </button>
    </div>
  </div>
  );
};

// ─── Main modal ───────────────────────────────────────────────────────────────

export type EnhancementButtonMode = 'enhancement' | 'qa';

interface Props {
  onClose:  () => void;
  mode?:    EnhancementButtonMode;
}

export const EnhancementRequestModal: React.FC<Props> = ({ onClose, mode = 'enhancement' }) => {
  const { t } = useTranslation();
  const isQA = mode === 'qa';
  const { capture, isCapturing } = useScreenCapture();
  const { user } = useAuth();

  const [title,           setTitle]           = useState('');
  const [description,     setDescription]     = useState('');
  const [category,        setCategory]        = useState<RequestCategory>(isQA ? 'Functional Issue' : 'Workflow');
  const [priority,        setPriority]        = useState<RequestPriority | undefined>(undefined);
  const [includeSystem,   setIncludeSystem]   = useState(true);
  const [screenshot,        setScreenshot]        = useState<ScreenCaptureResult | null>(null);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);

  const handleCapture = async () => {
    const result = await capture();
    setScreenshot(result);
    setIncludeScreenshot(true);
  };
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [submitted,       setSubmitted]       = useState(false);
  const [ticketUrl,       setTicketUrl]       = useState<string | undefined>();

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    // Convert screenshot dataUrl to File if included
    const attachments: File[] = [];
    if (screenshot && includeScreenshot) {
      try {
        const res   = await fetch(screenshot.dataUrl);
        const blob  = await res.blob();
        const ts    = new Date(screenshot.timestamp).toISOString().replace(/[:.]/g, '-');
        attachments.push(new File([blob], `screenshot-${ts}.png`, { type: 'image/png' }));
      } catch { /* skip if conversion fails */ }
    }

    const payload: EnhancementRequestPayload = {
      title:         title.trim(),
      description:   description.trim(),
      category,
      priority,
      attachments,
      includeSystem,
      mode,
      screenshotDataUrl: (screenshot && includeScreenshot) ? await compressScreenshot(screenshot.dataUrl, 400, 0.3) : undefined,
      metadata: includeSystem && user
        ? captureMetadata({ id: user.id, name: user.name, role: user.role })
        : undefined,
    };

    try {
      const config = loadEnhancementConfig();
      const result = await submitEnhancementRequest(payload, config);
      if (result.success) {
        setTicketUrl(result.ticketUrl);
        setSubmitted(true);
      } else {
        setError(result.error ?? t('enhancementRequestModal.submissionFailed'));
      }
    } catch (err: any) {
      setError(err?.message ?? t('enhancementRequestModal.unexpectedError'));
    } finally {
      setSubmitting(false);
    }
  };

  const modal = (
    <div
      data-enhancement-modal="true"
      onClick={onClose}
      className="ps-overlay erm-overlay"
    >
      <div onClick={e => e.stopPropagation()} className="erm-modal">
        {submitted ? (
          <SuccessScreen ticketUrl={ticketUrl} onClose={onClose} />
        ) : (
          <>
            {/* Header */}
            <div className="erm-header" style={{ '--erm-header-bg': isQA ? 'rgba(245,158,11,0.06)' : 'rgba(8,145,178,0.04)' } as React.CSSProperties}>
              <div>
                <div className="erm-header-title">
                  <span>{isQA ? '🐛' : '💡'}</span>
                  {isQA ? t('enhancementRequestModal.qaHeaderTitle') : t('enhancementRequestModal.enhancementHeaderTitle')}
                </div>
                <div className="erm-header-subtitle">
                  {isQA
                    ? t('enhancementRequestModal.qaHeaderSubtitle')
                    : t('enhancementRequestModal.enhancementHeaderSubtitle')}
                </div>
              </div>
              <button onClick={onClose} className="erm-close-btn">✕</button>
            </div>

            {/* Body */}
            <div className="erm-body">

              {/* Title */}
              <div>
                <label className="erm-label">{t('enhancementRequestModal.titleLabel')} <span className="erm-label-required">*</span></label>
                <input
                  value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={t('enhancementRequestModal.titlePlaceholder')}
                  maxLength={120} className="erm-input" autoFocus
                />
                <div className="erm-char-count">
                  {title.length}/120
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="erm-label">{t('enhancementRequestModal.descriptionLabel')} <span className="erm-label-required">*</span></label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={t('enhancementRequestModal.descriptionPlaceholder')}
                  rows={4}
                  className="erm-input erm-textarea"
                />
              </div>

              {/* QA routing notice */}
              {isQA && (
                <div className="erm-qa-notice">
                  {'🐛 '}{t('enhancementRequestModal.qaRoutingNotice')}
                </div>
              )}

              {/* Category + Priority */}
              <div className="erm-cat-priority-row">
                <div className="erm-cat-col">
                  <label className="erm-label">{t('enhancementRequestModal.categoryLabel')}</label>
                  <div className="erm-cat-chips">
                    {(isQA ? QA_CATEGORIES : ENHANCEMENT_CATEGORIES).map(cat => {
                      const active = category === cat;
                      return (
                        <button key={cat} onClick={() => setCategory(cat)} className="erm-cat-chip"
                          style={{
                            '--erm-chip-bg':     active ? 'rgba(8,145,178,0.15)' : 'rgba(255,255,255,0.04)',
                            '--erm-chip-color':  active ? '#0891B2' : '#64748b',
                            '--erm-chip-border': active ? 'rgba(8,145,178,0.4)' : '#334155',
                          } as React.CSSProperties}
                        >{t(CATEGORY_LABEL_KEY[cat])}</button>
                      );
                    })}
                  </div>
                </div>
                <div className="erm-priority-col">
                  <label className="erm-label">{t('enhancementRequestModal.priorityLabel')} <span className="erm-label-optional">{t('enhancementRequestModal.optionalNote')}</span></label>
                  <div className="erm-priority-list">
                    {PRIORITIES.map(p => {
                      const s = PRIORITY_STYLES[p];
                      const active = priority === p;
                      return (
                        <button key={p} onClick={() => setPriority(active ? undefined : p)} className="erm-priority-btn"
                          style={{
                            '--erm-priority-bg':     active ? s.bg     : 'rgba(255,255,255,0.03)',
                            '--erm-priority-color':  active ? s.color  : '#475569',
                            '--erm-priority-border': active ? s.border : '#334155',
                          } as React.CSSProperties}
                        >{t(PRIORITY_LABEL_KEY[p])}</button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Screen capture — opt-in */}
              {!screenshot ? (
                <div>
                  <label className="erm-label">{t('enhancementRequestModal.screenCaptureLabel')}</label>
                  <button
                    onClick={handleCapture}
                    disabled={isCapturing}
                    className="erm-capture-btn"
                    style={{
                      '--erm-capture-border': isCapturing ? '#334155' : '#334155',
                      '--erm-capture-color':  isCapturing ? '#475569' : '#94a3b8',
                      '--erm-capture-cursor': isCapturing ? 'wait' : 'pointer',
                    } as React.CSSProperties}
                  >
                    {isCapturing ? `⏳ ${t('enhancementRequestModal.capturing')}` : `📷 ${t('enhancementRequestModal.captureCurrentScreen')}`}
                  </button>
                  <div className="erm-capture-hint">
                    {t('enhancementRequestModal.captureHint')}
                  </div>
                </div>
              ) : (
                <ScreenshotPreview
                  screenshot={screenshot}
                  included={includeScreenshot}
                  onToggle={() => setIncludeScreenshot(v => !v)}
                />
              )}

              {/* Include system details toggle */}
              <div
                onClick={() => setIncludeSystem(v => !v)}
                className="erm-system-toggle"
                style={{
                  '--erm-toggle-bg':    includeSystem ? 'rgba(8,145,178,0.06)' : 'rgba(255,255,255,0.02)',
                  '--erm-toggle-border': includeSystem ? 'rgba(8,145,178,0.2)' : '#334155',
                  '--erm-toggle-color': includeSystem ? '#0891B2' : '#94a3b8',
                } as React.CSSProperties}
              >
                <div className="erm-switch" style={{ '--erm-switch-bg': includeSystem ? '#0891B2' : 'rgba(255,255,255,0.1)' } as React.CSSProperties}>
                  <span className="erm-switch-knob" style={{ '--erm-switch-left': includeSystem ? '19px' : '3px' } as React.CSSProperties} />
                </div>
                <div>
                  <div className="erm-system-title">
                    {t('enhancementRequestModal.includeSystemDetails')}
                  </div>
                  <div className="erm-system-desc">
                    {t('enhancementRequestModal.includeSystemDetailsHint')}
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="erm-error">
                  {'⚠ '}{error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="erm-footer">
              <button onClick={onClose} className="ps-conf-btn-secondary">
                {t('enhancementRequestModal.cancel')}
              </button>
              <button
                onClick={handleSubmit} disabled={!canSubmit}
                className={`ps-enhance-submit-btn${isQA ? ' ps-enhance-submit-btn--qa' : ''}`}
                style={{ opacity: submitting ? 0.7 : 1 }}
              >
                {submitting
                  ? `⏳ ${t('enhancementRequestModal.submitting')}`
                  : isQA
                    ? `🐛 ${t('enhancementRequestModal.submitQaFeedback')}`
                    : `💡 ${t('enhancementRequestModal.submitRequest')}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};
