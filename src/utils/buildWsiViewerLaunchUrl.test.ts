// src/utils/buildWsiViewerLaunchUrl.test.ts
import { describe, it, expect } from 'vitest';
import { buildWsiViewerLaunchUrl } from './buildWsiViewerLaunchUrl';

describe('buildWsiViewerLaunchUrl', () => {
  it('substitutes the real slide identifier into the real template', () => {
    const result = buildWsiViewerLaunchUrl('https://viewer.example-lab.org/view?slideId={{wsiUniqueId}}', 'S26-5003-A1-L1');
    expect(result).toEqual({ ok: true, url: 'https://viewer.example-lab.org/view?slideId=S26-5003-A1-L1' });
  });

  it('URL-encodes the real slide identifier, never injecting raw special characters into the URL', () => {
    const result = buildWsiViewerLaunchUrl('https://viewer.example.org/view?id={{wsiUniqueId}}', 'S26/5003 A1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe('https://viewer.example.org/view?id=S26%2F5003%20A1');
  });

  it('refuses honestly when no template is configured yet, never opening a broken URL', () => {
    const result = buildWsiViewerLaunchUrl('', 'S26-5003-A1-L1');
    expect(result.ok).toBe(false);
  });

  it('refuses honestly when the template is missing the real placeholder — a real admin typo, not silently opened anyway', () => {
    const result = buildWsiViewerLaunchUrl('https://viewer.example.org/landing', 'S26-5003-A1-L1');
    expect(result.ok).toBe(false);
  });

  it('refuses honestly when the slide has no real identifier to route to', () => {
    const result = buildWsiViewerLaunchUrl('https://viewer.example.org/view?id={{wsiUniqueId}}', '');
    expect(result.ok).toBe(false);
  });
});
