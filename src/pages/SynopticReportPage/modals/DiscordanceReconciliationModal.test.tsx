// @vitest-environment happy-dom
// Batch 382 (PS-359): the frozen-versus-final reconciliation modal takes what
// each step needs from the organisation's Field Requirements, and Record can
// be said.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key), i18n: { language: 'en' } }),
}));
vi.mock('@/components/SpellCheck/SpellCheckedTextarea', () => ({
  SpellCheckedTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

const { listeners, created } = vi.hoisted(() => ({
  listeners: [] as Array<(id: string) => void>,
  created: [] as unknown[],
}));
vi.mock('@/services', async () => {
  const rules = await vi.importActual<typeof import('@/services/fieldRequirements/fieldRequirementRules')>('@/services/fieldRequirements/fieldRequirementRules');
  const checks = await vi.importActual<typeof import('@/services/fieldRequirements/reportPageChecks')>('@/services/fieldRequirements/reportPageChecks');
  const record = await vi.importActual<typeof import('@/services/quality/discordanceRecord')>('@/services/quality/discordanceRecord');
  return {
    ...rules, ...checks, buildDiscordanceRecord: record.buildDiscordanceRecord,
    fieldRequirementService: { forSession: vi.fn(async () => rules.resolveFieldRequirements('report')) },
    qaActivityRecordService: { create: vi.fn(async (p: unknown) => { created.push(p); return p; }) },
    actionRegistryService: { onAction: (cb: (id: string) => void) => { listeners.push(cb); return () => { listeners.splice(listeners.indexOf(cb), 1); }; } },
  };
});

import { DiscordanceReconciliationModal } from './DiscordanceReconciliationModal';

afterEach(() => { cleanup(); listeners.length = 0; created.length = 0; });

async function open(onDone = vi.fn()) {
  render(
    <DiscordanceReconciliationModal
      caseId="C1" specimenId="S1" caseType="surgical" frozenCategory="malignant" frozenDx="Suspicious for carcinoma"
      performedBy={{ userId: 'U1', userName: 'Dr Attending' }} onDone={onDone}
    />,
  );
  await waitFor(() => expect(listeners.length).toBe(1));
  return onDone;
}
const pick = (id: string, v: string) => fireEvent.change(document.getElementById(id)!, { target: { value: v } });
const status = () => screen.queryByRole('status')?.textContent ?? '';

describe('DiscordanceReconciliationModal and Field Requirements (Batch 382)', () => {
  it('before a category is chosen, only the diagnosis and the category are asked for', async () => {
    await open();
    expect(status()).toContain('discordanceFinalDiagnosis');
    expect(status()).toContain('discordanceFinalCategory');
    expect(status()).not.toContain('discordanceDelta');
    expect((screen.getByText('discordanceReconciliationModal.recordDiscordantButton') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the same category as the frozen one is a concordant call, saved with the diagnosis and category', async () => {
    const onDone = await open();
    fireEvent.change(screen.getByPlaceholderText('discordanceReconciliationModal.finalDiagnosisPlaceholder'), { target: { value: 'Invasive carcinoma' } });
    pick('discordance-final-category', 'malignant');
    const button = screen.getByText('discordanceReconciliationModal.confirmConcordantButton') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ outcome: 'concordant', caseId: 'C1', fieldValues: { finalCategory: 'malignant', finalDx: 'Invasive carcinoma' } });
  });

  it('a different category asks for the delta, impact, root cause and comment, and "record discordance" saves once they are given', async () => {
    const onDone = await open();
    fireEvent.change(screen.getByPlaceholderText('discordanceReconciliationModal.finalDiagnosisPlaceholder'), { target: { value: 'Fibroadenoma' } });
    pick('discordance-final-category', 'benign');
    expect(status()).toContain('discordanceDelta');
    expect(status()).toContain('discordanceComments');
    act(() => listeners[0]('DISCORDANCE_RECORD'));
    expect(created).toHaveLength(0);
    pick('discordance-delta', 'downgrade');
    pick('discordance-severity', 'low');
    pick('discordance-root-cause', 'other');
    expect(status()).toContain('discordanceRootCauseNote');
    fireEvent.change(screen.getByPlaceholderText('discordanceReconciliationModal.explainPlaceholder'), { target: { value: 'Cautery artefact' } });
    fireEvent.change(screen.getByPlaceholderText('discordanceReconciliationModal.commentPlaceholder'), { target: { value: 'Frozen overcalled.' } });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => listeners[0]('DISCORDANCE_RECORD'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(created[0]).toMatchObject({ outcome: 'discordant', delta: 'downgrade', severity: 'low', rootCause: 'other', rootCauseNote: 'Cautery artefact', comments: 'Frozen overcalled.' });
  });
});
