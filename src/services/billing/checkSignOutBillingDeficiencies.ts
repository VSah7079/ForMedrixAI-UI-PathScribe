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
}

interface DictionaryEntryForCheck {
  id: string;
  defaultBaseCptCode?: string;
}

/** Real, per direct guidance: Trigger A ("Skin Biopsy" billed at
 *  88307 when the specimen's own dictionary default is 88305") and
 *  Trigger B (NCCI bundling) both run here, per specimen, against the
 *  case's real, net-active (non-reversed) charges only - a credited/
 *  removed code was never really billed, and should never trigger a
 *  finding. */
export function checkSignOutBillingDeficiencies(
  allCharges: ServiceChargeRecord[],
  specimens: SpecimenForCheck[],
  dictionaryEntries: DictionaryEntryForCheck[],
  ncciPairs: NcciPtpEditPair[]
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
  }

  return findings;
}
