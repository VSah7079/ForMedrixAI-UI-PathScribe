// src/pages/SynopticReportPage/components/OrchestratorSectionEditor.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Section-based narrative editor for Orchestration mode — right-hand pane.
//
// Deliberately mirrors RightSynopticPanel's structure so a pathologist who
// knows CoPilot mode already knows this layout:
//   • Sticky header: title bar → completion summary → Jump-to bar →
//     view-mode toggle (Tabs/Page) + section pills
//   • Tabs mode: one section visible at a time
//   • Page mode: all sections stacked, single scroll
//
// Architectural shift from the old OrchestratorReportPanel: sections are now
// first-class — each gets its OWN NarrativeEditor instance, rather than one
// merged ProseMirror document with non-editable anchor headings. This avoids
// the entire class of "anchor accidentally editable" / cursor-placement-after-
// heading bugs we hit with the single-document approach.
//
// One shared toolbar is portalled from whichever section is currently
// focused — same principle as the old version, just retargeted dynamically.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import NarrativeEditor from '@/components/Editor/NarrativeEditor';
import { useVoice } from '@/contexts/VoiceProvider';
import type { PathScribeEditorHandle } from '@/components/Editor/PathScribeEditorRef';
import type { LabelConfig } from '@/types/template';
import { labelStyle } from '@/pages/ReportPreview/ReportPreviewRenderer';
import type { Case } from '@/types/case/Case';
import { mockMacroService } from '@/services/macros/mockMacroService';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { PathScribeAIService, type SpellingFlag } from '@/services/aiIntegration/PathScribeAIService';
import { facilityService } from '@/services';
import { resolvePerformingLabFacilityId } from '@/services/facilities/IFacilityService';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { MockVoiceMacroService } from '@/services/voicemacro/mockVoiceMacroService';
import type { Jurisdiction } from '@/types/systemConfig';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrchestratorSection {
  id:                  string;
  label:               string;
  type?:               'narrative' | 'synoptic';
  synopticInstanceId?: string;
  text:                string;
  aiGenerated:         string;
  userEdited:          boolean;
  isStreaming:         boolean;
  pendingDraft?:       string;
  required?:           boolean;
  hint?:               string;
  committed?:          boolean;
  lockedAt?:           string;
  /** Real fix: the section's own `id` is auto-generated per template
   *  resolution (a fresh UUID every time), not a stable identifier —
   *  code that needs to reliably recognize "this is the Gross
   *  Description section" regardless of when/how it was resolved
   *  should match on sourcePartId (the stable ReportPart id, e.g.
   *  'std_body_gross' from mockReportPartService.ts) instead. See
   *  useGrossingCompletion.ts for the real, concrete case this
   *  exists for. */
  sourcePartId?:       string;
  /** Real feature, per direct request: "a separate section for each
   *  specimen location so that it is easier for the User to dictate
   *  the gross for each specimen." Set when this section is one of
   *  several per-specimen Gross Description sections (as opposed to
   *  the single, case-wide sections every other narrative part still
   *  uses) — links this section back to the specimen it's actually
   *  for. See handleStartManualEntry in useReportGeneration.ts for
   *  where these get created, and useGrossingCompletion.ts for the
   *  per-specimen completeness check this enables. */
  specimenId?:         string;
}

type SectionStatus = 'empty' | 'ai-generated' | 'accepted' | 'accepted-manual';

function getSectionStatus(s: OrchestratorSection): SectionStatus {
  if (!s.text && !s.aiGenerated) return 'empty';
  if (s.committed || s.userEdited) {
    // Was this ever AI-sourced, or is this purely the pathologist's own
    // writing? Mirrors RightSynopticPanel's distinction between "AI
    // Confirmed" (AI drafted it, pathologist signed off) and "Manual —
    // AI missed" (pathologist wrote it because AI had nothing).
    return s.aiGenerated ? 'accepted' : 'accepted-manual';
  }
  if (s.aiGenerated) return 'ai-generated';
  return 'empty';
}

const STATUS_META: Record<SectionStatus, { color: string; title: string; icon: string }> = {
  'empty':           { color: '#475569', title: 'Empty',          icon: '○' },
  'ai-generated':    { color: '#0891b2', title: 'AI generated',   icon: '◉' },
  // Matches RightSynopticPanel's field-level convention exactly: once
  // accepted, the badge still names the AI's involvement explicitly
  // ("AI Confirmed") rather than going generic ("Accepted") — provenance
  // stays visible permanently, only the styling/urgency settles down.
  'accepted':        { color: '#10b981', title: 'AI Confirmed',   icon: '✓' },
  // Pathologist wrote this section themselves — AI had no draft for it.
  // Distinct purple styling, same as RightSynopticPanel's "Manual — AI
  // missed" field badge.
  'accepted-manual': { color: '#c084fc', title: 'Manual entry',   icon: '✎' },
};

// ── HTML helpers — unchanged from the original implementation ────────────────

export function textToHtml(text: string): string {
  if (!text.trim()) return '';
  const trimmed = text.trimStart();
  // Previously: `if (trimmed.startsWith('<')) return text;` — this blindly
  // trusted a leading '<' as proof the ENTIRE string was already valid,
  // well-formed HTML. That's true for normal already-converted section
  // text, but if any upstream code ever concatenates onto an
  // already-wrapped string (e.g. "<p>...</p>" + new raw tokens), the
  // result still starts with '<' and was passed straight through
  // unwrapped — including the stray trailing fragment outside any tag,
  // which ProseMirror's HTML parser can then mis-parse or drop content
  // around. Belt-and-braces fix (the real fix is not letting that
  // concatenation happen upstream — see onSectionStart in
  // SynopticReportPage.tsx): only take the fast path when the string is a
  // SEQUENCE of balanced block-level tags with nothing stray outside them.
  if (trimmed.startsWith('<') && isWellFormedBlockHtml(trimmed)) return text;
  // Fallback: treat as plain/markdown-ish text. Strip any stray tags that
  // may have leaked in from a corrupted concatenation rather than
  // rendering them as literal text, then paragraph-split as before.
  const stripped = trimmed.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  return '<p>' + stripped.split(/\n\n+/).filter(Boolean).join('</p><p>') + '</p>';
}

// Cheap structural check — not a full HTML validator, just enough to catch
// the "valid HTML followed by stray bare text" shape that the regenerate
// concatenation bug produced (e.g. "<p>...</p>**"). True only if every
// top-level block tag closes and there is no non-whitespace content
// outside of tags.
function isWellFormedBlockHtml(html: string): boolean {
  let depth = 0;
  let lastIndex = 0;
  const tagRe = /<\/?[a-zA-Z][^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    const between = html.slice(lastIndex, match.index);
    if (depth === 0 && between.trim()) return false; // bare text outside any tag
    if (match[0].startsWith('</')) depth--;
    else if (!match[0].endsWith('/>')) depth++;
    lastIndex = tagRe.lastIndex;
  }
  const trailing = html.slice(lastIndex);
  if (trailing.trim()) return false; // stray text after the last tag closes
  return depth === 0;
}

// ── Spell-check review popover ────────────────────────────────────────────────
// Shows one flagged word at a time, highlighted in its surrounding sentence
// for context, with the AI's suggestion and three actions: apply the fix,
// keep the original wording, or skip (move on without deciding either way —
// functionally same as keep, but visually distinct so the pathologist knows
// they explicitly chose not to engage with this one).

function getWordContext(plainText: string, original: string, radius = 40): { before: string; after: string } {
  const idx = plainText.indexOf(original);
  if (idx === -1) return { before: '', after: '' };
  const start = Math.max(0, idx - radius);
  const end   = Math.min(plainText.length, idx + original.length + radius);
  return {
    before: (start > 0 ? '…' : '') + plainText.slice(start, idx),
    after:  plainText.slice(idx + original.length, end) + (end < plainText.length ? '…' : ''),
  };
}

const SpellCheckPopover: React.FC<{
  sectionLabel: string;
  text: string;       // current working HTML — used to derive plain-text context
  flag: SpellingFlag;
  index: number;
  total: number;
  onFix: () => void;
  onKeep: () => void;
  onSkip: () => void;
  onCancel: () => void;
}> = ({ sectionLabel, text, flag, index, total, onFix, onKeep, onSkip, onCancel }) => {
  const plainText = useMemo(() => text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), [text]);
  const { before, after } = useMemo(() => getWordContext(plainText, flag.original), [plainText, flag.original]);

  return (
    <div className="ps-ose-spellcheck-overlay">
      <div className="ps-ose-spellcheck-popover">
        <div className="ps-ose-spellcheck-header">
          <span className="ps-ose-spellcheck-eyebrow">✦ Spelling check · {sectionLabel}</span>
          <span className="ps-ose-spellcheck-counter">{index + 1} of {total}</span>
        </div>

        <div className="ps-ose-spellcheck-context">
          {before}<mark className="ps-ose-spellcheck-flagged">{flag.original}</mark>{after}
        </div>

        <div className="ps-ose-spellcheck-suggestion-row">
          <span className="ps-ose-spellcheck-arrow">→</span>
          <span className="ps-ose-spellcheck-suggestion">{flag.suggestion}</span>
        </div>
        <div className="ps-ose-spellcheck-reason">{flag.reason}</div>

        <div className="ps-ose-spellcheck-actions">
          <button className="ps-ose-spellcheck-btn ps-ose-spellcheck-btn--skip" onClick={onSkip} title="Move on without deciding">Skip</button>
          <button className="ps-ose-spellcheck-btn ps-ose-spellcheck-btn--keep" onClick={onKeep} title="Keep original wording">Keep original</button>
          <button className="ps-ose-spellcheck-btn ps-ose-spellcheck-btn--fix" onClick={onFix} title="Apply suggested correction">✓ Apply fix</button>
        </div>

        <button className="ps-ose-spellcheck-cancel" onClick={onCancel}>Cancel review — accept as written</button>
      </div>
    </div>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  sections:             OrchestratorSection[];
  isGenerating:         boolean;
  onSectionChange:      (sectionId: string, html: string) => void;
  onAcceptDraft:        (sectionId: string) => void;
  onKeepVersion:        (sectionId: string) => void;
  // ── Explicit Accept — distinct from onSectionChange ──────────────────────
  // Accept must unambiguously mark a section as accepted regardless of
  // whether the text actually changed (it usually doesn't — Accept on an
  // AI draft commits it as-is, or with spell-check corrections applied).
  // Relying on onSectionChange's text-equality inference for this was the
  // bug: a no-op text pass-through could fail to flip userEdited, leaving
  // the Accept button visibly "active" on an already-accepted section.
  onAcceptSection?:     (sectionId: string, finalText: string) => void;
  onRegenerateSection?: (sectionId: string) => void;
  onEditSynoptic?:      (instanceId: string) => void;
  lastGeneratedAt?:     Date | null;
  caseData?:            Case | null;
  resolvedTemplateName?:string;
  resolvedBy?:          string;
  overrideTemplateId?:  string | null;
  onOverrideTemplate?:  (templateId: string | null) => void;
  onAcceptAll?:         () => void;
  /** Shown in the empty-state message as a real, clickable action —
   *  previously just static bold text with no click handler at all. */
  onGenerateReport?:    () => void;
  /** Real fix, per direct workflow description: "the PA prefers to
   *  dictate the Gross and then AI would update the attached
   *  synoptic." Opens blank, dictation-ready sections without
   *  triggering any AI call — see useReportGeneration.ts's
   *  handleStartManualEntry for the real implementation. */
  onStartManualEntry?:  () => void;
  /** Real feature, per direct request — the specimen-name header for
   *  each per-specimen Gross Description section (see
   *  handleStartManualEntry) should be "styled per the template for
   *  Grossing." Same resolved style ReportPreviewRenderer.tsx applies
   *  to the read-only report — threaded here too so the editing view
   *  matches what the final report will actually look like, not a
   *  second, independently-derived style. */
  documentStyle?:       { header?: LabelConfig; body?: LabelConfig; footer?: LabelConfig };

  // ── Shared active-section state — lifted to SynopticReportPage so the
  //    navigator, centre Full Report pane, and this editor all stay in sync.
  activeSectionId?:     string | null;
  onActiveSectionChange?: (id: string) => void;

  // ── User-configurable tab width — lifted to SynopticReportPage so the
  //    setting is shared/persisted across all section editors in this case.
  tabWidthChars?:       number;
  onTabWidthChange?:    (chars: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const OrchestratorSectionEditor: React.FC<Props> = ({
  sections, isGenerating, onSectionChange, onAcceptDraft, onKeepVersion,
  onRegenerateSection, lastGeneratedAt, caseData,
  onAcceptAll, activeSectionId, onActiveSectionChange,
  tabWidthChars = 4, onTabWidthChange, onAcceptSection,
  onGenerateReport, onStartManualEntry, documentStyle,
}) => {
  // ── Refs ─────────────────────────────────────────────────────────────────────
  const editorRefs    = useRef<Record<string, PathScribeEditorHandle | null>>({});
  const sectionRefs   = useRef<Record<string, HTMLDivElement | null>>({});
  const pageScrollRef = useRef<HTMLDivElement>(null);

  // ── Jurisdiction — for locale-aware spelling checks ──────────────────────────
  const { config: systemConfig } = useSystemConfig();
  const aiService = useMemo(() => new PathScribeAIService(), []);

  // ── Spell-check review state ─────────────────────────────────────────────────
  // When Accept is clicked, we run a spelling check before actually committing.
  // If flags come back, spellCheckReview holds the in-progress review so the
  // popover can render; null means no review is active.
  const [spellCheckReview, setSpellCheckReview] = useState<{
    sectionId: string;
    text: string;            // working copy — edited as flags are resolved
    flags: SpellingFlag[];
    flagIndex: number;
  } | null>(null);
  const [spellCheckLoading, setSpellCheckLoading] = useState<string | null>(null); // sectionId currently being checked

  // ── View mode ─────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'tabs' | 'page'>('page');

  // ── Active section — controlled from parent or local fallback ────────────────
  const [localActiveId, setLocalActiveId] = useState<string>(sections[0]?.id ?? '');
  const activeId = activeSectionId ?? localActiveId;
  const setActiveId = useCallback((id: string) => {
    setLocalActiveId(id);
    onActiveSectionChange?.(id);
  }, [onActiveSectionChange]);

  // ── Focused section — determines which editor owns the portalled toolbar ──────
  const [focusedSectionId, setFocusedSectionId] = useState<string>(activeId);
  useEffect(() => { setFocusedSectionId(activeId); }, [activeId]);

  const activeSection = sections.find(s => s.id === activeId) ?? sections[0];

  // ── jumpToSection — must be declared before any useEffect that calls it ───────
  const jumpToSection = useCallback((id: string) => {
    setActiveId(id);
    if (viewMode === 'page') {
      setTimeout(() => {
        const el = sectionRefs.current[id];
        const container = pageScrollRef.current;
        if (el && container) {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const relativeTop = elRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({ top: Math.max(0, relativeTop - 16), behavior: 'smooth' });
        }
      }, 30);
    }
    setTimeout(() => {
      const handle = editorRefs.current[id];
      const editor = handle?.getEditor?.();
      if (!editor) return;
      try { editor.commands.focus('start'); } catch { /* ignore */ }
    }, viewMode === 'page' ? 200 : 50);
  }, [viewMode, setActiveId]);

  // ── Voice dictation ───────────────────────────────────────────────────────────
  const { startDictation, phase, dictationTarget } = useVoice();

  // ── Insert Specimen (IS) ───────────────────────────────────────────────────────
  // Inserts one line per specimen on the case, in the exact format:
  //   Specimen A: [Right hemicolectomy]
  //   Specimen B: [Ileocolic lymph node]
  //   Specimen C: [Appendix]
  // Pulled live from caseData.specimens — same source as the left sidebar and
  // the Add/Edit Specimen modal, so this always reflects the case's actual
  // specimen list, not a stale snapshot.
  const insertSpecimens = useCallback((section: OrchestratorSection) => {
    const editorHandle = editorRefs.current[section.id];
    const editor = editorHandle?.getEditor?.();
    if (!editor) return;

    const specimens = caseData?.specimens ?? [];
    if (specimens.length === 0) return;

    const html = specimens
      .map(sp => `<p>Specimen ${sp.label}: [${sp.description}]</p>`)
      .join('');

    editor.chain().focus().insertContent(html).run();
    onSectionChange(section.id, editor.getHTML());
  }, [caseData, onSectionChange]);

  // ── Case's real jurisdiction, for spell-check ─────────────────────────────────
  // Resolved from the case's own Submitting Facility, not the system-wide
  // SystemConfig.jurisdiction default — that field is a single global
  // value nothing meaningfully sets (see Facility.jurisdiction, the real
  // per-case mechanism, added earlier this session). A Fenwick case
  // should get British spelling regardless of what the system default
  // happens to be; a Metro General case should get US spelling. Falls
  // back to the system default only when the client can't be resolved
  // (e.g. clientId missing, or the lookup fails) — same fail-safe
  // posture as everywhere else this session, not a fail-open guess.
  //
  // jurisdictionFacilityName is kept alongside caseJurisdiction
  // purely for the visible badge below — deliberate design decision
  // (see conversation): the report conforms to the receiving
  // institution's convention regardless of who wrote it, same as a
  // specialist's consult letter follows the referring GP's own
  // conventions. The real risk in that design isn't that it's wrong,
  // it's that it's a silent surprise to the pathologist writing the
  // report — this badge is the fix for that, not a reversal of the
  // decision.
  const [caseJurisdiction, setCaseJurisdiction] = useState<Jurisdiction | undefined>(undefined);
  const [jurisdictionFacilityName, setJurisdictionFacilityName] = useState<string | undefined>(undefined);
  // Real, per direct guidance ("Personal Quick Text" — Enterprise then
  // Facility then Staff): this case's own real performing lab —
  // resolvePerformingLabFacilityId's real single-hop resolution
  // (services/facilities/IFacilityService.ts), since the ordering
  // facility itself may not be the one that actually performs the
  // work. Auto-attributed, never asked of the pathologist — the whole
  // point of "their name and facility would be known." Set from the
  // SAME facility fetch as jurisdiction below, not a second one.
  const [casePerformingLabFacilityId, setCasePerformingLabFacilityId] = useState<string | undefined>(undefined);
  const [casePerformingLabName, setCasePerformingLabName] = useState<string | undefined>(undefined);

  useEffect(() => {
    const clientId = caseData?.order?.facilityId;
    if (!clientId) { setCaseJurisdiction(undefined); setJurisdictionFacilityName(undefined); setCasePerformingLabFacilityId(undefined); setCasePerformingLabName(undefined); return; }
    let cancelled = false;
    facilityService.getById(clientId).then(res => {
      if (cancelled) return;
      setCaseJurisdiction(res.ok ? res.data.jurisdiction : undefined);
      setJurisdictionFacilityName(res.ok ? res.data.name : undefined);
      const labId = res.ok ? resolvePerformingLabFacilityId(res.data) : undefined;
      setCasePerformingLabFacilityId(labId);
      if (!labId) { setCasePerformingLabName(undefined); return; }
      // Real, per direct guidance: the resolved performing lab can be a
      // genuinely different facility than the ordering one
      // (Facility.performingLabFacilityId's own real override) — only
      // reuse this same fetch's name when it resolved to itself;
      // otherwise fetch the actual performing lab's own real name
      // rather than showing the wrong facility in the confirmation UI.
      if (res.ok && labId === res.data.id) { setCasePerformingLabName(res.data.name); return; }
      facilityService.getById(labId).then(labRes => {
        if (!cancelled) setCasePerformingLabName(labRes.ok ? labRes.data.name : undefined);
      });
    });
    return () => { cancelled = true; };
  }, [caseData?.order?.facilityId]);

  const effectiveJurisdiction = caseJurisdiction ?? systemConfig?.jurisdiction;

  const registerDictationTarget = useCallback((section: OrchestratorSection) => {
    const editorHandle = editorRefs.current[section.id];
    const editor = editorHandle?.getEditor?.();
    if (!editor) return;
    startDictation({
      fieldId: section.id,
      label:   section.label,
      context: section.label.toLowerCase().replace(/[^a-z]/g, ' ').trim(),
      // Real, per direct guidance (voice-trigger recognition wiring):
      // this case's own real, already-resolved performing lab —
      // VoiceProvider.tsx uses this to filter which real voice macros
      // (Enterprise/Facility/Personal) apply to this dictation session.
      performingLabFacilityId: casePerformingLabFacilityId,
      onText: (text: string, isInterim?: boolean) => {
        editor.chain().focus().insertContent(text + (isInterim ? '' : ' ')).run();
        onSectionChange(section.id, editor.getHTML());
      },
      onDone: () => { /* VoiceProvider handles phase reset */ },
    });
  }, [startDictation, onSectionChange, casePerformingLabFacilityId]);

  // ── Bind NavBar mic to the focused section ────────────────────────────────────
  // The mic button lives outside this component (NavBar/VoiceToggleButton) and
  // we deliberately don't import or modify it — everything here reacts to
  // VoiceProvider's shared state instead, via useVoice().
  //
  // When the pathologist presses the mic with no specific target already set
  // (dictationTarget === null) and a section in THIS editor currently has
  // focus, we register that section as the dictation target — wiring the
  // editor's onText handler into the stream that's already running.
  //
  // CRITICAL: this only runs when phase has ALREADY transitioned to 'dictate'
  // — i.e. in response to the mic being pressed — never as a side effect of
  // focusing a field. Focusing a field on its own does nothing here.
  useEffect(() => {
    if (phase !== 'dictate' || dictationTarget) return;
    const section = sections.find(s => s.id === focusedSectionId);
    if (!section || section.committed) return;
    registerDictationTarget(section);
  }, [phase, dictationTarget, focusedSectionId, sections, registerDictationTarget]);

  // ── Personal Quick Text — real, per direct guidance ─────────────────────────
  // "It would be easiest for them to select text they may have entered
  // in a case, select a button, their name and facility would be
  // known, all they would need is to create a voice trigger." Real
  // ownership (getSessionUser) and real facility
  // (casePerformingLabFacilityId, resolved above) are auto-attributed —
  // the only thing this modal actually asks for is the spoken trigger.
  // Saved as a real VoiceMacro (types/voiceMacros.ts) with
  // ownerUserId set — the Personal tier of the same three-tier
  // Enterprise/Facility/Personal model "My Macros" itself now uses
  // (services/macros/IMacroService.ts's own isMacroVisibleTo()).
  const voiceMacroService = useMemo(() => new MockVoiceMacroService(), []);
  const [quickTextDraft, setQuickTextDraft] = useState<{ sectionId: string; selectedText: string } | null>(null);
  const [quickTextTrigger, setQuickTextTrigger] = useState('');
  const [savingQuickText, setSavingQuickText] = useState(false);

  const handleOpenSaveAsQuickText = useCallback((section: OrchestratorSection) => {
    const editorHandle = editorRefs.current[section.id];
    const editor = editorHandle?.getEditor?.();
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) { alert('Select some text first to save it as a personal quick text.'); return; }
    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) return;
    setQuickTextTrigger('');
    setQuickTextDraft({ sectionId: section.id, selectedText });
  }, []);

  const handleConfirmSaveAsQuickText = useCallback(async () => {
    if (!quickTextDraft || !quickTextTrigger.trim()) return;
    setSavingQuickText(true);
    const sessionUser = getSessionUser();
    try {
      await voiceMacroService.addMacro({
        spoken: quickTextTrigger.trim(),
        written: quickTextDraft.selectedText,
        isActive: true,
        name: quickTextDraft.selectedText.length > 40 ? quickTextDraft.selectedText.slice(0, 40) + '…' : quickTextDraft.selectedText,
        ownerUserId: sessionUser?.id,
        performingLabFacilityId: casePerformingLabFacilityId,
        sourceCaseId: caseData?.id,
        createdBy: sessionUser?.id,
        createdAt: new Date().toISOString(),
      });
      setQuickTextDraft(null);
      setQuickTextTrigger('');
    } finally {
      setSavingQuickText(false);
    }
  }, [quickTextDraft, quickTextTrigger, voiceMacroService, casePerformingLabFacilityId, caseData?.id]);
  const spellLocaleLabel = effectiveJurisdiction === 'US' ? 'American English'
    : effectiveJurisdiction ? 'British English' // GB_EW/GB_SCT/IE all resolve to en-GB spelling; CA/AU/NZ not yet distinguished here
    : undefined;

  // ── Accept with spell check ───────────────────────────────────────────────────
  // Runs a locale-aware spelling check before committing the Accept. If the
  // check finds nothing, accept proceeds immediately (no added friction for
  // the common case). If it finds flags, we open the review popover instead
  // of accepting — the section only actually commits once the pathologist
  // has stepped through every flag (fix, keep, or skip).
  const handleAcceptWithSpellCheck = useCallback(async (section: OrchestratorSection) => {
    setSpellCheckLoading(section.id);
    try {
      const result = await aiService.checkSpelling(section.text, effectiveJurisdiction, caseData?.order?.facilityId);
      const commit = (finalText: string) => {
        if (onAcceptSection) onAcceptSection(section.id, finalText);
        else onSectionChange(section.id, finalText); // fallback for parents not yet wired
      };
      if (result.success && result.data.flags.length > 0) {
        setSpellCheckReview({
          sectionId: section.id,
          text: section.text,
          flags: result.data.flags,
          flagIndex: 0,
        });
      } else {
        // No flags (or check failed) — accept as-is rather than blocking
        // the pathologist on an AI service hiccup.
        commit(section.text);
      }
    } finally {
      setSpellCheckLoading(null);
    }
  }, [aiService, effectiveJurisdiction, onSectionChange, onAcceptSection]);

  // Resolve the current flag in an active review: apply the suggestion,
  // keep the original wording, or just move on (skip = same as keep, but
  // tracked separately in case we want different telemetry later).
  const resolveSpellCheckFlag = useCallback((action: 'fix' | 'keep' | 'skip') => {
    setSpellCheckReview(prev => {
      if (!prev) return prev;
      const flag = prev.flags[prev.flagIndex];
      const nextText = action === 'fix' && flag
        ? prev.text.split(flag.original).join(flag.suggestion)
        : prev.text;

      const nextIndex = prev.flagIndex + 1;
      if (nextIndex >= prev.flags.length) {
        // All flags resolved — commit the section now, explicitly
        if (onAcceptSection) onAcceptSection(prev.sectionId, nextText);
        else onSectionChange(prev.sectionId, nextText);
        return null;
      }
      return { ...prev, text: nextText, flagIndex: nextIndex };
    });
  }, [onSectionChange, onAcceptSection]);

  const cancelSpellCheckReview = useCallback(() => {
    // Cancel = accept the section as originally written, flags un-applied.
    // The pathologist saw the flags existed (via the popover) and chose not
    // to act on them right now — that's a legitimate outcome, not an error.
    setSpellCheckReview(prev => {
      if (prev) {
        if (onAcceptSection) onAcceptSection(prev.sectionId, prev.text);
        else onSectionChange(prev.sectionId, prev.text);
      }
      return null;
    });
  }, [onSectionChange, onAcceptSection]);

  // ── Voice / keyboard event listeners ─────────────────────────────────────────
  useEffect(() => {
    const onJumpSection = (e: Event) => {
      const idx = (e as CustomEvent).detail?.index ?? 0;
      const section = sections[idx];
      if (section) jumpToSection(section.id);
    };
    const onNextSection = () => {
      const idx = sections.findIndex(s => s.id === activeId);
      const next = sections[idx + 1];
      if (next) jumpToSection(next.id);
    };
    const onPrevSection = () => {
      const idx = sections.findIndex(s => s.id === activeId);
      const prev = sections[idx - 1];
      if (prev) jumpToSection(prev.id);
    };
    const onRegenAll = () => {
      if (onRegenerateSection) sections.forEach(s => onRegenerateSection(s.id));
    };
    const onDictateSection = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        sectionId?: string;
        sectionIndex?: number;
        label?: string;
      };
      let section: OrchestratorSection | undefined;
      if (detail.sectionId)    section = sections.find(s => s.id === detail.sectionId);
      if (!section && detail.sectionIndex !== undefined) section = sections[detail.sectionIndex];
      if (!section && detail.label) {
        const q = detail.label.toLowerCase();
        section = sections.find(s => s.label.toLowerCase().includes(q));
      }
      if (!section) return;
      jumpToSection(section.id);
      registerDictationTarget(section);
    };

    window.addEventListener('PATHSCRIBE_ORCH_JUMP_SECTION',    onJumpSection);
    window.addEventListener('PATHSCRIBE_ORCH_NEXT_SECTION',    onNextSection);
    window.addEventListener('PATHSCRIBE_ORCH_PREV_SECTION',    onPrevSection);
    window.addEventListener('PATHSCRIBE_ORCH_REGEN_ALL',       onRegenAll);
    window.addEventListener('PATHSCRIBE_ORCH_DICTATE_SECTION', onDictateSection);

    return () => {
      window.removeEventListener('PATHSCRIBE_ORCH_JUMP_SECTION',    onJumpSection);
      window.removeEventListener('PATHSCRIBE_ORCH_NEXT_SECTION',    onNextSection);
      window.removeEventListener('PATHSCRIBE_ORCH_PREV_SECTION',    onPrevSection);
      window.removeEventListener('PATHSCRIBE_ORCH_REGEN_ALL',       onRegenAll);
      window.removeEventListener('PATHSCRIBE_ORCH_DICTATE_SECTION', onDictateSection);
    };
  }, [sections, activeId, jumpToSection, onRegenerateSection, registerDictationTarget]);

  // ── Macros — loaded from service ────────────────────────────────────────────
  const [macros, setMacros] = useState<{ id: string; trigger: string; name: string; content: string }[]>([]);
  useEffect(() => {
    mockMacroService.getAll().then(r => {
      if (r.ok) {
        setMacros(
          r.data.filter(m => m.status === 'Active').map(m => ({
            id: m.id, trigger: m.shortcut, name: m.name, content: m.content,
          }))
        );
      }
    });
  }, []);

  // ── Completion summary (mirrors synoptic panel's answered/total badges) ─────
  const totalSections = sections.length;
  const acceptedCount = sections.filter(s => { const st = getSectionStatus(s); return st === 'accepted' || st === 'accepted-manual'; }).length;
  const requiredSections = sections.filter(s => s.required);
  const requiredDone     = requiredSections.filter(s => { const st = getSectionStatus(s); return st === 'accepted' || st === 'accepted-manual'; }).length;

  // ── Jump-to: Next Unanswered / Next Required ────────────────────────────────

  const jumpToNextEmpty = useCallback(() => {
    const all = sections.filter(s => !s.text);
    if (!all.length) return;
    const curIdx = all.findIndex(s => s.id === activeId);
    const next = all[curIdx >= 0 && curIdx < all.length - 1 ? curIdx + 1 : 0];
    jumpToSection(next.id);
  }, [sections, activeId, jumpToSection]);

  const jumpToNextRequired = useCallback(() => {
    const all = requiredSections.filter(s => { const st = getSectionStatus(s); return st !== 'accepted' && st !== 'accepted-manual'; });
    if (!all.length) return;
    const curIdx = all.findIndex(s => s.id === activeId);
    const next = all[curIdx >= 0 && curIdx < all.length - 1 ? curIdx + 1 : 0];
    jumpToSection(next.id);
  }, [requiredSections, activeId, jumpToSection]);

  // ── Render one section's editor card ────────────────────────────────────────
  const renderSectionCard = (section: OrchestratorSection, showHeader: boolean) => {
    const status = getSectionStatus(section);
    const meta = STATUS_META[status];
    const isLocked = !!section.committed;
    return (
      <div
        key={section.id}
        ref={el => { sectionRefs.current[section.id] = el; }}
        className={`ps-ose-section-card${activeId === section.id ? ' ps-ose-section-card--active' : ''}${isLocked ? ' ps-ose-section-card--locked' : ''}`}
      >
        {showHeader && (
          <div className="ps-ose-section-card-header">
            <span className="ps-ose-section-card-title" style={section.specimenId ? labelStyle(documentStyle?.body) : undefined}>{section.label}</span>
            <span className="ps-ose-section-card-status" style={{ color: meta.color }} title={meta.title}>
              {meta.icon} {meta.title}
            </span>
            {section.required && status !== 'accepted' && status !== 'accepted-manual' && (
              <span className="ps-ose-section-card-required" title="Required">⚠ Required</span>
            )}
            {isLocked && (
              <span className="ps-ose-section-card-locked-badge" title="Committed — locked. Editing requires an Amendment.">
                🔒 Locked
              </span>
            )}
            {/* Insert Specimen — available on any unlocked section, independent of accept status */}
            {!isLocked && (caseData?.specimens?.length ?? 0) > 0 && (
              <button
                className="ps-ose-section-insert-specimen-btn"
                title={`Insert all ${caseData?.specimens?.length} specimen(s) as "Specimen [Letter]: [Description]"`}
                onClick={() => insertSpecimens(section)}
              >
                IS
              </button>
            )}
            {/* Real, per direct guidance ("Personal Quick Text"): save
                the currently-selected text as a real, personal quick
                text entry — name/facility auto-attributed, only a
                voice trigger needs to be entered. */}
            {!isLocked && (
              <button
                className="ps-ose-section-insert-specimen-btn"
                title="Save the selected text as a personal quick text (voice trigger)"
                onClick={() => handleOpenSaveAsQuickText(section)}
              >
                QT
              </button>
            )}
            {/* Per-section accept — only shown for AI-generated, unaccepted sections */}
            {!isLocked && status === 'ai-generated' && !isGenerating && (
              <button
                className="ps-ose-section-accept-btn"
                title="Check spelling and accept this section"
                disabled={spellCheckLoading === section.id}
                onClick={() => handleAcceptWithSpellCheck(section)}
              >
                {spellCheckLoading === section.id ? '⋯ Checking' : '✓ Accept'}
              </button>
            )}

          </div>
        )}
        <div
          className={`ps-ose-section-card-body${isLocked ? ' ps-ose-section-card-body--locked' : ''}`}
          onFocus={() => {
            if (isLocked) return;
            setActiveId(section.id);
            setFocusedSectionId(section.id);
            // Passive focus tracking only — does NOT call startDictation.
            // focusedSectionId is read by the NavBar mic handler (in
            // AppShell/NavBar — outside this component) to know which
            // section to target IF the pathologist explicitly presses the
            // mic. Voice should only ever activate from an explicit action:
            // a recognized "Dictate [section]" command, or a deliberate
            // mic press — never as a side effect of clicking into a field.
          }}
          onBlur={() => {
            // Only stop dictation on blur if we're actively dictating —
            // don't interrupt if the pathologist clicked the NavBar mic
            // or another app control while the section was focused.
            // VoiceProvider's stop phrases ("done", "stop dictation") are
            // the primary exit path during active dictation.
          }}
        >
          {isLocked && (
            <div className="ps-ose-locked-overlay-note">
              This section is committed and read-only. Use Delegate → Amendment to make changes after sign-out.
            </div>
          )}
          <NarrativeEditor
            ref={(h: any) => { editorRefs.current[section.id] = h; }}
            value={textToHtml(section.text)}
            onChange={html => onSectionChange(section.id, html)}
            readOnly={isGenerating || isLocked}
            minHeight="120px"
            placeholder={section.hint ?? `Begin ${section.label.toLowerCase()}…`}
            macros={macros}
            suppressToolbar
            theme="dark"
            toolbarPortalId={!isLocked && focusedSectionId === section.id ? 'ps-ose-tb-portal' : undefined}
            tabWidthChars={tabWidthChars}
            onTabWidthChange={onTabWidthChange}
          />
        </div>
        {section.pendingDraft && (
          <div className="ps-ose-pending-banner">
            <span>New AI draft available for this section.</span>
            <div className="ps-ose-pending-actions">
              <button onClick={() => onAcceptDraft(section.id)} className="ps-ose-pending-btn ps-ose-pending-btn--accept">Use new draft</button>
              <button onClick={() => onKeepVersion(section.id)} className="ps-ose-pending-btn">Keep my version</button>
            </div>
          </div>
        )}
        {spellCheckReview && spellCheckReview.sectionId === section.id && (
          <SpellCheckPopover
            sectionLabel={section.label}
            text={spellCheckReview.text}
            flag={spellCheckReview.flags[spellCheckReview.flagIndex]}
            index={spellCheckReview.flagIndex}
            total={spellCheckReview.flags.length}
            onFix={() => resolveSpellCheckFlag('fix')}
            onKeep={() => resolveSpellCheckFlag('keep')}
            onSkip={() => resolveSpellCheckFlag('skip')}
            onCancel={cancelSpellCheckReview}
          />
        )}
      </div>
    );
  };

  return (
    <div className="ps-ose-shell">

      {/* ── Sticky header zone ─────────────────────────────────────────────── */}
      <div className="ps-ose-sticky-header">

        {/* Single row: [Tabs/Page — left] [Jump to — center] [counts/actions — right] */}
        <div className="ps-ose-summary-row">

          {/* Group 1: jurisdiction badge + Tabs / Page toggle — left justified */}
          <div className="ps-ose-group-left">
            {spellLocaleLabel && (
              <span
                className="ps-ose-jurisdiction-badge"
                title={jurisdictionFacilityName
                  ? `Spelling and terminology on this report follow ${jurisdictionFacilityName}'s convention, not the reviewing pathologist's own — the report has to conform to the receiving institution's record system.`
                  : 'No Submitting Facility resolved for this case — using the system default convention.'}
              >
                ✎ {spellLocaleLabel}{jurisdictionFacilityName ? ` — ${jurisdictionFacilityName}` : ''}
              </span>
            )}
            <div className="ps-ose-view-toggle">
              <button
                className={`ps-ose-view-toggle-btn${viewMode === 'tabs' ? ' ps-ose-view-toggle-btn--active' : ''}`}
                onClick={() => setViewMode('tabs')}
                title="Tab view — one section at a time"
              >⊟ Tabs</button>
              <button
                className={`ps-ose-view-toggle-btn${viewMode === 'page' ? ' ps-ose-view-toggle-btn--active' : ''}`}
                onClick={() => setViewMode('page')}
                title="Page view — all sections scrollable"
              >☰ Page</button>
            </div>
          </div>

          {/* Group 2: Jump to — center */}
          <div className="ps-ose-summary-centre">
            <span className="ps-ose-jumpto-label">Jump to:</span>
            <button
              className="ps-ose-jumpto-btn ps-ose-jumpto-btn--unanswered"
              onClick={jumpToNextEmpty}
              disabled={totalSections - sections.filter(s => s.text).length === 0}
              title={totalSections === 0 ? 'No sections yet — run Generate Report' : undefined}
            >
              → Next Empty {totalSections - sections.filter(s => s.text).length > 0 ? `(${totalSections - sections.filter(s => s.text).length})` : '✓'}
            </button>
            <button
              className={`ps-ose-jumpto-btn ps-ose-jumpto-btn--required${requiredDone < requiredSections.length ? ' ps-ose-jumpto-btn--required-pending' : ''}`}
              onClick={jumpToNextRequired}
              disabled={requiredSections.length - requiredDone === 0}
              title={requiredSections.length === 0 ? 'No required sections yet — run Generate Report' : undefined}
            >
              → Next Required {requiredSections.length - requiredDone > 0 ? `(${requiredSections.length - requiredDone})` : '✓'}
            </button>
          </div>

          {/* Group 3: counts + actions — right justified */}
          <div className="ps-ose-summary-right">
            {isGenerating && (
              <span className="ps-ose-generating-badge"><span className="ps-ose-dot-pulse" />Generating…</span>
            )}
            {!isGenerating && lastGeneratedAt && (
              <span className="ps-ose-generated-time">
                Generated {lastGeneratedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <span className="ps-ose-summary-count">
              {acceptedCount}/{totalSections} sections
            </span>
            {requiredSections.length > 0 && (
              <span className={`ps-ose-summary-count${requiredDone < requiredSections.length ? ' ps-ose-summary-count--warn' : ' ps-ose-summary-count--ok'}`}>
                {requiredDone}/{requiredSections.length} required
              </span>
            )}
            {onRegenerateSection && !isGenerating && (
              <button
                className="ps-ose-summary-btn ps-ose-regen-btn"
                onClick={() => sections.forEach(s => onRegenerateSection(s.id))}
                title="Regenerate all sections"
              >↺ Regen all</button>
            )}
            {onAcceptAll && !isGenerating && sections.some(s => s.aiGenerated && !s.userEdited && !s.committed) && (
              <button className="ps-ose-summary-btn ps-ose-accept-btn" onClick={onAcceptAll} title="Accept all AI-generated sections">
                ✓ Accept all
              </button>
            )}
          </div>
        </div>

        {/* Row 2: section pills — Tabs mode only */}
        {viewMode === 'tabs' && (
          <div className="ps-ose-tabs-row">
            <div className="ps-ose-pills">
              {sections.map(s => {
                const status = getSectionStatus(s);
                const meta = STATUS_META[status];
                return (
                  <button
                    key={s.id}
                    className={`ps-ose-pill${activeId === s.id ? ' ps-ose-pill--active' : ''}`}
                    onClick={() => jumpToSection(s.id)}
                  >
                    {s.label}
                    <span className="ps-ose-pill-dot" style={{ color: activeId === s.id ? 'currentColor' : meta.color }}>{meta.icon}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Row 3: toolbar (portalled from focused section's editor) —
            positioned LAST, directly above the content body, so the
            formatting controls sit as close as possible to the actual
            text being edited. */}
        <div className="ps-ose-toolbar">
          <div id="ps-ose-tb-portal" className="ps-ose-tb-portal" />
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="ps-ose-body" ref={pageScrollRef}>
        {sections.length === 0 ? (
          <div className="ps-ose-empty">
            <div className="ps-ose-empty-icon">✍️</div>
            <div className="ps-ose-empty-title">Report Draft</div>
            <div className="ps-ose-empty-text">
              {onGenerateReport ? (
                <>Complete the synoptic fields, then press{' '}
                  <button className="ps-ose-empty-link" onClick={onGenerateReport}>⚡ Generate Report</button>
                  {' '}to create an AI-drafted narrative.</>
              ) : (
                <>Complete the synoptic fields, then press <strong>⚡ Generate Report</strong> to create an AI-drafted narrative.</>
              )}
            </div>
            {onStartManualEntry && (
              <div className="ps-ose-empty-text" style={{ marginTop: 4 }}>
                Prefer to dictate the Gross directly instead?{' '}
                <button className="ps-ose-empty-link" onClick={onStartManualEntry}>✍️ Start writing manually</button>
                {' '}— opens blank sections with no AI involved; AI can update the synoptic from what you write once you're done.
              </div>
            )}
            <div className="ps-ose-empty-hint">
              Sections appear here as they generate. Every section is fully editable — your changes are preserved if you regenerate.
            </div>
          </div>
        ) : viewMode === 'tabs' ? (
          activeSection && renderSectionCard(activeSection, false)
        ) : (
          sections.map(s => renderSectionCard(s, true))
        )}
      </div>

      {/* Real, per direct guidance ("Personal Quick Text"): only asks
          for the one thing that isn't already known — the voice
          trigger. Name and facility are shown, not asked for, since
          they're already resolved from the real session/case context. */}
      {quickTextDraft && (
        <div className="ps-conf-backdrop" onClick={() => setQuickTextDraft(null)}>
          <div className="ps-ose-quicktext-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ose-quicktext-title">Save as Personal Quick Text</div>
            <div className="ps-ose-quicktext-preview">{quickTextDraft.selectedText}</div>
            <div className="ps-ose-quicktext-meta">
              {getSessionUser()?.firstName ?? 'You'} {getSessionUser()?.lastName ?? ''} · {casePerformingLabName ?? (casePerformingLabFacilityId ? casePerformingLabFacilityId : 'no facility resolved for this case')}
            </div>
            <label className="ps-conf-label">Voice Trigger</label>
            <input
              autoFocus
              className="ps-conf-input"
              value={quickTextTrigger}
              onChange={e => setQuickTextTrigger(e.target.value)}
              placeholder='e.g. "normal colon comment"'
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmSaveAsQuickText(); }}
            />
            <div className="ps-ose-quicktext-actions">
              <button className="ps-btn-ghost-dark" onClick={() => setQuickTextDraft(null)}>Cancel</button>
              <button className="ps-conf-btn-primary" disabled={!quickTextTrigger.trim() || savingQuickText} onClick={handleConfirmSaveAsQuickText}>
                {savingQuickText ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrchestratorSectionEditor;
