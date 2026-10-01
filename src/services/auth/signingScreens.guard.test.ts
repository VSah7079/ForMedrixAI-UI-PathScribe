// src/services/auth/signingScreens.guard.test.ts — Batch 344 (PS-60 follow-up)
// Source-level guard: every screen that signs a case confirms the signer
// through services/auth/signerConfirmation.ts first. Before Batch 344 the
// sign-out and finalize screens asked for a password and never checked it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

const MODALS = [
  'pages/SynopticReportPage/modals/CaseSignOutModal.tsx',
  'pages/SynopticReportPage/modals/FinalizeSynopticModal.tsx',
  'pages/SynopticReportPage/modals/PreFinalisationModal.tsx',
];

describe('signing screens confirm the signer (Batch 344)', () => {
  for (const rel of MODALS) {
    it(`${rel} uses useSignerConfirmation and has no password field of its own`, () => {
      const text = read(rel);
      expect(text).toMatch(/useSignerConfirmation\(/);
      expect(text).toMatch(/<SignerConfirmationFields/);
      expect(text, 'a raw password input would bypass the check').not.toMatch(/type="password"/);
      // The sign callback runs only with a confirmation in hand.
      expect(text).toMatch(/\.then\(c => \{ if \(c\) on(Confirm|Sign)\(c\); \}\)/);
    });
  }

  it('the only password input in a signing flow is the shared, checked one', () => {
    expect(read('components/Signing/SignerConfirmationFields.tsx')).toMatch(/type="password"/);
  });

  it('cytology sign-out goes through the confirmation modal', () => {
    const text = read('pages/CytologyWorklistPage/CytologyScreeningPage.tsx');
    expect(text).not.toMatch(/onClick=\{handleSignOut\}/);
    expect(text).toMatch(/<SignatureConfirmModal[\s\S]*?action="cytology-sign-out"/);
  });

  it('autopsy PAD/FAD signing goes through the confirmation modal', () => {
    const text = read('pages/SynopticReportPage/SynopticReportPage.tsx');
    expect(text).not.toMatch(/onClick=\{\(\) => handleSignAutopsyReport\(/);
    expect(text).toMatch(/<SignatureConfirmModal[\s\S]*?action=\{confirmingAutopsyTier === 'FAD' \? 'autopsy-fad' : 'autopsy-pad'\}/);
  });

  it('the old unchecked credential state is gone', () => {
    const hook = read('pages/Synoptic/useSynopticFinalize.ts');
    for (const name of ['signOutPassword', 'signOutUser', 'finalizePassword']) expect(hook).not.toContain(name);
  });

  it('every signed state change checks the signature when it is saved (Batch 345)', () => {
    const hook = read('pages/SynopticReportPage/hooks/useSignOutWorkflow.ts');
    expect(hook.match(/signatureGate\.accept\(confirmation,/g)?.length).toBe(3); // sign-out, pre-finalise, finalize
    expect(hook).toMatch(/const finalizeCase = useCallback[\s\S]*?signatureGate\.accept\(undefined,/);
    expect(hook).toMatch(/signatureGate\.commit\(caseData\.id, 'finalized'\)/);
    expect(hook).toMatch(/signatureGate\.commit\(caseData\.id, 'signed'/);
    expect(hook).toMatch(/signatureGate\.commit\(caseData\.id, 'released_for_countersign'/);
    expect(read('pages/CytologyWorklistPage/CytologyScreeningPage.tsx')).toMatch(/signatureGate\.accept\(confirmation,/);
    expect(read('pages/SynopticReportPage/SynopticReportPage.tsx')).toMatch(/signatureGate\.accept\(confirmation,/);
  });
});
