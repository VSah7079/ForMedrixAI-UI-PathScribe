#!/usr/bin/env ts-node
/**
 * seedTerminology.ts — scripts/seedTerminology.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deployment script that seeds pathscribe's clinical terminology dictionaries
 * into Firestore. Run once at institution setup, and again whenever a new
 * terminology edition is released.
 *
 * This script is idempotent — running it twice does not create duplicates.
 * Each code document is written by exact code ID using set() with merge:false,
 * so a re-run replaces stale records cleanly.
 *
 * Usage:
 *   npx ts-node scripts/seedTerminology.ts --jurisdiction US --env staging
 *   npx ts-node scripts/seedTerminology.ts --jurisdiction GB_SCT --env production
 *   npx ts-node scripts/seedTerminology.ts --jurisdiction IE --env production --confirm-license
 *   npx ts-node scripts/seedTerminology.ts --system ICD-O --jurisdiction US --env staging
 *   npx ts-node scripts/seedTerminology.ts --dry-run --jurisdiction CA --env staging
 *   npx ts-node scripts/seedTerminology.ts --list-versions --env production
 *
 * Flags:
 *   --jurisdiction   Required. One of: US | CA | GB_EW | GB_SCT | IE
 *   --env            Required. One of: development | staging | production
 *   --system         Optional. Seed only one system: SNOMED | ICD-10 | ICD-11 | ICD-O
 *   --dry-run        Preview what would be written without committing to Firestore
 *   --confirm-license  Required for IE jurisdiction (acknowledges Affiliate License)
 *   --list-versions  Print currently seeded versions across all systems and exit
 *
 * Source files (scripts/terminology-sources/):
 *   snomed-{jurisdiction}.json        SNOMED CT national release subset
 *   icd10-{jurisdiction}.json         ICD-10 jurisdiction variant
 *   icd11-all.json                    ICD-11 oncology subset (all jurisdictions)
 *   icdo-topography.json              ICD-O-3.2 topography (all jurisdictions)
 *   icdo-morphology.json              ICD-O-3.2 morphology (all jurisdictions)
 *
 * During development, source files are the mock seed data from mockCodeService.
 * Replace with official release files before seeding staging/production.
 *
 * ─── Firestore data model written by this script ─────────────────────────────
 *
 *   terminology/{system}_{jurisdiction}/codes/{codeId}
 *     code, display, system, subtype?, category?, jurisdiction, active, version
 *
 *   terminologyMeta/{system}_{jurisdiction}
 *     system, jurisdiction, version, codeCount, seededAt, seededBy,
 *     nextUpdateDue, notes?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Modular Admin SDK imports: firebase-admin 14 (PS-47, Batch 324) dropped the
// old namespaced API (admin.firestore(), admin.credential.cert()).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as fs      from 'fs';
import * as path    from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname (works regardless of package.json "type" setting)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Types ────────────────────────────────────────────────────────────────────

type Jurisdiction  = 'US' | 'CA' | 'GB_EW' | 'GB_SCT' | 'IE';
type CodeSystem    = 'SNOMED' | 'ICD-10' | 'ICD-11' | 'ICD-O';
type Env           = 'development' | 'staging' | 'production';
type IcdOSubtype   = 'topography' | 'morphology';

interface ClinicalCode {
  code:         string;
  display:      string;
  system:       CodeSystem;
  subtype?:     IcdOSubtype;
  category?:    string;
  jurisdiction: string;
  active:       boolean;
  version?:     string;
}

interface TerminologyMeta {
  system:        CodeSystem;
  jurisdiction:  string;
  version:       string;
  codeCount:     number;
  seededAt:      Timestamp;
  seededBy:      string;
  nextUpdateDue: string;
  notes?:        string;
}

// ─── Release schedule ─────────────────────────────────────────────────────────
// Used to populate nextUpdateDue in terminologyMeta

const NEXT_UPDATE: Record<string, string> = {
  'SNOMED_US':     'September 2025',
  'SNOMED_CA':     'October 2025',
  'SNOMED_GB_EW':  'October 2025',
  'SNOMED_GB_SCT': 'October 2025',
  'SNOMED_IE':     'September 2025',
  'ICD-10_US':     'October 2025',
  'ICD-10_CA':     'April 2026',
  'ICD-10_GB_EW':  'TBC',
  'ICD-10_GB_SCT': 'TBC',
  'ICD-10_IE':     'TBC',
  'ICD-11_ALL':    'January 2026',
  'ICD-O_ALL':     'Per edition (next TBC)',
};

// ─── Jurisdiction → source file mapping ──────────────────────────────────────

const SOURCES_DIR = path.join(__dirname, 'terminology-sources');

const sourceFile = (system: CodeSystem, jurisdiction: Jurisdiction): string => {
  switch (system) {
    case 'SNOMED':  return path.join(SOURCES_DIR, `snomed-${jurisdiction.toLowerCase()}.json`);
    case 'ICD-10':  return path.join(SOURCES_DIR, `icd10-${jurisdiction.toLowerCase()}.json`);
    case 'ICD-11':  return path.join(SOURCES_DIR, 'icd11-all.json');
    case 'ICD-O':   return path.join(SOURCES_DIR, 'icdo-all.json');
  }
};

const collectionKey = (system: CodeSystem, jurisdiction: Jurisdiction): string => {
  switch (system) {
    case 'ICD-11': return 'ICD-11_ALL';
    case 'ICD-O':  return 'ICD-O_ALL';
    default:       return `${system}_${jurisdiction}`;
  }
};

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg  = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
const hasFlag = (flag: string): boolean => args.includes(flag);

const jurisdiction      = getArg('--jurisdiction') as Jurisdiction | undefined;
const env               = (getArg('--env') ?? 'development') as Env;
const systemFilter      = getArg('--system') as CodeSystem | undefined;
const isDryRun          = hasFlag('--dry-run');
const isListVersions    = hasFlag('--list-versions');
const confirmLicense    = hasFlag('--confirm-license');

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_JURISDICTIONS: Jurisdiction[] = ['US', 'CA', 'GB_EW', 'GB_SCT', 'IE'];
const VALID_SYSTEMS: CodeSystem[]         = ['SNOMED', 'ICD-10', 'ICD-11', 'ICD-O'];
const VALID_ENVS: Env[]                   = ['development', 'staging', 'production'];

if (!isListVersions) {
  if (!jurisdiction || !VALID_JURISDICTIONS.includes(jurisdiction)) {
    console.error(`❌ --jurisdiction is required. Valid values: ${VALID_JURISDICTIONS.join(' | ')}`);
    process.exit(1);
  }
  if (!VALID_ENVS.includes(env)) {
    console.error(`❌ --env must be one of: ${VALID_ENVS.join(' | ')}`);
    process.exit(1);
  }
  if (systemFilter && !VALID_SYSTEMS.includes(systemFilter)) {
    console.error(`❌ --system must be one of: ${VALID_SYSTEMS.join(' | ')}`);
    process.exit(1);
  }
  // Ireland requires explicit license acknowledgement for production
  if (jurisdiction === 'IE' && env === 'production' && !confirmLicense) {
    console.error([
      '❌ Jurisdiction IE (Republic of Ireland) requires a SNOMED International',
      '   Affiliate License before seeding production data.',
      '',
      '   Register at: https://www.snomed.org/snomed-ct/get-snomed',
      '',
      '   Once your license is confirmed, re-run with --confirm-license to proceed.',
      '   Staging and development environments are not affected by this requirement.',
    ].join('\n'));
    process.exit(1);
  }
}

// ─── Firebase init ────────────────────────────────────────────────────────────

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ?? path.join(__dirname, `../service-accounts/${env}.json`);

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Service account not found at: ${serviceAccountPath}`);
  console.error('   Set GOOGLE_APPLICATION_CREDENTIALS or place the file at the expected path.');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccountPath),
});

const db = getFirestore();

// ─── List versions ────────────────────────────────────────────────────────────

async function listVersions(): Promise<void> {
  console.log('\n📋 Seeded terminology versions:\n');
  const snap = await db.collection('terminologyMeta').get();
  if (snap.empty) {
    console.log('  No terminology has been seeded yet.');
    return;
  }
  snap.docs.forEach(d => {
    const meta = d.data() as TerminologyMeta;
    const seededAt = meta.seededAt?.toDate().toLocaleDateString('en-GB') ?? 'unknown';
    console.log(`  ${d.id.padEnd(20)} v${meta.version.padEnd(35)} ${meta.codeCount} codes   seeded ${seededAt}`);
  });
  console.log();
}

// ─── Seed one system ──────────────────────────────────────────────────────────

async function seedSystem(
  system: CodeSystem,
  jurisdiction: Jurisdiction,
  dryRun: boolean,
): Promise<void> {
  const colKey  = collectionKey(system, jurisdiction);
  const srcPath = sourceFile(system, jurisdiction);

  console.log(`\n▶ ${system} (${colKey})`);

  if (!fs.existsSync(srcPath)) {
    console.warn(`  ⚠️  Source file not found: ${srcPath}`);
    console.warn('     Skipping. Add the official release file to scripts/terminology-sources/');
    return;
  }

  const raw: { codes: ClinicalCode[]; version: string; notes?: string } =
    JSON.parse(fs.readFileSync(srcPath, 'utf-8'));

  const { codes, version, notes } = raw;
  console.log(`  Source: ${srcPath}`);
  console.log(`  Version: ${version}`);
  console.log(`  Codes to write: ${codes.length}`);

  if (dryRun) {
    console.log('  [DRY RUN] No writes performed.');
    console.log(`  [DRY RUN] Would write ${codes.length} documents to terminology/${colKey}/codes/`);
    console.log(`  [DRY RUN] Would write terminologyMeta/${colKey}`);
    return;
  }

  // Batch write codes — Firestore batch limit is 500 operations
  const BATCH_SIZE = 499;
  let written = 0;

  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = codes.slice(i, i + BATCH_SIZE);

    chunk.forEach(code => {
      // Document ID: normalise code string (replace '/' with '_')
      const docId  = code.code.replace(/\//g, '_');
      const docRef = db.collection('terminology').doc(colKey).collection('codes').doc(docId);
      batch.set(docRef, {
        ...code,
        jurisdiction: jurisdiction === undefined ? 'ALL' : jurisdiction,
        version,
        active: code.active ?? true,
      });
    });

    await batch.commit();
    written += chunk.length;
    process.stdout.write(`  Writing... ${written}/${codes.length}\r`);
  }

  // Write metadata
  const meta: TerminologyMeta = {
    system,
    jurisdiction: ['ICD-11', 'ICD-O'].includes(system) ? 'ALL' : jurisdiction,
    version,
    codeCount:     codes.length,
    seededAt:      Timestamp.now(),
    seededBy:      `scripts/seedTerminology.ts — ${env}`,
    nextUpdateDue: NEXT_UPDATE[colKey] ?? 'TBC',
    ...(notes ? { notes } : {}),
  };

  await db.collection('terminologyMeta').doc(colKey).set(meta);

  console.log(`  ✅ ${codes.length} codes written to terminology/${colKey}/codes/`);
  console.log(`  ✅ Metadata written to terminologyMeta/${colKey}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('━'.repeat(60));
  console.log('  pathscribe Terminology Seed Script');
  console.log('━'.repeat(60));

  if (isListVersions) {
    await listVersions();
    process.exit(0);
  }

  console.log(`  Environment:  ${env}`);
  console.log(`  Jurisdiction: ${jurisdiction}`);
  console.log(`  Systems:      ${systemFilter ?? 'ALL'}`);
  if (isDryRun) console.log('  Mode:         DRY RUN — no writes will be performed');

  if (env === 'production' && !isDryRun) {
    console.log('\n⚠️  Writing to PRODUCTION Firestore.');
    console.log('   You have 5 seconds to cancel (Ctrl+C)...\n');
    await new Promise(r => setTimeout(r, 5000));
  }

  const systems: CodeSystem[] = systemFilter
    ? [systemFilter]
    : ['SNOMED', 'ICD-10', 'ICD-11', 'ICD-O'];

  for (const system of systems) {
    await seedSystem(system, jurisdiction!, isDryRun);
  }

  console.log('\n' + '━'.repeat(60));
  console.log(isDryRun
    ? '  DRY RUN complete. No data was written.'
    : '  Seeding complete.');
  console.log('━'.repeat(60) + '\n');
}

main().catch(e => {
  console.error('\n❌ Seed script failed:', e);
  process.exit(1);
});
