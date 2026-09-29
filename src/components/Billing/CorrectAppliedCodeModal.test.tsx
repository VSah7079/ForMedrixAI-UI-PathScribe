// @vitest-environment happy-dom
// Batch 382 (PS-359): the applied-code correction modal takes what Correct
// needs from the organisation's Field Requirements, needs
// billing:applied-code:correct, and Correct can be said.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key), i18n: { language: 'en' } }),
}));

const { listeners, held, asked } = vi.hoisted(() => ({
  listeners: [] as Array<(id: string) => void>,
  held: { current: true },
  asked: [] as Array<[string, unknown]>,
}));
vi.mock('@/services', async () => {
  const rules = await vi.importActual<typeof import('@/services/fieldRequirements/fieldRequirementRules')>('@/services/fieldRequirements/fieldRequirementRules');
  const checks = await vi.importActual<typeof import('@/services/fieldRequirements/reportPageChecks')>('@/services/fieldRequirements/reportPageChecks');
  return {
    ...rules, ...checks,
    fieldRequirementService: { forSession: vi.fn(async () => rules.resolveFieldRequirements('report')) },
    rvuCodeMapService: { getActiveVersion: vi.fn(async () => ({ ok: true, data: { entries: [] } })) },
    actionRegistryService: { onAction: (cb: (id: string) => void) => { listeners.push(cb); return () => { listeners.splice(listeners.indexOf(cb), 1); }; } },
    capabilityDefinition: () => undefined,
    capabilityLabelKey: () => 'x',
  };
});
vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    loading: false,
    has: () => held.current,
    decide: (capability: string, context: unknown) => { asked.push([capability, context]); return { allowed: held.current, reason: held.current ? 'granted' : 'notGranted', missingRequirements: [] }; },
  }),
}));
vi.mock('@/components/Common/CptCodeSearchPicker', () => ({
  CptCodeSearchPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="code" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

import { CorrectAppliedCodeModal } from './CorrectAppliedCodeModal';

afterEach(() => { cleanup(); listeners.length = 0; asked.length = 0; held.current = true; });

async function open(onConfirm = vi.fn()) {
  render(<CorrectAppliedCodeModal originalCode="88305" caseId="C1" onConfirm={onConfirm} onCancel={vi.fn()} />);
  await waitFor(() => expect(listeners.length).toBe(1));
  return onConfirm;
}
const type = (v: string) => fireEvent.change(screen.getByLabelText('code'), { target: { value: v } });
const button = () => screen.getByText('correctAppliedCodeModal.correctCode') as HTMLButtonElement;

describe('CorrectAppliedCodeModal and Field Requirements (Batch 382)', () => {
  it('Correct waits for a code that differs from the original', async () => {
    const onConfirm = await open();
    expect(button().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('fieldRequirements.fields.report.correctedBillingCode');
    type('88305');
    expect(button().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('correctAppliedCodeModal.sameAsOriginal');
    type(' 88307 ');
    expect(button().disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(button());
    expect(onConfirm).toHaveBeenCalledWith('88307');
    expect(asked.some(([c, ctx]) => c === 'billing:applied-code:correct' && (ctx as { caseId: string }).caseId === 'C1')).toBe(true);
  });

  it('without billing:applied-code:correct the button and the voice command do nothing', async () => {
    held.current = false;
    const onConfirm = await open();
    type('88307');
    fireEvent.click(button());
    act(() => listeners[0]('CORRECT_CODE_CONFIRM'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('"correct billing code" corrects only when nothing is missing', async () => {
    const onConfirm = await open();
    act(() => listeners[0]('CORRECT_CODE_CONFIRM'));
    expect(onConfirm).not.toHaveBeenCalled();
    type('88307');
    act(() => listeners[0]('CORRECT_CODE_CONFIRM'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('88307');
  });
});
