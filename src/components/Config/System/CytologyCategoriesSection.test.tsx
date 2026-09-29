// @vitest-environment happy-dom
//
// src/components/Config/System/CytologyCategoriesSection.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, direct fix (PS-328): the nomenclature-system selector on this
// admin dictionary screen used to list "PALGA CISOE-A (Netherlands)"
// alongside Bethesda/BSCC-RCPath/München III/SFCC, with full Add/Edit/
// Deactivate available for it — but the real Dutch CISOE-A workflow
// (CytologyScreeningPage.tsx, PS-183) never reads this dictionary at
// all; it's a genuinely separate, hardcoded 6-axis scoring form.
// Populating categories under "PALGA CISOE-A" here did nothing —
// misleading, not a capability gap. This test locks in the fix: the
// option no longer appears here, while the other four real,
// dictionary-backed systems remain untouched.
// ─────────────────────────────────────────────────────────────────────────────

import '@/i18n/config';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import CytologyCategoriesSection from './CytologyCategoriesSection';

afterEach(cleanup);

// The nomenclature-system <select> and its <label> are siblings, not
// a wrapped/htmlFor pair, so it's found by role rather than label text
// — it's the only <select> on screen with the Add/Edit modal closed.
const getNomenclatureSelect = async () => (await screen.findAllByRole('combobox'))[0];

describe('CytologyCategoriesSection — nomenclature-system selector (PS-328)', () => {
  it('does not offer "PALGA CISOE-A" as a selectable nomenclature system', async () => {
    render(<CytologyCategoriesSection />);

    const select = await getNomenclatureSelect();
    const optionLabels = within(select).getAllByRole('option').map(o => o.textContent);

    expect(optionLabels).not.toContain('PALGA CISOE-A (Netherlands)');
  });

  it('still offers the four real, dictionary-backed systems, unaffected', async () => {
    render(<CytologyCategoriesSection />);

    const select = await getNomenclatureSelect();
    const optionLabels = within(select).getAllByRole('option').map(o => o.textContent);

    expect(optionLabels).toEqual([
      'Bethesda System',
      'BSCC / RCPath (UK, Scotland, Ireland)',
      'München III (Germany)',
      'SFCC (France)',
    ]);
  });
});
