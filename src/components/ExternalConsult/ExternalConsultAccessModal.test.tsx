// @vitest-environment happy-dom
//
// src/components/ExternalConsult/ExternalConsultAccessModal.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, closing a noted gap from the PS-290 build: only the service layer
// underneath this modal (mockConsultTokenService.test.ts,
// computeDefaultConsultTokenExpiry.test.ts) had test coverage — the modal
// itself, the pathologist-facing half of External Consult Access, had none.
//
// Same real mocking conventions as OrSuiteDashboardPage.test.tsx: mocks
// every service the component imports and drives it with fireEvent.
//
// Real update alongside the component's i18n sweep conversion: it now
// calls useTranslation(), so the real i18next instance needs to be
// initialized before render — same side-effect import main.tsx itself
// uses (`import '@/i18n/config'`) — otherwise t() has nothing to
// resolve keys against and every assertion below would see the raw
// key string instead of its English text.
// ─────────────────────────────────────────────────────────────────────────────

import '@/i18n/config';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import type { Case } from '@/types/case/Case';
import type { ConsultToken } from '@/services/consultAccess/IConsultTokenService';

const { getByCaseId, issue, revoke } = vi.hoisted(() => ({
  getByCaseId: vi.fn(), issue: vi.fn(), revoke: vi.fn(),
}));
vi.mock('@/services', () => ({
  consultTokenService: { getByCaseId, issue, revoke },
}));

const CASE = {
  id: 'case-1',
  accession: { accessionNumber: 'S26-1234' },
  patient: { firstName: 'Jane', lastName: 'Roe' },
  specimens: [{
    id: 'sp-1', label: 'A',
    blocks: [{ id: 'block-1', label: '1', stains: [{ id: 'stain-1', stainName: 'H&E' }] }],
  }],
} as unknown as Case;

function makeToken(overrides: Partial<ConsultToken> = {}): ConsultToken {
  return {
    id: 'ctok-1', token: 'ct_abc123',
    scope: { caseId: 'case-1', caseAccessionNumber: 'S26-1234' },
    issuedByUserId: 'u1', issuedByName: 'Dr. Attending',
    // Real, deliberately far-future expiresAt — resolveConsultTokenStatus()
    // derives Active/Expired live off Date.now(), so a near-term fixed date
    // would go stale (and this test would start failing) the moment real
    // wall-clock time passes it, regardless of when this suite is re-run.
    issuedAt: '2026-09-17T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    isActive: true, consultantIdentifier: 'Dr. Jane Reviewer', accessCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  getByCaseId.mockResolvedValue({ ok: true, data: [] });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function renderModal(onClose = vi.fn()) {
  const { default: ExternalConsultAccessModal } = await import('./ExternalConsultAccessModal');
  const utils = render(
    <ExternalConsultAccessModal isOpen caseData={CASE} currentUserId="u1" currentUserName="Dr. Attending" onClose={onClose} />
  );
  await act(async () => {});
  return utils;
}

describe('ExternalConsultAccessModal — real render/behavior coverage', () => {
  it('shows the load-bearing disclosure banner and the case label on open', async () => {
    await renderModal();
    expect(screen.getByText(/Demo\/pilot only — not real security\./)).not.toBeNull();
    expect(screen.getByText('S26-1234 · Roe, Jane')).not.toBeNull();
  });

  it('blocks issuing without a consultant identifier, with a real inline error', async () => {
    await renderModal();
    fireEvent.click(screen.getByText('+ Issue New Consult Link'));
    fireEvent.click(screen.getByText('Issue Link'));
    await act(async () => {});

    expect(screen.getByText('A consultant name or identifier is required.')).not.toBeNull();
    expect(issue).not.toHaveBeenCalled();
  });

  it('issues a Full Case link with the real scope, then shows the copyable created link', async () => {
    issue.mockResolvedValue({ ok: true, data: makeToken() });
    await renderModal();

    fireEvent.click(screen.getByText('+ Issue New Consult Link'));
    fireEvent.change(screen.getByPlaceholderText(/Dr\. Jane Reviewer/), { target: { value: 'Dr. Jane Reviewer' } });
    fireEvent.click(screen.getByText('Issue Link'));
    await act(async () => {});

    expect(issue).toHaveBeenCalledWith(expect.objectContaining({
      scope: { caseId: 'case-1', caseAccessionNumber: 'S26-1234', slideIds: undefined },
      issuedByUserId: 'u1', issuedByName: 'Dr. Attending', consultantIdentifier: 'Dr. Jane Reviewer',
    }));
    expect(screen.getByText('Link Created')).not.toBeNull();
    const linkInput = screen.getByDisplayValue(/\/consult\/ct_abc123$/) as HTMLInputElement;
    expect(linkInput.value.endsWith('/consult/ct_abc123')).toBe(true);
  });

  it('a Specific Slides scope requires at least one slide, then issues with the real selected slide id', async () => {
    issue.mockResolvedValue({ ok: true, data: makeToken({ scope: { caseId: 'case-1', caseAccessionNumber: 'S26-1234', slideIds: ['stain-1'] } }) });
    await renderModal();

    fireEvent.click(screen.getByText('+ Issue New Consult Link'));
    fireEvent.change(screen.getByPlaceholderText(/Dr\. Jane Reviewer/), { target: { value: 'Dr. Jane Reviewer' } });
    fireEvent.click(screen.getByText('Specific Slides'));
    fireEvent.click(screen.getByText('Issue Link'));
    await act(async () => {});

    expect(screen.getByText('Select at least one slide, or switch to Full Case access.')).not.toBeNull();
    expect(issue).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('A-1 · H&E'));
    fireEvent.click(screen.getByText('Issue Link'));
    await act(async () => {});

    expect(issue).toHaveBeenCalledWith(expect.objectContaining({
      scope: { caseId: 'case-1', caseAccessionNumber: 'S26-1234', slideIds: ['stain-1'] },
    }));
  });

  it('revoking an Active token calls the real service and reloads the list', async () => {
    getByCaseId.mockResolvedValue({ ok: true, data: [makeToken()] });
    revoke.mockResolvedValue({ ok: true, data: makeToken({ isActive: false }) });
    await renderModal();

    expect(screen.getByText('Dr. Jane Reviewer')).not.toBeNull();
    expect(screen.getByText('Active')).not.toBeNull();

    fireEvent.click(screen.getByText('Revoke'));
    await act(async () => {});

    expect(revoke).toHaveBeenCalledWith('ctok-1', 'u1');
    expect(getByCaseId).toHaveBeenCalledTimes(2);
  });
});
