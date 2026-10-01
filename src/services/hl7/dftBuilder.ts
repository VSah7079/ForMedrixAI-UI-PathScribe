// src/services/hl7/dftBuilder.ts
// ─────────────────────────────────────────────────────────────
// Assembles a complete DFT^P03 message from a case's real, permanent
// ServiceChargeRecord[] (services/billing/resolveServiceCharge.ts,
// types/billing/ServiceChargeRecord.ts) - one message per case,
// bundling every real charge into its own FT1, plus one DG1 per real
// ICD-10 diagnosis - matching the real, verified "bundle related
// charges into one message for atomicity" pattern confirmed via
// direct search against real DFT^P03 production examples, not a
// separate message per code.
//
// Same deliberate split as ormBuilder.ts: this is the STANDARD core
// only, built and testable independent of any specific receiving
// RCM/billing system's own quirks - see adapters/ for where that
// vendor-specific customization would plug in, same seam already
// established there.
//
// Real fix, per direct, explicit guidance (Charge Capture rewire):
// this function used to read specimen.coding.cpt/block.coding.cpt
// directly, treating each raw string as a final CPT code ready to
// transmit. That's genuinely stale now - those fields hold internal
// billingCode labels ('IHC-FIRST', not '88342'), and the real,
// resolved CPT/description/modifier/quantity values now live
// permanently on each case's own ServiceChargeRecord[], resolved once
// at finalization and never re-resolved later (see that file's own
// header for why). This function now takes that array directly -
// buildFT1 (segmentBuilders.ts) already supported cptDescription/
// modifier/quantity all along; this rewire is what actually sources
// them, not a change to buildFT1 itself.
//
// Per this codebase's own README for services/hl7/: DELIBERATE
// PRE-INTEGRATION SCAFFOLDING. Nothing calls this yet - no real
// MLLP/HTTP transport exists to actually send it. Real, carefully-
// researched engineering ready for when transport is.
// ─────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import type { HL7MessageContext } from './types';
import { buildMSH, buildPID, buildFT1, buildDG1 } from './segmentBuilders';

let messageCounter = 0;
function nextMessageControlId(): string {
  messageCounter += 1;
  return `PSCRB-DFT${Date.now()}${messageCounter}`;
}

export interface DftBuildResult {
  /** The complete, real HL7 message text — segments joined by \r,
   *  same real segment terminator confirmed for ormBuilder.ts's own
   *  messages. */
  message: string;
  messageControlId: string;
  /** Real count of FT1 segments this message actually carries - a
   *  caller can use this to skip sending a message with zero real
   *  charges rather than send an empty, meaningless DFT. */
  chargeCount: number;
}

/**
 * Builds one DFT^P03 message for one case's worth of real, permanent
 * ServiceChargeRecord[] - call once per case at finalization, not once
 * per charge, matching the real, verified "bundle related charges for
 * transactional atomicity" pattern (if any one charge fails downstream
 * validation, the whole case's charge batch should be rejected
 * together, not partially posted).
 *
 * Honest, deliberate scope boundary, unchanged from before this
 * rewire: only emits real charges this case actually has
 * ServiceChargeRecords for - never a fabricated or rule-based-default
 * charge. A case with no real charges yet produces zero FT1 segments
 * (see chargeCount on the result) rather than a fabricated one.
 *
 * FT1-2 (transactionId) uses each ServiceChargeRecord's own real,
 * deterministic id directly - the same id already used end to end
 * through the whole Charge Capture pipeline, real and traceable rather
 * than a second, separately-composed string. FT1-6 (transaction type)
 * is derived per record from that record's own real transactionType
 * ('charge' -> CG, 'credit' -> CR) - never a single, batch-level value
 * applied uniformly, which would silently transmit a real credit as
 * if it were a charge.
 */
export function buildDftP03ForCase(
  ctx: HL7MessageContext,
  caseData: Pick<Case, 'id' | 'patient'> & { coding?: { icd10?: { code: string; display: string }[] } },
  charges: ServiceChargeRecord[],
  timezone: string
): DftBuildResult {
  const messageControlId = nextMessageControlId();
  const nowIso = new Date().toISOString();

  const segments: string[] = [];
  segments.push(buildMSH(ctx, messageControlId, timezone, nowIso, 'DFT^P03'));
  segments.push(buildPID({
    mrn: (caseData.patient as any)?.mrn,
    firstName: (caseData.patient as any)?.firstName ?? '',
    lastName: (caseData.patient as any)?.lastName ?? '',
    dateOfBirth: (caseData.patient as any)?.dateOfBirth,
    sex: (caseData.patient as any)?.sex,
  }, timezone));

  // Real, primary diagnosis link — the first real ICD-10 code on the
  // case, if any. FT1-19 below points every charge back to this same
  // diagnosis, matching the real, professional-billing pattern
  // confirmed via direct search ("one DG1 per diagnosis... 1-4
  // diagnoses per charge" for professional DFTs, as opposed to the
  // larger institutional DG1 stack this app's real domain doesn't need).
  const primaryDiagnosis = caseData.coding?.icd10?.[0];

  let ft1SetId = 1;
  for (const charge of charges) {
    segments.push(buildFT1({
      setId: ft1SetId++,
      transactionId: charge.id,
      transactionDate: charge.resolvedAt,
      // Real, per-record derivation, per direct question ("did we
      // handle Credits?") - a batch-level default here would have
      // silently stamped every segment CG regardless of what this
      // specific record actually is, which is exactly wrong for a
      // credit: it must transmit as CR, or a downstream billing
      // system would double-charge instead of netting to zero.
      transactionType: charge.transactionType === 'credit' ? 'CR' : 'CG',
      cptCode: charge.cptCode,
      cptDescription: charge.cptDescription,
      modifier: charge.modifier,
      quantity: charge.quantity,
      diagnosisCode: primaryDiagnosis?.code,
    }, timezone));
  }

  // Real DG1 stack — one per real ICD-10 code on the case, first one
  // marked principal (F), matching real, verified DG1.6 semantics.
  (caseData.coding?.icd10 ?? []).forEach((dx, i) => {
    segments.push(buildDG1({ setId: i + 1, icd10Code: dx.code, icd10Description: dx.display, isPrincipal: i === 0 }));
  });

  return { message: segments.join('\r'), messageControlId, chargeCount: ft1SetId - 1 };
}
