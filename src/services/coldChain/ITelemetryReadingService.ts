// src/services/coldChain/ITelemetryReadingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
// Laboratory Sensor & Cold-Chain Integration gap: "Direct ingestion of
// telemetry data (temperature, humidity, GPS) from smart transport
// containers and storage equipment via IoT/MQTT/REST APIs." One real,
// shared reading shape covering both real asset types this gap names
// — a smart HardwareContainer or a fixed StorageUnit — rather than
// two, near-duplicate reading types.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export type MonitoredAssetType = 'hardware_container' | 'storage_unit';

export interface TelemetryReading {
  id: string;
  assetType: MonitoredAssetType;
  assetId: string;
  temperatureCelsius?: number;
  humidityPercent?: number;
  gpsLat?: number;
  gpsLng?: number;
  recordedAt: string;
  /** Set by resolveColdChainExcursion.ts at ingest time — never
   *  recomputed later, so a reading's own real, historical excursion
   *  status stays honest even if a StorageConditionType's own
   *  threshold is later edited. */
  isExcursion: boolean;
}

export interface ITelemetryReadingService {
  getAll(): Promise<ServiceResult<TelemetryReading[]>>;
  getByAsset(assetType: MonitoredAssetType, assetId: string): Promise<ServiceResult<TelemetryReading[]>>;
  getExcursions(): Promise<ServiceResult<TelemetryReading[]>>;
  record(reading: Omit<TelemetryReading, 'id' | 'isExcursion'>): Promise<ServiceResult<TelemetryReading>>;
}
