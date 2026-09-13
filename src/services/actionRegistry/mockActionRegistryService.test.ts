// src/services/actionRegistry/mockActionRegistryService.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("the actions list is out of sync... voice
// control is one of its central pillars. It has to be flawless"): no
// test file existed for this system at all before this pass, despite
// a real, severe audit finding — 49 real actions (Edit Field, Full
// View, Preview Report, Case Comment, and more) were silently,
// completely unreachable by voice or keyboard, because their own
// `category: VOICE_CONTEXT.REPORTING` matched no context any real
// page has ever set (`SynopticReportPage.tsx` sets `SYNOPTIC`, not
// `REPORTING` — confirmed directly, zero pages anywhere call
// `setCurrentContext(VOICE_CONTEXT.REPORTING)`). Fixed by
// recategorizing the 46 genuinely distinct survivors (3 were exact
// duplicates of an already-live SYNOPTIC action, deleted instead),
// reassigning 19 shortcuts and de-duplicating 10 voice-trigger
// phrases that only collided once the merge happened, and fixing 32
// separate `internalKey` entries that had all silently copied
// `ACTION_MAP['diagnosis.enterAddendum']`'s own key regardless of
// what the action actually was (confirmed non-functional today, since
// real dispatch — `VoiceProvider.tsx`'s keyboard handler and
// `findActionByTrigger`'s voice matching — keys off `shortcut`/
// `voiceTriggers`, never `internalKey`; still real, wrong data,
// fixed on the same pass). Two confirmed stale `ActionId` references
// (`system.finalise`/`system.finaliseNext`, both cast
// `(ACTION_MAP as any)[...]` to bypass the type error rather than fix
// the mismatch) also resolved — one was on the entry merged away as a
// duplicate, the other given a real, own internalKey.
//
// These tests exist so that class of drift can't happen silently
// again — a new action added without checking against what's already
// live, or a page's own context renamed without updating every
// action that depended on the old name, fails a real test here
// instead of just quietly going unreachable.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { mockActionRegistryService } from './mockActionRegistryService';
import fs from 'fs';
import path from 'path';

const actions = mockActionRegistryService.getActions();

// Real, per direct confirmation via a whole-app search (not guessed):
// every VOICE_CONTEXT value some real page genuinely calls
// setCurrentContext() with today. GLOBAL_CATEGORIES ('SYSTEM',
// 'NAVIGATION') are excluded — those are eligible everywhere by
// design, not tied to a specific page's own context. If a new page
// is added that owns a new context, add it here too — this list is
// a deliberate snapshot, not derived automatically, so a real,
// confirmed check gates any addition to it.
const REAL_LIVE_CONTEXTS = new Set([
  'SYSTEM', 'NAVIGATION', // GLOBAL_CATEGORIES — always eligible
  'ACCESSION', 'WORKLIST', 'CONFIGURATION', 'CASE_VIEW', 'INTRAOP', 'SEARCH', 'SYNOPTIC', 'CONTRIBUTION', 'AUDIT',
  'MESSAGES', // set by the messages drawer, not a page — confirmed separately
  'CYTOLOGY', // set by CytologyScreeningPage.tsx's own useEffect — confirmed directly, same pattern as SynopticReportPage.tsx's own SYNOPTIC context
]);

describe('mockActionRegistryService — real regression guard against orphaned/colliding actions', () => {
  it('every real action\'s category is a context some real page (or the messages drawer) actually sets — no orphaned category like the real REPORTING bug this suite exists because of', () => {
    const orphaned = actions.filter(a => !REAL_LIVE_CONTEXTS.has(a.category));
    expect(orphaned.map(a => `${a.id} (category: ${a.category})`)).toEqual([]);
  });

  it('no two actions share the same id', () => {
    const ids = actions.map(a => a.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it('no two actions eligible in the same real context share the same keyboard shortcut', () => {
    const byContext: Record<string, Record<string, string[]>> = {};
    for (const a of actions) {
      if (!a.shortcut || !a.isActive) continue;
      (byContext[a.category] ||= {});
      (byContext[a.category][a.shortcut] ||= []).push(a.id);
    }
    const collisions: string[] = [];
    for (const [ctx, shortcuts] of Object.entries(byContext)) {
      for (const [sc, ids] of Object.entries(shortcuts)) {
        if (ids.length > 1) collisions.push(`${ctx}/${sc}: ${ids.join(' vs ')}`);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('no two actions eligible in the same real context share an exact voice-trigger phrase', () => {
    const byContext: Record<string, Record<string, string[]>> = {};
    for (const a of actions) {
      if (!a.isActive) continue;
      (byContext[a.category] ||= {});
      for (const t of a.voiceTriggers) (byContext[a.category][t] ||= []).push(a.id);
    }
    const collisions: string[] = [];
    for (const [ctx, triggers] of Object.entries(byContext)) {
      for (const [t, ids] of Object.entries(triggers)) {
        if (ids.length > 1) collisions.push(`${ctx}/"${t}": ${ids.join(' vs ')}`);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('every action has a genuinely unique internalKey — catches the real miscopy bug this suite exists because of (32 actions had all silently copied the same, unrelated action\'s key)', () => {
    const keys = actions.map(a => a.internalKey);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it('the real source file never casts (ACTION_MAP as any) — a direct, reliable signal of a stale ActionId reference bypassing the type system instead of being fixed', () => {
    const src = fs.readFileSync(path.join(__dirname, 'mockActionRegistryService.ts'), 'utf8');
    expect(src.includes('ACTION_MAP as any')).toBe(false);
  });
});
