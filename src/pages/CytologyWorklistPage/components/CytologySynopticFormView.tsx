// src/pages/CytologyWorklistPage/components/CytologySynopticFormView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed sequencing: renders the 5
// real, existing CAP/RCPath Non-GYN templates
// (cytologySynopticTemplateRegistry.ts), with local-state answers and
// an explicit Save action — "matches your Record A New Review
// paradigm cleanly," per direct guidance's own confirmed Check 3.
// Real, per direct guidance's own confirmed migration design: every
// real label rendered here goes through resolveSynopticFieldLabel.ts
// (and its option/section siblings) — this component never reads
// field.label directly, so a future labelKey migration changes only
// that one, shared resolver file, never this renderer.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CYTOLOGY_SYNOPTIC_TEMPLATES, resolveCytologySynopticTemplateById } from '@/services/cytology/cytologySynopticTemplateRegistry';
import { resolveSynopticFieldLabel, resolveSynopticOptionLabel, resolveSynopticSectionTitle } from '@/services/cytology/resolveSynopticFieldLabel';
import { resolveSynopticAnswersValidation } from '@/services/cytology/resolveSynopticAnswersValidation';
import { resolveUnvalidatedTermKeysInAnswers, resolveTranslationAcknowledgmentIsCurrent } from '@/services/cytology/resolveSynopticTranslationValidation';
import { compileCytologySynopticNarrative } from '@/services/cytology/compileCytologySynopticNarrative';
import { mockPathologyLexiconService } from '@/services/cytology/mockPathologyLexiconService';
import type { SynopticField } from '@/types/cytology/SynopticTemplate';
import type { PathologyLexiconEntry, PathologyLexiconLocale } from '@/types/cytology/PathologyLexicon';
import { SpellCheckedTextarea } from '@/components/SpellCheck/SpellCheckedTextarea';

export interface SynopticTranslationAcknowledgment {
  acknowledgedBy: string;
  acknowledgedByName: string;
  acknowledgedAt: string;
  acknowledgedUnvalidatedTermKeys: string[];
}

interface CytologySynopticFormViewProps {
  initialTemplateId?: string;
  initialAnswers?: Record<string, string | string[]>;
  initialAcknowledgment?: SynopticTranslationAcknowledgment;
  currentUser: { userId: string; userName: string };
  onSave: (templateId: string, answers: Record<string, string | string[]>, acknowledgment: SynopticTranslationAcknowledgment | undefined) => void;
  /** Real, Layer B UI integration, per direct guidance's own confirmed
   *  choice: an explicit, separate action — never a silent auto-write
   *  onto the real review record's own `notes` field. The real
   *  pathologist stays in control of what actually lands in Notes;
   *  the compiled narrative is a reviewable draft they consciously
   *  accept, never an automatic, unreviewed substitution for their
   *  own clinical judgment. */
  onInsertNarrative: (narrativeText: string) => void;
}

const CytologySynopticFormView: React.FC<CytologySynopticFormViewProps> = ({ initialTemplateId, initialAnswers, initialAcknowledgment, currentUser, onSave, onInsertNarrative }) => {
  const { t, i18n } = useTranslation();
  const [templateId, setTemplateId] = useState<string | undefined>(initialTemplateId);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initialAnswers ?? {});
  const [missingFieldIds, setMissingFieldIds] = useState<string[]>([]);
  const [lexicon, setLexicon] = useState<PathologyLexiconEntry[]>([]);
  const [acknowledgmentChecked, setAcknowledgmentChecked] = useState(false);
  const [showAcknowledgmentError, setShowAcknowledgmentError] = useState(false);
  // Real, per direct guidance's own "Key Traceability on Focus/
  // Hover" requirement — tracks which real, unvalidated segment (by
  // its own index in the current compiledNarrative.segments array)
  // has its click-toggled lexiconTermKey badge expanded. Null means
  // none — the native `title` attribute still covers hover on its
  // own; this only drives the explicit click/tap case.
  const [expandedSegmentIndex, setExpandedSegmentIndex] = useState<number | null>(null);

  useEffect(() => {
    mockPathologyLexiconService.getAll().then(res => { if (res.ok) setLexicon(res.data); });
  }, []);

  const template = templateId ? resolveCytologySynopticTemplateById(templateId) : undefined;

  // Real, per direct guidance's own confirmed correction — English is
  // the real canonical source language itself, never a "translation"
  // needing validation; only genuinely non-English locales can ever
  // have a real, unvalidated-translation concern.
  const currentLocale = i18n.language.split('-')[0];
  const isNonEnglishLocale = currentLocale !== 'en';
  const unvalidatedTermKeys = (template && isNonEnglishLocale)
    ? resolveUnvalidatedTermKeysInAnswers(template, answers, currentLocale as PathologyLexiconLocale, lexicon)
    : [];
  // Real, per direct guidance's own explicit staleness warning — a
  // real, prior acknowledgment loaded from the saved review record is
  // only trusted while it still genuinely covers the current,
  // real-time unvalidated set; a real, newly-changed answer can make
  // it stale even without the user touching the checkbox this session.
  const hasCurrentAcknowledgment = acknowledgmentChecked || resolveTranslationAcknowledgmentIsCurrent(initialAcknowledgment, unvalidatedTermKeys);
  // Real, Layer B — per direct guidance's own confirmed sequencing:
  // "finalize the narrative generation logic in the primary source
  // language" before any localization. Recomputed live from the
  // real, current answers as the pathologist fills the form, so the
  // preview never lags behind what's actually been entered.
  const compiledNarrative = template
    ? compileCytologySynopticNarrative(template, answers, t, currentLocale as PathologyLexiconLocale | 'en', lexicon)
    : { segments: [], rawText: '', hasUnvalidatedTerms: false };

  const setAnswer = (fieldId: string, value: string | string[]) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
    // Real, per resolveTranslationAcknowledgmentIsCurrent.ts's own
    // staleness rule — a real, changed answer can introduce a real,
    // new unvalidated term this session's own checkbox tick never
    // covered; never silently carry a stale checkbox state forward.
    setAcknowledgmentChecked(false);
    // Real, same staleness reasoning — a changed answer can shift
    // which real segment sits at any given index, so a stale
    // expanded badge would end up pointing at the wrong real phrase.
    setExpandedSegmentIndex(null);
  };

  const handleSave = () => {
    if (!template) return;
    const validation = resolveSynopticAnswersValidation(template, answers);
    setMissingFieldIds(validation.missingFieldIds);
    if (!validation.valid) return;
    if (unvalidatedTermKeys.length > 0 && !hasCurrentAcknowledgment) {
      setShowAcknowledgmentError(true);
      return;
    }
    const acknowledgment: SynopticTranslationAcknowledgment | undefined = unvalidatedTermKeys.length > 0
      ? { acknowledgedBy: currentUser.userId, acknowledgedByName: currentUser.userName, acknowledgedAt: new Date().toISOString(), acknowledgedUnvalidatedTermKeys: unvalidatedTermKeys }
      : undefined;
    onSave(template.id, answers, acknowledgment);
  };

  // Real, per direct guidance's own confirmed "fully voice ready"
  // request. Deliberately excludes the translation-validation
  // acknowledgment checkbox above — see resolveSynopticTranslation
  // SignOutAuditEvent.ts's own header comment for the same real
  // safety reasoning: a misrecognized voice command shouldn't be
  // able to trigger a real, attributable acknowledgment on a
  // pathologist's behalf.
  useEffect(() => {
    const selectTemplate = (id: string) => { setTemplateId(id); setAnswers({}); setMissingFieldIds([]); };
    const listeners: [string, EventListener][] = [
      ['PATHSCRIBE_CYTOLOGY_SELECT_TEMPLATE_THYROID', () => selectTemplate('thyroid_fna_cytology')],
      ['PATHSCRIBE_CYTOLOGY_SELECT_TEMPLATE_PANCREATICOBILIARY', () => selectTemplate('pancreaticobiliary_cytology')],
      ['PATHSCRIBE_CYTOLOGY_SELECT_TEMPLATE_SALIVARY_GLAND', () => selectTemplate('salivary_gland_fna_cytology')],
      ['PATHSCRIBE_CYTOLOGY_SELECT_TEMPLATE_LYMPH_NODE', () => selectTemplate('lymph_node_fna_cytology')],
      ['PATHSCRIBE_CYTOLOGY_SELECT_TEMPLATE_URINE', () => selectTemplate('urine_cytology')],
      ['PATHSCRIBE_CYTOLOGY_SAVE_SYNOPTIC', () => handleSave()],
      // Real, per direct guidance's own confirmed "Insert into Notes"
      // choice — only fires when there's a real, current narrative to
      // insert, matching the button's own real, visible condition
      // (compiledNarrative.segments.length > 0) exactly.
      ['PATHSCRIBE_CYTOLOGY_INSERT_NARRATIVE', () => { if (compiledNarrative.segments.length > 0) onInsertNarrative(compiledNarrative.rawText); }],
    ];
    listeners.forEach(([event, fn]) => window.addEventListener(event, fn));
    return () => listeners.forEach(([event, fn]) => window.removeEventListener(event, fn));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, answers, unvalidatedTermKeys, hasCurrentAcknowledgment, compiledNarrative.rawText]);

  const renderField = (field: SynopticField) => {
    const label = resolveSynopticFieldLabel(field, t);
    const isMissing = missingFieldIds.includes(field.id);
    const labelNode = (
      <label className={`ps-cytosynform-label${isMissing ? ' ps-cytosynform-label--missing' : ''}`}>
        {label}{field.required && ' *'}
      </label>
    );

    if (field.type === 'dropdown') {
      return (
        <div key={field.id} className="ps-mb-12">
          {labelNode}
          <select className="ps-conf-select ps-w-full" value={(answers[field.id] as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)}>
            <option value="">— {t('common.select')} —</option>
            {field.options?.map(opt => <option key={opt.id} value={opt.id}>{resolveSynopticOptionLabel(opt, t)}</option>)}
          </select>
        </div>
      );
    }
    if (field.type === 'checkboxes') {
      const selected = (answers[field.id] as string[]) ?? [];
      return (
        <div key={field.id} className="ps-mb-12">
          {labelNode}
          {field.options?.map(opt => (
            <label key={opt.id} className="ps-cytosynform-checkbox-label">
              <input type="checkbox" checked={selected.includes(opt.id)}
                onChange={() => setAnswer(field.id, selected.includes(opt.id) ? selected.filter(id => id !== opt.id) : [...selected, opt.id])} />
              {resolveSynopticOptionLabel(opt, t)}
            </label>
          ))}
        </div>
      );
    }
    if (field.type === 'numeric') {
      return (
        <div key={field.id} className="ps-mb-12">
          {labelNode}
          <input type="number" className="ps-conf-input ps-w-full" value={(answers[field.id] as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)} />
        </div>
      );
    }
    if (field.type === 'longtext') {
      return (
        <div key={field.id} className="ps-mb-12">
          {labelNode}
          <SpellCheckedTextarea className="ps-conf-input ps-cytosynform-textarea" value={(answers[field.id] as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)} />
        </div>
      );
    }
    // 'text'
    return (
      <div key={field.id} className="ps-mb-12">
        {labelNode}
        <input type="text" className="ps-conf-input ps-w-full" value={(answers[field.id] as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)} />
      </div>
    );
  };

  return (
    <div>
      <div className="ps-cytosynform-preview-banner">
        {t('cytologyScreening.synopticDrawer.previewBanner')}
      </div>

      <label className="ps-cytosynform-label">
        {t('cytologyScreening.synopticDrawer.selectTemplate')}
      </label>
      <select className="ps-conf-select ps-cytosynform-template-select" value={templateId ?? ''} onChange={e => { setTemplateId(e.target.value || undefined); setAnswers({}); setMissingFieldIds([]); }}>
        <option value="">— {t('common.select')} —</option>
        {CYTOLOGY_SYNOPTIC_TEMPLATES.map(tmpl => <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>)}
      </select>

      {template && template.sections.map(section => (
        <div key={section.id} className="ps-mb-18">
          <div className="ps-cytosynform-section-title">
            {resolveSynopticSectionTitle(section, t)}
          </div>
          {section.fields.map(renderField)}
        </div>
      ))}

      {missingFieldIds.length > 0 && (
        <div className="ps-cytosynform-error-banner">
          {t('cytologyScreening.synopticDrawer.validationError')}
        </div>
      )}

      {unvalidatedTermKeys.length > 0 && (
        <div className="ps-cytosynform-warn-banner">
          <div className="ps-cytosynform-warn-title">
            {t('cytologyScreening.synopticDrawer.unvalidatedTermsTitle')}
          </div>
          <div className="ps-cytosynform-warn-text">
            {t('cytologyScreening.synopticDrawer.unvalidatedTermsExplanation')}
          </div>
          <ul className="ps-cytosynform-term-list">
            {unvalidatedTermKeys.map(key => <li key={key}>{key}</li>)}
          </ul>
          <label className="ps-cytosynform-ack-label">
            <input type="checkbox" checked={hasCurrentAcknowledgment}
              onChange={e => { setAcknowledgmentChecked(e.target.checked); setShowAcknowledgmentError(false); }}
              className="ps-mt-2" />
            {t('cytologyScreening.synopticDrawer.acknowledgmentLabel')}
          </label>
          {showAcknowledgmentError && !hasCurrentAcknowledgment && (
            <div className="ps-cytosynform-ack-error">{t('cytologyScreening.synopticDrawer.acknowledgmentRequiredError')}</div>
          )}
        </div>
      )}

      {compiledNarrative.segments.length > 0 && (
        <div className="ps-cytosynform-narrative-banner">
          <div className="ps-cytosynform-narrative-title">
            {t('cytologyScreening.synopticDrawer.generatedNarrativeTitle')}
          </div>
          <div className="ps-cytosynform-narrative-text">
            {compiledNarrative.segments.map((seg, i) => {
              if (!seg.isUnvalidatedFallback) return <span key={i}>{seg.text}</span>;
              // Real, per direct guidance's own three requirements:
              // (1) Direct Spatial Correlation — amber background +
              // dashed underline, directly inline, never a separate
              // callout. (2) Key Traceability on Focus/Hover — the
              // native `title` attribute covers real mouse hover
              // (and keyboard focus, in most browsers) with zero
              // extra UI; the onClick toggle covers a real touch/tap
              // interaction where hover never fires at all. Both
              // paths show the exact same real lexiconTermKey text.
              const tooltipText = t('cytologyScreening.synopticDrawer.unvalidatedSegmentTooltip').replace('{key}', seg.lexiconTermKey ?? '');
              return (
                <span key={i} className="ps-relative">
                  <mark
                    role="button"
                    tabIndex={0}
                    title={tooltipText}
                    aria-label={tooltipText}
                    onClick={() => setExpandedSegmentIndex(expandedSegmentIndex === i ? null : i)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedSegmentIndex(expandedSegmentIndex === i ? null : i); } }}
                    className="ps-cytosynform-unvalidated-mark"
                  >
                    {seg.text}
                  </mark>
                  {expandedSegmentIndex === i && (
                    <span className="ps-cytosynform-lexicon-badge">
                      {seg.lexiconTermKey}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <button onClick={() => onInsertNarrative(compiledNarrative.rawText)}
            className="ps-cytosynform-insert-btn">
            {t('cytologyScreening.synopticDrawer.insertIntoNotesBtn')}
          </button>
        </div>
      )}

      {template && (
        <button onClick={handleSave} className="ps-cytosynform-save-btn">
          {t('cytologyScreening.synopticDrawer.saveBtn')}
        </button>
      )}
    </div>
  );
};

export default CytologySynopticFormView;
