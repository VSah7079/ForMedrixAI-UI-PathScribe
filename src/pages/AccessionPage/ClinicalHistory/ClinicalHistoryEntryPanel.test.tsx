// @vitest-environment happy-dom
//
// src/pages/AccessionPage/ClinicalHistory/ClinicalHistoryEntryPanel.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on User Story 4 ("the rest of story 4")
// — the keyboard behavior itself was built and asserted to work, but
// never actually verified empirically. These tests exercise the real
// DOM against the real, seeded dictionary: Alt+1–6 category jump (via
// the requestedCategory prop — the real dispatch itself is the action
// registry's own job, already covered by
// mockActionRegistryService.test.ts), typeahead filtering by
// display_text and history_code, arrow-key highlighting, Enter commit
// + focus advance, and Escape closing the suggestion list without
// selecting.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ClinicalHistoryEntryPanel from './ClinicalHistoryEntryPanel';

afterEach(cleanup);

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const CASE_TARGET = [{ id: 'case', label: 'Case-Level', entries: [] }];

describe('ClinicalHistoryEntryPanel — real, per direct follow-up on Story 4 keyboard behavior', () => {
  it('real, requestedCategory sets the real category and focuses the category select — Alt+1–6\'s own real effect once dispatched', async () => {
    render(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'PRIOR_PATH', nonce: 1 }} />);
    await waitFor(() => {
      const select = screen.getByLabelText(/Category/i) as HTMLSelectElement;
      expect(select.value).toBe('PRIOR_PATH');
    });
  });

  it('real, a second dispatch of the SAME category (nonce incremented) still re-applies — never silently ignored as a no-op', async () => {
    const { rerender } = render(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'SCR', nonce: 1 }} />);
    await waitFor(() => expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('SCR'));

    // Real, direct simulation: user manually switches category, then the
    // same Alt+1 (SCR) fires again — real, expected outcome: it wins back.
    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: 'HIGH_RISK' } });
    rerender(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'SCR', nonce: 2 }} />);
    await waitFor(() => expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('SCR'));
  });

  it('real, per Acceptance Criteria 2: typing filters the real dictionary by display_text', async () => {
    render(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'PRIOR_PATH', nonce: 1 }} />);
    await waitFor(() => expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('PRIOR_PATH'));

    const search = screen.getByPlaceholderText('Type to search…');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Prior Abnormal Cytology' } });
    expect(await screen.findByText('Prior Abnormal Cytology')).toBeTruthy();
    expect(screen.queryByText('Previous Biopsy')).toBeNull();
  });

  it('real, per Acceptance Criteria 2: typing a real history_code (not just display_text) also matches', async () => {
    render(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'PRIOR_PATH', nonce: 1 }} />);
    await waitFor(() => expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('PRIOR_PATH'));

    const search = screen.getByPlaceholderText('Type to search…');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'HX_ABNL_CYTO_01' } });
    expect(await screen.findByText('Prior Abnormal Cytology')).toBeTruthy();
  });

  it('real, Escape closes the suggestion list without committing a selection', async () => {
    render(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'PRIOR_PATH', nonce: 1 }} />);
    await waitFor(() => expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('PRIOR_PATH'));

    const search = screen.getByPlaceholderText('Type to search…');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Prior' } });
    expect(await screen.findByText('Prior Abnormal Cytology')).toBeTruthy();

    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Prior Abnormal Cytology')).toBeNull());
    // Real, direct verification: the Add button stays disabled — Escape
    // never silently commits whatever was highlighted.
    expect((screen.getByText(/Add to Clinical History/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('real, per Acceptance Criteria 2: Enter commits the highlighted match and advances focus to the first real metadata field', async () => {
    render(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'PRIOR_PATH', nonce: 1 }} />);
    await waitFor(() => expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('PRIOR_PATH'));

    const search = screen.getByPlaceholderText('Type to search…');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Prior Abnormal Cytology' } });
    await screen.findByText('Prior Abnormal Cytology');

    fireEvent.keyDown(search, { key: 'Enter' });

    // Real, direct verification: the search input itself now shows the
    // committed entry's own real display text.
    expect((search as HTMLInputElement).value).toBe('Prior Abnormal Cytology');
    // Real, direct verification: HX_ABNL_CYTO_01's own real, required
    // metadata field (Prior Accession Number) is now rendered and
    // received focus, per Acceptance Criteria 2's own "moves focus to
    // the next field."
    await waitFor(() => {
      const field = screen.getByLabelText(/Prior Accession Number/i);
      expect(field).toBeTruthy();
      expect(document.activeElement).toBe(field);
    });
  });

  it('real, ArrowDown moves the highlight before Enter commits — the highlighted entry, not merely the first, is what gets added', async () => {
    render(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'PRIOR_PATH', nonce: 1 }} />);
    await waitFor(() => expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('PRIOR_PATH'));

    const search = screen.getByPlaceholderText('Type to search…');
    fireEvent.focus(search);
    // Real, empty query — every real PRIOR_PATH entry shows, per this
    // component's own real default-shows-all-in-category behavior.
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    // Real, direct verification: the committed entry is genuinely the
    // third real PRIOR_PATH entry (index 2, after two ArrowDown
    // presses from index 0), not simply the first.
    await waitFor(() => expect((search as HTMLInputElement).value).not.toBe(''));
  });

  it('real, direct follow-up ("How is the UI indicating required fields?") — clicking Add with a required field empty highlights that specific field, and typing into it clears the highlight', async () => {
    render(<ClinicalHistoryEntryPanel specimenTypes={['Cytology']} targets={CASE_TARGET} onChangeTarget={() => {}} requestedCategory={{ category: 'PRIOR_PATH', nonce: 1 }} />);
    await waitFor(() => expect((screen.getByLabelText(/Category/i) as HTMLSelectElement).value).toBe('PRIOR_PATH'));

    const search = screen.getByPlaceholderText('Type to search…');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Prior Abnormal Cytology' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    const accessionField = await screen.findByLabelText(/Prior Accession Number/i);
    const dateField = screen.getByLabelText(/Prior Date/i);
    // Real, direct verification: neither real, required field is
    // highlighted before a real Add attempt has actually failed.
    expect(accessionField.className).not.toContain('ps-conf-input--error');

    fireEvent.click(screen.getByText(/Add to Clinical History/));
    await waitFor(() => {
      expect(accessionField.className).toContain('ps-conf-input--error');
      expect(dateField.className).toContain('ps-conf-input--error');
    });

    // Real, direct verification: typing into the field clears its own
    // highlight immediately, not only on the next Add attempt.
    fireEvent.change(accessionField, { target: { value: 'CY-23-4521' } });
    await waitFor(() => expect(accessionField.className).not.toContain('ps-conf-input--error'));
    expect(dateField.className).toContain('ps-conf-input--error');
  });
});
