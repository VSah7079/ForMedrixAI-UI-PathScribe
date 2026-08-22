// src/pages/SynopticReportPage/components/MicroscopicEntryPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "So after gross complete, then
// the next logical step is to generate a Microscopic Description...
// Perhaps a gap in our orchestration flow." Deliberately a simple,
// dedicated panel — a plain, controlled <textarea>, not the full
// TipTap-based rich editor OrchestratorSectionEditor.tsx uses for the
// Report Draft's own narrative sections. Confirmed directly before
// building: that system requires a resolved report template
// (buildContext/resolveReportTemplate) and carries its own real,
// documented UX fragility (report draft persistence, layout —
// flagged as pending review in this app's own prior session notes) —
// building on it here would couple a genuinely new, independent
// feature to a system with open problems of its own, for no real
// benefit; a Microscopic narrative doesn't need rich formatting.
//
// Dictation wired directly via useVoice()'s own startDictation, same
// real "register as target when focused and the global mic is
// pressed" pattern OrchestratorSectionEditor.tsx already uses —
// reusing the proven voice infrastructure without reusing the
// heavier rich-editor machinery it's normally paired with.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVoice } from '@/contexts/VoiceProvider';
import type { MicroscopicReportInstance } from '@/types/case/Case';

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
  const [text, setText] = useState(instance?.text ?? '');
  const [entryMethod, setEntryMethod] = useState<MicroscopicReportInstance['entryMethod']>(instance?.entryMethod);
  const [isFocused, setIsFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      label: `Microscopic Description — Specimen ${specimenLabel}`,
      context: 'micro',
      onText: (dictated: string, isInterim?: boolean) => {
        setText(prev => {
          const next = prev ? `${prev}${dictated}` : dictated;
          if (!isInterim) onSaveDraft(specimenId, next, entryMethod === 'typed' ? 'mixed' : 'dictated');
          return next;
        });
        if (!isInterim) setEntryMethod(prev => prev === 'typed' ? 'mixed' : 'dictated');
      },
    });
  }, [startDictation, specimenId, specimenLabel, onSaveDraft, entryMethod]);

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
    const attestation = 'Microscopic examination performed.';
    const nextText = text.trim().length > 0 ? `${text}\n\n${attestation}` : attestation;
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

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 4, color: '#e2e8f0' }}>🔬 Microscopic Description</h2>
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
        Specimen {specimenLabel}{specimenDesc ? ` — ${specimenDesc}` : ''}
      </p>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
        Type or dictate — press the mic with this field focused, or insert the standard attestation below
        and add detail only when clinically indicated. Optional when the active synoptic template's own
        required fields are complete; saving this narrative is what re-checks whether a different CAP
        template fits better, same as the review you already get for other AI-proposed changes.
      </p>

      <button
        type="button"
        className="ps-btn-secondary"
        onClick={handleInsertAttestation}
        style={{ marginBottom: 8, fontSize: 12 }}
      >
        + Insert "Microscopic examination performed."
      </button>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => handleTextChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Sections show..."
        className="ps-conf-textarea"
        style={{
          width: '100%', minHeight: 220, resize: 'vertical', fontSize: 14, lineHeight: 1.6,
          border: isDictatingHere ? '1px solid #ef4444' : undefined,
        }}
      />

      {isDictatingHere && (
        <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          Dictating into this field…
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
        <button className="ps-btn-primary" onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
          {saving ? 'Saving…' : '✓ Save'}
        </button>
        {text.trim().length > 0 && (
          <button className="ps-btn-secondary" onClick={handleClear} disabled={saving}>
            Clear
          </button>
        )}
        <span style={{ fontSize: 12, color: status === 'draft' ? '#f59e0b' : status === 'saved' ? '#34d399' : '#64748b', marginLeft: 8 }}>
          {status === 'draft' && '● Unsaved changes'}
          {status === 'saved' && text.trim().length > 0 && '✓ Saved'}
          {status === 'saved' && text.trim().length === 0 && '— Deliberately left blank'}
          {status === 'not-started' && 'Not started'}
        </span>
      </div>
    </div>
  );
};

export default MicroscopicEntryPanel;
