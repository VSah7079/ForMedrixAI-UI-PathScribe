// src/services/cytology/ICytologyInstrumentationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "support Cytology Assisted instrumentation."
// Two real, genuinely different instrument categories, per direct
// guidance's own explicit architectural decision:
//
// 'wsi' — Whole Slide Imaging-based assisted screening (the same real
// category as surgical pathology's own WSI concept). PathScribe's own
// real job: open a real, separate, "sticky" companion window hosting
// the real image viewer for that specific case — reusing
// useCompanionWindow.ts exactly, the same real, generic window-
// management infrastructure already built (and explicitly intended,
// per that file's own header) for "Digital Pathology viewers."
//
// 'traditional_guided' — older, physical-guided-scope instruments
// (e.g. mechanical/optical field-of-view guidance under a real,
// physical microscope). Per direct guidance's own explicit
// instruction: "treat simply as non-digital cases... stays completely
// out of the image-rendering business." Real, deliberate consequence:
// this app already does everything a traditional_guided case needs —
// case status, order, and CT/Pathologist sign-out tracking — with
// zero new code. The only real, new behavior for this category is
// what does NOT happen: no WSI viewer action is ever offered.
//
// Real, deliberate scope for this first increment: a single, real,
// global setting — mirroring mockCytologyScreeningStrategyService.ts's
// own actual, simpler implementation (not a full, per-facility
// override cascade). Stated plainly as a real, later extension point,
// not silently assumed sufficient for every real, multi-facility lab.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export type CytologyInstrumentationModality = 'wsi' | 'traditional_guided';

export interface CytologyInstrumentationConfig {
  modality: CytologyInstrumentationModality;
}

/** Real, per direct guidance: WSI is the real, standardized default —
 *  "Design your digital slide viewer and image orchestration
 *  exclusively around the WSI approach." */
export const DEFAULT_CYTOLOGY_INSTRUMENTATION_CONFIG: CytologyInstrumentationConfig = {
  modality: 'wsi',
};

export interface ICytologyInstrumentationService {
  get(): Promise<ServiceResult<CytologyInstrumentationConfig>>;
  update(patch: Partial<CytologyInstrumentationConfig>): Promise<ServiceResult<CytologyInstrumentationConfig>>;
  reset(): Promise<ServiceResult<CytologyInstrumentationConfig>>;
}
