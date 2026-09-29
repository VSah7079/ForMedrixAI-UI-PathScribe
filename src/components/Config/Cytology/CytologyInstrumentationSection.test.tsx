// @vitest-environment happy-dom
//
// src/components/Config/Cytology/CytologyInstrumentationSection.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("each performing facility could identify
// their own mode... is it possible that an individual system could
// have both types?" — high priority, multi-facility support). First
// test file for this component. Scoped to the real, new Tier 2
// (Facility override) behavior this batch adds — Tier 1 (Enterprise
// default save/reset) already has direct service-layer coverage in
// mockCytologyInstrumentationService.test.ts and isn't re-verified at
// the component level here.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { FACILITIES } = vi.hoisted(() => ({
  FACILITIES: [
    { id: 'fac-wsi-hub', name: 'WSI Digital Hub' },
    { id: 'fac-legacy-scope', name: 'Legacy Microscope Lab' },
  ],
}));

vi.mock('../../../services/facilities/mockFacilityService', () => ({
  mockFacilityService: { getAll: vi.fn().mockResolvedValue({ ok: true, data: FACILITIES }) },
}));

const getSpy = vi.fn();
const createSpy = vi.fn();
const removeSpy = vi.fn();

vi.mock('../../../services/cytology/mockCytologyInstrumentationService', () => ({
  mockCytologyInstrumentationService: {
    get: vi.fn().mockResolvedValue({ ok: true, data: { modality: 'wsi' } }),
    update: vi.fn().mockResolvedValue({ ok: true, data: { modality: 'wsi' } }),
  },
}));

vi.mock('../../../services/cytology/mockFacilityCytologyInstrumentationOverrideService', () => ({
  mockFacilityCytologyInstrumentationOverrideService: {
    getForFacility: (...args: unknown[]) => getSpy(...args),
    create: (...args: unknown[]) => createSpy(...args),
    remove: (...args: unknown[]) => removeSpy(...args),
  },
}));

import CytologyInstrumentationSection from './CytologyInstrumentationSection';

beforeEach(() => {
  getSpy.mockReset();
  createSpy.mockReset();
  removeSpy.mockReset();
  getSpy.mockResolvedValue({ ok: true, data: null });
  createSpy.mockResolvedValue({ ok: true, data: { id: 'x', facilityId: 'fac-legacy-scope', overrides: { modality: 'traditional_guided' }, createdAt: '', updatedAt: '' } });
  removeSpy.mockResolvedValue({ ok: true, data: undefined });
});
afterEach(() => cleanup());

describe('CytologyInstrumentationSection — real, per-facility Tier 2 override', () => {
  it('shows the empty state when no facility has an override', async () => {
    render(<CytologyInstrumentationSection />);
    await waitFor(() => expect(screen.getByText('cytologyInstrumentationSection.facility.emptyState')).toBeTruthy());
  });

  it('lists an existing facility override with its real modality and a Remove action', async () => {
    getSpy.mockImplementation((facilityId: string) =>
      Promise.resolve(
        facilityId === 'fac-legacy-scope'
          ? { ok: true, data: { id: 'ov-1', facilityId: 'fac-legacy-scope', overrides: { modality: 'traditional_guided' }, createdAt: '', updatedAt: '' } }
          : { ok: true, data: null },
      ),
    );
    render(<CytologyInstrumentationSection />);
    await waitFor(() => expect(screen.getByText('Legacy Microscope Lab')).toBeTruthy());
    // Scoped to the Tier 2 row itself — the Tier 1 Enterprise <select>
    // always renders both modality labels as <option> text too, so an
    // unscoped query would match twice.
    const row = screen.getByText('Legacy Microscope Lab').closest('.ps-cytqc__row') as HTMLElement;
    expect(within(row).getByText('cytologyInstrumentationSection.modality.traditionalGuided')).toBeTruthy();
  });

  it('creating a new facility override calls create() with the chosen facility and modality', async () => {
    const { container } = render(<CytologyInstrumentationSection />);
    await waitFor(() => expect(screen.getByText('cytologyQcSettingsSection.addOverrideBtn')).toBeTruthy());
    fireEvent.click(screen.getByText('cytologyQcSettingsSection.addOverrideBtn'));

    const addRow = container.querySelector('.ps-cytqc__add-row') as HTMLElement;
    const selects = within(addRow).getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'fac-legacy-scope' } });
    fireEvent.change(selects[1], { target: { value: 'traditional_guided' } });
    fireEvent.click(within(addRow).getByText('common.save'));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith('fac-legacy-scope', { modality: 'traditional_guided' }));
  });

  it('removing a facility override calls remove() with that facility id', async () => {
    getSpy.mockImplementation((facilityId: string) =>
      Promise.resolve(
        facilityId === 'fac-legacy-scope'
          ? { ok: true, data: { id: 'ov-1', facilityId: 'fac-legacy-scope', overrides: { modality: 'traditional_guided' }, createdAt: '', updatedAt: '' } }
          : { ok: true, data: null },
      ),
    );
    render(<CytologyInstrumentationSection />);
    await waitFor(() => expect(screen.getByText('common.remove')).toBeTruthy());
    fireEvent.click(screen.getByText('common.remove'));
    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith('fac-legacy-scope'));
  });
});
