// src/pages/SynopticReportPage/components/MicroscopicEntryPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "So after gross complete, then
// the next logical step is to generate a Microscopic Description...
// Perhaps a gap in our orchestration flow."
//
// Real fix (PS-313 — "The Microscopic Description field's current
// styling is jarring on the eyes. It should probably use the same
// darker background as the Case Comment field... and should be a
// rich-text (RTF) field since it's a major report element"): this
// panel originally used a plain, controlled <textarea>, deliberately
// NOT the full TipTap-based rich editor OrchestratorSectionEditor.tsx
// uses for the Report Draft's own narrative sections — that system
// requires a resolved report template (buildContext/
// resolveReportTemplate) and carries its own real, documented UX
// fragility, so building on it here would have coupled a genuinely
// new, independent feature to a system with open problems of its
// own. That reasoning still holds — this still does NOT use
// OrchestratorSectionEditor. But PathScribeEditor (the same
// standalone rich-text component CaseCommentModal.tsx/
// ReportCommentModal.tsx already use for Case/Specimen Comment, with
// no report-template dependency of its own) is a different, lighter
// real option that sidesteps that exact risk while genuinely giving
// this "major report element" real formatting and the darker,
// easier-to-read `theme="dark"` background the ticket asked to
// match. Checked every real consumer of MicroscopicReportInstance.text
// before switching formats (Sidebar.tsx, useSignOutWorkflow.ts,
// evaluateMicroscopicFinalizeGate.ts) — every one only ever checks
// non-emptiness (`.trim().length > 0`), never parses or renders this
// text as plain text anywhere; this narrative isn't wired into any
// PDF/report-preview renderer yet (a real, separate, already-known
// gap this ticket doesn't touch), so there is no existing plain-text
// consumer this format change could break.
//
// Dictation wired directly via useVoice()'s own startDictation, same
// real "register as target when focused and the global mic is
// pressed" pattern OrchestratorSectionEditor.tsx already uses. Now
// that the field is a real rich editor, dictated text is inserted at
// the cursor through the editor's own Tiptap instance (via
// PathScribeEditorHandle.getEditor()) rather than naive string
// concatenation — the same real pattern
// OrchestratorSectionEditor.tsx's own registerDictationTarget
// already uses, not a second, independently-invented approach.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoice } from '@/contexts/VoiceProvider';
import type { MicroscopicReportInstance } from '@/types/case/Case';
import PathScribeEditor from '@/components/Editor/PathScribeEditor';
import { SpellingLanguageControl } from '@/components/SpellCheck/SpellingLanguageControl';
import type { PathScribeEditorHandle } from '@/components/Editor/PathScribeEditorRef';
import '../../../pathscribe.css';

/** Same real "strip tags, then check for actual text" convention
 *  PathScribeEditor.tsx's own MacroModal preview already uses —
 *  robust to whichever exact empty-HTML shape (`''`, `<p></p>`,
 *  `<p><br></p>`) the editor happens to produce, unlike a single
 *  hardcoded string comparison. */
const isRichTextEmpty = (html: string): boolean => !html || !html.replace(/<[^>]+>/g, ' ').trim();

interface MicroscopicEntryPanelProps {
  specimenId: string;
  specimenLabel: string;
  specimenDesc?: string;
  instance: MicroscopicReportInstance | undefined;
  onSaveDraft: (specimenId: string, text: string, entryMethod?: MicroscopicReportInstance['entryMethod']) => void;
  onConfirmAndSave: (specimenId: string, text: string) => Promise<boolean>;
  onClearAndSave: (specimenId: string) => Promise<boolean>;
}

const MicroscopicEntryPanel: React.FC<MicroscopicEntryPanelProps> = ({
  specimenId, specimenLabel, specimenDesc, instance,
  onSaveDraft, onConfirmAndSave, onClearAndSave,
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState(instance?.text ?? '');
  const [entryMethod, setEntryMethod] = useState<MicroscopicReportInstance['entryMethod']>(instance?.entryMethod);
  const [isFocused, setIsFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<PathScribeEditorHandle>(null);

  // Real, deliberate re-sync when the underlying instance changes for
  // a reason other than this panel's own edits (e.g. specimen
  // switched, or a concurrency-conflict resolution overwrote local
  // state) — matches the same "prop is the source of truth on
  // genuine external change" pattern used throughout this app's
  // controlled-input components.
  useEffect(() => {
    setText(instance?.text ?? '');
    setEntryMethod(instance?.entryMethod);
  }, [specimenId, instance?.instanceId, instance?.updatedAt]);

  const { startDictation, phase, dictationTarget } = useVoice();

  const registerDictationTarget = useCallback(() => {
    startDictation({
      fieldId: `micro-${specimenId}`,
      label: t('microscopicEntryPanel.dictationLabel', { specimenLabel }),
      context: 'micro',
      onText: (dictated: string, isInterim?: boolean) => {
        // Real fix (PS-313): insert through the editor's own Tiptap
        // instance, same real pattern
        // OrchestratorSectionEditor.tsx's registerDictationTarget
        // already uses — naive `prev + dictated` string concatenation
        // (this field's old, plain-textarea approach) would land raw
        // text outside/after the rich content's closing tags instead
        // of inside the current paragraph.
        const editor = editorRef.current?.getEditor();
        if (!editor) return;
        editor.chain().focus().insertContent(dictated + (isInterim ? '' : ' ')).run();
        const next = editor.getHTML();
        setText(next);
        if (!isInterim) {
          onSaveDraft(specimenId, next, entryMethod === 'typed' ? 'mixed' : 'dictated');
          setEntryMethod(prev => prev === 'typed' ? 'mixed' : 'dictated');
        }
      },
    });
  }, [startDictation, specimenId, specimenLabel, onSaveDraft, entryMethod, t]);

  // Same real "only when the mic was just pressed and nothing else
  // already claimed it" guard as OrchestratorSectionEditor.tsx's own
  // identical effect — never auto-registers just from this field
  // receiving focus on its own.
  useEffect(() => {
    if (phase !== 'dictate' || dictationTarget) return;
    if (!isFocused) return;
    registerDictationTarget();
  }, [phase, dictationTarget, isFocused, registerDictationTarget]);

  const isDictatingHere = dictationTarget?.fieldId === `micro-${specimenId}`;

  const handleTextChange = (value: string) => {
    setText(value);
    const nextMethod = entryMethod === 'dictated' ? 'mixed' : 'typed';
    setEntryMethod(nextMethod);
    onSaveDraft(specimenId, value, nextMethod);
  };

  const handleInsertAttestation = () => {
    // Real fix (PS-313): inserts as a real paragraph through the
    // editor's own Tiptap instance — same reasoning as the dictation
    // handler above, so the standard attestation becomes a genuine
    // part of the rich content rather than raw text appended after
    // whatever HTML the editor already holds.
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    editor.chain().focus().insertContent('<p>Microscopic examination performed.</p>').run();
    const nextText = editor.getHTML();
    setText(nextText);
    setEntryMethod('typed');
    onSaveDraft(specimenId, nextText, 'typed');
  };

  const handleSave = async () => {
    setSaving(true);
    await onConfirmAndSave(specimenId, text);
    setSaving(false);
  };

  const handleClear = async () => {
    setSaving(true);
    const ok = await onClearAndSave(specimenId);
    if (ok) { setText(''); setEntryMethod(undefined); }
    setSaving(false);
  };

  const status = instance?.status ?? 'not-started';
  const hasUnsavedChanges = text !== (instance?.text ?? '') || status === 'draft';
  const isTextEmpty = isRichTextEmpty(text);

  return (
    <div className="ps-micro-entry">
      <h2 className="ps-micro-entry-title">{t('microscopicEntryPanel.title')}</h2>
      <p className="ps-micro-entry-subtitle">
        {t('accessionPage.cytology.specimenTarget', { label: specimenLabel })}{specimenDesc ? ` — ${specimenDesc}` : ''}
      </p>
      <p className="ps-micro-entry-hint">
        {t('microscopicEntryPanel.hint')}
      </p>

      {/* The quoted phrase mirrors the exact, literal text
          handleInsertAttestation() inserts into the report narrative
          (persisted clinical documentation) — kept in English like
          every other persisted diagnostic/narrative string in this
          sweep, even though the button's own "Insert" chrome word is
          translated. */}
      <button
        type="button"
        className="ps-btn-secondary ps-micro-entry-attest-btn"
        onClick={handleInsertAttestation}
      >
        + {t('microscopicEntryPanel.insertAttestationButton')} "Microscopic examination performed."
      </button>

      {/* Real fix (PS-313): rich-text field, dark theme — matching
          CaseCommentModal.tsx's/ReportCommentModal.tsx's own real
          Case/Specimen Comment editor exactly, per the ticket's own
          ask ("the same darker background as the Case Comment
          field"). */}
      {/* onFocus/onBlur on this wrapper (not a PathScribeEditor prop —
          it doesn't expose one) rely on React's focus/blur bubbling
          from the editor's real contentEditable region inside it,
          same as any other focus-tracked container in this app. */}
      <SpellingLanguageControl className="ps-micro-entry-spelllang" />
      <div
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`ps-micro-entry-editor-wrap${isDictatingHere ? ' ps-micro-entry-editor-wrap--dictating' : ''}`}
      >
        <PathScribeEditor
          ref={editorRef}
          key={`micro-editor-${specimenId}`}
          content={text}
          onChange={handleTextChange}
          placeholder={t('microscopicEntryPanel.editorPlaceholder')}
          minHeight="220px"
          theme="dark"
          allowThemeToggle
          showRulerDefault={false}
          macros={[]}
          approvedFonts={['Arial', 'Times New Roman', 'Calibri', 'Courier New']}
        />
      </div>

      {isDictatingHere && (
        <div className="ps-micro-entry-dictating-indicator">
          <span className="ps-micro-entry-dictating-dot" />
          {t('microscopicEntryPanel.dictatingIndicator')}
        </div>
      )}

      <div className="ps-micro-entry-actions">
        <button className="ps-btn-primary" onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
          {saving ? t('common.saving') : t('microscopicEntryPanel.saveButton')}
        </button>
        {!isTextEmpty && (
          <button className="ps-btn-secondary" onClick={handleClear} disabled={saving}>
            {t('common.clear')}
          </button>
        )}
        <span className={`ps-micro-entry-status${status === 'draft' ? ' ps-micro-entry-status--draft' : status === 'saved' ? ' ps-micro-entry-status--saved' : ''}`}>
          {status === 'draft' && t('synopticEditor.nav.unsavedChanges')}
          {status === 'saved' && !isTextEmpty && t('templateAssemblyPage.savedIndicator')}
          {status === 'saved' && isTextEmpty && t('microscopicEntryPanel.status.deliberatelyBlank')}
          {status === 'not-started' && t('sidebar.dotStatus.empty')}
        </span>
      </div>
    </div>
  );
};

export default MicroscopicEntryPanel;
