// scripts/seedEngraverDevices.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own "Quick Win" request: populates
// engraver_devices with realistic-looking sample data so the Engraver
// Monitor page (src/pages/BatchManagement/EngraverMonitorPage.tsx) has
// something real to render during local visual verification
// (`vercel dev` / Vite), without needing a real Cassette Engine
// connected yet.
//
// Real, deliberate correction from how this was originally framed:
// this does NOT seed "multi-hopper states" — PathScribe's own
// confirmed architecture never models per-hopper detail at all (see
// EngraverStatusEventPayload.ts's own header). What's seeded here is
// realistic variety across the actual, coarse model that exists:
// every real `status` value, real `supplyWarnings` using real
// CassetteColorDefinition keys (mockCassetteColorService.ts), and a
// couple of real, free-text `warnings` for non-supply issues.
//
// Real, deliberate implementation choice: seeds via the actual
// upsertEngraverStatus() function, not a raw Firestore write — this
// guarantees the seeded documents have the exact real shape a genuine
// Engine event would produce (no risk of a hand-typed seed drifting
// from the real schema), and incidentally exercises that function for
// free.
//
// Real, deliberate safety guardrail: refuses to run unless
// FIRESTORE_EMULATOR_HOST is set, unless --force is passed explicitly.
// A seed script silently wiping/polluting a REAL, staging-or-worse
// engraver_devices collection because someone ran this with real
// FIREBASE_SERVICE_ACCOUNT_KEY credentials configured would be a real,
// avoidable mistake — this makes that require a deliberate, explicit
// second step instead of a plain accident.
//
// Usage:
//   $env:FIRESTORE_EMULATOR_HOST = "localhost:8080"
//   npm run seed:engravers
//
// Against a real, non-emulator project (rare, deliberate, real risk):
//   npm run seed:engravers -- --force
// ─────────────────────────────────────────────────────────────────────────────

import { upsertEngraverStatus } from '../api/webhooks/engine/_lib/upsertEngraverStatus';
import type { EngraverStatus, SupplyWarningCode } from '../src/types/events/EngraverStatusEventPayload';

const FORCE = process.argv.includes('--force');

if (!process.env.FIRESTORE_EMULATOR_HOST && !FORCE) {
  console.error(
    '\nRefusing to run: FIRESTORE_EMULATOR_HOST is not set, and --force was not passed.\n' +
    'This script is meant to seed a LOCAL emulator for visual dev testing, not a real ' +
    'project. If you genuinely want to seed a real, non-emulator Firestore project ' +
    '(rare — think carefully about which project FIREBASE_SERVICE_ACCOUNT_KEY points ' +
    'at first), re-run with --force.\n'
  );
  process.exit(1);
}

interface SeedDevice {
  deviceId: string;
  deviceName: string;
  locationLabel: string;
  status: EngraverStatus;
  supplyWarnings?: { code: SupplyWarningCode; colorKey?: string }[];
  warnings?: string[];
}

// Real, deliberate variety — every real status value at least once,
// both real warning shapes (supplyWarnings and free-text warnings)
// represented, and one device with multiple simultaneous supply
// warnings to exercise the UI's own list rendering.
const SEED_DEVICES: SeedDevice[] = [
  {
    deviceId: 'ENG-NY-04', deviceName: 'Grossing Bench 01', locationLabel: 'New York — Main Lab',
    status: 'online',
  },
  {
    deviceId: 'ENG-NY-05', deviceName: 'Grossing Bench 02', locationLabel: 'New York — Main Lab',
    status: 'engraving',
  },
  {
    deviceId: 'ENG-NY-06', deviceName: 'Grossing Bench 03', locationLabel: 'New York — Main Lab',
    status: 'warning',
    supplyWarnings: [
      { code: 'CASSETTE_SUPPLY_DEPLETED', colorKey: 'COLOR_CELLBLOCK' },
      { code: 'COLOR_UNAVAILABLE', colorKey: 'COLOR_STAT' },
    ],
  },
  {
    deviceId: 'ENG-BOS-01', deviceName: 'Grossing Bench A', locationLabel: 'Boston — Reference Lab',
    status: 'warning',
    supplyWarnings: [{ code: 'CASSETTE_SUPPLY_LOW', colorKey: 'COLOR_BIOPSY' }],
  },
  {
    deviceId: 'ENG-BOS-02', deviceName: 'Grossing Bench B', locationLabel: 'Boston — Reference Lab',
    status: 'fault',
    warnings: ['Cover Open'],
  },
  {
    deviceId: 'ENG-CHI-01', deviceName: 'Grossing Station 1', locationLabel: 'Chicago — Satellite Lab',
    status: 'offline',
    warnings: ['Firmware update required'],
  },
];

async function main() {
  console.log(`Seeding ${SEED_DEVICES.length} real, sample engraver devices into engraver_devices...\n`);

  for (const device of SEED_DEVICES) {
    const outcome = await upsertEngraverStatus({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      locationLabel: device.locationLabel,
      organisationId: 'ORG-SEED-DEMO',
      status: device.status,
      supplyWarnings: device.supplyWarnings,
      warnings: device.warnings,
      sourceSystem: 'seedEngraverDevices.ts (dev seed script)',
      // Real, deliberate "now" — always the newest possible timestamp,
      // so re-running this script always wins over whatever's there,
      // rather than risking a stale-ignored outcome against leftover
      // data from a previous, later-timestamped manual test.
      timestamp: new Date().toISOString(),
    });
    console.log(`  ${device.deviceId} (${device.status}) -> ${outcome}`);
  }

  console.log('\nDone. Open the Engraver Monitor page (Batch Management) to see these render.');
}

main().catch(err => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
