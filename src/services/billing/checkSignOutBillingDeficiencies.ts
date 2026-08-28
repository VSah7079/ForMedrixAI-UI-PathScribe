// src/services/billing/checkSignOutBillingDeficiencies.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("alert the Pathologist with a warning
// message, but not block. Those cases would be routed to QA"): the
// real detection logic run at sign-out. A pure function, same
// established pattern as checkNcciBundling/computeStainCodingStatus -
// takes real, already-resolved data in, returns real findings out,
// never calls a service or touches storage itself. The caller
// (useSignOutWorkflow.ts) is responsible for actually raising each
// finding as a real BillingDeficiencyRecord, and for never blocking
// finalizeCase() on the result.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import type { NcciPtpEditPair } from '@/types/billing/NcciPtpEdit';
import type { BillingDeficiencyType } from '@/types/billing/BillingDeficiencyRecord';
import { checkNcciBundling } from './ncciEditUtils';

/** Real, verified series (codeMapTable.ts's own header: "full six-code
 *  series, confirmed consistently: I-88300, II-88302, III-88304,
 *  IV-88305, V-88307, VI-88309") - the only real, programmatic
 *  ordering this check needs; Trigger A only asks "did the pathologist
 *  bill higher than the specimen type's own configured default,"
 *  never a confident clinical judgment about which level is correct. */
const SPECIMEN_LEVEL_ORDER = ['88300', '88302', '88304', '88305', '88307', '88309'];

export interface SignOutBillingFinding {
  deficiencyType: BillingDeficiencyType;
  chargeRecordId?: string;
  specimenId?: string;
  auditorNotes: string;
}

interface SpecimenForCheck {
  id: string;
  label: string;
  specimenDictionaryEntryId?: string;
  /** Real Specimen.coding.icd10 (presence-only needed here) - the
   *  per-specimen ICD-10 override. Real, per direct guidance: falls
   *  back to the case-wide caseIcd10Codes parameter below when a
   *  specimen has none of its own, matching every other real
   *  charge-building path's own established fallback (Specimen.ts's
   *  own doc comment on coding.icd10). */
  icd10?: { code: string }[];
}

interface DictionaryEntryForCheck {
  id: string;
  defaultBaseCptCode?: string;
}

/** Real, minimal shape needed for Trigger D (UNATTACHED_ANCILLARY_ORDER)
 *  - a block's own lisRequestStatus and its stains' own, same real
 *  field (HistologyBlock.lisRequestStatus / StainOrder.lisRequestStatus).
 *  Real, disclosed limitation: ServiceChargeRecord has no stainOrderId
 *  linking a specific 'stain'-level charge to one specific StainOrder
 *  within a block (only blockId) - this check is honestly block-level,
 *  not exact-stain-level, and only ever fires on real, positive
 *  evidence (an explicit 'pending'/'rejected' status somewhere on the
 *  block), never on the mere absence of a resolvable block. */
interface BlockForCheck {
  id: string;
  lisRequestStatus?: 'pending' | 'confirmed' | 'rejected';
  stains: { lisRequestStatus?: 'pending' | 'confirmed' | 'rejected' }[];
}

/** Real, deterministic convention this app already enforces at
 *  resolution time (resolveServiceCharge.ts's own header: "TC always
 *  takes -TC, 26 always takes -26, Global takes neither") - Trigger E
 *  (MODIFIER_MISMATCH) checks every real, active charge against this
 *  same rule, catching drift from a manually-added code, a legacy
 *  record predating the deterministic assignment, or a post-signout
 *  correction that changed billingType-relevant fields without
 *  updating modifier to match. */
function expectedModifierForBillingType(billingType: ServiceChargeRecord['billingType']): string | undefined {
  if (billingType === 'TC') return '-TC';
  if (billingType === '26') return '-26';
  return undefined; // Global - no modifier
}

/** Real, per direct guidance: Trigger A ("Skin Biopsy" billed at
 *  88307 when the specimen's own dictionary default is 88305"),
 *  Trigger B (NCCI bundling), Trigger C (MISSING_DIAGNOSTIC_ICD10),
 *  Trigger D (UNATTACHED_ANCILLARY_ORDER), Trigger E
 *  (MODIFIER_MISMATCH), and Trigger F (ZERO_FEE_MAPPING_ERROR) all run
 *  here, against the case's real, net-active (non-reversed) charges
 *  only - a credited/removed code was never really billed, and should
 *  never trigger a finding. caseIcd10Codes and blocksById are both
 *  optional, defaulting to empty - a caller that genuinely has no
 *  case-wide ICD-10 or block context yet (e.g. an existing, narrower
 *  test) sees exactly the same behavior it always has for A/B, and
 *  Trigger C/D simply find nothing to flag rather than fabricating a
 *  finding from absent context. */
export function checkSignOutBillingDeficiencies(
  allCharges: ServiceChargeRecord[],
  specimens: SpecimenForCheck[],
  dictionaryEntries: DictionaryEntryForCheck[],
  ncciPairs: NcciPtpEditPair[],
  caseIcd10Codes: { code: string }[] = [],
  blocksById: Map<string, BlockForCheck> = new Map()
): SignOutBillingFinding[] {
  const findings: SignOutBillingFinding[] = [];

  // Real, net-active charges only - a 'charge' whose id is not
  // referenced by any later 'credit' in the same real ledger. Matches
  // resolveServiceCharge.ts/reverseServiceCharge.ts's own real
  // reversesTransactionId linkage - never a separate, second
  // definition of "still active."
  const reversedIds = new Set(
    allCharges.filter(c => c.transactionType === 'credit' && c.reversesTransactionId).map(c => c.reversesTransactionId!)
  );
  const activeCharges = allCharges.filter(c => c.transactionType === 'charge' && !reversedIds.has(c.id));

  const chargesBySpecimen = new Map<string, ServiceChargeRecord[]>();
  activeCharges.forEach(c => {
    if (!c.specimenId) return;
    if (!chargesBySpecimen.has(c.specimenId)) chargesBySpecimen.set(c.specimenId, []);
    chargesBySpecimen.get(c.specimenId)!.push(c);
  });

  const dictById = new Map(dictionaryEntries.map(e => [e.id, e]));

  for (const specimen of specimens) {
    const specCharges = chargesBySpecimen.get(specimen.id) ?? [];
    if (specCharges.length === 0) continue;
    const codes = specCharges.map(c => c.cptCode);

    // ── Trigger A: UNSUPPORTED_CPT_LEVEL ────────────────────────────
    const dictEntry = specimen.specimenDictionaryEntryId ? dictById.get(specimen.specimenDictionaryEntryId) : undefined;
    const defaultCode = dictEntry?.defaultBaseCptCode;
    if (defaultCode && SPECIMEN_LEVEL_ORDER.includes(defaultCode)) {
      const defaultIdx = SPECIMEN_LEVEL_ORDER.indexOf(defaultCode);
      // Highest real specimen-level code actually billed on this specimen.
      const billedLevelCodes = specCharges.filter(c => c.level === 'specimen' && SPECIMEN_LEVEL_ORDER.includes(c.cptCode));
      const highestBilled = billedLevelCodes.reduce<{ code: string; idx: number; chargeId: string } | null>((acc, c) => {
        const idx = SPECIMEN_LEVEL_ORDER.indexOf(c.cptCode);
        return !acc || idx > acc.idx ? { code: c.cptCode, idx, chargeId: c.id } : acc;
      }, null);
      if (highestBilled && highestBilled.idx > defaultIdx) {
        findings.push({
          deficiencyType: 'UNSUPPORTED_CPT_LEVEL',
          chargeRecordId: highestBilled.chargeId,
          specimenId: specimen.id,
          auditorNotes: `Specimen ${specimen.label}: ${highestBilled.code} billed; this specimen type's own configured default is ${defaultCode}. May be a real, legitimate higher-complexity case — routed to QA for review, not blocked.`,
        });
      }
    }

    // ── Trigger B: NCCI_BUNDLING_VIOLATION ──────────────────────────
    const violations = checkNcciBundling(codes, ncciPairs);
    for (const v of violations) {
      const chargeForColOne = specCharges.find(c => c.cptCode === v.columnOneCode);
      findings.push({
        deficiencyType: 'NCCI_BUNDLING_VIOLATION',
        chargeRecordId: chargeForColOne?.id,
        specimenId: specimen.id,
        auditorNotes: `Specimen ${specimen.label}: ${v.columnOneCode} and ${v.columnTwoCode} billed together — a real, never-bypassable NCCI PTP conflict (modifier indicator 0).`,
      });
    }

    // ── Trigger C: MISSING_DIAGNOSTIC_ICD10 ─────────────────────────
    // Real, same fallback this app already established everywhere else
    // an ICD-10 is resolved (Specimen.ts's own doc comment): a
    // specimen's own coding.icd10 first, then the case-wide
    // Order.icd10Codes. Same real check validateChargeMetadata.ts
    // already runs at DISPATCH time - this is that same real gap,
    // surfaced earlier, at sign-out, so the pathologist sees it before
    // it ever reaches the outbound queue. Case-wide by nature (per
    // BillingDeficiencyRecord.chargeRecordId's own doc comment on this
    // exact scenario) - one finding per specimen, chargeRecordId left
    // undefined, never pinned to one arbitrary charge line among several.
    const resolvedIcd10 = (specimen.icd10 && specimen.icd10.length > 0) ? specimen.icd10 : caseIcd10Codes;
    if (resolvedIcd10.length === 0) {
      findings.push({
        deficiencyType: 'MISSING_DIAGNOSTIC_ICD10',
        specimenId: specimen.id,
        auditorNotes: `Specimen ${specimen.label}: ${codes.join(', ')} billed with no cross-mapped ICD-10 — neither this specimen nor the case's own order carries a diagnostic code.`,
      });
    }

    // ── Trigger D: UNATTACHED_ANCILLARY_ORDER ───────────────────────
    // Real, per this file's own BlockForCheck doc comment: only ever
    // fires on real, positive evidence (an explicit 'pending' or
    // 'rejected' lisRequestStatus somewhere on the resolved block),
    // never on a charge with no resolvable blockId/block context -
    // absence of data is not evidence of a gap.
    const stainCharges = specCharges.filter(c => c.level === 'stain' && c.blockId);
    for (const c of stainCharges) {
      const block = blocksById.get(c.blockId!);
      if (!block) continue;
      const blockUnconfirmed = block.lisRequestStatus === 'pending' || block.lisRequestStatus === 'rejected';
      const anyStainUnconfirmed = block.stains.some(s => s.lisRequestStatus === 'pending' || s.lisRequestStatus === 'rejected');
      if (blockUnconfirmed || anyStainUnconfirmed) {
        const status = block.lisRequestStatus ?? block.stains.find(s => s.lisRequestStatus === 'pending' || s.lisRequestStatus === 'rejected')?.lisRequestStatus;
        findings.push({
          deficiencyType: 'UNATTACHED_ANCILLARY_ORDER',
          chargeRecordId: c.id,
          specimenId: specimen.id,
          auditorNotes: `Specimen ${specimen.label}: ${c.cptCode} (${c.billingCode}) billed for a stain whose order/sign-off status is "${status}" — not a real, confirmed order.`,
        });
      }
    }

    // ── Trigger E: MODIFIER_MISMATCH ────────────────────────────────
    for (const c of specCharges) {
      const expected = expectedModifierForBillingType(c.billingType);
      if (c.modifier !== expected) {
        findings.push({
          deficiencyType: 'MODIFIER_MISMATCH',
          chargeRecordId: c.id,
          specimenId: specimen.id,
          auditorNotes: `Specimen ${specimen.label}: ${c.cptCode} (${c.billingType} component) carries modifier "${c.modifier ?? 'none'}" — expected "${expected ?? 'none'}".`,
        });
      }
    }

    // ── Trigger F: ZERO_FEE_MAPPING_ERROR ────────────────────────────
    // Real, deliberate reuse of suppressionAdvisory
    // (ServiceChargeRecord.ts's own field, carried through from
    // BillingRuleVersion) as the "explicit override" this deficiency
    // type's own definition requires - that field's whole documented
    // purpose is "a real, local reason a charge might not actually be
    // separately billable," which is exactly what an explicit
    // zero-fee override means. No new field invented for this.
    for (const c of specCharges) {
      const isZeroFee = (c.rvuWork ?? 0) === 0 && (c.rvuPe ?? 0) === 0 && (c.rvuMp ?? 0) === 0;
      if (isZeroFee && !c.suppressionAdvisory) {
        findings.push({
          deficiencyType: 'ZERO_FEE_MAPPING_ERROR',
          chargeRecordId: c.id,
          specimenId: specimen.id,
          auditorNotes: `Specimen ${specimen.label}: ${c.cptCode} (${c.billingCode}) resolved with $0.00 RVU across work/PE/MP and no suppressionAdvisory on record — likely a fee-schedule mapping gap, not a deliberate zero-fee code.`,
        });
      }
    }
  }

  return findings;
}
