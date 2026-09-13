// src/services/coldChain/mockTelemetryReadingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working implementation of ITelemetryReadingService. Resolves
// the real, assigned StorageConditionType for whichever real asset a
// reading is FOR (a HardwareContainer or a StorageUnit) and calls
// resolveColdChainExcursion.ts's own real, pure logic — never
// duplicates that logic here.
// ─────────────────────────────────────────────────────────────────────────────

import type { ITelemetryReadingService, TelemetryReading, MonitoredAssetType } from './ITelemetryReadingService';
import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { resolveColdChainExcursion } from './resolveColdChainExcursion';
import { mockStorageConditionTypeService } from './mockStorageConditionTypeService';
import { mockHardwareContainerRegistryService } from '../hardwareContainers/mockHardwareContainerRegistryService';
import { mockStorageUnitService } from './mockStorageUnitService';

const STORAGE_KEY = 'telemetryReadings';

const load = (): TelemetryReading[] => storageGet(STORAGE_KEY, []);
const persist = (data: TelemetryReading[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(res => setTimeout(res, 30));

async function resolveAssetStorageConditionTypeId(assetType: MonitoredAssetType, assetId: string): Promise<string | undefined> {
  if (assetType === 'hardware_container') {
    const res = await mockHardwareContainerRegistryService.getById(assetId);
    return res.ok ? res.data.storageConditionTypeId : undefined;
  }
  const res = await mockStorageUnitService.getById(assetId);
  return res.ok ? res.data.storageConditionTypeId : undefined;
}

export const mockTelemetryReadingService: ITelemetryReadingService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByAsset(assetType: MonitoredAssetType, assetId: string) {
    await delay();
    return ok(load().filter(r => r.assetType === assetType && r.assetId === assetId));
  },

  async getExcursions() {
    await delay();
    return ok(load().filter(r => r.isExcursion));
  },

  async record(reading) {
    await delay();
    const conditionTypeId = await resolveAssetStorageConditionTypeId(reading.assetType, reading.assetId);
    const conditionType = conditionTypeId ? (await mockStorageConditionTypeService.getById(conditionTypeId)) : null;
    const isExcursion = resolveColdChainExcursion(
      reading.temperatureCelsius,
      conditionType && conditionType.ok ? conditionType.data : undefined,
    );
    const created: TelemetryReading = { ...reading, id: crypto.randomUUID(), isExcursion };
    persist([...load(), created]);
    return ok(created);
  },
};
