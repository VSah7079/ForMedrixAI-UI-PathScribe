// @vitest-environment happy-dom
//
// src/pages/GrossingScreenPage/GrossingScreenPage.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-260's own noted verification gap: no page-level render
// test existed for GrossingScreenPage.tsx — only the pure operations
// underneath it (grossingScreenOperations.test.ts) were covered.
//
// Mocks useGrossingScreen entirely — its own write-path behavior is
// already covered by useSpecimenBlockManagement.test.ts's triage
// suite and grossingScreenOperations.test.ts; this file is about the
// page's own rendering logic (protocol header, block table, cytology
// table, audit panel), not re-proving the write handlers.
//
// Real, first-in-codebase pattern: mocks react-i18next's useTranslation
// to return the raw key (optionally with interpolation values
// appended) rather than loading the real i18n config — standard,
// minimal-setup approach for a component test; assertions check for
// key presence, not translated text.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ caseId: 'TEST-CASE-GROSS' }) };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'tech-1', name: 'Test Tech' } }),
}));

const { getCase } = vi.hoisted(() => ({ getCase: vi.fn() }));
vi.mock('@/services/cases/CaseRouter', () => ({ caseRouter: { getCase } }));

const { protocolGetAll, stainTypeGetAll, batchGetAll } = vi.hoisted(() => ({
  protocolGetAll: vi.fn(), stainTypeGetAll: vi.fn(), batchGetAll: vi.fn(),
}));
vi.mock('@/services', () => ({
  protocolService: { getAll: protocolGetAll },
  stainTypeService: { getAll: stainTypeGetAll },
  batchService: { getAll: batchGetAll },
}));

vi.mock('./hooks/useGrossingScreen', () => ({
  useGrossingScreen: () => ({
    handleAddBlock: vi.fn(), handleRemoveBlock: vi.fn().mockResolvedValue({ ok: true }),
    handleAddStain: vi.fn(), handleRemoveStain: vi.fn().mockResolvedValue({ ok: true }),
    pendingStainRemoval: null, confirmPendingStainRemoval: vi.fn(), cancelPendingStainRemoval: vi.fn(),
    handleUpdatePieceCount: vi.fn(),
  }),
}));

const PROTOCOL = {
  id: 'proto-1', name: 'Standard Small Biopsy', requiresTriage: false, active: true, version: 3,
  updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z',
  pathways: [{ id: 'p1', pathwayName: 'Track', materialKind: 'block', fixativeType: '10% NBF', requiresDecal: false, processingFormat: 'Standard', tasks: [] }],
};

const TEST_CASE = {
  id: 'TEST-CASE-GROSS',
  accession: { fullAccession: 'S26-9001' },
  specimens: [
    {
      id: 'sp1', label: 'A', description: 'Gallbladder',
      protocolSnapshot: { id: 'proto-1', version: 3, name: 'Standard Small Biopsy' },
      blocks: [
        { id: 'blk-1', label: '1', status: 'Pending', pieceCount: 2, stains: [{ id: 'st-1', stainName: 'H&E', status: 'Pending Cut' }] },
      ],
      grossingOverrides: [],
    },
  ],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function renderGrossingScreen(caseData: unknown = TEST_CASE) {
  getCase.mockResolvedValue(caseData);
  protocolGetAll.mockResolvedValue({ ok: true, data: [PROTOCOL] });
  stainTypeGetAll.mockResolvedValue({ ok: true, data: [{ id: 'st-pas', name: 'PAS', active: true }] });
  batchGetAll.mockResolvedValue({ ok: true, data: [] });
  const { default: GrossingScreenPage } = await import('./GrossingScreenPage');
  const utils = render(<MemoryRouter><GrossingScreenPage /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('common.loading')).toBeNull());
  return utils;
}

describe('GrossingScreenPage — real render smoke test', () => {
  it('shows the loading state, then the real case, protocol version, and block table', async () => {
    await renderGrossingScreen();
    expect(screen.getByText(/grossingScreen.protocolVersion/)).not.toBeNull();
    expect(screen.getByText(/S26-9001/)).not.toBeNull();
    expect(screen.getByText('H&E')).not.toBeNull();
    expect(screen.getByDisplayValue('2')).not.toBeNull(); // real pieceCount value — rendered as an editable input's value, not plain text
  });

  it('shows a real case-not-found message when the case genuinely does not resolve', async () => {
    await renderGrossingScreen(null);
    expect(screen.getByText('grossingScreen.caseNotFound')).not.toBeNull();
  });

  it('shows the real "Protocol Modified" badge only when a block has userModified: true', async () => {
    const modifiedCase = {
      ...TEST_CASE,
      specimens: [{ ...TEST_CASE.specimens[0], blocks: [{ ...TEST_CASE.specimens[0].blocks[0], userModified: true }] }],
    };
    await renderGrossingScreen(modifiedCase);
    expect(screen.getByText('grossingScreen.protocolModified')).not.toBeNull();
  });

  it('does not show the "Protocol Modified" badge when no block has been modified', async () => {
    await renderGrossingScreen();
    expect(screen.queryByText('grossingScreen.protocolModified')).toBeNull();
  });

  it('a user-added stain renders with the userAdded flag, an auto-generated one with the autoGenerated flag', async () => {
    const caseWithUserAdded = {
      ...TEST_CASE,
      specimens: [{
        ...TEST_CASE.specimens[0],
        blocks: [{
          ...TEST_CASE.specimens[0].blocks[0],
          stains: [
            { id: 'st-1', stainName: 'H&E', status: 'Pending Cut' },
            { id: 'st-2', stainName: 'PAS', status: 'Pending Cut', userAdded: true },
          ],
        }],
      }],
    };
    await renderGrossingScreen(caseWithUserAdded);
    expect(screen.getByText('grossingScreen.autoGenerated')).not.toBeNull();
    expect(screen.getByText('grossingScreen.userAdded')).not.toBeNull();
  });

  it('the audit panel toggles open to show a real logged override', async () => {
    const caseWithOverride = {
      ...TEST_CASE,
      specimens: [{
        ...TEST_CASE.specimens[0],
        grossingOverrides: [{ field: 'pieceCount', blockLabel: '1', originalValue: '(none)', newValue: '2', actor: 'tech-1', timestamp: '2026-09-10T00:00:00.000Z' }],
      }],
    };
    await renderGrossingScreen(caseWithOverride);
    const toggle = screen.getByText(/grossingScreen.auditPanelTitle/);
    expect(screen.queryByText(/grossingScreen.auditEntry/)).toBeNull(); // collapsed by default
    fireEvent.click(toggle);
    expect(screen.getByText(/grossingScreen.auditEntry/)).not.toBeNull();
  });
});
