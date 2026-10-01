/**
 * components/TemplateRequest/TemplateRequestModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Pathologist-facing form to request a new synoptic template.
 *
 * - Submits via messageService.send() to the admin pool (u3 / System Admin)
 * - Embeds structured request metadata in the message body as JSON
 * - Base template selector pulls from published PROTOCOL_REGISTRY entries
 * - Admin can open the template editor pre-populated via the link in the message
 *
 * Entry points:
 *   1. AddSynopticModal — "Don't see what you need? Request a template →"
 *   2. Home page — alongside Enhancement Request tile
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { messageService } from '@/services';
import { useAuth } from '@/contexts/AuthContext';
import { useMessaging } from '@/contexts/MessagingContext';
import { PROTOCOL_REGISTRY } from '@/components/Config/Protocols/protocolShared';

// ─── Constants ────────────────────────────────────────────────────────────────

// The real organ value stays untouched (embedded English in the message
// subject/body/JSON metadata sent to the admin pool); labelKey is only
// used to render the translated option text — same label-key-map pattern
// used elsewhere in this sweep.
const ORGANS: { value: string; labelKey: string }[] = [
  { value: 'Breast',              labelKey: 'templateRequestModal.organs.breast' },
  { value: 'Colorectal / Rectum', labelKey: 'templateRequestModal.organs.colorectalRectum' },
  { value: 'Lung',                labelKey: 'templateRequestModal.organs.lung' },
  { value: 'Prostate',            labelKey: 'templateRequestModal.organs.prostate' },
  { value: 'Kidney',              labelKey: 'templateRequestModal.organs.kidney' },
  { value: 'Bladder',             labelKey: 'templateRequestModal.organs.bladder' },
  { value: 'Liver / Biliary',     labelKey: 'templateRequestModal.organs.liverBiliary' },
  { value: 'Pancreas',            labelKey: 'templateRequestModal.organs.pancreas' },
  { value: 'Skin / Melanoma',     labelKey: 'templateRequestModal.organs.skinMelanoma' },
  { value: 'Thyroid',             labelKey: 'templateRequestModal.organs.thyroid' },
  { value: 'Head & Neck',         labelKey: 'templateRequestModal.organs.headNeck' },
  { value: 'Gynaecological',      labelKey: 'templateRequestModal.organs.gynaecological' },
  { value: 'Haematopathology',    labelKey: 'templateRequestModal.organs.haematopathology' },
  { value: 'Neuropathology',      labelKey: 'templateRequestModal.organs.neuropathology' },
  { value: 'Soft Tissue / Bone',  labelKey: 'templateRequestModal.organs.softTissueBone' },
  { value: 'Other',               labelKey: 'templateRequestModal.organs.other' },
];

// CAP / RCPath / ICCR / RCPA are real standards-body acronyms and stay as
// literal text in every locale; only the "Custom / Institution" entry
// gets a translated display label (its underlying value stays English).
const STANDARDS = ['CAP', 'RCPath', 'ICCR', 'RCPA', 'Custom / Institution'];

// .label stays English — it's embedded directly into the persisted
// message body sent to the admin pool. .labelKey/.descKey are for the
// on-screen radio options only.
const URGENCIES = [
  { value: 'routine',  label: 'Routine',  labelKey: 'templateRequestModal.urgencies.routine.label',  descKey: 'templateRequestModal.urgencies.routine.desc'  },
  { value: 'moderate', label: 'Moderate', labelKey: 'templateRequestModal.urgencies.moderate.label', descKey: 'templateRequestModal.urgencies.moderate.desc' },
  { value: 'urgent',   label: 'Urgent',   labelKey: 'templateRequestModal.urgencies.urgent.label',   descKey: 'templateRequestModal.urgencies.urgent.desc'   },
];

// Admin pool recipient — System Admin (u3)
const ADMIN_RECIPIENT = { id: 'u3', name: 'System Admin' };

// Locates one or more values inside an already-translated sentence and
// wraps each in <strong>, correct regardless of a locale's word order.
// Same helper as RequestReviewModal.tsx's own boldSubstrings().
const boldSubstrings = (text: string, values: string[]): React.ReactNode => {
  const positions = values
    .filter(Boolean)
    .map(v => ({ v, i: text.indexOf(v) }))
    .filter(p => p.i !== -1)
    .sort((a, b) => a.i - b.i);
  if (positions.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  positions.forEach(({ v, i }, idx) => {
    if (i < cursor) return;
    parts.push(text.slice(cursor, i));
    parts.push(<strong key={idx} className="trm-strong">{v}</strong>);
    cursor = i + v.length;
  });
  parts.push(text.slice(cursor));
  return parts;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface TemplateRequestModalProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TemplateRequestModal: React.FC<TemplateRequestModalProps> = ({ onClose }) => {
  const { t }            = useTranslation();
  const { user }         = useAuth();
  const { setMessages }  = useMessaging();

  // Form state
  const [organ,        setOrgan]        = useState('');
  const [procedure,    setProcedure]    = useState('');
  const [standard,     setStandard]     = useState('CAP');
  const [keyFields,    setKeyFields]    = useState('');
  const [baseTemplate, setBaseTemplate] = useState('');
  const [urgency,      setUrgency]      = useState('routine');
  const [reason,       setReason]       = useState('');

  // UI state
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [error,        setError]        = useState('');
  const [baseSearch,   setBaseSearch]   = useState('');
  const [showBaseList, setShowBaseList] = useState(false);

  const baseRef = useRef<HTMLDivElement>(null);

  // Published templates for base selector
  const publishedTemplates = PROTOCOL_REGISTRY.filter(p => p.status === 'published');
  const filteredBase = publishedTemplates.filter(p =>
    !baseSearch.trim() ||
    p.name.toLowerCase().includes(baseSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(baseSearch.toLowerCase()) ||
    p.source.toLowerCase().includes(baseSearch.toLowerCase())
  );
  const selectedBase = publishedTemplates.find(p => p.id === baseTemplate);

  const standardLabel = (s: string) => s === 'Custom / Institution' ? t('templateRequestModal.standards.custom') : s;
  const organLabel = (value: string) => {
    const found = ORGANS.find(o => o.value === value);
    return found ? t(found.labelKey) : value;
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (baseRef.current && !baseRef.current.contains(e.target as Node)) {
        setShowBaseList(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isValid = organ.trim() && procedure.trim() && keyFields.trim();

  const handleSubmit = async () => {
    if (!isValid || submitting || !user) return;
    setSubmitting(true);
    setError('');

    // Structured metadata embedded in message — admin can parse this to
    // pre-populate the template editor
    const requestMeta = {
      __templateRequest: true,
      organ,
      procedure,
      standard,
      keyFields,
      baseTemplateId:   baseTemplate || null,
      baseTemplateName: selectedBase?.name ?? null,
      urgency,
      reason,
      requestedBy:   user.id,
      requestedByName: user.name,
      requestedAt:   new Date().toISOString(),
    };

    const urgencyLabel = URGENCIES.find(u => u.value === urgency)?.label ?? urgency;
    const baseNote = selectedBase ? `\n\nBase template: ${selectedBase.name} (${selectedBase.source})` : '';

    const body = `${user.name} has requested a new synoptic template.\n\n` +
      `Organ/Subspecialty: ${organ}\n` +
      `Procedure: ${procedure}\n` +
      `Standard: ${standard}\n` +
      `Urgency: ${urgencyLabel}${reason ? ` — ${reason}` : ''}\n` +
      `Key fields needed:\n${keyFields}` +
      baseNote +
      `\n\n<!-- TEMPLATE_REQUEST_META:${JSON.stringify(requestMeta)} -->`;

    try {
      const result = await messageService.send({
      senderId:      user.id,
      senderName:    user.name,
      recipientId:   ADMIN_RECIPIENT.id,
      recipientName: ADMIN_RECIPIENT.name,
      subject:       `Template Request — ${standard} ${organ} ${procedure}`,
      body,
      timestamp:     new Date(),
      isUrgent:      urgency === 'urgent',
      caseNumber:    '',
    });

      if (result.ok) {
        setMessages(prev => [...prev, result.data]);
        setSubmitted(true);
      } else {
        setError(t('templateRequestModal.genericError'));
      }
    } catch {
      setError(t('templateRequestModal.genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="ps-overlay trm-overlay">
      <div className="trm-modal">

        {/* Header */}
        <div className="trm-header">
          <div className="trm-header-row">
            <div>
              <h2 className="trm-title">
                {t('templateRequestModal.title')}
              </h2>
              <p className="trm-subtitle">
                {t('templateRequestModal.subtitle')}
              </p>
            </div>
            <button onClick={onClose} className="trm-close-btn">×</button>
          </div>
        </div>

        {/* Submitted state */}
        {submitted ? (
          <div className="trm-submitted">
            <div className="trm-submitted-icon">✅</div>
            <h3 className="trm-submitted-title">
              {t('templateRequestModal.submittedTitle')}
            </h3>
            <p className="trm-submitted-text">
              {boldSubstrings(
                t('templateRequestModal.submittedMessage', { details: `${standardLabel(standard)} ${organLabel(organ)} ${procedure}` }),
                [`${standardLabel(standard)} ${organLabel(organ)} ${procedure}`]
              )}
            </p>
            <div className="trm-submitted-callout">
              {'💡 '}{t('templateRequestModal.submittedTip')}
            </div>
            <button onClick={onClose} className="trm-submitted-close-btn">
              {t('templateRequestModal.close')}
            </button>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="trm-body">

              {/* Organ + Procedure row */}
              <div className="trm-row-2col">
                <div>
                  <label className="trm-label">{t('templateRequestModal.organLabel')}</label>
                  <select value={organ} onChange={e => setOrgan(e.target.value)} className="trm-input">
                    <option value="">{t('templateRequestModal.selectOrganPlaceholder')}</option>
                    {ORGANS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="trm-label">{t('templateRequestModal.standardLabel')}</label>
                  <select value={standard} onChange={e => setStandard(e.target.value)} className="trm-input">
                    {STANDARDS.map(s => <option key={s} value={s}>{standardLabel(s)}</option>)}
                  </select>
                </div>
              </div>

              {/* Procedure */}
              <div>
                <label className="trm-label">{t('templateRequestModal.procedureLabel')}</label>
                <input
                  value={procedure}
                  onChange={e => setProcedure(e.target.value)}
                  placeholder={t('templateRequestModal.procedurePlaceholder')}
                  className="trm-input"
                />
              </div>

              {/* Key fields */}
              <div>
                <label className="trm-label">{t('templateRequestModal.keyFieldsLabel')}</label>
                <textarea
                  value={keyFields}
                  onChange={e => setKeyFields(e.target.value)}
                  placeholder={t('templateRequestModal.keyFieldsPlaceholder')}
                  className="trm-input trm-textarea"
                />
                <p className="trm-field-hint">
                  {t('templateRequestModal.keyFieldsHint')}
                </p>
              </div>

              {/* Base template selector */}
              <div ref={baseRef}>
                <label className="trm-label">
                  {t('templateRequestModal.baseTemplateLabel')}{' '}
                  <span className="trm-optional-label">{t('templateRequestModal.baseTemplateOptional')}</span>
                </label>
                <div className="trm-base-wrap">
                  <input
                    value={showBaseList ? baseSearch : (selectedBase?.name ?? '')}
                    onChange={e => { setBaseSearch(e.target.value); setShowBaseList(true); }}
                    onFocus={() => { setShowBaseList(true); setBaseSearch(''); }}
                    placeholder={t('templateRequestModal.baseSearchPlaceholder')}
                    className={`trm-input${baseTemplate ? ' trm-input--with-clear' : ''}`}
                  />
                  {baseTemplate && (
                    <button
                      onClick={() => { setBaseTemplate(''); setBaseSearch(''); }}
                      className="trm-base-clear-btn"
                    >×</button>
                  )}
                  {showBaseList && (
                    <div className="trm-base-dropdown">
                      {filteredBase.length === 0 ? (
                        <div className="trm-base-empty">{t('templateRequestModal.noTemplatesFound')}</div>
                      ) : filteredBase.map(p => {
                        const active = p.id === baseTemplate;
                        return (
                          <div
                            key={p.id}
                            onClick={() => { setBaseTemplate(p.id); setShowBaseList(false); setBaseSearch(''); }}
                            className={`trm-base-option${active ? ' trm-base-option--active' : ''}`}
                            style={{ '--trm-option-bg': active ? 'rgba(8,145,178,0.08)' : 'transparent' } as React.CSSProperties}
                          >
                            <div className="trm-base-option-info">
                              <div className="trm-base-option-name" data-phi="name">{p.name}</div>
                              <div className="trm-base-option-meta">
                                {p.source} · {p.fields} fields · v{p.version}
                              </div>
                            </div>
                            {active && <span className="trm-base-option-check">✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedBase && (
                  <div className="trm-base-selected-note">
                    {t('templateRequestModal.baseSelectedNote', {
                      name: selectedBase.name, fields: selectedBase.fields, source: selectedBase.source, version: selectedBase.version,
                    })}
                  </div>
                )}
              </div>

              {/* Urgency */}
              <div>
                <label className="trm-label">{t('templateRequestModal.urgencyLabel')}</label>
                <div className="trm-urgency-row">
                  {URGENCIES.map(u => {
                    const active = urgency === u.value;
                    return (
                      <label
                        key={u.value}
                        className="trm-urgency-option"
                        style={{
                          '--trm-urgency-border': active ? '#0891b2' : '#334155',
                          '--trm-urgency-bg':     active ? 'rgba(8,145,178,0.08)' : 'transparent',
                          '--trm-urgency-color':  active ? '#0891b2' : '#f1f5f9',
                        } as React.CSSProperties}
                      >
                        <input type="radio" value={u.value} checked={active}
                          onChange={() => setUrgency(u.value)} className="trm-urgency-radio" />
                        <span className="trm-urgency-option-label">
                          {t(u.labelKey)}
                        </span>
                        <span className="trm-urgency-option-desc">{t(u.descKey)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="trm-label">
                  {t('templateRequestModal.reasonLabel')}{' '}
                  <span className="trm-optional-label">{t('templateRequestModal.reasonOptional')}</span>
                </label>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={t('templateRequestModal.reasonPlaceholder')}
                  className="trm-input"
                />
              </div>

              {/* Info callout */}
              <div className="trm-callout">
                <strong>{t('templateRequestModal.whatHappensNextLabel')}</strong> {t('templateRequestModal.whatHappensNextText')}
              </div>

              {error && (
                <div className="trm-error">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="trm-footer">
              <button onClick={onClose} className="trm-cancel-btn">
                {t('templateRequestModal.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
                className="trm-submit-btn"
                style={{
                  '--trm-submit-bg':     isValid && !submitting ? '#0891b2' : 'rgba(8,145,178,0.2)',
                  '--trm-submit-color':  isValid && !submitting ? '#fff' : '#94a3b8',
                  '--trm-submit-cursor': isValid && !submitting ? 'pointer' : 'not-allowed',
                } as React.CSSProperties}
              >
                {submitting ? t('templateRequestModal.sending') : t('templateRequestModal.submitRequest')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
