// @vitest-environment happy-dom
// Batch 382 (PS-359): the post-sign-out billing reason modal takes what
// Confirm needs from the organisation's Field Requirements, and Confirm can
// be said.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key), i18n: { language: 'en' } }),
}));

const { listeners } = vi.hoisted(() => ({ listeners: [] as Array<(id: string) => void> }));
vi.mock('@/services', async () => {
  const rules = await vi.importActual<typeof import('@/services/fieldRequirements/fieldRequirementRules')>('@/services/fieldRequirements/fieldRequirementRules');
  const checks = await vi.importActual<typeof import('@/services/fieldRequirements/reportPageChecks')>('@/services/fieldRequirements/reportPageChecks');
  return {
    ...rules, ...checks,
    fieldRequirementService: { forSession: vi.fn(async () => rules.resolveFieldRequirements('report')) },
    reasonDictionaryService: { getAll: vi.fn(async () => ({ ok: true, data: [{ id: 'R1', name: 'Wrong code billed', status: 'Active' }, { id: 'R2', name: 'Old', status: 'Inactive' }] })) },
    actionRegistryService: { onAction: (cb: (id: string) => void) => { listeners.push(cb); return () => { listeners.splice(listeners.indexOf(cb), 1); }; } },
  };
});

import { PostSignoutBillingChangeModal } from './PostSignoutBillingChangeModal';

afterEach(() => { cleanup(); listeners.length = 0; });

async function open() {
  const onConfirm = vi.fn();
  render(<PostSignoutBillingChangeModal summary="2 codes added" onConfirm={onConfirm} onCancel={vi.fn()} />);
  await waitFor(() => expect(listeners.length).toBe(1));
  await screen.findByText('Wrong code billed');
  return onConfirm;
}

describe('PostSignoutBillingChangeModal and Field Requirements (Batch 382)', () => {
  it('Confirm waits for a reason and a comment, and lists what is missing', async () => {
    const onConfirm = await open();
    const confirm = screen.getByText('postSignoutBillingChangeModal.confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const status = screen.getByRole('status').textContent ?? '';
    expect(status).toContain('fieldRequirements.fields.report.postSignoutBillingReason');
    expect(status).toContain('fieldRequirements.fields.report.postSignoutBillingComment');
    expect(screen.queryByText('Old')).toBeNull();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'R1' } });
    fireEvent.change(screen.getByPlaceholderText('postSignoutBillingChangeModal.commentPlaceholder'), { target: { value: '  Billed in error. ' } });
    expect(confirm.disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ reasonId: 'R1', comment: 'Billed in error.' });
  });

  it('"confirm billing change" confirms only when nothing is missing', async () => {
    const onConfirm = await open();
    act(() => listeners[0]('POST_SIGNOUT_BILLING_CONFIRM'));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'R1' } });
    fireEvent.change(screen.getByPlaceholderText('postSignoutBillingChangeModal.commentPlaceholder'), { target: { value: 'Billed in error.' } });
    act(() => listeners[0]('POST_SIGNOUT_BILLING_CONFIRM'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
