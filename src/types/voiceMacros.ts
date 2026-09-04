// src/types/voiceMacros.ts
export interface VoiceMacro {
  id: string;
  spoken: string;
  written: string;
  isActive: boolean;
  /**
   * Real, per direct guidance ("Personal Quick Text" — Enterprise then
   * Facility then Staff): a human-readable label, distinct from the
   * spoken trigger itself — a real macro browsing/management UI needs
   * something to show besides the raw trigger phrase. Optional so
   * existing seeded voice macros (PATHOLOGY_DEFAULTS) don't need
   * updating — falls back to the spoken phrase itself when absent.
   */
  name?: string;
  /**
   * Real, per direct guidance: same Global/scoped convention as
   * Macro.performingLabFacilityId (services/macros/IMacroService.ts) —
   * undefined means Enterprise-wide, set means visible only at that
   * specific facility. See Macro's own isMacroVisibleTo() for the
   * shared three-tier resolution rule this type follows identically.
   */
  performingLabFacilityId?: string;
  /**
   * Real, per direct guidance: when set, this voice macro is personal —
   * the real mechanism behind "Personal Quick Text." A pathologist
   * selects text they've already written in a real case, saves it with
   * only a spoken trigger to provide (their own identity and the
   * case's own real performing lab are already known from context —
   * see components/Editor/PathScribeEditor.tsx's own
   * onSaveAsPersonalQuickText), and it becomes visible only to them,
   * regardless of performingLabFacilityId.
   */
  ownerUserId?: string;
  /** Real, per direct guidance: which real case this was captured
   *  from, if any — provenance for a Personal Quick Text entry, not
   *  set for an admin-authored Enterprise/Facility voice macro. */
  sourceCaseId?: string;
  createdBy?: string;
  createdAt?: string;
}

/**
 * Real, per direct guidance: identical three-tier resolution rule to
 * Macro's own isMacroVisibleTo() (services/macros/IMacroService.ts) —
 * kept as a genuinely separate function rather than a shared generic,
 * since VoiceMacro and Macro are deliberately different types (see
 * that file's own header for why), but the real visibility RULE is
 * the same one, so both implementations must stay in sync by hand if
 * either ever changes.
 */
export function isVoiceMacroVisibleTo(macro: VoiceMacro, userId: string, performingLabFacilityId?: string): boolean {
  if (macro.ownerUserId) return macro.ownerUserId === userId;
  if (macro.performingLabFacilityId) return macro.performingLabFacilityId === performingLabFacilityId;
  return true;
}

/**
 * Real, per direct guidance (voice-trigger recognition wiring):
 * extracted from MockVoiceMacroService.refineTranscript()'s own real,
 * already-correct algorithm — word-boundary regex, spoken → written,
 * longest match first (so "normal colon mucosa" doesn't get partially
 * eaten by a shorter, unrelated "normal colon" macro first) — kept
 * here as a pure, synchronous function so the real, live dictation
 * pipeline (contexts/VoiceProvider.tsx) can call it directly without
 * an async round-trip through a mock service's own artificial
 * setTimeout latency. refineTranscript() itself now delegates to this
 * same function, so the two can never drift apart.
 */
export function applyVoiceMacroSubstitutions(text: string, macros: VoiceMacro[]): string {
  let result = text;
  const active = macros.filter(m => m.isActive && m.spoken).sort((a, b) => b.spoken.length - a.spoken.length);
  active.forEach(macro => {
    const regex = new RegExp(`\\b${macro.spoken}\\b`, 'gi');
    result = result.replace(regex, macro.written);
  });
  return result;
}
