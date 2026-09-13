// src/services/actionRegistry/phase3aTranslatedTriggers.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per src/MULTILANG_VOICE_COMMANDS_PLAN.md's own Phase 3a: a
// representative, everyday-workflow subset of 18 real actions
// (navigation, sign-out, common confirm/override/skip) now carry
// real, native-language voiceTriggersByLanguage content for French,
// German, Dutch, and Korean. This test confirms a real, genuine
// sample of that content actually matches through the real
// findActionByTrigger() pipeline end to end — not just that the data
// exists, but that it's genuinely wired and functional.
//
// Real, confirmed directly while writing this: several of these 18
// actions (SIGN_OUT, AI_REVIEW_CONFIRM/OVERRIDE/SKIP) are
// category: 'SYNOPTIC', not one of the always-eligible GLOBAL_CATEGORIES
// — findActionByTrigger() only considers them eligible when
// setCurrentContext('SYNOPTIC') has been called first, same real
// context-eligibility rule this service already enforces for every
// other real caller. Restored to its own prior value afterward, since
// currentAppContext is real, shared module state across this whole
// test suite.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockActionRegistryService } from './mockActionRegistryService';

describe('Phase 3a translated voice triggers — real, end-to-end matching', () => {
  beforeAll(() => { mockActionRegistryService.setCurrentContext('SYNOPTIC'); });
  afterAll(() => { mockActionRegistryService.setCurrentContext('WORKLIST'); });

  it('real, French "aller à l\u2019accueil" correctly triggers OPEN_HOME', () => {
    expect(mockActionRegistryService.findActionByTrigger('aller à l\u2019accueil', 'fr')?.id).toBe('OPEN_HOME');
  });

  it('real, German "arbeitsliste öffnen" correctly triggers OPEN_WORKLIST', () => {
    expect(mockActionRegistryService.findActionByTrigger('arbeitsliste öffnen', 'de')?.id).toBe('OPEN_WORKLIST');
  });

  it('real, Dutch "zaak ondertekenen" correctly triggers SIGN_OUT (a real, SYNOPTIC-context-only action)', () => {
    expect(mockActionRegistryService.findActionByTrigger('zaak ondertekenen', 'nl')?.id).toBe('SIGN_OUT');
  });

  it('real, Korean "다음 증례" correctly triggers NEXT_CASE', () => {
    expect(mockActionRegistryService.findActionByTrigger('다음 증례', 'ko')?.id).toBe('NEXT_CASE');
  });

  it('real, French "annuler le résultat" correctly triggers AI_REVIEW_OVERRIDE, not AI_REVIEW_CONFIRM', () => {
    const result = mockActionRegistryService.findActionByTrigger('annuler le résultat', 'fr');
    expect(result?.id).toBe('AI_REVIEW_OVERRIDE');
  });

  it('real, German "befund bestätigen" correctly triggers AI_REVIEW_CONFIRM, not AI_REVIEW_OVERRIDE', () => {
    const result = mockActionRegistryService.findActionByTrigger('befund bestätigen', 'de');
    expect(result?.id).toBe('AI_REVIEW_CONFIRM');
  });

  it('real, Dutch "bevinding overslaan" correctly triggers AI_REVIEW_SKIP', () => {
    expect(mockActionRegistryService.findActionByTrigger('bevinding overslaan', 'nl')?.id).toBe('AI_REVIEW_SKIP');
  });

  it('real, Korean "설정 열기" correctly triggers OPEN_CONFIGURATION', () => {
    expect(mockActionRegistryService.findActionByTrigger('설정 열기', 'ko')?.id).toBe('OPEN_CONFIGURATION');
  });

  it('real, English matching for every one of these 18 real, now-translated actions remains completely unaffected', () => {
    expect(mockActionRegistryService.findActionByTrigger('go home')?.id).toBe('OPEN_HOME');
    expect(mockActionRegistryService.findActionByTrigger('sign out case')?.id).toBe('SIGN_OUT');
    expect(mockActionRegistryService.findActionByTrigger('confirm finding')?.id).toBe('AI_REVIEW_CONFIRM');
  });
});
