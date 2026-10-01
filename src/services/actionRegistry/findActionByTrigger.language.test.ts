// src/services/actionRegistry/findActionByTrigger.language.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per src/MULTILANG_VOICE_COMMANDS_PLAN.md's own scoped pieces
// 1-2: tests the new, language-aware matching logic directly against
// a real, existing, globally-eligible seed action (OPEN_HOME,
// category: 'SYSTEM' — always eligible regardless of currentAppContext,
// so this test doesn't need to also control that separate, global
// state). getActions() returns the real, live, shared LIVE_ACTIONS
// array reference (confirmed directly before writing this) — so the
// real action's own voiceTriggersByLanguage is mutated in place for
// this test and explicitly restored afterward, since other test files
// in this same suite run against this same, shared module state.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockActionRegistryService } from './mockActionRegistryService';

describe('findActionByTrigger — real, language-aware matching', () => {
  const action = mockActionRegistryService.getActionById('OPEN_HOME')!;
  const originalVoiceTriggersByLanguage = action.voiceTriggersByLanguage;

  beforeEach(() => {
    action.voiceTriggersByLanguage = { fr: ['aller à l\u2019accueil', 'page d\u2019accueil'] };
  });

  afterEach(() => {
    action.voiceTriggersByLanguage = originalVoiceTriggersByLanguage;
  });

  it('real, the default (no language argument) behavior is completely unchanged — English matches exactly as before', () => {
    const result = mockActionRegistryService.findActionByTrigger('go home');
    expect(result?.id).toBe('OPEN_HOME');
  });

  it('real, a genuine, translated French phrase matches correctly when language=\'fr\'', () => {
    const result = mockActionRegistryService.findActionByTrigger('aller à l\u2019accueil', 'fr');
    expect(result?.id).toBe('OPEN_HOME');
  });

  it('real, English fallback still works on a French profile when no translated phrase matches — a bilingual user mixing in an English term is not broken', () => {
    const result = mockActionRegistryService.findActionByTrigger('go home', 'fr');
    expect(result?.id).toBe('OPEN_HOME');
  });

  it('real, a genuinely untranslated action (no voiceTriggersByLanguage at all) still matches correctly via English fallback on a non-English profile', () => {
    const result = mockActionRegistryService.findActionByTrigger('go home', 'de');
    expect(result?.id).toBe('OPEN_HOME');
  });

  it('real, a phrase that matches NEITHER the translated set NOR English correctly finds nothing for this action', () => {
    const result = mockActionRegistryService.findActionByTrigger('completely unrelated nonsense phrase', 'fr');
    expect(result?.id).not.toBe('OPEN_HOME');
  });
});
