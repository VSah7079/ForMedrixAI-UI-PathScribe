// src/components/Common/PhiToastMessage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, direct follow-up (PS-72) — a toast message carrying real PHI
// (patient name, MRN, DOB, accession/case number) is a genuine, visible
// exposure risk: it renders on screen, and useScreenCapture.ts's redaction
// pass (services/phiSelectors.ts) runs html2canvas against document.body,
// which is exactly where react-toastify's own <ToastContainer /> portals
// every toast. So a toast tagged data-phi="true" gets caught by the exact
// same redaction overlay mechanism as any other PHI element in the app —
// no special-casing needed in useScreenCapture.ts itself.
//
// SCOPE — what counts as PHI here, and what doesn't (Pete's direct call,
// after questioning why a plain order-number toast was being redacted):
// wrap a toast in PhiToastMessage only when it carries one of the fields
// scripts/tag-phi.mjs's own PHI_PATTERNS already treats as a primary
// identifier — patient name, MRN, DOB, NHS number, accession/case number,
// address/phone/email, diagnosis, insurance, referring physician, age —
// or when the message embeds one of those inline even under a different
// field name (e.g. a "label" built from patient name/MRN). A field that
// ISN'T on that list — externalOrderNumber, encounterNumber, ward — does
// NOT get wrapped on its own, even though it identifies a specific
// order/encounter, because it isn't a primary identifier by this
// project's existing standard and over-tagging erodes the signal of what
// "PHI" means here. If in doubt, check PHI_PATTERNS in scripts/tag-phi.mjs
// before adding a new wrap rather than guessing.
//
// The gap this closes: PHI_SELECTORS is DOM-attribute-based, but
// toast.success('...template literal with a patient name...') renders a
// plain string with no DOM attribute to match. There's no way to fix that
// centrally without touching call sites — the PHI only exists as data at
// the call site, not in any shared rendering path. What CAN be centralized
// is the wrapping itself: react-toastify accepts a ReactNode (not just a
// string), so a real PHI-bearing call site becomes a small, mechanical
// swap rather than reinventing the tagging at every one:
//
//   toast.success(`Loaded ${patient.firstName} ${patient.lastName}...`)
//   →
//   toast.success(<PhiToastMessage>Loaded {patient.firstName} {patient.lastName}...</PhiToastMessage>)
//
// Deliberately whole-message tagging, not a narrower per-token span —
// every real PHI-bearing toast found so far (AccessionPage.tsx) is
// entirely about one patient/case, never a mix of "safe" and "PHI"
// fragments in the same message, so redacting the whole toast body is the
// correct, simpler choice rather than over-engineering partial redaction
// nothing here actually needs yet.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

interface PhiToastMessageProps {
  children: React.ReactNode;
}

export const PhiToastMessage: React.FC<PhiToastMessageProps> = ({ children }) => (
  <span data-phi="true">{children}</span>
);
