// @vitest-environment happy-dom
//
// src/components/Config/Search/ConfigSearchBar.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct report ("the top level search in config found the
// entry, but when clicked on, it did not go to the setting"): this
// component previously only ever called onNavigate(tabId) — meaning a
// click landed on the right top-level tab but never the specific
// section within it. These tests cover the real fix: onNavigate now
// also receives the matched entry's section (when one exists), and
// still falls back cleanly to tab-only navigation for entries that
// genuinely don't have a confirmed section (see configSearchIndex.ts's
// own notes on 'sys-jurisdiction'/'sys-info').
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ConfigSearchBar from './ConfigSearchBar';

afterEach(cleanup);

describe('ConfigSearchBar — real navigation fix (tab + section)', () => {
  it('a real, section-mapped entry (Specimen Deficiencies) passes both tabId and section on click', () => {
    const onNavigate = vi.fn();
    render(<ConfigSearchBar onNavigate={onNavigate} />);

    const input = screen.getByLabelText('Search configuration settings');
    fireEvent.change(input, { target: { value: 'Specimen Deficiencies' } });

    const result = screen.getByText('Specimen Deficiencies');
    fireEvent.click(result);

    expect(onNavigate).toHaveBeenCalledWith('system', 'deficiencies');
  });

  it('an entry with a confirmed section reachable by synonym also passes it through', () => {
    const onNavigate = vi.fn();
    render(<ConfigSearchBar onNavigate={onNavigate} />);

    const input = screen.getByLabelText('Search configuration settings');
    fireEvent.change(input, { target: { value: 'referring doctor' } });

    const result = screen.getByText('Physician Directory');
    fireEvent.click(result);

    expect(onNavigate).toHaveBeenCalledWith('system', 'physicians');
  });

  it('a real entry with no confirmed section (Jurisdiction) still falls back to tab-only navigation, not nothing', () => {
    const onNavigate = vi.fn();
    render(<ConfigSearchBar onNavigate={onNavigate} />);

    const input = screen.getByLabelText('Search configuration settings');
    fireEvent.change(input, { target: { value: 'Jurisdiction' } });

    const result = screen.getByText('Jurisdiction');
    fireEvent.click(result);

    expect(onNavigate).toHaveBeenCalledWith('system', undefined);
  });

  it('selecting a result also clears the query and closes the results panel', () => {
    const onNavigate = vi.fn();
    render(<ConfigSearchBar onNavigate={onNavigate} />);

    const input = screen.getByLabelText('Search configuration settings') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Flag Management' } });
    fireEvent.click(screen.getByText('Flag Management'));

    expect(input.value).toBe('');
    expect(screen.queryByText('Flag Management')).toBeNull();
  });
});
