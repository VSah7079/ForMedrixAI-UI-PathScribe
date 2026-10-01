// @vitest-environment happy-dom
//
// src/components/Config/System/DepartmentsSection.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-277 §1.2.2 gap-closing — the first test file for this
// screen. Deliberately narrow scope: only exercises the real fix made
// in this batch (Department.directorName/cliaOrIsoNumber/headerLogoUrl
// — real, typed fields resolveFacilityPrintBranding.ts already reads
// as its own middle fallback tier — are now actually editable here,
// closing a real, disclosed gap). Every other pre-existing behavior of
// this screen (retention override, Case Mask link, deactivation
// reference-check) is left untested here, same scope discipline as
// this batch's other changes.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

const departmentService = vi.hoisted(() => ({ getAll: vi.fn(), add: vi.fn(), update: vi.fn(), verify: vi.fn() }));
vi.mock('../../../services', () => ({ departmentService }));

vi.mock('../../../services/referenceCheck/referenceCheckService', () => ({
  checkDepartmentReferences: vi.fn().mockResolvedValue({ hasReferences: false, sources: [] }),
}));

vi.mock('../../../services/auditlog/mockAuditService', () => ({
  mockAuditService: { logEvent: vi.fn().mockResolvedValue({ ok: true, data: {} }) },
}));

vi.mock('../../../services/caseRegistry/mockCaseMaskService', () => ({
  mockCaseMaskService: { getAllMasks: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
}));

vi.mock('../../../services/retentionPolicy/resolveRetentionEligibility', () => ({
  resolveCurrentGoverningBodyFloor: vi.fn().mockResolvedValue(undefined),
}));

import DepartmentsSection from './DepartmentsSection';

const DEPT = {
  id: 'dept-1', name: 'Surgical Tissue', defaultGrossingTemplateId: 'grossing_standard_tissue',
  status: 'Active' as const,
  directorName: 'Dr. Jane A. Smith', cliaOrIsoNumber: 'CLIA-01D2345678', headerLogoUrl: 'https://example.com/dept-logo.png',
};

beforeEach(() => {
  departmentService.getAll.mockReset().mockResolvedValue({ ok: true, data: [DEPT] });
  departmentService.add.mockReset().mockResolvedValue({ ok: true, data: { ...DEPT, id: 'dept-2' } });
  departmentService.update.mockReset().mockResolvedValue({ ok: true, data: DEPT });
});
afterEach(() => cleanup());

describe('DepartmentsSection — real, per PS-277 §1.2.2 gap-closing: branding override fields', () => {
  it('opening Edit on a real department pre-fills its own real, already-set branding fields', async () => {
    render(<DepartmentsSection />);
    await screen.findByText('Surgical Tissue');
    fireEvent.click(screen.getByText('common.edit'));

    expect(await screen.findByDisplayValue('Dr. Jane A. Smith')).toBeTruthy();
    expect(screen.getByDisplayValue('CLIA-01D2345678')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.com/dept-logo.png')).toBeTruthy();
  });

  it('real, per PS-277 §1.2.2 gap-closing — editing the header logo URL and saving calls departmentService.update with the real, new value', async () => {
    render(<DepartmentsSection />);
    await screen.findByText('Surgical Tissue');
    fireEvent.click(screen.getByText('common.edit'));

    const logoInput = await screen.findByDisplayValue('https://example.com/dept-logo.png');
    fireEvent.change(logoInput, { target: { value: 'https://example.com/new-dept-logo.png' } });
    fireEvent.click(screen.getByText('departmentsSection.modal.saveButton'));

    await waitFor(() => expect(departmentService.update).toHaveBeenCalledWith(
      'dept-1',
      expect.objectContaining({ headerLogoUrl: 'https://example.com/new-dept-logo.png', directorName: 'Dr. Jane A. Smith', cliaOrIsoNumber: 'CLIA-01D2345678' }),
    ));
  });

  it('a brand-new department can set real branding fields on add — never forced to edit-after-create', async () => {
    departmentService.getAll.mockResolvedValue({ ok: true, data: [] });
    render(<DepartmentsSection />);
    await waitFor(() => expect(departmentService.getAll).toHaveBeenCalled());
    fireEvent.click(screen.getByText('departmentsSection.addDepartment'));

    fireEvent.change(await screen.findByPlaceholderText('departmentsSection.modal.namePlaceholder'), { target: { value: 'Cytology' } });
    fireEvent.change(screen.getByPlaceholderText('departmentsSection.modal.brandingDirectorNamePlaceholder'), { target: { value: 'Dr. New Director' } });
    fireEvent.click(screen.getByText('departmentsSection.modal.addButton'));

    await waitFor(() => expect(departmentService.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cytology', directorName: 'Dr. New Director' }),
    ));
  });

  it('leaving every branding field blank on a new department saves it with none of the three set — never a stray empty string', async () => {
    departmentService.getAll.mockResolvedValue({ ok: true, data: [] });
    render(<DepartmentsSection />);
    await waitFor(() => expect(departmentService.getAll).toHaveBeenCalled());
    fireEvent.click(screen.getByText('departmentsSection.addDepartment'));

    fireEvent.change(await screen.findByPlaceholderText('departmentsSection.modal.namePlaceholder'), { target: { value: 'Histology' } });
    fireEvent.click(screen.getByText('departmentsSection.modal.addButton'));

    await waitFor(() => expect(departmentService.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Histology', directorName: undefined, cliaOrIsoNumber: undefined, headerLogoUrl: undefined }),
    ));
  });
});
