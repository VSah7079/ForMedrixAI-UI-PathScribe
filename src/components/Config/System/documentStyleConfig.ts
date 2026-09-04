// src/components/Config/System/documentStyleConfig.ts
// ─────────────────────────────────────────────────────────────
// Real source of truth for the org-wide default report font style.
//
// Confirmed by direct investigation before building this: the report's
// actual rendered default font (.rp-page's font-family in pathscribe.css)
// was, until this feature, 100% hardcoded CSS with zero configuration
// anywhere — not org-wide, not per-facility, nothing. A per-template
// override (ReportTemplate.documentStyle.body) already exists as the
// next layer up; this file adds the missing layer beneath it.
//
// Same "null/unset = inherit" two-layer convention already used for
// AI Orchestrator mode (see orchestratorModeConfig.ts, this file's own
// direct model) and Facility.tatFirstTouchHours/jurisdiction/etc.:
//   1. ORG DEFAULT     — org-wide, admin-editable here, persisted to
//      localStorage. Defaults to Arial/10pt per direct product decision
//      if never explicitly set (fresh install) — not an arbitrary guess.
//   2. TEMPLATE OVERRIDE — ReportTemplate.documentStyle.body, set per
//      template in the Template Assembly editor. Wins over the org
//      default when set. Resolved directly in contextBuilder.ts, since
//      that's where the real, resolved ReportTemplate is already in
//      hand — no separate async lookup needed the way per-facility
//      settings require (this cascade has no facility dimension).
// A third layer — per-component labelConfig — already existed before
// either of the above; it continues to win over both via ordinary CSS
// inheritance (see ReportPreviewRenderer.tsx).
// ─────────────────────────────────────────────────────────────

import type { LabelConfig } from '../../../types/template';

const ORG_DOCUMENT_STYLE_KEY = 'pathscribe_org_document_style_body';
const ORG_DOCUMENT_STYLE_HEADER_KEY = 'pathscribe_org_document_style_header';
const ORG_DOCUMENT_STYLE_FOOTER_KEY = 'pathscribe_org_document_style_footer';

// position isn't meaningful for a document-wide default (there's no
// single "label" to position at this level — see LabelConfig's own doc
// comment) — carried only because LabelConfig requires it; never read
// in this context.
const FALLBACK_DEFAULT: LabelConfig = { position: 'above', fontFamily: 'Arial', fontSize: 10 };
// Real feature (Step 2): header/footer get their own sensible
// defaults, distinct from body — a slightly larger, bold header is
// conventional for a report letterhead; a smaller footer is
// conventional for page-bottom metadata. Both still fully
// admin-editable, same as body.
const FALLBACK_HEADER_DEFAULT: LabelConfig = { position: 'above', fontFamily: 'Arial', fontSize: 12, weight: 'bold' };
const FALLBACK_FOOTER_DEFAULT: LabelConfig = { position: 'above', fontFamily: 'Arial', fontSize: 8 };

// ── Org-level default (sync — safe to call from render) ────────────────────

function readStored(key: string, fallback: LabelConfig): LabelConfig {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return { ...fallback, ...JSON.parse(stored) };
  } catch {
    // localStorage unavailable (SSR / sandboxed env) or corrupt stored
    // JSON — fall through to the fallback default rather than throw.
  }
  return fallback;
}

export function getOrgDocumentStyleDefault(): LabelConfig {
  return readStored(ORG_DOCUMENT_STYLE_KEY, FALLBACK_DEFAULT);
}

export function setOrgDocumentStyleDefault(style: LabelConfig): void {
  try {
    localStorage.setItem(ORG_DOCUMENT_STYLE_KEY, JSON.stringify(style));
  } catch {
    // ignore write failures
  }
}

export function getOrgHeaderStyleDefault(): LabelConfig {
  return readStored(ORG_DOCUMENT_STYLE_HEADER_KEY, FALLBACK_HEADER_DEFAULT);
}

export function setOrgHeaderStyleDefault(style: LabelConfig): void {
  try {
    localStorage.setItem(ORG_DOCUMENT_STYLE_HEADER_KEY, JSON.stringify(style));
  } catch {
    // ignore write failures
  }
}

export function getOrgFooterStyleDefault(): LabelConfig {
  return readStored(ORG_DOCUMENT_STYLE_FOOTER_KEY, FALLBACK_FOOTER_DEFAULT);
}

export function setOrgFooterStyleDefault(style: LabelConfig): void {
  try {
    localStorage.setItem(ORG_DOCUMENT_STYLE_FOOTER_KEY, JSON.stringify(style));
  } catch {
    // ignore write failures
  }
}
