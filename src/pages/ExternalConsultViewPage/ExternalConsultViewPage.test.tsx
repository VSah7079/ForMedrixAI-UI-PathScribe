// @vitest-environment happy-dom
//
// src/pages/ExternalConsultViewPage/ExternalConsultViewPage.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, closing a noted gap from the PS-290 build: only the service layer
// underneath this page (mockConsultTokenService.test.ts) had test coverage
// — the outside-consultant-facing page itself, the entire reason this
// domain exists, had none.
//
// i18n/cleanup sweep, batch 164: the page gained useTranslation()/Trans
// calls, so this file now follows the established codebase pattern
// (first used in GrossingScreenPage.test.tsx) of mocking react-i18next's
// useTranslation to return the raw key (with interpolation values
// appended as `key:{"opt":"val"}`) rather than loading the real i18n
// config, and mocking Trans to render its own i18nKey — assertions below
// check for key presence, not translated text.
//
// react-router's useParams is mocked directly rather than wrapping in
// a MemoryRouter — this page only ever reads `token` off the URL, it
// never navigates, so a full router isn't needed to exercise its logic.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import type { Case } from '@/types/case/Case';
import type { ConsultToken } from '@/services/consultAccess/IConsultTokenService';

vi.mock('react-router', () => ({
  useParams: () => ({ token: 'ct_abc123' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

const { getCase } = vi.hoisted(() => ({ getCase: vi.fn() }));

const { resolve, recordAccess, submitOpinion } = vi.hoisted(() => ({
  resolve: vi.fn(), recordAccess: vi.fn(), submitOpinion: vi.fn(),
}));
// Batch 363: the page reads cases through @/services (caseService), not the mock file.
vi.mock('@/services', () => ({
  consultTokenService: { resolve, recordAccess, submitOpinion },
  caseService: { getCase },
}));

const CASE = {
  id: 'case-1',
  accession: { accessionNumber: 'S26-1234' },
  patient: { firstName: 'Jane', lastName: 'Roe', dateOfBirth: '1980-01-01' },
  specimens: [{
    id: 'sp-1', label: 'A', description: 'Left breast, lumpectomy',
    blocks: [{ id: 'block-1', label: '1', stains: [
      { id: 'stain-1', stainName: 'H&E' },
      { id: 'stain-2', stainName: 'ER' },
    ] }],
  }],
} as unknown as Case;

function makeToken(overrides: Partial<ConsultToken> = {}): ConsultToken {
  return {
    id: 'ctok-1', token: 'ct_abc123',
    scope: { caseId: 'case-1', caseAccessionNumber: 'S26-1234' },
    issuedByUserId: 'u1', issuedByName: 'Dr. Attending',
    issuedAt: '2026-09-17T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    isActive: true, consultantIdentifier: 'Dr. Jane Reviewer', accessCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  recordAccess.mockResolvedValue({ ok: true, data: makeToken() });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function renderPage() {
  const { default: ExternalConsultViewPage } = await import('./ExternalConsultViewPage');
  const utils = render(<ExternalConsultViewPage />);
  await act(async () => {});
  return utils;
}

describe('ExternalConsultViewPage — real render/behavior coverage', () => {
  it('an invalid/expired/revoked token shows the one, uniform denial and never fetches the case', async () => {
    resolve.mockResolvedValue({ ok: false, error: 'This link is invalid or no longer active.' });
    await renderPage();

    expect(await screen.findByText('externalConsultViewPage.invalidLink.title')).not.toBeNull();
    expect(getCase).not.toHaveBeenCalled();
    expect(recordAccess).not.toHaveBeenCalled();
  });

  it('a valid Full Case token shows the disclosure banner, the real case/patient data, every slide, and records exactly one access', async () => {
    resolve.mockResolvedValue({ ok: true, data: makeToken() });
    getCase.mockResolvedValue(CASE);
    await renderPage();

    expect(await screen.findByText('S26-1234')).not.toBeNull();
    expect(screen.getByText(/Roe, Jane/)).not.toBeNull();
    expect(screen.getByText(/externalConsultViewPage\.dobPrefix/)).not.toBeNull();
    expect(screen.getByText(/externalConsultViewPage\.fullCaseAccess/)).not.toBeNull();
    expect(screen.getByText('A-1 · H&E')).not.toBeNull();
    expect(screen.getByText('A-1 · ER')).not.toBeNull();
    expect(screen.getByText('externalConsultViewPage.disclosureBanner')).not.toBeNull();

    expect(recordAccess).toHaveBeenCalledTimes(1);
    expect(recordAccess).toHaveBeenCalledWith('ctok-1');
  });

  it('a slide-scoped token only shows the slides actually in scope', async () => {
    resolve.mockResolvedValue({ ok: true, data: makeToken({ scope: { caseId: 'case-1', caseAccessionNumber: 'S26-1234', slideIds: ['stain-2'] } }) });
    getCase.mockResolvedValue(CASE);
    await renderPage();

    expect(await screen.findByText(/externalConsultViewPage\.scopedAccess/)).not.toBeNull();
    expect(screen.queryByText('A-1 · H&E')).toBeNull();
    expect(screen.getByText('A-1 · ER')).not.toBeNull();
  });

  it('submitting an opinion requires text, then calls the real service with the tokenRecord/caseRecord identity', async () => {
    resolve.mockResolvedValue({ ok: true, data: makeToken() });
    getCase.mockResolvedValue(CASE);
    submitOpinion.mockResolvedValue({ ok: true, data: { id: 'op-1' } });
    await renderPage();
    await screen.findByText('S26-1234');

    fireEvent.click(screen.getByText('externalConsultViewPage.submitOpinionButton'));
    await act(async () => {});
    expect(screen.getByText('externalConsultViewPage.requiredOpinionError')).not.toBeNull();
    expect(submitOpinion).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('externalConsultViewPage.opinionPlaceholder'), { target: { value: 'Concur with invasive ductal carcinoma.' } });
    fireEvent.click(screen.getByText('externalConsultViewPage.submitOpinionButton'));
    await act(async () => {});

    expect(submitOpinion).toHaveBeenCalledWith({
      tokenId: 'ctok-1', caseId: 'case-1', consultantIdentifier: 'Dr. Jane Reviewer',
      diagnosticCategory: undefined, signedStatus: 'Draft', opinionText: 'Concur with invasive ductal carcinoma.',
    });
    expect(screen.getByText('externalConsultViewPage.opinionSubmittedConfirmation')).not.toBeNull();
  });
});
