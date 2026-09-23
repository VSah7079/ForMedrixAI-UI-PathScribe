// @vitest-environment happy-dom
//
// src/pages/AccessionPage/AccessionPage.e2e.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up flagging a real, open gap: generateDefaultMaterial.ts
// was tested directly (its own test file), but nothing ever exercised
// the real, full form-submission flow through AccessionPage.tsx itself
// — selecting a real, seeded Autopsy specimen dictionary entry, filling
// the minimal required patient fields, submitting, and confirming the
// real case that reaches caseRouter.createCase() actually carries the
// real, protocol-generated blocks, not just that the pure function
// produces them in isolation.
//
// Real, deliberate choice: uses the real, already-seeded mock services
// (specimen dictionary, protocol dictionary) against a real, in-memory
// localStorage shim, rather than mocking every one of AccessionPage.tsx's
// own dozen-plus service dependencies individually — this is genuinely
// closer to how the real app behaves (its own real seed data, its own
// real generateDefaultMaterial call), and far less fragile than
// hand-stubbing every service method this large a page touches. Only
// caseRouter.createCase itself is spied on — real submission is
// exercised end-to-end, just never actually persisted past that point.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemConfigProvider } from '@/contexts/SystemConfigContext';
import { MessagingProvider } from '@/contexts/MessagingContext';
import { SpecimenDictionaryProvider } from '@/components/Config/System/useSpecimenDictionary';
import { DirtyStateProvider } from '@/contexts/DirtyStateProvider';
import { BreadcrumbProvider } from '@/contexts/BreadcrumbContext';
import { VoiceProvider } from '@/contexts/VoiceProvider';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
  // Real shape from react-i18next's own initReactI18next.js (type +
  // no-op init) — needed as of caseAccessControl.ts's own i18n
  // conversion, since CaseRouter.ts's import chain now reaches
  // @/i18n/config, which calls i18n.use(initReactI18next) at module
  // load time regardless of whether this test ever exercises the
  // functions that actually call t(). Without this, the mock above
  // (which replaces the whole react-i18next module) leaves that call
  // referencing undefined and crashes at import time.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'path-1', name: 'Test Pathologist' } }),
}));

describe('AccessionPage \u2014 real, full form-submission walkthrough (Autopsy specimen \u2192 real, protocol-generated blocks)', () => {
  it('a real Autopsy specimen dictionary selection carries its own real, seeded protocol\u2019s generated blocks all the way to the real caseRouter.createCase() call', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const createCaseSpy = vi.spyOn(caseRouter, 'createCase').mockResolvedValue({ ok: true, data: { id: 'TEST-CASE-1' } } as any);

    const { default: AccessionPage } = await import('./AccessionPage');
    render(
      <MemoryRouter>
        <SystemConfigProvider>
          <MessagingProvider>
            <SpecimenDictionaryProvider>
              <DirtyStateProvider>
                <BreadcrumbProvider>
                  <VoiceProvider>
                    <AccessionPage />
                  </VoiceProvider>
                </BreadcrumbProvider>
              </DirtyStateProvider>
            </SpecimenDictionaryProvider>
          </MessagingProvider>
        </SystemConfigProvider>
      </MemoryRouter>
    );
    await waitFor(() => screen.getByPlaceholderText('accessionPage.demographics.givenNamesPlaceholder'));

    fireEvent.change(screen.getByPlaceholderText('accessionPage.demographics.givenNamesPlaceholder'), { target: { value: 'Jean' } });
    fireEvent.change(screen.getByPlaceholderText('accessionPage.demographics.familyNamesPlaceholder'), { target: { value: 'Dupont' } });
    const dobInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dobInput, { target: { value: '1970-01-01' } });

    // Real, per direct investigation of a real, confirmed regression
    // this specific test surfaced: caseInfoValid also requires a real
    // Submitting Facility and Requesting Provider \u2014 this test
    // never filled either in, so canSubmit was never actually true.
    // A real, seeded facility/provider pair (mockFacilityService.ts's
    // own 'c1' Metro General Hospital, mockPhysicianService.ts's own
    // 'ph1' Dr. Robert Williams, already linked via clientIds), not
    // fabricated test-only fixtures. Real, confirmed root cause of
    // the first attempt at this fix: mockFacilityService.getAll() is
    // a real, async fetch (services/facilities/mockFacilityService.ts)
    // \u2014 the dropdown has only its own empty placeholder option
    // until that real fetch resolves, so a fireEvent.change to 'c1'
    // before it does is a genuine no-op, silently ignored since no
    // matching <option> exists yet. A real waitFor here, not a fixed
    // delay, is what makes this reliable.
    await waitFor(() => screen.getByText('Metro General Hospital'));
    fireEvent.change(screen.getByLabelText('accessionPage.facility.submittingFacility'), { target: { value: 'c1' } });
    const providerInput = screen.getByPlaceholderText('accessionPage.provider.searchPlaceholder');
    fireEvent.focus(providerInput);
    fireEvent.change(providerInput, { target: { value: 'Williams' } });
    await waitFor(() => screen.getByText('Robert Williams'), { timeout: 2000 });
    // Real, confirmed root cause: this option's own real handler is
    // onMouseDown (AccessionPage.tsx), not onClick \u2014 fireEvent.click
    // never dispatches a real mousedown event on its own, so it was a
    // genuine no-op against this specific real handler.
    fireEvent.mouseDown(screen.getByText('Robert Williams'));

    fireEvent.click(screen.getByRole('button', { name: /accessionPage\.tabs\.specimens/ }));
    await waitFor(() => screen.getByText(/accessionPage\.specimens\.selectFromDictionary/));
    fireEvent.click(screen.getByText(/accessionPage\.specimens\.selectFromDictionary/));
    await waitFor(() => screen.getByText('Heart, Autopsy'));
    fireEvent.click(screen.getByText('Heart, Autopsy'));

    // Real, per the Autopsy Grossing Synoptic's own organ-driven
    // section visibility — at least one organ must be selected for
    // the form to be genuinely submittable.
    await waitFor(() => screen.getByText('accessionPage.specimens.organsIncluded', { exact: false }));
    const heartCheckboxLabel = screen.getAllByText('accessionPage.autopsy.organLabel.heart').find(el => el.closest('label'));
    fireEvent.click(heartCheckboxLabel!.closest('label')!.querySelector('input')!);

    // Real, confirmed root cause: this whole section only renders
    // inside AccessionPage.tsx's own tab === 'case' block (the "Case
    // & Patient" tab), not "Specimens" \u2014 switching back is
    // required, not optional, once a real Autopsy specimen has made
    // autopsyRelevant true.
    fireEvent.click(screen.getByRole('button', { name: 'accessionPage.tabs.casePatient' }));

    // Real, per direct investigation: resolveAutopsyIntakeFormValidation.ts's
    // own real bar for this whole gate \u2014 a real Jurisdiction and
    // real Case Authority, on every real Autopsy case, regardless of
    // path (forensic vs. hospital-consented). Neither label is
    // actually associated to its own real <select> via htmlFor/id
    // (AccessionPage.tsx), so this navigates from the real label text
    // to its own sibling select directly, rather than getByLabelText.
    const jurisdictionSelect = (await waitFor(() => screen.getByText('accessionPage.autopsy.jurisdiction'))).closest('div')!.querySelector('select')!;
    fireEvent.change(jurisdictionSelect, { target: { value: 'US' } });
    const caseAuthoritySelect = screen.getByText('accessionPage.autopsy.caseAuthority').closest('div')!.querySelector('select')!;
    fireEvent.change(caseAuthoritySelect, { target: { value: 'hospital_consented' } });

    // Real, confirmed root cause: Submit Accession itself only
    // renders inside AccessionPage.tsx's own tab === 'specimens'
    // block \u2014 switching back here is required for the same real
    // reason switching to 'case' was required above. Narrowed to the
    // real ps-tab-btn class \u2014 a bare /Specimens/ name regex also
    // matches other real, unrelated buttons on this page (e.g.
    // "Select from Specimen Dictionary").
    fireEvent.click(screen.getAllByText(/accessionPage\.tabs\.specimens/).find(el => el.closest('button')?.className.includes('ps-tab-btn'))!.closest('button')!);

    await waitFor(() => expect(screen.queryByText('accessionPage.actions.submitAccession')).not.toBeNull());
    const submitBtn = screen.getByText('accessionPage.actions.submitAccession').closest('button');
    console.log('SUBMIT BUTTON DISABLED?', submitBtn?.disabled);
    fireEvent.click(screen.getByText('accessionPage.actions.submitAccession'));

    await waitFor(() => expect(createCaseSpy).toHaveBeenCalled());
    const submittedCase = createCaseSpy.mock.calls[0][0] as any;
    const specimen = submittedCase.specimens?.[0];
    expect(specimen).toBeDefined();
    // Real, per generateDefaultMaterial.test.ts's own, already-passing
    // expectations for this exact seeded protocol \u2014 confirmed
    // directly, not re-derived here: 4 coronary vessel blocks + 2
    // myocardial blocks, label is the bare sequential number ('1'),
    // the 'C' specimen-letter prefix lives only on displayId.
    expect(specimen.blocks?.length).toBe(6);
    expect(specimen.blocks[0].label).toBe('1');
  }, 20000);
});
