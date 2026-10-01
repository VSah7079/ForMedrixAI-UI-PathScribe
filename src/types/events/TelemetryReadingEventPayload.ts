// src/types/events/TelemetryReadingEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
// Laboratory Sensor & Cold-Chain Integration gap: "Direct ingestion
// of telemetry data (temperature, humidity, GPS)... via IoT/MQTT/REST
// APIs." Same real "PathScribe ingests its own specification; a real
// interface engine handles the actual IoT/MQTT/REST transport" split
// as every other inbound event in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { MonitoredAssetType } from '@/services/coldChain/ITelemetryReadingService';

export interface TelemetryReadingEventPayload {
  messageId: string;
  timestamp: string;
  assetType: MonitoredAssetType;
  assetId: string;
  temperatureCelsius?: number;
  humidityPercent?: number;
  gpsLat?: number;
  gpsLng?: number;
  recordedAt: string;
}
