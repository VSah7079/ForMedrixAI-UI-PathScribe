/**
 * protocolShared.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared data registry, types, style maps, and micro-components used by
 * ActiveProtocolsSection, ReviewQueueSection, and AllProtocolsSection.
 *
 * TODO: Replace PROTOCOL_REGISTRY with a useProtocols() hook once the
 * data layer (API / context) is wired up.
 *
 * i18n (file-by-file sweep):
 *   PROTOCOL_REGISTRY entries (name, category, type, owner, reviewNote, …)
 *   are persisted mock data — the same posture as section.title/field.label
 *   in other swept files — and stay untouched/English. `protocolGroup()`'s
 *   return values ('Surgical Pathology', 'Non-GYN Cytology', …) are a
 *   cross-file comparison key consumed by ActiveProtocolsSection.tsx (not
 *   part of this batch) via strict string equality, so they're left as
 *   English data identifiers here too, per the "internal schema/data-key
 *   identifiers stay English" convention — that file's own rendering of
 *   these values as tab labels will need a LABEL_KEY mapping of its own
 *   when it's swept. Governing-body abbreviations (CAP/RCPath/ICCR/RCPA)
 *   are fixed vocabulary, same posture as source badges elsewhere in this
 *   sweep. LifecycleState is a real persisted enum, so its display label
 *   goes through a LIFECYCLE_LABEL_KEY map instead of being translated
 *   directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LifecycleState =
  | 'draft'
  | 'in_review'
  | 'needs_changes'
  | 'approved'
  | 'published';

export interface Protocol {
  id:           string;
  name:         string;
  category:     string;
  version:      string;
  source:       'CAP' | 'RCPath' | 'ICCR' | 'PathScribe' | 'Custom';
  type:         string;
  status:       LifecycleState;
  fields:       number;
  snomedPct:    number;
  icdPct:       number;
  lastModified: string;
  owner:        string;
  reviewNote?:  string;
  reviewedBy?:  string;   // who requested changes or approved
  reviewedAt?:  string;   // ISO timestamp of last review action
  /**
   * Whether this protocol's answers are diagnostic content destined for a
   * pathology report / cancer registry submission, as opposed to procedural
   * data (e.g. Grossing checklists) that never gets coded or transmitted
   * the same way. Drives whether SNOMED/ICD coverage should be expected
   * or encouraged for this protocol — NOT whether coding fields are
   * available (every field always has snomed/icd keys, regardless).
   * Default TRUE when unset — use isDiagnosticProtocol() below rather than
   * reading this field directly, so existing entries that predate this flag
   * (effectively all CAP/RCPath/diagnostic-Custom protocols) don't need to
   * be touched one by one to keep their correct default behavior.
   */
  isDiagnostic?: boolean;
  /**
   * High-level grouping for the Synoptic Library's top-level filter —
   * coarser than category (which is organ/purpose-specific: BREAST,
   * COLON, GROSSING, CYTOLOGY_NONGYN, etc.). Optional — when unset,
   * derived from category via protocolGroup() below, so existing
   * entries don't need to be touched one by one. Set explicitly only
   * when a category's default grouping is genuinely wrong for a
   * specific entry.
   */
  group?: 'Surgical Pathology' | 'Non-GYN Cytology' | 'GYN Cytology' | 'Grossing';
}

/**
 * Resolves a protocol's Synoptic Library group. Call this rather than
 * reading category or group directly, so the derivation rule lives in
 * one place. Explicit group wins if set; otherwise derived from
 * category. GYN Cytology has no real category prefix yet (none built —
 * see the HPV-testing note on why GYN was deliberately deprioritized),
 * included here so the filter UI has a real place for it to land
 * without another change once it exists.
 */
export function protocolGroup(p: Protocol): 'Surgical Pathology' | 'Non-GYN Cytology' | 'GYN Cytology' | 'Grossing' {
  if (p.group) return p.group;
  if (p.category === 'GROSSING') return 'Grossing';
  if (p.category.startsWith('CYTOLOGY_NONGYN')) return 'Non-GYN Cytology';
  if (p.category.startsWith('CYTOLOGY_GYN')) return 'GYN Cytology';
  return 'Surgical Pathology';
}

/**
 * Whether coverage (SNOMED/ICD coding) should be expected/encouraged for
 * this protocol. Defaults to true (diagnostic) unless isDiagnostic is
 * explicitly set to false. Any future coverage-checker tool or Review
 * Queue enforcement should call this rather than reading isDiagnostic
 * directly, both for the default-true behavior and as a single place to
 * change the rule later if it needs to get more nuanced than a flat flag.
 */
export function isDiagnosticProtocol(p: Protocol): boolean {
  return p.isDiagnostic !== false;
}

// ─── Data registry ────────────────────────────────────────────────────────────
// Single source of truth for all protocol/template state.
// templateService mutates this array directly during the mock phase.
// Replace with a useProtocols() hook backed by API once the backend is ready.
//
// localStorage bridge: on module load we merge any saved protocol overrides
// back into the registry so that lifecycle transitions survive page reloads.
// Key: ps_registry_overrides_v1  Value: Record<id, Partial<Protocol>>

const REGISTRY_STORE_KEY = 'ps_registry_overrides_v1';

export function loadRegistryOverrides(): Record<string, Partial<Protocol>> {
  try {
    const raw = localStorage.getItem(REGISTRY_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveRegistryOverride(patch: Partial<Protocol> & { id: string }): void {
  try {
    const overrides = loadRegistryOverrides();
    overrides[patch.id] = { ...(overrides[patch.id] ?? {}), ...patch };
    localStorage.setItem(REGISTRY_STORE_KEY, JSON.stringify(overrides));
  } catch { /* storage unavailable */ }
}

export let PROTOCOL_REGISTRY: Protocol[] = [
  // CAP/RCPath-derived registry entries removed entirely (not just
  // disabled) as part of the CAP/RCPath content-licensing cleanup, pending
  // a confirmed CAP license. Note this doesn't affect the 19 real synoptic
  // templates (breast_invasive, colon_resection, etc.) -- those were never
  // listed in PROTOCOL_REGISTRY to begin with (see templateService.ts's
  // getTemplate() fallback for templates seeded directly into editorStore).
  // Those templates' JSON content was separately genericized in place
  // rather than removed. Replaced with two generic, non-clinical test
  // templates below.
  {
    id: 'generic_test_basic', name: 'Generic Synoptic Test Form -- Basic',
    category: 'TEST', version: '1.0', source: 'PathScribe', type: 'Base template',
    status: 'published', fields: 6, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-17', owner: 'System',
  },
  {
    id: 'generic_test_complex', name: 'Generic Synoptic Test Form -- Complex',
    category: 'TEST', version: '1.0', source: 'PathScribe', type: 'Base template',
    status: 'published', fields: 17, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-17', owner: 'System',
  },
  // 19 generic templates below -- registered here for the first time (see
  // this file's own comment above: these were seeded into editorStore at
  // module load but never had a PROTOCOL_REGISTRY entry, so they were
  // reachable only by direct URL, invisible to normal browsing/assignment).
  // Content is genericized placeholder (CAP/RCPath-derived structure, no
  // licensed wording) pending a confirmed CAP/RCPath license -- version
  // strings' "-generic" suffix marks this; will be bumped to a real
  // version number at the same time real licensed content replaces the
  // placeholder options, rather than tracking a separate status for the
  // interim period.
  {
    id: 'breast_invasive', name: 'Generic Template — Breast Invasive',
    category: 'BREAST', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 44, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'breast_dcis_resection', name: 'Generic Template — Breast Dcis Resection',
    category: 'BREAST', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 20, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'lung_adeno', name: 'Generic Template — Lung Adeno',
    category: 'LUNG', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 39, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'prostate_needle_biopsy', name: 'Generic Template — Prostate Needle Biopsy',
    category: 'PROSTATE', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 34, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'colon_resection', name: 'Generic Template — Colon Resection',
    category: 'COLON', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 46, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'skin_melanoma_bx', name: 'Generic Template — Skin Melanoma Bx',
    category: 'SKIN', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 22, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'kidney_resection', name: 'Generic Template — Kidney Resection',
    category: 'KIDNEY', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 25, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'kidney_biopsy', name: 'Generic Template — Kidney Biopsy',
    category: 'KIDNEY', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 10, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'wilms_resection', name: 'Generic Template — Wilms Resection',
    category: 'KIDNEY', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 32, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'wilms_biopsy', name: 'Generic Template — Wilms Biopsy',
    category: 'KIDNEY', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 8, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'autopsy_gross_examination', name: 'Autopsy Gross Examination — Whole Body / Multi-Cavity',
    category: 'AUTOPSY', version: '0.4.0-draft', source: 'Custom', type: 'Base template',
    status: 'in_review', fields: 98, snomedPct: 0, icdPct: 0,
    lastModified: '2026-09-13', owner: 'System',
  },
  {
    id: 'prostate_resection', name: 'Generic Template — Prostate Resection',
    category: 'PROSTATE', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 28, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'lung_resection', name: 'Generic Template — Lung Resection',
    category: 'LUNG', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 22, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'breast_surgical_excision', name: 'Generic Template — Breast Surgical Excision',
    category: 'BREAST', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 96, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'colorectal_resection_b', name: 'Generic Template — Colorectal Resection B',
    category: 'COLORECTAL', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 39, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'colorectal_local_excision', name: 'Generic Template — Colorectal Local Excision',
    category: 'COLORECTAL', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 34, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'colorectal_further_investigations', name: 'Generic Template — Colorectal Further Investigations',
    category: 'COLORECTAL', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 26, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'prostate_biopsy', name: 'Generic Template — Prostate Biopsy',
    category: 'PROSTATE', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 45, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'prostate_radical_prostatectomy', name: 'Generic Template — Prostate Radical Prostatectomy',
    category: 'PROSTATE', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 38, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'prostate_turp_enucleation', name: 'Generic Template — Prostate Turp Enucleation',
    category: 'PROSTATE', version: '0.1.0-generic', source: 'Custom', type: 'Base template',
    status: 'published', fields: 22, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-25', owner: 'System',
  },
  {
    id: 'liver_biopsy_medical', name: 'Liver Biopsy -- Medical (Native)',
    category: 'LIVER', version: '1.0.1', source: 'Custom', type: 'Non-cancer / Custom',
    status: 'in_review', fields: 18, snomedPct: 72, icdPct: 60,
    lastModified: '2025-12-01', owner: 'Dr. L. Okonkwo',
    reviewNote: 'Awaiting clinical sign-off from hepatopathology',
  },
  {
    id: 'placenta_term', name: 'Placenta -- Term Delivery',
    category: 'PLACENTA', version: '1.0.0', source: 'Custom', type: 'Non-cancer / Custom',
    status: 'in_review', fields: 24, snomedPct: 40, icdPct: 20,
    lastModified: '2025-12-03', owner: 'Dr. S. Torres',
    reviewNote: 'First submission -- please review section structure and SNOMED coverage.',
  },
  {
    id: 'renal_transplant_biopsy', name: 'Renal Biopsy -- Transplant',
    category: 'KIDNEY', version: '0.9.0', source: 'Custom', type: 'Non-cancer / Custom',
    status: 'draft', fields: 21, snomedPct: 33, icdPct: 15,
    lastModified: '2025-12-04', owner: 'Dr. J. Williams',
  },
  // -- Grossing Templates --------------------------------------------------
  // Not diagnostic checklists -- these are PA bench-grossing protocols, the
  // data-entry equivalent for Stage 0/1 of the Orchestration workflow rather
  // than the diagnostic Synoptic Template assignment stage. snomedPct/icdPct
  // are intentionally 0 (isDiagnostic: false).
  {
    id: 'grossing_standard_tissue',
    name: 'Standard Tissue Grossing (Gold Standard) -- Route A',
    category: 'GROSSING', version: '1.0.0', source: 'PathScribe', type: 'Non-cancer / Custom',
    status: 'published', fields: 31, snomedPct: 0, icdPct: 0,
    lastModified: '2026-06-27', owner: 'System',
    isDiagnostic: false,
  },
  {
    id: 'grossing_fluid_cytology',
    name: 'Fluid / Cell Block Grossing (Gold Standard) -- Route B',
    category: 'GROSSING', version: '1.0.0', source: 'PathScribe', type: 'Non-cancer / Custom',
    status: 'published', fields: 12, snomedPct: 0, icdPct: 0,
    lastModified: '2026-06-27', owner: 'System',
    isDiagnostic: false,
  },
  {
    id: 'grossing_histology_only',
    name: 'Histology-Only / Direct Triage (Gold Standard) -- Route C',
    category: 'GROSSING', version: '1.0.0', source: 'PathScribe', type: 'Non-cancer / Custom',
    status: 'published', fields: 9, snomedPct: 0, icdPct: 0,
    lastModified: '2026-06-27', owner: 'System',
    isDiagnostic: false,
  },
  {
    // Self-authored -- no CAP/RCPath equivalent exists; their own Cancer
    // Protocol FAQ explicitly excludes cytology specimens. Real content
    // (Bethesda System, 3rd Edition), same schema every other template
    // here uses.
    id: 'thyroid_fna_cytology',
    name: 'Thyroid FNA -- The Bethesda System for Reporting Thyroid Cytopathology',
    category: 'CYTOLOGY_NONGYN', version: '1.0.0', source: 'PathScribe', type: 'Custom / Institution',
    status: 'published', fields: 22, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-08', owner: 'System',
    reviewedBy: 'Pete Nimmo', reviewedAt: '2026-07-08T00:00:00Z',
    isDiagnostic: true,
  },
  {
    // Milan System (2018) -- genuinely different category names/structure
    // from Bethesda despite both being 6-tier; not interchangeable.
    id: 'salivary_gland_fna_cytology',
    name: 'Salivary Gland FNA -- The Milan System for Reporting Salivary Gland Cytopathology',
    category: 'CYTOLOGY_NONGYN', version: '1.0.0', source: 'PathScribe', type: 'Custom / Institution',
    status: 'published', fields: 18, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-09', owner: 'System',
    reviewedBy: 'Pete Nimmo', reviewedAt: '2026-07-09T00:00:00Z',
    isDiagnostic: true,
  },
  {
    // Paris System, 2nd Edition (2022) -- built specifically around
    // detecting high-grade urothelial carcinoma; LGUN deliberately kept
    // as its own separate category rather than folded into the main tier.
    id: 'urine_cytology',
    name: 'Urine Cytology -- The Paris System for Reporting Urinary Cytology',
    category: 'CYTOLOGY_NONGYN', version: '1.0.0', source: 'PathScribe', type: 'Custom / Institution',
    status: 'published', fields: 16, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-09', owner: 'System',
    reviewedBy: 'Pete Nimmo', reviewedAt: '2026-07-09T00:00:00Z',
    isDiagnostic: true,
  },
  {
    // Papanicolaou Society System (2014) -- Category IV deliberately
    // split into IVA (benign) / IVB (premalignant) rather than one tier,
    // since the two carry very different clinical management.
    id: 'pancreaticobiliary_cytology',
    name: 'Pancreaticobiliary Cytology -- Papanicolaou Society System for Reporting Pancreaticobiliary Cytology',
    category: 'CYTOLOGY_NONGYN', version: '1.0.0', source: 'PathScribe', type: 'Custom / Institution',
    status: 'published', fields: 18, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-09', owner: 'System',
    reviewedBy: 'Pete Nimmo', reviewedAt: '2026-07-09T00:00:00Z',
    isDiagnostic: true,
  },
  {
    // No single dominant named system exists for lymph node FNA, unlike
    // the other three above -- the template's own "standard" field says
    // so honestly rather than implying a citation that doesn't exist.
    id: 'lymph_node_fna_cytology',
    name: 'Lymph Node FNA -- General Reporting Categories',
    category: 'CYTOLOGY_NONGYN', version: '1.0.0', source: 'PathScribe', type: 'Custom / Institution',
    status: 'published', fields: 15, snomedPct: 0, icdPct: 0,
    lastModified: '2026-07-09', owner: 'System',
    reviewedBy: 'Pete Nimmo', reviewedAt: '2026-07-09T00:00:00Z',
    isDiagnostic: true,
  },
];

// Hydrate from localStorage on module load — merges saved overrides so that
// transitions made in previous sessions are reflected immediately on reload.
// This is the mock-phase bridge; remove when the backend API is wired in.
{
  const overrides = loadRegistryOverrides();
  PROTOCOL_REGISTRY = PROTOCOL_REGISTRY.map(p =>
    overrides[p.id] ? { ...p, ...overrides[p.id] } : p
  );
  // Also restore any entries that were created at runtime (not in mock array)
  Object.values(overrides).forEach(o => {
    if (o.id && !PROTOCOL_REGISTRY.find(p => p.id === o.id)) {
      PROTOCOL_REGISTRY.push(o as Protocol);
    }
  });
}

// ─── Registry subscriber ──────────────────────────────────────────────────────
// Allows components to re-render when templateService mutates PROTOCOL_REGISTRY.
// Call notifyRegistryChanged() after any mutation in templateService.

type RegistryListener = () => void;
const registryListeners = new Set<RegistryListener>();

export function subscribeToRegistry(fn: RegistryListener): () => void {
  registryListeners.add(fn);
  return () => registryListeners.delete(fn);
}

export function notifyRegistryChanged(): void {
  registryListeners.forEach(fn => fn());
}

// useProtocols — drop-in hook that re-renders when the registry changes.
// Stores a snapshot of the filtered array in state so React sees a new
// reference on every mutation and re-renders reliably.
// Replace body with a real API fetch when backend is ready.
export function useProtocols(
  filter?: (p: Protocol) => boolean
): Protocol[] {
  const snapshot = () => filter ? PROTOCOL_REGISTRY.filter(filter) : [...PROTOCOL_REGISTRY];

  const [protocols, setProtocols] = React.useState<Protocol[]>(snapshot);

  React.useEffect(() => {
    // Refresh immediately in case registry changed before mount
    setProtocols(snapshot());
    // Subscribe for future changes
    return subscribeToRegistry(() => setProtocols(snapshot()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return protocols;
}



export const LIFECYCLE_STYLES: Record<LifecycleState, { bg: string; color: string; border: string }> = {
  draft:         { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)'  },
  in_review:     { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24', border: 'rgba(245,158,11,0.3)'   },
  needs_changes: { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', border: 'rgba(239,68,68,0.3)'    },
  approved:      { bg: 'rgba(16,185,129,0.15)',  color: '#10B981', border: 'rgba(16,185,129,0.3)'   },
  published:     { bg: 'rgba(8,145,178,0.15)',   color: '#38bdf8', border: 'rgba(8,145,178,0.3)'    },
};

// Translation keys for each persisted LifecycleState value — the value
// itself stays the untranslated English enum used throughout the app;
// only the label LifecycleBadge renders is translated.
const LIFECYCLE_LABEL_KEY: Record<LifecycleState, string> = {
  draft:         'protocolShared.lifecycle.draft',
  in_review:     'protocolShared.lifecycle.inReview',
  needs_changes: 'protocolShared.lifecycle.needsChanges',
  approved:      'protocolShared.lifecycle.approved',
  published:     'protocolShared.lifecycle.published',
};

export const SOURCE_STYLES: Record<string, { color: string; bg: string }> = {
  CAP:        { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  RCPath:     { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  ICCR:       { color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)'  },
  PathScribe: { color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  Custom:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
};

export const CATEGORY_COLORS: Record<string, string> = {
  BREAST:   '#e879f9',
  COLON:    '#2dd4bf',
  PROSTATE: '#60a5fa',
  LUNG:     '#fbbf24',
  LIVER:    '#4ade80',
  PLACENTA: '#f472b6',
  KIDNEY:   '#818cf8',
  CYTOLOGY_NONGYN: '#fb923c',
};

export const LIFECYCLE_ORDER: LifecycleState[] = ['draft', 'in_review', 'approved', 'published'];

// ─── Shared micro-components ──────────────────────────────────────────────────

export const LifecycleBadge: React.FC<{ state: LifecycleState }> = ({ state }) => {
  const { t } = useTranslation();
  const s = LIFECYCLE_STYLES[state];
  const label = t(LIFECYCLE_LABEL_KEY[state]);
  return (
    <span
      className="ps-pshare-lifecycle-badge"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label}
    </span>
  );
};

export const CoverageBar: React.FC<{ pct: number; label: string }> = ({ pct, label }) => {
  const color = pct >= 85 ? '#10B981' : pct >= 65 ? '#fbbf24' : '#f87171';
  return (
    <div className="ps-pshare-coverage">
      <div className="ps-pshare-coverage-head">
        <span className="ps-pshare-coverage-label">{label}</span>
        <span className="ps-pshare-coverage-pct" style={{ color }}>{pct}%</span>
      </div>
      <div className="ps-pshare-coverage-track">
        <div className="ps-pshare-coverage-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
};

// ─── UploadProtocolModal ──────────────────────────────────────────────────────
// Direct upload modal — no intermediary root step.
// Reached by clicking "Upload Protocol" button in any section header.

type GoverningBody = 'CAP' | 'RCPath' | 'ICCR' | 'RCPA' | 'Other';

// Labels for the four real governing-body abbreviations are fixed
// vocabulary (same posture as source badges elsewhere in this sweep) and
// stay literal; only 'Other' is an ordinary UI word and the descriptions
// are explanatory prose, so both go through t(). A hook (not a module
// constant) because it needs useTranslation().
const useGoverningBodies = (): { id: GoverningBody; label: string; desc: string }[] => {
  const { t } = useTranslation();
  return [
    { id: 'CAP',    label: 'CAP',    desc: t('protocolShared.uploadModal.governingBody.capDesc') },
    { id: 'RCPath', label: 'RCPath', desc: t('protocolShared.uploadModal.governingBody.rcpathDesc') },
    { id: 'ICCR',   label: 'ICCR',   desc: t('protocolShared.uploadModal.governingBody.iccrDesc') },
    { id: 'RCPA',   label: 'RCPA',   desc: t('protocolShared.uploadModal.governingBody.rcpaDesc') },
    { id: 'Other',  label: t('protocolShared.uploadModal.governingBody.other'), desc: t('protocolShared.uploadModal.governingBody.otherDesc') },
  ];
};

export const UploadProtocolModal: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const { t } = useTranslation();
  const GOVERNING_BODIES = useGoverningBodies();
  const [govBody,  setGovBody]  = React.useState<GoverningBody>('CAP');
  const [file,     setFile]     = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-pshare-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ps-pshare-modal-header">
          <div>
            <div className="ps-pshare-modal-title">{t('protocolShared.uploadModal.title')}</div>
            <div className="ps-pshare-modal-subtitle">{t('protocolShared.uploadModal.subtitle')}</div>
          </div>
          <button onClick={onClose} className="ps-pshare-close-btn">✕</button>
        </div>

        <div className="ps-pshare-modal-body">

          {/* Governing body */}
          <div>
            <div className="ps-pshare-section-label">{t('protocolShared.uploadModal.governingBodyLabel')}</div>
            <div className="ps-pshare-pill-row">
              {GOVERNING_BODIES.map(gb => (
                <button
                  key={gb.id} onClick={() => setGovBody(gb.id)} title={gb.desc}
                  className={`ps-pshare-pill${govBody === gb.id ? ' ps-pshare-pill--active' : ''}`}
                >
                  {gb.label}
                </button>
              ))}
            </div>
            <div className="ps-pshare-pill-desc">{GOVERNING_BODIES.find(g => g.id === govBody)?.desc}</div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('ps-upload-input')?.click()}
            className={`ps-pshare-dropzone${dragging ? ' ps-pshare-dropzone--dragging' : file ? ' ps-pshare-dropzone--filled' : ''}`}
          >
            <input id="ps-upload-input" type="file" accept=".json,.xml,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
            {file ? (
              <>
                <div className="ps-pshare-dropzone-icon">✅</div>
                <div className="ps-pshare-dropzone-filename">{file.name}</div>
                <div className="ps-pshare-dropzone-hint">{t('protocolShared.uploadModal.clickToChange')}</div>
              </>
            ) : (
              <>
                <div className="ps-pshare-dropzone-icon ps-pshare-dropzone-icon--lg">📤</div>
                <div className="ps-pshare-dropzone-text">{t('protocolShared.uploadModal.dropHereText', { govBody })}</div>
                <div className="ps-pshare-dropzone-hint ps-pshare-dropzone-hint--dim">{t('protocolShared.uploadModal.formatsHint')}</div>
              </>
            )}
          </div>

          {/* Warning */}
          <div className="ps-pshare-warning">
            <span className="ps-pshare-warning-prefix">ℹ️ {t('protocolShared.uploadModal.warningPrefix')} </span>
            {t('protocolShared.uploadModal.warningBody')}
          </div>

          {/* Actions */}
          <div className="ps-pshare-actions">
            <button onClick={onClose} className="ps-conf-btn-secondary">{t('common.cancel')}</button>
            <button
              disabled={!file} onClick={onClose}
              className="ps-conf-btn-teal-accent"
            >
              {t('protocolShared.uploadModal.uploadButton')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── BuildCustomiseModal ──────────────────────────────────────────────────────
// Reached by clicking "Build / Customise" button.
// Offers: Start from Scratch OR pick an existing template.

export const BuildCustomiseModal: React.FC<{
  onClose:             () => void;
  onBuildBlank:        () => void;
  onBuildFromTemplate: (templateId: string) => void;
}> = ({ onClose, onBuildBlank, onBuildFromTemplate }) => {
  const { t } = useTranslation();
  const [selectedTpl, setSelectedTpl] = React.useState<string | null>(null);
  const [search,      setSearch]      = React.useState('');
  const publishedTemplates = PROTOCOL_REGISTRY.filter(p => p.status === 'published');
  const filtered = search.trim()
    ? publishedTemplates.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.source.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())
      )
    : publishedTemplates;

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-pshare-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ps-pshare-modal-header">
          <div>
            <div className="ps-pshare-modal-title">{t('protocolShared.buildModal.title')}</div>
            <div className="ps-pshare-modal-subtitle">{t('protocolShared.buildModal.subtitle')}</div>
          </div>
          <button onClick={onClose} className="ps-pshare-close-btn">✕</button>
        </div>

        <div className="ps-pshare-modal-body ps-pshare-modal-body--tight">

          {/* Blank */}
          <div
            onClick={onBuildBlank}
            className="ps-pshare-scratch-card"
          >
            <div className="ps-pshare-scratch-icon">🧩</div>
            <div className="ps-pshare-scratch-text">
              <div className="ps-pshare-scratch-title">{t('protocolShared.buildModal.scratchTitle')}</div>
              <div className="ps-pshare-scratch-desc">{t('protocolShared.buildModal.scratchDesc')}</div>
            </div>
            <span className="ps-pshare-scratch-chevron">›</span>
          </div>

          {/* Divider */}
          <div className="ps-pshare-divider-row">
            <div className="ps-pshare-divider-line" />
            <span className="ps-pshare-divider-text">{t('protocolShared.buildModal.orBaseOnDivider')}</span>
            <div className="ps-pshare-divider-line" />
          </div>

          {/* Template picker */}
          <div>
            <div className="ps-pshare-section-label">{t('protocolShared.buildModal.existingTemplateLabel')}</div>

            {/* Search */}
            <div className="ps-pshare-search-wrap">
              <span className="ps-pshare-search-icon">🔍</span>
              <input
                type="text"
                placeholder={t('protocolShared.buildModal.searchPlaceholder')}
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedTpl(null); }}
                className="ps-pshare-search-input"
                autoFocus={false}
              />
            </div>

            <div className="ps-pshare-template-list">
              {filtered.length === 0 && (
                <div className="ps-pshare-empty">
                  {t('protocolShared.buildModal.noMatches', { search })}
                </div>
              )}
              {filtered.map(p => {
                const srcStyle = SOURCE_STYLES[p.source] ?? SOURCE_STYLES.Custom;
                const selected = selectedTpl === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedTpl(selected ? null : p.id)}
                    className={`ps-pshare-template-row${selected ? ' ps-pshare-template-row--selected' : ''}`}
                  >
                    <span className="ps-pshare-template-source" style={{ background: srcStyle.bg, color: srcStyle.color }}>{p.source}</span>
                    <div className="ps-pshare-template-info">
                      <div className="ps-pshare-template-name" data-phi="name">{p.name}</div>
                      <div className="ps-pshare-template-meta">{p.version} · {p.fields} fields</div>
                    </div>
                    {selected && <span className="ps-pshare-template-check">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="ps-pshare-actions ps-pshare-actions--spaced">
            <button onClick={onClose} className="ps-conf-btn-secondary">{t('common.cancel')}</button>
            {selectedTpl && (
              <button
                onClick={() => onBuildFromTemplate(selectedTpl)}
                className="ps-conf-btn-teal-accent"
              >
                {t('protocolShared.buildModal.customiseButton')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Keep AddToLibraryModal as alias for backward compatibility
export const AddToLibraryModal = BuildCustomiseModal;
export const ImportModal       = BuildCustomiseModal;
