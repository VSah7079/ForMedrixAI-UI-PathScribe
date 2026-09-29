// @vitest-environment happy-dom
//
// src/pages/system/FacilityDictionaryPage.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-73 (Sep 2026) — the one real regression this ticket's own
// verification bar asks for and the modal-level tests in
// components/FacilityDictionary/FacilityEditorModal.test.tsx can't reach on
// their own: that clicking Duplicate on a real facility, then Save, calls
// facilityService.add(), never facilityService.update() — the exact failure
// this ticket's whole `mode`-not-`entry`-presence fix exists to prevent (see
// FacilityEditorModal.tsx's own file-header comment and
// FacilityDictionaryPage.tsx's own handleDuplicateFacility/handleSave).
//
// Deliberately narrow scope, matching FacilityEditorModal.test.tsx's own
// precedent: only the real fix made in this batch, not a full page audit.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Facility } from '../../services/facilities/IFacilityService';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', name: 'Admin One' } }),
}));

const seedFacility: Facility = {
  id: 'fac-1',
  name: 'Fenwick General Hospital',
  roles: ['performing_lab'],
  jurisdiction: 'US',
  assigningAuthority: 'FGH',
  email: 'contact@fenwick.example',
  phone: '', fax: '', address: '123 Main St',
  status: 'Active',
  reporting: { reportFormat: 'PDF', deliveryMethod: 'Portal', autoRelease: false, copyToReferring: false },
} as Facility;

const facilityServiceMock = vi.hoisted(() => ({
  getAll: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  deactivate: vi.fn(),
  reactivate: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('../../services', () => ({
  facilityService: facilityServiceMock,
  auditService: { logEvent: vi.fn() },
  modelService: { getAll: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  locationService: { listForFacility: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  placeOfServiceCodeService: { getActiveCodes: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
}));

vi.mock('../../services/referenceCheck/referenceCheckService', () => ({
  checkFacilityReferences: vi.fn().mockResolvedValue({ hasReferences: false, sources: [] }),
}));

vi.mock('../../components/Config/AI/resolveClientAiModel', () => ({
  getEligibleModelIdsForClient: vi.fn().mockResolvedValue([]),
}));

// Real, deliberate stub — same reasoning as FacilityEditorModal.test.tsx's
// own: Identifier Formats is never the active tab in this test.
vi.mock('../../components/FacilityDictionary/IdentifierFormatsTab', () => ({ default: () => null }));

import { FacilityDictionaryPage } from './FacilityDictionaryPage';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FacilityDictionaryPage — PS-73: Duplicate saves as add(), never update()', () => {
  it('Duplicate opens the editor prefilled (name marked via common.copyOfName, assigningAuthority/contact cleared); saving with a fresh assigningAuthority calls facilityService.add, never .update, and never touches the source record', async () => {
    facilityServiceMock.getAll.mockResolvedValue({ ok: true, data: [seedFacility] });
    facilityServiceMock.add.mockResolvedValue({ ok: true, data: { ...seedFacility, id: 'fac-2', name: 'Fenwick General Hospital (Copy)', assigningAuthority: 'FGH2' } });

    render(<FacilityDictionaryPage />);

    await waitFor(() => expect(screen.getByText('Fenwick General Hospital')).toBeTruthy());

    fireEvent.click(screen.getByText('common.duplicate'));

    // Real assertion: the editor opened in Add mode (not Edit), even though
    // a populated `facility` prop was passed — the exact mode-vs-presence
    // distinction this ticket's fix is about.
    expect(screen.getByText('facilityEditorModal.addTitle')).toBeTruthy();

    const nameInput = screen.getByPlaceholderText('facilityEditorModal.general.facilityNamePlaceholder') as HTMLInputElement;
    const authorityInput = screen.getByPlaceholderText('facilityEditorModal.general.assigningAuthorityPlaceholder') as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText('contact@facility.com') as HTMLInputElement;

    // Prefill assertions: the name is marked through the localized
    // common.copyOfName key (the mocked t() echoes key + options), while
    // assigningAuthority/contact fields were cleared, not copied — copying
    // assigningAuthority verbatim would be an immediate, real collision
    // against the very record being duplicated.
    expect(nameInput.value).toBe('common.copyOfName:{"name":"Fenwick General Hospital"}');
    expect(authorityInput.value).toBe('');
    expect(emailInput.value).toBe('');

    fireEvent.change(authorityInput, { target: { value: 'FGH2' } });
    fireEvent.change(emailInput, { target: { value: 'new@fenwick2.example' } });
    fireEvent.click(screen.getByText('facilityEditorModal.addFacility'));

    await waitFor(() => expect(facilityServiceMock.add).toHaveBeenCalledTimes(1));
    expect(facilityServiceMock.update).not.toHaveBeenCalled();

    const payload = facilityServiceMock.add.mock.calls[0][0];
    expect(payload.assigningAuthority).toBe('FGH2');
    expect(payload.name).toBe('common.copyOfName:{"name":"Fenwick General Hospital"}');
  });

  it('a real Edit (not Duplicate) of the same facility calls facilityService.update, never .add', async () => {
    facilityServiceMock.getAll.mockResolvedValue({ ok: true, data: [seedFacility] });
    facilityServiceMock.update.mockResolvedValue({ ok: true, data: { ...seedFacility, name: 'Fenwick General Hospital Renamed' } });

    render(<FacilityDictionaryPage />);
    await waitFor(() => expect(screen.getByText('Fenwick General Hospital')).toBeTruthy());

    fireEvent.click(screen.getByText('facilityTable.edit'));
    expect(screen.getByText('facilityEditorModal.editTitle')).toBeTruthy();

    fireEvent.click(screen.getByText('facilityEditorModal.saveChanges'));

    await waitFor(() => expect(facilityServiceMock.update).toHaveBeenCalledTimes(1));
    expect(facilityServiceMock.add).not.toHaveBeenCalled();
    expect(facilityServiceMock.update.mock.calls[0][0]).toBe('fac-1');
  });
});
