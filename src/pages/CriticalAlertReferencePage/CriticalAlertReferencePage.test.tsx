// @vitest-environment happy-dom
//
// src/pages/CriticalAlertReferencePage/CriticalAlertReferencePage.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real render/behavior coverage for PS-136's public, unauthenticated
// reference-resolution page — same established pattern as
// ExternalConsultViewPage.test.tsx (react-i18next mocked to return raw
// keys, useParams mocked directly, no full router needed since this
// page never navigates).
//
// The one assertion every test in this file cares about most: this page
// must NEVER render findingTerm/findingSeverity, even though the
// resolved token record carries them (for the internal audit viewer
// only) — see the page's own header comment for why.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import type { CriticalAlertReferenceToken } from '@/services/clinical/ICriticalAlertReferenceTokenService';

vi.mock('react-router', () => ({
  useParams: () => ({ token: 'cat_abc123' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

const { resolve, recordAccess, recordAcknowledged } = vi.hoisted(() => ({
  resolve: vi.fn(), recordAccess: vi.fn(), recordAcknowledged: vi.fn(),
}));
vi.mock('@/services/clinical/mockCriticalAlertReferenceTokenService', () => ({
  mockCriticalAlertReferenceTokenService: { resolve, recordAccess, recordAcknowledged },
}));

function makeRecord(overrides: Partial<CriticalAlertReferenceToken> = {}): CriticalAlertReferenceToken {
  return {
    id: 'crit-alert-ref-1', token: 'cat_abc123',
    dispatchRecordId: 'cad-1', caseId: 'case-1', accessionNumber: 'S26-1234',
    physicianId: 'phys-1', physicianName: 'Dr. Sarah Johnson',
    findingTerm: 'invasive carcinoma', findingSeverity: 'Critical',
    issuedAt: '2026-09-19T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    accessCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  recordAccess.mockResolvedValue({ ok: true, data: makeRecord() });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function renderPage() {
  const { default: CriticalAlertReferencePage } = await import('./CriticalAlertReferencePage');
  const utils = render(<CriticalAlertReferencePage />);
  await act(async () => {});
  return utils;
}

describe('CriticalAlertReferencePage — real render/behavior coverage', () => {
  it('an invalid/expired token shows the one, uniform denial and never calls recordAccess', async () => {
    resolve.mockResolvedValue({ ok: false, error: 'This link is invalid or no longer active.' });
    await renderPage();

    expect(await screen.findByText('criticalAlertReferencePage.invalidLink.title')).not.toBeNull();
    expect(recordAccess).not.toHaveBeenCalled();
  });

  it('a valid token shows only the non-PHI reference info, never findingTerm or findingSeverity, and records exactly one access', async () => {
    resolve.mockResolvedValue({ ok: true, data: makeRecord() });
    await renderPage();

    expect(await screen.findByText('S26-1234')).not.toBeNull();
    expect(screen.getByText(/Dr\. Sarah Johnson/)).not.toBeNull();
    expect(screen.getByText('criticalAlertReferencePage.disclosureBanner')).not.toBeNull();
    expect(screen.queryByText(/invasive carcinoma/i)).toBeNull();
    expect(screen.queryByText(/Critical/)).toBeNull();

    expect(recordAccess).toHaveBeenCalledTimes(1);
    expect(recordAccess).toHaveBeenCalledWith('crit-alert-ref-1');
  });

  it('an expired token still resolves (resolve() itself denies expired tokens) — this test documents the Active/Expired badge for a still-active one', async () => {
    resolve.mockResolvedValue({ ok: true, data: makeRecord() });
    await renderPage();
    expect(await screen.findByText('criticalAlertReferencePage.statusLabel.active')).not.toBeNull();
  });

  it('clicking Acknowledge Reviewed calls recordAcknowledged and shows the confirmation', async () => {
    resolve.mockResolvedValue({ ok: true, data: makeRecord() });
    recordAcknowledged.mockResolvedValue({ ok: true, data: makeRecord({ acknowledgedAt: '2026-09-19T01:00:00.000Z' }) });
    await renderPage();
    await screen.findByText('S26-1234');

    fireEvent.click(screen.getByText('criticalAlertReferencePage.acknowledgeButton'));
    await act(async () => {});

    expect(recordAcknowledged).toHaveBeenCalledWith('crit-alert-ref-1');
    expect(screen.getByText('criticalAlertReferencePage.acknowledgedConfirmation')).not.toBeNull();
  });

  it('a token already acknowledged shows the confirmation immediately, without a redundant recordAcknowledged call', async () => {
    resolve.mockResolvedValue({ ok: true, data: makeRecord({ acknowledgedAt: '2026-09-19T01:00:00.000Z' }) });
    await renderPage();

    expect(await screen.findByText('criticalAlertReferencePage.acknowledgedConfirmation')).not.toBeNull();
    expect(recordAcknowledged).not.toHaveBeenCalled();
  });
});
