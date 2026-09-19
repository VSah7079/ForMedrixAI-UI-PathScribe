// @vitest-environment happy-dom
//
// src/components/Config/System/ProtocolDictionarySection.rowsToProtocols.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "update the spreadsheet to include the
// new fields." rowsToProtocols is a real, pure, exported function,
// but importing it transitively reaches ProtocolDictionarySection.tsx's
// own top-level imports (down through services/index.ts), which
// execute real, browser-only localStorage access at module-load time
// — same real reason generateDefaultMaterial.test.ts needed
// @vitest-environment happy-dom above.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { rowsToProtocols } from './ProtocolDictionarySection';

const baseRow = (overrides: Record<string, any> = {}) => ({
  'Protocol Name': 'Test Protocol',
  'Description': '',
  'Requires Triage': 'No',
  'Triage Checklist': '',
  'Track Name': 'Track A',
  'Material Kind': 'Block',
  'Fixative': '10% NBF',
  'Processing Format': 'Standard',
  'Requires Decal': 'No',
  'Default Block/Decant Count': '',
  'Default Piece Count': '',
  'Step Order': 1,
  'Step Action': 'Cut Section',
  'Slide Count': '',
  'Hold': 'No',
  'Stains': '',
  ...overrides,
});

describe('rowsToProtocols \u2014 Default Block/Decant Count and Default Piece Count columns', () => {
  it('a real, valid Default Block/Decant Count round-trips onto the real pathway, no warning raised', () => {
    const { drafts, invalidPathwayCounts } = rowsToProtocols([baseRow({ 'Default Block/Decant Count': 4 })], []);
    expect(drafts[0].pathways[0].defaultCount).toBe(4);
    expect(invalidPathwayCounts.size).toBe(0);
  });

  it('a real, valid Default Piece Count on a real Block track round-trips, no warning raised', () => {
    const { drafts, invalidPathwayCounts } = rowsToProtocols([baseRow({ 'Default Piece Count': 2 })], []);
    expect(drafts[0].pathways[0].defaultPieceCount).toBe(2);
    expect(invalidPathwayCounts.size).toBe(0);
  });

  it('both columns genuinely blank leave both fields undefined, matching every protocol that predates this UI', () => {
    const { drafts, invalidPathwayCounts } = rowsToProtocols([baseRow()], []);
    expect(drafts[0].pathways[0].defaultCount).toBeUndefined();
    expect(drafts[0].pathways[0].defaultPieceCount).toBeUndefined();
    expect(invalidPathwayCounts.size).toBe(0);
  });

  it('a real, invalid (zero) Default Block/Decant Count is sanitized to undefined, not silently persisted, and raises a real, named warning', () => {
    const { drafts, invalidPathwayCounts } = rowsToProtocols([baseRow({ 'Default Block/Decant Count': 0 })], []);
    expect(drafts[0].pathways[0].defaultCount).toBeUndefined();
    expect(invalidPathwayCounts.size).toBe(1);
    expect([...invalidPathwayCounts][0]).toContain('Test Protocol');
    expect([...invalidPathwayCounts][0]).toContain('Track A');
  });

  it('a real, negative Default Piece Count is sanitized to undefined and raises a real, named warning', () => {
    const { drafts, invalidPathwayCounts } = rowsToProtocols([baseRow({ 'Default Piece Count': -2 })], []);
    expect(drafts[0].pathways[0].defaultPieceCount).toBeUndefined();
    expect(invalidPathwayCounts.size).toBe(1);
  });

  it('a real Default Piece Count on a real Decant track is sanitized to undefined \u2014 only meaningful for Block \u2014 with a warning naming the real reason, not just "invalid"', () => {
    const { drafts, invalidPathwayCounts } = rowsToProtocols(
      [baseRow({ 'Material Kind': 'Decant', 'Default Piece Count': 3 })], [],
    );
    expect(drafts[0].pathways[0].defaultPieceCount).toBeUndefined();
    expect(invalidPathwayCounts.size).toBe(1);
    expect([...invalidPathwayCounts][0]).toContain('only valid for a Block track');
  });

  it('a real Default Block/Decant Count on a real Decant track is genuinely valid \u2014 that column applies to both material kinds', () => {
    const { drafts, invalidPathwayCounts } = rowsToProtocols(
      [baseRow({ 'Material Kind': 'Decant', 'Default Block/Decant Count': 3 })], [],
    );
    expect(drafts[0].pathways[0].defaultCount).toBe(3);
    expect(invalidPathwayCounts.size).toBe(0);
  });

  it('a real, multi-row track (several steps under the same Track Name) only reads the count columns from the real first row \u2014 later rows never overwrite the already-sanitized value', () => {
    const rows = [
      baseRow({ 'Default Block/Decant Count': 4, 'Step Order': 1, 'Step Action': 'Cut 1' }),
      baseRow({ 'Default Block/Decant Count': 99, 'Step Order': 2, 'Step Action': 'Cut 2' }),
    ];
    const { drafts } = rowsToProtocols(rows, []);
    expect(drafts[0].pathways).toHaveLength(1);
    expect(drafts[0].pathways[0].defaultCount).toBe(4);
    expect(drafts[0].pathways[0].tasks).toHaveLength(2);
  });
});

describe('rowsToProtocols \u2014 Slide Count column', () => {
  // Real, per direct follow-up flagging this as "same class of bug as
  // the defaultCount falsy-check issue" \u2014 a real, literal 0 is a
  // genuinely valid slide count for a real task step (e.g. a hold
  // step with no slides cut yet), and must round-trip as 0, never be
  // silently treated the same as an empty cell the way the old
  // truthy check (`row['Slide Count'] ? ... : undefined`) did.
  it('a real, literal 0 Slide Count round-trips as 0, never silently dropped to undefined', () => {
    const { drafts } = rowsToProtocols([baseRow({ 'Slide Count': 0 })], []);
    expect(drafts[0].pathways[0].tasks[0].slideCount).toBe(0);
  });

  it('a real, genuinely empty Slide Count cell round-trips as undefined, never a fabricated 0', () => {
    const { drafts } = rowsToProtocols([baseRow({ 'Slide Count': '' })], []);
    expect(drafts[0].pathways[0].tasks[0].slideCount).toBeUndefined();
  });

  it('a real, positive Slide Count round-trips correctly', () => {
    const { drafts } = rowsToProtocols([baseRow({ 'Slide Count': 6 })], []);
    expect(drafts[0].pathways[0].tasks[0].slideCount).toBe(6);
  });
});
