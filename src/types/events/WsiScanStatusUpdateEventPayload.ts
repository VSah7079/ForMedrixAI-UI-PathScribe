// src/types/events/WsiScanStatusUpdateEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING a real WSI
// scanner instrument's own status updates — per direct follow-up on
// Cytology Assisted Instrumentation: "The interface engine would be
// involved with managing the bidirectional transactions." Same real
// "PathScribe publishes/ingests its own specification; the real
// interface engine owns translating the real instrument's own raw
// protocol into this shape" philosophy as HpvResultEventPayload.ts /
// MolecularBatchResultEventPayload.ts.
//
// Real, per-slide, not per-batch: one real, physical batch can have
// some real slides complete successfully while others fail — the same
// real "honest, partial success" posture
// processInboundMolecularBatchEvent.ts already established for a
// batch spanning many real specimens.
// ─────────────────────────────────────────────────────────────────────────────

export interface WsiScanStatusUpdateEventPayload {
  messageId: string;
  timestamp: string;
  organisationId: string;
  siteId?: string;

  batchId: string;
  slidePosition: string;

  scanStatus: 'scanning' | 'completed' | 'failed';
  /** Real, optional — the real, external instrument's own real
   *  failure reason, exactly as it reports it (e.g. "Focus error",
   *  "Tissue detection failed"), never PathScribe's own guess. See
   *  WsiScanSlide.failureReason's own doc comment (IWsiScanBatchService.ts)
   *  — shared for both a genuine scan failure and a real IMS QC
   *  finding below. */
  failureReason?: string;
  /** Real, per direct guidance's own confirmed Digital Readiness
   *  spec — see WsiScanSlide.qcPassed's own doc comment. Genuinely
   *  distinct from scanStatus; exactly as the real IMS's own
   *  automated post-scan quality check reports it, never inferred
   *  from scanStatus alone. */
  qcPassed?: boolean;
  /** Real, per direct guidance's own confirmed Surgical Pathology vs.
   *  Cytology DP technical breakdown — see WsiScanSlide's own header
   *  comment (IWsiScanBatchService.ts) for the full account. Exactly
   *  as the real interface engine's own inbound event reports it,
   *  never inferred or defaulted by PathScribe itself. */
  acquisitionMode?: 'single_plane' | 'z_stack' | 'focus_fusion';
  /** Real, only meaningful alongside acquisitionMode 'z_stack' — see
   *  WsiScanSlide.focalPlaneCount's own doc comment. */
  focalPlaneCount?: number;
}
