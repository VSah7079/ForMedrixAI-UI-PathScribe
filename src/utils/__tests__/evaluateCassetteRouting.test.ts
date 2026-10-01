// src/utils/__tests__/evaluateCassetteRouting.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateCassetteRouting } from '../evaluateCassetteRouting';
import type { CassetteRoutingRule } from '@/services/cassetteRouting/ICassetteRoutingRuleService';
import type { CassetteColorDefinition } from '@/services/cassetteColors/ICassetteColorService';
import type { Protocol } from '@/services/protocols/IProtocolService';

function makeRule(overrides: Partial<CassetteRoutingRule> = {}): CassetteRoutingRule {
  return {
    id: 'rule-1', name: 'Test Rule', conditions: {}, colorId: 'color-blue',
    priorityWeight: 10, active: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeColor(overrides: Partial<CassetteColorDefinition> = {}): CassetteColorDefinition {
  return {
    id: 'color-blue', key: 'COLOR_BIOPSY', displayName: 'Blue', hexCode: '#3B82F6', active: true,
    fallbackBehavior: 'prompt',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const DEFAULT_COLORS: CassetteColorDefinition[] = [
  makeColor(),
  makeColor({ id: 'color-red', key: 'COLOR_STAT', displayName: 'Red', hexCode: '#EF4444' }),
  makeColor({ id: 'color-white', key: 'COLOR_WHITE', displayName: 'White', hexCode: '#F8FAFC' }),
];

function makeProtocol(overrides: Partial<Protocol> = {}): Protocol {
  return {
    id: 'proto-1', name: 'Test Protocol', requiresTriage: false,
    pathways: [{ id: 'path-1', pathwayName: 'Light Microscopy', fixativeType: 'Formalin', requiresDecal: false, processingFormat: 'Standard', tasks: [] }],
    active: true, version: 1, updatedBy: 'test', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Protocol;
}

describe('evaluateCassetteRouting', () => {
  it('returns null when no rule matches at all — an honest "no match," never a guessed default', () => {
    const result = evaluateCassetteRouting({ priority: 'Routine' }, [makeRule({ conditions: { priority: ['STAT'] } })], [], DEFAULT_COLORS);
    expect(result).toBeNull();
  });

  it('a rule with every condition unset matches any context — the real fallback/catch-all shape', () => {
    const rule = makeRule({ conditions: {} });
    const result = evaluateCassetteRouting({ priority: 'STAT', protocolId: 'anything' }, [rule], [], DEFAULT_COLORS);
    expect(result?.rule.id).toBe('rule-1');
  });

  it('a set condition that does not match the context excludes the rule', () => {
    const rule = makeRule({ conditions: { protocolId: 'proto-renal' } });
    const result = evaluateCassetteRouting({ protocolId: 'proto-other' }, [rule], [], DEFAULT_COLORS);
    expect(result).toBeNull();
  });

  it('priority condition matches when the context priority is anywhere in the list (OR within one dimension)', () => {
    const rule = makeRule({ conditions: { priority: ['Rush', 'STAT'] } });
    expect(evaluateCassetteRouting({ priority: 'STAT' }, [rule], [], DEFAULT_COLORS)?.rule.id).toBe('rule-1');
    expect(evaluateCassetteRouting({ priority: 'Rush' }, [rule], [], DEFAULT_COLORS)?.rule.id).toBe('rule-1');
    expect(evaluateCassetteRouting({ priority: 'Routine' }, [rule], [], DEFAULT_COLORS)).toBeNull();
  });

  it('multiple conditions on one rule are AND-ed together', () => {
    const rule = makeRule({ conditions: { protocolId: 'proto-renal', priority: ['STAT'] } });
    expect(evaluateCassetteRouting({ protocolId: 'proto-renal', priority: 'Routine' }, [rule], [], DEFAULT_COLORS)).toBeNull();
    expect(evaluateCassetteRouting({ protocolId: 'proto-renal', priority: 'STAT' }, [rule], [], DEFAULT_COLORS)?.rule.id).toBe('rule-1');
  });

  it('a higher priorityWeight wins over a lower one when both genuinely match', () => {
    const general = makeRule({ id: 'general', conditions: {}, priorityWeight: 10, colorId: 'color-blue' });
    const statOverride = makeRule({ id: 'stat', conditions: { priority: ['STAT'] }, priorityWeight: 90, colorId: 'color-red' });
    const result = evaluateCassetteRouting({ priority: 'STAT' }, [general, statOverride], [], DEFAULT_COLORS);
    expect(result?.rule.id).toBe('stat');
    expect(result?.primaryColor.displayName).toBe('Red');
  });

  it('an inactive rule never matches, even if every condition genuinely fits', () => {
    const rule = makeRule({ conditions: { priority: ['STAT'] }, active: false });
    expect(evaluateCassetteRouting({ priority: 'STAT' }, [rule], [], DEFAULT_COLORS)).toBeNull();
  });

  it('respects effectiveFrom/effectiveTo — a rule outside its own real date range does not match', () => {
    const future = makeRule({ effectiveFrom: '2027-01-01T00:00:00.000Z' });
    const past = makeRule({ effectiveTo: '2025-01-01T00:00:00.000Z' });
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(evaluateCassetteRouting({}, [future], [], DEFAULT_COLORS, now)).toBeNull();
    expect(evaluateCassetteRouting({}, [past], [], DEFAULT_COLORS, now)).toBeNull();
  });

  it('a rule within its own real, bounded date range does match', () => {
    const rule = makeRule({ effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: '2026-12-31T00:00:00.000Z' });
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(evaluateCassetteRouting({}, [rule], [], DEFAULT_COLORS, now)?.rule.id).toBe('rule-1');
  });

  it('ties on priorityWeight break by earlier createdAt — deterministic, not array order', () => {
    const later = makeRule({ id: 'later', priorityWeight: 50, createdAt: '2026-03-01T00:00:00.000Z' });
    const earlier = makeRule({ id: 'earlier', priorityWeight: 50, createdAt: '2026-01-01T00:00:00.000Z' });
    const result = evaluateCassetteRouting({}, [later, earlier], [], DEFAULT_COLORS);
    expect(result?.rule.id).toBe('earlier');
  });

  it('resolves cassette type from the CONTEXT\'s own protocol, never the matched rule\'s condition', () => {
    const protocol = makeProtocol({ id: 'proto-renal', pathways: [{ id: 'p1', pathwayName: 'LM', materialKind: 'block', fixativeType: 'Formalin', requiresDecal: false, processingFormat: 'Megablock', tasks: [] }] });
    const rule = makeRule({ conditions: { priority: ['STAT'] }, colorId: 'color-red' });
    const result = evaluateCassetteRouting({ priority: 'STAT', protocolId: 'proto-renal' }, [rule], [protocol], DEFAULT_COLORS);
    expect(result?.cassetteType).toBe('Megablock');
  });

  it('cassette type is undefined when the context has no protocolId at all', () => {
    const rule = makeRule({ conditions: {} });
    const result = evaluateCassetteRouting({}, [rule], [], DEFAULT_COLORS);
    expect(result?.cassetteType).toBeUndefined();
  });

  it('cassette type is undefined when the context\'s protocolId does not resolve to any real, known protocol', () => {
    const rule = makeRule({ conditions: {} });
    const result = evaluateCassetteRouting({ protocolId: 'proto-does-not-exist' }, [rule], [], DEFAULT_COLORS);
    expect(result?.cassetteType).toBeUndefined();
  });

  it('a rule with printTemplateKey carries it through to the real result', () => {
    const rule = makeRule({ printTemplateKey: 'renal-layout-v2' });
    const result = evaluateCassetteRouting({}, [rule], [], DEFAULT_COLORS);
    expect(result?.printTemplateKey).toBe('renal-layout-v2');
  });

  it('returns null when the matched rule\'s colorId does not resolve to any real, known color — a genuine data-integrity gap, never a placeholder', () => {
    const rule = makeRule({ colorId: 'color-does-not-exist' });
    const result = evaluateCassetteRouting({}, [rule], [], DEFAULT_COLORS);
    expect(result).toBeNull();
  });

  it('an \"auto\" fallback color resolves the real fallback target', () => {
    const colors = [
      makeColor({ id: 'color-blue', fallbackBehavior: 'auto', fallbackColorId: 'color-white' }),
      makeColor({ id: 'color-white', key: 'COLOR_WHITE', displayName: 'White', hexCode: '#F8FAFC' }),
    ];
    const rule = makeRule({ colorId: 'color-blue' });
    const result = evaluateCassetteRouting({}, [rule], [], colors);
    expect(result?.fallbackBehavior).toBe('auto');
    expect(result?.fallbackColor?.displayName).toBe('White');
  });

  it('a \"prompt\" color has no fallbackColor at all — the Engine has nothing to silently substitute', () => {
    const colors = [makeColor({ id: 'color-red', fallbackBehavior: 'prompt' })];
    const rule = makeRule({ colorId: 'color-red' });
    const result = evaluateCassetteRouting({}, [rule], [], colors);
    expect(result?.fallbackBehavior).toBe('prompt');
    expect(result?.fallbackColor).toBeUndefined();
  });

  it('an \"auto\" color with a dangling/unset fallbackColorId still has no fallbackColor — never a guessed substitute', () => {
    const colors = [makeColor({ id: 'color-blue', fallbackBehavior: 'auto', fallbackColorId: undefined })];
    const rule = makeRule({ colorId: 'color-blue' });
    const result = evaluateCassetteRouting({}, [rule], [], colors);
    expect(result?.fallbackColor).toBeUndefined();
  });

  it('the real, full primaryColor shape (key, displayName, hexCode) is returned, not just a name string', () => {
    const rule = makeRule({ colorId: 'color-blue' });
    const result = evaluateCassetteRouting({}, [rule], [], DEFAULT_COLORS);
    expect(result?.primaryColor).toEqual({ colorId: 'color-blue', key: 'COLOR_BIOPSY', displayName: 'Blue', hexCode: '#3B82F6' });
  });
});
