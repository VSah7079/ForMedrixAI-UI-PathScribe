// @vitest-environment happy-dom
//
// src/components/FacilityDictionary/FacilityEditorModal.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-277 §1.2.2 gap-closing — the first test file for this
// component. Deliberately narrow scope: only exercises the real fix
// made in this batch (the CLIA/Director/Header-Logo branding fields
// are now also reachable for an Enterprise-tagged facility that
// doesn't hold the performing_lab role — previously gated on
// performing_lab alone, a real, latent gap since isEnterprise and
// FacilityRole are architecturally independent fields). Every other
// tab/behavior of this large, pre-existing component is left
// untested here, same "close the one, real, disclosed gap" scope as
// this batch's other changes.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

vi.mock('../../services', () => ({
  modelService: { getAll: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  locationService: { listForFacility: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  placeOfServiceCodeService: { getActiveCodes: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
}));

vi.mock('../Config/AI/resolveClientAiModel', () => ({
  getEligibleModelIdsForClient: vi.fn().mockResolvedValue([]),
}));

// Real, deliberate stub — the Identifier Formats tab is never the
// active tab in these tests (General is the default), so its own,
// separate real dependency chain is irrelevant here.
vi.mock('./IdentifierFormatsTab', () => ({ default: () => null }));

import { FacilityEditorModal } from './FacilityEditorModal';
import { locationService } from '../../services';
import { getEligibleModelIdsForClient } from '../Config/AI/resolveClientAiModel';
import type { Facility } from '../../services/facilities/IFacilityService';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FacilityEditorModal — real, per PS-277 §1.2.2 gap-closing: branding fields reachable for Enterprise facilities', () => {
  it('hides CLIA/Director/Header-Logo fields for a brand-new facility with neither Performing Lab nor Enterprise checked', () => {
    render(<FacilityEditorModal isOpen mode="add" onClose={() => {}} onSave={() => {}} allFacilities={[]} />);
    expect(screen.queryByText('facilityEditorModal.general.cliaIsoNumber')).toBeNull();
    expect(screen.queryByText('facilityEditorModal.general.directorName')).toBeNull();
    expect(screen.queryByText('facilityEditorModal.general.headerLogoUrl')).toBeNull();
  });

  it('real, per PS-277 §1.2.2 gap-closing — checking "Enterprise" alone (no Performing Lab role) now reveals the three branding fields', () => {
    render(<FacilityEditorModal isOpen mode="add" onClose={() => {}} onSave={() => {}} allFacilities={[]} />);
    const enterpriseCheckbox = screen.getByRole('checkbox', { name: 'facilityEditorModal.general.enterpriseCheckbox' });
    enterpriseCheckbox.click();

    expect(screen.getByText('facilityEditorModal.general.cliaIsoNumber')).toBeTruthy();
    expect(screen.getByText('facilityEditorModal.general.directorName')).toBeTruthy();
    expect(screen.getByText('facilityEditorModal.general.headerLogoUrl')).toBeTruthy();
  });

  it('an existing Enterprise facility (isEnterprise: true, no performing_lab role) opens directly onto the visible branding fields', () => {
    const enterpriseFacility = {
      id: 'ent-1', name: 'Trust HQ', roles: [], jurisdiction: 'US' as const,
      assigningAuthority: 'THQ', email: 'a@b.com', phone: '', fax: '', address: '',
      status: 'Active' as const, reporting: { reportFormat: 'PDF' as const, deliveryMethod: 'Portal' as const, autoRelease: false, copyToReferring: false },
      isEnterprise: true, headerLogoUrl: 'https://example.com/trust-logo.png',
    };
    render(<FacilityEditorModal isOpen mode="edit" onClose={() => {}} onSave={() => {}} allFacilities={[enterpriseFacility as never]} facility={enterpriseFacility as never} />);
    expect(screen.getByText('facilityEditorModal.general.headerLogoUrl')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.com/trust-logo.png')).toBeTruthy();
  });
});

// Real fix (PS-73, Sep 2026): two regression suites for the Duplicate +
// uniqueness-validation pattern extended to Facility — see
// FacilityDictionaryPage.tsx's own handleDuplicateFacility and this
// modal's own file-header comment for the full account.
describe('FacilityEditorModal — PS-73: mode, not facility presence, gates id-dependent effects', () => {
  it('a Duplicate template (mode="add" with a populated, placeholder-id facility prop) never fires the real eligibleModels/locations lookups, and never shows the Locations tab — the exact bug class this fix closes', () => {
    const template: Partial<Facility> = {
      id: '__clone__',
      name: 'Fenwick General Hospital (Copy)',
      roles: ['performing_lab'],
      jurisdiction: 'US',
      assigningAuthority: '',
      email: '', phone: '', fax: '', address: '',
      status: 'Active',
      reporting: { reportFormat: 'PDF', deliveryMethod: 'Portal', autoRelease: false, copyToReferring: false },
    };
    render(
      <FacilityEditorModal
        isOpen
        mode="add"
        onClose={() => {}}
        onSave={() => {}}
        allFacilities={[template as Facility]}
        facility={template as Facility}
      />
    );
    // Real assertion, not just "doesn't crash" — before this fix, `isEdit`
    // was `!!facility`, which is true here (facility IS populated), so
    // these would have fired against the bogus '__clone__' id.
    expect(getEligibleModelIdsForClient).not.toHaveBeenCalled();
    expect(locationService.listForFacility).not.toHaveBeenCalled();
    expect(screen.queryByText('facilityEditorModal.tabs.locations')).toBeNull();
    // The header also must read as Add, not Edit — same mode-not-presence fix.
    expect(screen.getByText('facilityEditorModal.addTitle')).toBeTruthy();
  });

  it('a real edit (mode="edit") of the same shape DOES fire the id-dependent lookups and shows the Locations tab', () => {
    const real: Partial<Facility> = {
      id: 'fac-real-1',
      name: 'Fenwick General Hospital',
      roles: ['performing_lab'],
      jurisdiction: 'US',
      assigningAuthority: 'FGH',
      email: 'a@b.com', phone: '', fax: '', address: '',
      status: 'Active',
      reporting: { reportFormat: 'PDF', deliveryMethod: 'Portal', autoRelease: false, copyToReferring: false },
    };
    render(
      <FacilityEditorModal
        isOpen
        mode="edit"
        onClose={() => {}}
        onSave={() => {}}
        allFacilities={[real as Facility]}
        facility={real as Facility}
      />
    );
    expect(getEligibleModelIdsForClient).toHaveBeenCalledWith('fac-real-1');
    expect(locationService.listForFacility).toHaveBeenCalledWith('fac-real-1');
    expect(screen.getByText('facilityEditorModal.tabs.locations')).toBeTruthy();
    expect(screen.getByText('facilityEditorModal.editTitle')).toBeTruthy();
  });
});

describe('FacilityEditorModal — PS-73: real assigningAuthority uniqueness validation', () => {
  const existing: Facility = {
    id: 'fac-existing', name: 'Existing Hospital', roles: ['performing_lab'], jurisdiction: 'US',
    assigningAuthority: 'EXIST', email: 'x@y.com', phone: '', fax: '', address: '',
    status: 'Active',
    reporting: { reportFormat: 'PDF', deliveryMethod: 'Portal', autoRelease: false, copyToReferring: false },
  } as Facility;

  it('blocks save on a real assigningAuthority collision (case-insensitive) and never calls onSave', () => {
    const onSave = vi.fn();
    render(<FacilityEditorModal isOpen mode="add" onClose={() => {}} onSave={onSave} allFacilities={[existing]} />);

    fireEvent.change(screen.getByPlaceholderText('facilityEditorModal.general.facilityNamePlaceholder'), { target: { value: 'New Clinic' } });
    fireEvent.change(screen.getByPlaceholderText('facilityEditorModal.general.assigningAuthorityPlaceholder'), { target: { value: 'exist' } });
    fireEvent.change(screen.getByPlaceholderText('contact@facility.com'), { target: { value: 'new@clinic.com' } });
    fireEvent.click(screen.getByText('facilityEditorModal.addFacility'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/assigningAuthorityCollision/)).toBeTruthy();
  });

  it('allows save once the assigningAuthority is changed to a genuinely unique value', () => {
    const onSave = vi.fn();
    render(<FacilityEditorModal isOpen mode="add" onClose={() => {}} onSave={onSave} allFacilities={[existing]} />);

    fireEvent.change(screen.getByPlaceholderText('facilityEditorModal.general.facilityNamePlaceholder'), { target: { value: 'New Clinic' } });
    fireEvent.change(screen.getByPlaceholderText('facilityEditorModal.general.assigningAuthorityPlaceholder'), { target: { value: 'NEWCLINIC' } });
    fireEvent.change(screen.getByPlaceholderText('contact@facility.com'), { target: { value: 'new@clinic.com' } });
    fireEvent.click(screen.getByText('facilityEditorModal.addFacility'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].assigningAuthority).toBe('NEWCLINIC');
  });

  it('editing the existing facility itself (excludeId) never flags its own unchanged assigningAuthority', () => {
    const onSave = vi.fn();
    render(<FacilityEditorModal isOpen mode="edit" onClose={() => {}} onSave={onSave} allFacilities={[existing]} facility={existing} />);

    fireEvent.click(screen.getByText('facilityEditorModal.saveChanges'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/assigningAuthorityCollision/)).toBeNull();
  });
});
