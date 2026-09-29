// @vitest-environment happy-dom
//
// src/components/Config/System/ParticipationTypesSection.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The end-to-end compliance audit trail for facility-level sign-out
// authority overrides (Sep 2026, per Pete's direction: who, when, why):
// a real save through the real screen stamps provenance onto the stored
// override and writes an audit entry carrying the justification — and
// writes nothing when the save itself fails.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import type { ParticipationTypeRecord } from '../../../services/participationTypes/IParticipationTypeService';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'en-US' },
  }),
}));

// vi.hoisted — vi.mock factories below are hoisted above ordinary
// top-level declarations, so anything they reference must be too.
const { RESIDENT, update, logEvent } = vi.hoisted(() => ({
  RESIDENT: {
    id: 'resident', label: 'Resident / Fellow', abbreviation: 'RES', description: '', color: '#60a5fa',
    allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 2,
    canFinalize: false, requiresCountersign: true, canViewWholeCase: true,
  } as ParticipationTypeRecord,
  update: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('../../../services/participationTypes/mockParticipationTypeService', () => ({
  mockParticipationTypeService: {
    getAll: vi.fn().mockResolvedValue({ ok: true, data: [RESIDENT] }),
    update: (...a: unknown[]) => update(...a),
    add: vi.fn(),
  },
}));
vi.mock('../../../utils/performingLabs', () => ({
  getActivePerformingLabs: vi.fn().mockResolvedValue([{ id: 'lab-au', name: 'Sydney Path Lab', jurisdiction: 'AU', roles: ['performing_lab'] }]),
}));
vi.mock('../../../services/auth/caseAccessControl', () => ({
  getSessionUser: () => ({ id: 'u-jane', firstName: 'Jane', lastName: 'Admin' }),
}));
vi.mock('../../../services', () => ({ auditService: { logEvent: (...a: unknown[]) => logEvent(...a) } }));

import ParticipationTypesSection from './ParticipationTypesSection';

beforeEach(() => { update.mockReset(); logEvent.mockReset(); logEvent.mockResolvedValue({ ok: true }); });
afterEach(() => cleanup());

async function overrideAndSave(justification: string) {
  render(<ParticipationTypesSection />);
  fireEvent.click(await screen.findByText('common.edit'));
  const lab = within(await screen.findByTestId('ptauth-lab-lab-au'));
  fireEvent.click(lab.getByText('participationTypesSection.modal.authority.overrideButton'));
  fireEvent.click(lab.getAllByRole('checkbox')[0]); // grant canFinalize
  fireEvent.change(lab.getByRole('textbox'), { target: { value: justification } });
  fireEvent.click(screen.getByText('participationTypesSection.modal.saveChangesBtn'));
}

describe('ParticipationTypesSection — facility override audit trail', () => {
  it('stamps who/when/why onto the saved override and writes a matching audit entry', async () => {
    update.mockResolvedValue({ ok: true, data: RESIDENT });
    await overrideAndSave('NATA exemption ref 7');

    await waitFor(() => expect(update).toHaveBeenCalled());
    const saved = update.mock.calls[0][1].authorityOverrides['lab-au'];
    expect(saved).toMatchObject({ canFinalize: true, overriddenBy: { userId: 'u-jane', userName: 'Jane Admin' }, justification: 'NATA exemption ref 7' });
    expect(Number.isNaN(Date.parse(saved.overriddenAt))).toBe(false);

    await waitFor(() => expect(logEvent).toHaveBeenCalledTimes(1));
    expect(logEvent.mock.calls[0][0]).toMatchObject({
      type: 'user',
      event: 'Signing-authority facility override added',
      user: 'Jane Admin',
      facilityId: 'lab-au',
    });
    expect(logEvent.mock.calls[0][0].detail).toContain('Sydney Path Lab');
    expect(logEvent.mock.calls[0][0].detail).toContain('canFinalize: inherited → true');
    expect(logEvent.mock.calls[0][0].detail).toContain('"NATA exemption ref 7"');
  });

  it('writes NO audit entry when the save itself fails — never a record of a change that did not land', async () => {
    update.mockResolvedValue({ ok: false, error: 'storage full' });
    await overrideAndSave('Should not be logged');
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(logEvent).not.toHaveBeenCalled();
  });
});
