// @vitest-environment happy-dom
//
// src/components/Config/System/TypeModal.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real coverage for the facility-level sign-out authority controls
// (Sep 2026, per Pete's human-in-the-loop direction): transparent
// inheritance (active rule + source of truth), the break-glass "Override
// default for this facility" control, revert, justification capture, and
// country-scoped types. The first test file for this component; the
// rest of the modal (label/abbreviation validation, colour, capabilities)
// is pre-existing and left out of scope here.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import TypeModal from './TypeModal';
import type { ParticipationTypeRecord } from '../../../services/participationTypes/IParticipationTypeService';
import type { Facility } from '../../../services/facilities/IFacilityService';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'en-US' },
  }),
}));

afterEach(() => cleanup());

const UK_LAB = { id: 'lab-uk', name: 'Manchester Royal Infirmary', jurisdiction: 'GB_EW', roles: ['performing_lab'] } as unknown as Facility;
const US_LAB = { id: 'lab-us', name: 'Tucson General', jurisdiction: 'US', roles: ['performing_lab'] } as unknown as Facility;

const RESIDENT: ParticipationTypeRecord = {
  id: 'resident', label: 'Resident / Fellow', abbreviation: 'RES', description: '', color: '#60a5fa',
  allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 2,
  canFinalize: false, requiresCountersign: true, canViewWholeCase: true,
  jurisdictionProfiles: { GB_EW: { canFinalize: false, requiresCountersign: true, canViewWholeCase: false, regulatoryNote: 'RCPath task-shifting limits' } },
};

function renderModal(type: ParticipationTypeRecord = RESIDENT, labs: Facility[] = [UK_LAB, US_LAB]) {
  const onSave = vi.fn();
  render(<TypeModal mode="edit" type={type} existingEntries={[type]} labs={labs} isBuiltIn onSave={onSave} onClose={vi.fn()} />);
  return { onSave, lab: (id: string) => within(screen.getByTestId(`ptauth-lab-${id}`)) };
}

const save = () => fireEvent.click(screen.getByText('participationTypesSection.modal.saveChangesBtn'));

describe('TypeModal — transparent inheritance', () => {
  it('shows each rule\'s source: the UK lab inherits its jurisdiction default, the US lab the platform default', () => {
    const { lab } = renderModal();
    expect(lab('lab-uk').getAllByText(/sourceJurisdiction/)).toHaveLength(3);
    // jurisdiction names are localized (jurisdictionNames.*), never the English-only constant
    expect(lab('lab-uk').getByText('jurisdictionNames.GB_EW')).toBeTruthy();
    expect(lab('lab-uk').getAllByText(/sourceJurisdiction:.*jurisdictionNames\.GB_EW/)).toHaveLength(3);
    expect(lab('lab-us').getAllByText('participationTypesSection.modal.authority.sourcePlatform')).toHaveLength(3);
  });

  it('shows the jurisdiction\'s regulatory basis', () => {
    const { lab } = renderModal();
    expect(lab('lab-uk').getByText(/RCPath task-shifting limits/)).toBeTruthy();
    expect(lab('lab-us').queryByText(/regulatoryBasis/)).toBeNull();
  });

  it('an existing facility override shows who set it and when', () => {
    const { lab } = renderModal({
      ...RESIDENT,
      authorityOverrides: { 'lab-uk': { canFinalize: true, requiresCountersign: true, canViewWholeCase: false, overriddenBy: { userId: 'u1', userName: 'Dr. Admin' }, overriddenAt: '2026-09-01T10:00:00.000Z', justification: 'MD ref 14' } },
    });
    expect(lab('lab-uk').getAllByText(/sourceFacility:.*Dr\. Admin/)).toHaveLength(3);
    expect((lab('lab-uk').getByRole('textbox') as HTMLTextAreaElement).value).toBe('MD ref 14');
  });
});

describe('TypeModal — break-glass override', () => {
  it('"Override default for this facility" seeds from the INHERITED values, so switching it on changes nothing', () => {
    const { lab, onSave } = renderModal();
    fireEvent.click(lab('lab-uk').getByText('participationTypesSection.modal.authority.overrideButton'));
    const boxes = lab('lab-uk').getAllByRole('checkbox') as HTMLInputElement[];
    // canFinalize false, requiresCountersign true, canViewWholeCase FALSE (UK profile) — not the platform's true
    expect(boxes.map(b => b.checked)).toEqual([false, true, false]);
    save();
    expect(onSave.mock.calls[0][0].authorityOverrides['lab-uk']).toMatchObject({ canFinalize: false, requiresCountersign: true, canViewWholeCase: false });
  });

  it('an edited flag shows as an unsaved facility-level change, and the typed justification reaches onSave', () => {
    const { lab, onSave } = renderModal();
    fireEvent.click(lab('lab-uk').getByText('participationTypesSection.modal.authority.overrideButton'));
    fireEvent.click(lab('lab-uk').getAllByRole('checkbox')[0]);
    expect(lab('lab-uk').getAllByText('participationTypesSection.modal.authority.sourceFacilityPending').length).toBeGreaterThan(0);
    fireEvent.change(lab('lab-uk').getByRole('textbox'), { target: { value: 'Credentialed under IBMS scheme' } });
    save();
    const [draft, justifications] = onSave.mock.calls[0];
    expect(draft.authorityOverrides['lab-uk'].canFinalize).toBe(true);
    expect(justifications['lab-uk']).toBe('Credentialed under IBMS scheme');
  });

  it('reverting an existing override asks for a reason, can be undone, and removes the override on save', () => {
    const { lab, onSave } = renderModal({
      ...RESIDENT,
      authorityOverrides: { 'lab-uk': { canFinalize: true, requiresCountersign: true, canViewWholeCase: false } },
    });
    fireEvent.click(lab('lab-uk').getByText('participationTypesSection.modal.authority.revertButton'));
    expect(lab('lab-uk').getByText('participationTypesSection.modal.authority.pendingRemoval')).toBeTruthy();
    // undo restores the stored override
    fireEvent.click(lab('lab-uk').getByText('participationTypesSection.modal.authority.keepButton'));
    expect((lab('lab-uk').getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
    // revert again, give a reason, save
    fireEvent.click(lab('lab-uk').getByText('participationTypesSection.modal.authority.revertButton'));
    fireEvent.change(lab('lab-uk').getByRole('textbox'), { target: { value: 'Exemption expired' } });
    save();
    const [draft, justifications] = onSave.mock.calls[0];
    expect(draft.authorityOverrides?.['lab-uk']).toBeUndefined();
    expect(justifications['lab-uk']).toBe('Exemption expired');
  });
});

describe('TypeModal — country-scoped regional roles', () => {
  it('a UK-scoped type lists only UK labs', () => {
    renderModal({ ...RESIDENT, id: 'bms_advanced_practitioner', scopedJurisdictions: ['GB_EW', 'GB_SCT', 'GB_NIR'] });
    expect(screen.queryByTestId('ptauth-lab-lab-uk')).toBeTruthy();
    expect(screen.queryByTestId('ptauth-lab-lab-us')).toBeNull();
  });

  it('…but never hides a lab that already carries an override', () => {
    renderModal({ ...RESIDENT, scopedJurisdictions: ['GB_EW'], authorityOverrides: { 'lab-us': { canFinalize: false } } });
    expect(screen.queryByTestId('ptauth-lab-lab-us')).toBeTruthy();
  });
});
