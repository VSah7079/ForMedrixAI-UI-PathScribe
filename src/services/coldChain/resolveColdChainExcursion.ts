// src/services/coldChain/resolveColdChainExcursion.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
// Laboratory Sensor & Cold-Chain Integration gap: "Automated Excursion
// Alerts... if transit temperature exceeds defined parameters." A
// real, pure, testable function — takes the reading and the real
// StorageConditionType directly, no lookups of its own, so it can be
// tested without any service/storage layer at all.
// ─────────────────────────────────────────────────────────────────────────────

import type { StorageConditionType } from './IStorageConditionTypeService';

export function resolveColdChainExcursion(
  temperatureCelsius: number | undefined,
  conditionType: StorageConditionType | undefined,
): boolean {
  // Real, honest default: a reading with no real temperature at all,
  // or an asset with no real, assigned condition type to check
  // against, can never be classified as an excursion — there is
  // nothing real to compare it against, and a fabricated "no
  // excursion" default is exactly as wrong as a fabricated "yes."
  // Both cases correctly return false here, but the real caller
  // (processInboundTelemetryReadingEvent.ts) treats "nothing to check
  // against" as its own, separate, honestly-surfaced condition rather
  // than silently trusting this function's own necessarily-limited
  // answer.
  if (temperatureCelsius === undefined || !conditionType) return false;

  if (temperatureCelsius > conditionType.maxTemperatureCelsius) return true;
  if (conditionType.minTemperatureCelsius !== undefined && temperatureCelsius < conditionType.minTemperatureCelsius) return true;
  return false;
}
