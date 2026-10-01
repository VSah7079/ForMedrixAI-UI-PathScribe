// PS-344: navigation targets from stored data stay inside PathScribe.
import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safeInternalPath';

describe('safeInternalPath', () => {
  it('accepts PathScribe paths with queries and fragments', () => {
    expect(safeInternalPath('/audit?tab=errors&pill=interfaces')).toBe('/audit?tab=errors&pill=interfaces');
    expect(safeInternalPath('/configuration?tab=system&section=users#top')).toBe('/configuration?tab=system&section=users#top');
  });

  it('refuses anything that could leave the site (GHSA-wrjc-x8rr-h8h6 and friends)', () => {
    for (const bad of ['/\\evil.example', '//evil.example', '/\\/evil.example', 'https://evil.example', 'javascript:alert(1)',
      'evil.example/path', '/\t/evil.example', '/ /evil.example', '/%09x\u0000', '', null, undefined, 42]) {
      expect(safeInternalPath(bad), String(bad)).toBeNull();
    }
  });
});
