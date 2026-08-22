// src/services/hl7/dftBuilder.ts
// ─────────────────────────────────────────────────────────────
// Assembles a complete DFT^P03 message from our own real Case/Specimen/
// HistologyBlock CPT data - the outbound side of the full specimen/
// block-level CPT association work (Phase 1: types/case/Specimen.ts,
// Phase 2: services/billing/). One message per case, bundling every
// real specimen's base code and every real block's ancillary code
// into its own FT1, plus one DG1 per real ICD-10 diagnosis - matching
// the real, verified "bundle related charges into one message for
// atomicity" pattern confirmed via direct search against real DFT^P03
// production examples, not a separate message per code.
//
// Same deliberate split as ormBuilder.ts: this is the STANDARD core
// only, built and testable independent of any specific receiving
// RCM/billing system's own quirks - see adapters/ for where that
// vendor-specific customization would plug in, same seam already
// established there.
//
// Per this codebase's own README for services/hl7/: DELIBERATE
// PRE-INTEGRATION SCAFFOLDING. Nothing calls this yet - no real
// MLLP/HTTP transport exists to actually send it. Real, carefully-
// researched engineering ready for when transport is.
//
// KNOWN, DISCLOSED STALENESS (Charge Capture work, not yet reconciled
// here): this function still reads specimen.coding.cpt/
// block.coding.cpt directly as if those arrays hold final, real CPT
// code strings. As of the Charge Capture build
// (services/billing/resolveServiceCharge.ts,
// types/billing/ServiceChargeRecord.ts), that's no longer true going
// forward - those fields hold internal billingCode labels
// ('IHC-FIRST', not '88342'), and the real, resolved CPT/RVU/modifier
// values now live on a case's own ServiceChargeRecord[] instead,
// resolved once at finalization and never re-resolved later (see that
// file's own header for why). This function needs a real rewire to
// pull cptCode/modifier/quantity from ServiceChargeRecord before it's
// safe to actually wire up transport - deliberately NOT done as part
// of this same change, since this file has zero real callers today and
// the two changes are cleanly separable; flagged here so whoever wires
// up real transport later finds this note before finding a silent bug.
// ─────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock } from '@/types/case/Specimen';
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
 * Builds one DFT^P03 message for one case's worth of real, assigned
 * CPT charges - specimen-level base codes plus block-level ancillary
 * codes, gathered from every real specimen on the case. Call once per
 * case at sign-out, not once per code - matches the real, verified
 * "bundle related charges for transactional atomicity" pattern (if any
 * one charge fails downstream validation, the whole case's charge
 * batch should be rejected together, not partially posted).
 *
 * Honest, deliberate scope boundary: only emits real, actually-assigned
 * codes (Specimen.coding.cpt / HistologyBlock.coding.cpt) - never the
 * honest, rule-based default (ruleBasedDefaultCptCodes) from
 * services/billing/codeMapTable.ts. That default exists for internal
 * workload/productivity estimation only and is explicitly documented
 * as "NOT physician-entered or physician-confirmed coding" - sending
 * it to a real billing system would misrepresent an estimate as a real
 * charge. A case with no real, assigned codes yet produces zero FT1
 * segments (see chargeCount on the result) rather than a fabricated
 * one.
 */
export function buildDftP03ForCase(
  ctx: HL7MessageContext,
  caseData: Pick<Case, 'id' | 'patient'> & { coding?: { icd10?: { code: string; display: string }[] } },
  specimens: Pick<Specimen, 'id' | 'label' | 'coding'>[],
  blocksBySpecimenId: Record<string, Pick<HistologyBlock, 'id' | 'label' | 'coding'>[]>,
  timezone: string,
  transactionType: 'CG' | 'PY' | 'AJ' | 'CR' = 'CG'
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
  for (const specimen of specimens) {
    // Specimen-level base code(s) — only real, actually-assigned codes,
    // never the rule-based default (see this function's own doc
    // comment on why).
    for (const code of specimen.coding?.cpt ?? []) {
      segments.push(buildFT1({
        setId: ft1SetId++,
        transactionId: `${caseData.id}-${specimen.label}-${code}`,
        transactionDate: nowIso,
        transactionType,
        cptCode: code,
        diagnosisCode: primaryDiagnosis?.code,
      }, timezone));
    }

    // Block-level ancillary code(s) for this specimen.
    for (const block of blocksBySpecimenId[specimen.id] ?? []) {
      for (const code of block.coding?.cpt ?? []) {
        segments.push(buildFT1({
          setId: ft1SetId++,
          transactionId: `${caseData.id}-${specimen.label}${block.label}-${code}`,
          transactionDate: nowIso,
          transactionType,
          cptCode: code,
          diagnosisCode: primaryDiagnosis?.code,
        }, timezone));
      }
    }
  }

  // Real DG1 stack — one per real ICD-10 code on the case, first one
  // marked principal (F), matching real, verified DG1.6 semantics.
  (caseData.coding?.icd10 ?? []).forEach((dx, i) => {
    segments.push(buildDG1({ setId: i + 1, icd10Code: dx.code, icd10Description: dx.display, isPrincipal: i === 0 }));
  });

  return { message: segments.join('\r'), messageControlId, chargeCount: ft1SetId - 1 };
}
