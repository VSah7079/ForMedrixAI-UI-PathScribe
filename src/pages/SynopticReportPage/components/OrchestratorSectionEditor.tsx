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

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import NarrativeEditor from '@/components/Editor/NarrativeEditor';
import { useVoice } from '@/contexts/VoiceProvider';
import type { PathScribeEditorHandle } from '@/components/Editor/PathScribeEditorRef';
import type { LabelConfig } from '@/types/template';
import { labelStyleVars } from '@/utils/labelStyleVars';
import type { Case } from '@/types/case/Case';
import { facilityService, macroService, voiceMacroService } from '@/services';
import { resolvePerformingLabFacilityId } from '@/services/facilities/IFacilityService';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { SpellingLanguageControl } from '@/components/SpellCheck/SpellingLanguageControl';

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

// Status titles are UI-chrome badge labels for a computed section
// status (not itself a persisted field) — translated via the same
// label-key indirection used for other computed display statuses in
// this sweep, resolved with t() wherever STATUS_META is read.
const STATUS_META: Record<SectionStatus, { color: string; titleKey: string; icon: string }> = {
  'empty':           { color: '#475569', titleKey: 'orchestratorSectionEditor.status.empty',        icon: '○' },
  'ai-generated':    { color: '#0891b2', titleKey: 'orchestratorSectionEditor.status.aiGenerated',   icon: '◉' },
  // Matches RightSynopticPanel's field-level convention exactly: once
  // accepted, the badge still names the AI's involvement explicitly
  // ("AI Confirmed") rather than going generic ("Accepted") — provenance
  // stays visible permanently, only the styling/urgency settles down.
  'accepted':        { color: '#10b981', titleKey: 'orchestratorSectionEditor.status.aiConfirmed',   icon: '✓' },
  // Pathologist wrote this section themselves — AI had no draft for it.
  // Distinct purple styling, same as RightSynopticPanel's "Manual — AI
  // missed" field badge.
  'accepted-manual': { color: '#c084fc', titleKey: 'orchestratorSectionEditor.status.manualEntry',   icon: '✎' },
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
  /** Real, honest note: the real implementation (useReportGeneration.ts's
   *  handleRegenerateSection) is async and returns a Promise — declared
   *  here as returning void | Promise<void> (rather than plain void) so
   *  "Regen all" below can genuinely await each call in turn instead of
   *  firing every section's regeneration at once. */
  onRegenerateSection?: (sectionId: string) => void | Promise<void>;
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
  const { t } = useTranslation();
  // ── Refs ─────────────────────────────────────────────────────────────────────
  const editorRefs    = useRef<Record<string, PathScribeEditorHandle | null>>({});
  const sectionRefs   = useRef<Record<string, HTMLDivElement | null>>({});
  const pageScrollRef = useRef<HTMLDivElement>(null);

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

  // ── Case's performing lab (for personal quick text) ──────────────────────────
  // Real, per direct guidance ("Personal Quick Text" — Enterprise then
  // Facility then Staff): this case's own real performing lab —
  // resolvePerformingLabFacilityId's real single-hop resolution
  // (services/facilities/IFacilityService.ts), since the ordering
  // facility itself may not be the one that actually performs the
  // work. Auto-attributed, never asked of the pathologist — the whole
  // point of "their name and facility would be known." Set from the
  // from one facility fetch below.
  const [casePerformingLabFacilityId, setCasePerformingLabFacilityId] = useState<string | undefined>(undefined);
  const [casePerformingLabName, setCasePerformingLabName] = useState<string | undefined>(undefined);

  useEffect(() => {
    const clientId = caseData?.order?.facilityId;
    if (!clientId) { setCasePerformingLabFacilityId(undefined); setCasePerformingLabName(undefined); return; }
    let cancelled = false;
    facilityService.getById(clientId).then(res => {
      if (cancelled) return;
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
  const [quickTextDraft, setQuickTextDraft] = useState<{ sectionId: string; selectedText: string } | null>(null);
  const [quickTextTrigger, setQuickTextTrigger] = useState('');
  const [savingQuickText, setSavingQuickText] = useState(false);

  const handleOpenSaveAsQuickText = useCallback((section: OrchestratorSection) => {
    const editorHandle = editorRefs.current[section.id];
    const editor = editorHandle?.getEditor?.();
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) { alert(t('orchestratorSectionEditor.quickText.selectTextFirstAlert')); return; }
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
  }, [quickTextDraft, quickTextTrigger, casePerformingLabFacilityId, caseData?.id]);
  // ── Accept ─────────────────────────────────────────────────────────────────────
  // PS-342 (Batch 338): Accept commits the section directly. The AI spelling
  // pass that used to run here first is retired: the report editor now
  // checks spelling as the pathologist types (components/SpellCheck/), in
  // the case's own spelling language.
  const acceptSection = useCallback((section: OrchestratorSection) => {
    if (onAcceptSection) onAcceptSection(section.id, section.text);
    else onSectionChange(section.id, section.text); // fallback for parents not yet wired
  }, [onSectionChange, onAcceptSection]);

  // Real fix (PS-317 — "Regen All" appearing to put Gross Description in
  // the wrong place): both real triggers (this button, and the voice
  // command below) used to call onRegenerateSection(s.id) once per
  // section inside a plain forEach — since the real handler
  // (useReportGeneration.ts's handleRegenerateSection) is async and
  // guards re-entry with `if (isOrchestrating) return`, and isOrchestrating
  // is ordinary React state (not a ref), every iteration of that forEach
  // read the SAME stale, pre-loop value of isOrchestrating — so every
  // section's regeneration actually started at once, as N fully
  // concurrent AI calls all writing into the same orchSections state
  // through the same callbacks, instead of one at a time. Awaiting each
  // call before starting the next is the real fix — sections regenerate
  // in the same order they're listed, one real AI call in flight at a
  // time, matching what "Regen ALL" should mean.
  const regenerateAllSequentially = useCallback(async () => {
    if (!onRegenerateSection) return;
    for (const s of sections) {
      await onRegenerateSection(s.id);
    }
  }, [sections, onRegenerateSection]);

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
      void regenerateAllSequentially();
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
  }, [sections, activeId, jumpToSection, onRegenerateSection, registerDictationTarget, regenerateAllSequentially]);

  // ── Macros — loaded from service ────────────────────────────────────────────
  const [macros, setMacros] = useState<{ id: string; trigger: string; name: string; content: string }[]>([]);
  useEffect(() => {
    macroService.getAll().then(r => {
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
            <span
              className={`ps-ose-section-card-title${section.specimenId ? ' ps-ose-section-card-title--specimen' : ''}`}
              style={section.specimenId ? labelStyleVars(documentStyle?.body) : undefined}
            >{section.label}</span>
            <span className={`ps-ose-section-card-status ps-ose-section-card-status--${status}`} title={t(meta.titleKey)}>
              {meta.icon} {t(meta.titleKey)}
            </span>
            {section.required && status !== 'accepted' && status !== 'accepted-manual' && (
              <span className="ps-ose-section-card-required" title={t('common.required')}>⚠ {t('common.required')}</span>
            )}
            {isLocked && (
              <span className="ps-ose-section-card-locked-badge" title={t('orchestratorSectionEditor.lockedTooltip')}>
                🔒 {t('orchestratorSectionEditor.lockedBadge')}
              </span>
            )}
            {/* Insert Specimen — available on any unlocked section, independent of accept status */}
            {!isLocked && (caseData?.specimens?.length ?? 0) > 0 && (
              <button
                className="ps-ose-section-insert-specimen-btn"
                title={t('orchestratorSectionEditor.insertSpecimensTooltip', { count: caseData?.specimens?.length ?? 0 })}
                onClick={() => insertSpecimens(section)}
              >
                {t('orchestratorSectionEditor.insertSpecimensAbbr')}
              </button>
            )}
            {/* Real, per direct guidance ("Personal Quick Text"): save
                the currently-selected text as a real, personal quick
                text entry — name/facility auto-attributed, only a
                voice trigger needs to be entered. */}
            {!isLocked && (
              <button
                className="ps-ose-section-insert-specimen-btn"
                title={t('orchestratorSectionEditor.saveQuickTextTooltip')}
                onClick={() => handleOpenSaveAsQuickText(section)}
              >
                {t('orchestratorSectionEditor.quickTextAbbr')}
              </button>
            )}
            {/* Per-section accept — only shown for AI-generated, unaccepted sections */}
            {!isLocked && status === 'ai-generated' && !isGenerating && (
              <button
                className="ps-ose-section-accept-btn"
                title={t('orchestratorSectionEditor.acceptSectionTooltip')}
                onClick={() => acceptSection(section)}
              >
                {`✓ ${t('orchestratorSectionEditor.acceptButton')}`}
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
              {t('orchestratorSectionEditor.lockedOverlayNote')}
            </div>
          )}
          <NarrativeEditor
            ref={(h: any) => { editorRefs.current[section.id] = h; }}
            value={textToHtml(section.text)}
            onChange={html => onSectionChange(section.id, html)}
            readOnly={isGenerating || isLocked}
            minHeight="120px"
            placeholder={section.hint ?? t('orchestratorSectionEditor.beginSectionPlaceholder', { sectionLabel: section.label.toLowerCase() })}
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
            <span>{t('orchestratorSectionEditor.pendingDraftAvailable')}</span>
            <div className="ps-ose-pending-actions">
              <button onClick={() => onAcceptDraft(section.id)} className="ps-ose-pending-btn ps-ose-pending-btn--accept">{t('orchestratorSectionEditor.useNewDraftButton')}</button>
              <button onClick={() => onKeepVersion(section.id)} className="ps-ose-pending-btn">{t('orchestratorSectionEditor.keepMyVersionButton')}</button>
            </div>
          </div>
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

          {/* Group 1: spelling language + Tabs / Page toggle — left justified */}
          <div className="ps-ose-group-left">
            <SpellingLanguageControl className="ps-ose-spelllang" />
            <div className="ps-ose-view-toggle">
              <button
                className={`ps-ose-view-toggle-btn${viewMode === 'tabs' ? ' ps-ose-view-toggle-btn--active' : ''}`}
                onClick={() => setViewMode('tabs')}
                title={t('orchestratorSectionEditor.tabViewTooltip')}
              >⊟ {t('orchestratorSectionEditor.tabsButton')}</button>
              <button
                className={`ps-ose-view-toggle-btn${viewMode === 'page' ? ' ps-ose-view-toggle-btn--active' : ''}`}
                onClick={() => setViewMode('page')}
                title={t('orchestratorSectionEditor.pageViewTooltip')}
              >☰ {t('orchestratorSectionEditor.pageButton')}</button>
            </div>
          </div>

          {/* Group 2: Jump to — center */}
          <div className="ps-ose-summary-centre">
            <span className="ps-ose-jumpto-label">{t('orchestratorSectionEditor.jumpToLabel')}</span>
            <button
              className="ps-ose-jumpto-btn ps-ose-jumpto-btn--unanswered"
              onClick={jumpToNextEmpty}
              disabled={totalSections - sections.filter(s => s.text).length === 0}
              title={totalSections === 0 ? t('orchestratorSectionEditor.noSectionsYetTooltip') : undefined}
            >
              → {t('orchestratorSectionEditor.nextEmptyButton')} {totalSections - sections.filter(s => s.text).length > 0 ? `(${totalSections - sections.filter(s => s.text).length})` : '✓'}
            </button>
            <button
              className={`ps-ose-jumpto-btn ps-ose-jumpto-btn--required${requiredDone < requiredSections.length ? ' ps-ose-jumpto-btn--required-pending' : ''}`}
              onClick={jumpToNextRequired}
              disabled={requiredSections.length - requiredDone === 0}
              title={requiredSections.length === 0 ? t('orchestratorSectionEditor.noRequiredSectionsYetTooltip') : undefined}
            >
              → {t('orchestratorSectionEditor.nextRequiredButton')} {requiredSections.length - requiredDone > 0 ? `(${requiredSections.length - requiredDone})` : '✓'}
            </button>
          </div>

          {/* Group 3: counts + actions — right justified */}
          <div className="ps-ose-summary-right">
            {isGenerating && (
              <span className="ps-ose-generating-badge"><span className="ps-ose-dot-pulse" />{t('orchestratorSectionEditor.generatingLabel')}</span>
            )}
            {!isGenerating && lastGeneratedAt && (
              <span className="ps-ose-generated-time">
                {t('orchestratorSectionEditor.generatedAtLabel', { time: lastGeneratedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
              </span>
            )}
            <span className="ps-ose-summary-count">
              {t('orchestratorSectionEditor.sectionsCount', { done: acceptedCount, total: totalSections })}
            </span>
            {requiredSections.length > 0 && (
              <span className={`ps-ose-summary-count${requiredDone < requiredSections.length ? ' ps-ose-summary-count--warn' : ' ps-ose-summary-count--ok'}`}>
                {t('orchestratorSectionEditor.requiredCount', { done: requiredDone, total: requiredSections.length })}
              </span>
            )}
            {onRegenerateSection && !isGenerating && (
              <button
                className="ps-ose-summary-btn ps-ose-regen-btn"
                onClick={() => { void regenerateAllSequentially(); }}
                title={t('orchestratorSectionEditor.regenAllTooltip')}
              >↺ {t('orchestratorSectionEditor.regenAllButton')}</button>
            )}
            {onAcceptAll && !isGenerating && sections.some(s => s.aiGenerated && !s.userEdited && !s.committed) && (
              <button className="ps-ose-summary-btn ps-ose-accept-btn" onClick={onAcceptAll} title={t('orchestratorSectionEditor.acceptAllTooltip')}>
                ✓ {t('orchestratorSectionEditor.acceptAllButton')}
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
                    <span className={`ps-ose-pill-dot ps-ose-pill-dot--${status}`}>{meta.icon}</span>
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
            <div className="ps-ose-empty-title">{t('orchestratorSectionEditor.emptyState.title')}</div>
            <div className="ps-ose-empty-text">
              {onGenerateReport ? (
                <>{t('orchestratorSectionEditor.emptyState.completeFieldsThenPress')}{' '}
                  <button className="ps-ose-empty-link" onClick={onGenerateReport}>⚡ {t('orchestratorSectionEditor.emptyState.generateReportButton')}</button>
                  {' '}{t('orchestratorSectionEditor.emptyState.toCreateNarrative')}</>
              ) : (
                <>{t('orchestratorSectionEditor.emptyState.completeFieldsThenPress')} <strong>⚡ {t('orchestratorSectionEditor.emptyState.generateReportButton')}</strong> {t('orchestratorSectionEditor.emptyState.toCreateNarrative')}</>
              )}
            </div>
            {onStartManualEntry && (
              <div className="ps-ose-empty-text ps-ose-empty-text--tight">
                {t('orchestratorSectionEditor.emptyState.preferToDictate')}{' '}
                <button className="ps-ose-empty-link" onClick={onStartManualEntry}>✍️ {t('orchestratorSectionEditor.emptyState.startWritingManuallyButton')}</button>
                {' '}{t('orchestratorSectionEditor.emptyState.startWritingManuallyNote')}
              </div>
            )}
            <div className="ps-ose-empty-hint">
              {t('orchestratorSectionEditor.emptyState.hint')}
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
            <div className="ps-ose-quicktext-title">{t('orchestratorSectionEditor.quickText.modalTitle')}</div>
            <div className="ps-ose-quicktext-preview">{quickTextDraft.selectedText}</div>
            <div className="ps-ose-quicktext-meta">
              {getSessionUser()?.firstName ?? t('orchestratorSectionEditor.quickText.youFallback')} {getSessionUser()?.lastName ?? ''} · {casePerformingLabName ?? (casePerformingLabFacilityId ? casePerformingLabFacilityId : t('orchestratorSectionEditor.quickText.noFacilityResolved'))}
            </div>
            <label className="ps-conf-label">{t('orchestratorSectionEditor.quickText.voiceTriggerLabel')}</label>
            <input
              autoFocus
              className="ps-conf-input"
              value={quickTextTrigger}
              onChange={e => setQuickTextTrigger(e.target.value)}
              placeholder={t('orchestratorSectionEditor.quickText.voiceTriggerPlaceholder')}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmSaveAsQuickText(); }}
            />
            <div className="ps-ose-quicktext-actions">
              <button className="ps-btn-ghost-dark" onClick={() => setQuickTextDraft(null)}>{t('common.cancel')}</button>
              <button className="ps-conf-btn-primary" disabled={!quickTextTrigger.trim() || savingQuickText} onClick={handleConfirmSaveAsQuickText}>
                {savingQuickText ? t('orchestratorSectionEditor.quickText.savingLabel') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrchestratorSectionEditor;
