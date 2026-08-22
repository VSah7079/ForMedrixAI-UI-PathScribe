// src/utils/formatDate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Locale-aware date, datetime, age, and relative time formatting.
// Single source of truth for all date display across PathScribe.
//
// All display formatting derives from the institution's jurisdiction via
// JURISDICTION_LOCALE in systemConfig.ts. Internal storage is always UTC ISO 8601.
//
// Usage:
//   import { formatDate, formatDateTime, localeForJurisdiction } from '@/utils/formatDate';
//   formatDate('1974-03-14', 'en-GB')  → '14/03/1974'
//   formatDate('1974-03-14', 'en-US')  → '03/14/1974'
//
// With jurisdiction:
//   const locale = localeForJurisdiction(config.jurisdiction);
//   formatDate(caseDate, locale)
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '../types/systemConfig';
import { JURISDICTION_LOCALE } from '../types/systemConfig';

// ── Jurisdiction helpers ──────────────────────────────────────────────────────

/** Returns the BCP-47 locale string for a given jurisdiction. */
export function localeForJurisdiction(j: Jurisdiction): string {
  return JURISDICTION_LOCALE[j]?.locale ?? 'en-US';
}

/** Returns the spellcheck lang attribute value for a given jurisdiction. */
export function spellLangForJurisdiction(j: Jurisdiction): string {
  return JURISDICTION_LOCALE[j]?.spellLang ?? 'en-US';
}

/** Returns a display hint for the date format (e.g. 'DD/MM/YYYY'). */
export function dateFormatHint(j: Jurisdiction): string {
  return JURISDICTION_LOCALE[j]?.dateFormat ?? 'MM/DD/YYYY';
}

/** Returns '12h' or '24h' for the jurisdiction. */
export function timeFormatForJurisdiction(j: Jurisdiction): '12h' | '24h' {
  return JURISDICTION_LOCALE[j]?.timeFormat ?? '12h';
}

// ── Date only ─────────────────────────────────────────────────────────────────

export function formatDate(iso: string | undefined, locale?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale ?? 'en-US', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  });
}

// ── Date + time ───────────────────────────────────────────────────────────────

export function formatDateTime(iso: string | undefined, locale?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const j    = localeToJurisdiction(locale);
  const is24 = j ? timeFormatForJurisdiction(j) === '24h' : false;
  return d.toLocaleString(locale ?? 'en-US', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: !is24,
  });
}

// ── Long-form date (unambiguous — for reports and audit) ──────────────────────
// Always spelled out: '4 June 2026' or 'June 4, 2026'
// Use this on finalised reports to avoid any DD/MM vs MM/DD ambiguity.

export function formatDateLong(iso: string | undefined, locale?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale ?? 'en-US', {
    day:   'numeric',
    month: 'long',
    year:  'numeric',
  });
}

// ── UTC audit timestamp (always unambiguous) ──────────────────────────────────

export function formatAuditTimestamp(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 23) + ' UTC';
}

// ── Age label (days / weeks / months / years) ─────────────────────────────────

export function formatAge(dobIso: string | undefined): string {
  if (!dobIso) return '—';
  const dob   = new Date(dobIso);
  const now   = new Date();
  const msOld = now.getTime() - dob.getTime();
  const days  = Math.floor(msOld / (1000 * 3600 * 24));

  if (days < 1)   return `${Math.max(0, Math.floor(msOld / (1000 * 3600)))}h`;
  if (days < 7)   return `${days}d`;
  if (days < 30)  return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30.43)}mo`;
  return `${Math.floor(days / 365.25)}y`;
}

// ── Relative label (today / yesterday / day name / date) ──────────────────────

export function formatRelative(iso: string | undefined, locale?: string): string {
  if (!iso) return '—';
  const d   = new Date(iso);
  const now = new Date();
  if (isNaN(d.getTime())) return iso;

  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 3600 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return d.toLocaleDateString(locale ?? 'en-US', { weekday: 'short' });
  if (diffDays < 365) return d.toLocaleDateString(locale ?? 'en-US', { month: 'short', day: 'numeric' });
  return formatDate(iso, locale);
}

/** Real feature, per direct follow-up: "Maybe time in military
 *  style? Will it reflect regional preference for date?" Exposes the
 *  same real 12h/24h detection formatDateTime already uses
 *  internally (localeToJurisdiction below), so a caller that needs a
 *  DIFFERENT date/time SHAPE than formatDateTime's own fixed one
 *  (e.g. a compact, no-year timestamp for a short-duration log) can
 *  still reuse the real, shared jurisdiction logic for whether that
 *  format should be 12h or 24h — instead of re-deriving that decision
 *  independently, which would risk silently drifting from this file's
 *  own real source of truth the moment one changes without the
 *  other. */
export function is24HourForLocale(locale?: string): boolean {
  const j = localeToJurisdiction(locale);
  return j ? timeFormatForJurisdiction(j) === '24h' : false;
}

// ── Internal helper ───────────────────────────────────────────────────────────

/** Best-effort reverse lookup: locale string → Jurisdiction.
 *  Used only for time format (12h/24h) inference. */
function localeToJurisdiction(locale?: string): Jurisdiction | null {
  if (!locale) return null;
  const entry = (Object.entries(JURISDICTION_LOCALE) as [Jurisdiction, { locale: string }][])
    .find(([, v]) => v.locale === locale);
  return entry?.[0] ?? null;
}
