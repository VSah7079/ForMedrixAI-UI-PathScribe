#!/usr/bin/env node
/**
 * scripts/tag-phi.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans PathScribe source files for PHI/PII field references and either:
 *   --audit   (default) — reports every match, no files changed
 *   --write             — auto-inserts data-phi attributes into JSX elements
 *
 * Usage:
 *   node scripts/tag-phi.mjs            ← audit mode (safe, read-only)
 *   node scripts/tag-phi.mjs --write    ← auto-tag mode (modifies files)
 *   node scripts/tag-phi.mjs --write --dry-run  ← shows diffs, no writes
 *
 * What it detects:
 *   JSX expressions like {patient.name}, {mrn}, {accessionNumber} etc.
 *   wrapped in inline elements: <span>, <td>, <div>, <p>, <label>, <strong>
 *
 * What it tags:
 *   Adds data-phi="[type]" to the wrapping element, e.g.:
 *     <span>{patient.name}</span>
 *     → <span data-phi="name">{patient.name}</span>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs   from 'fs';
import path from 'path';

const WRITE   = process.argv.includes('--write');
const DRY_RUN = process.argv.includes('--dry-run');
const SRC_DIR = path.resolve('./src');

// ─── PHI pattern registry ─────────────────────────────────────────────────────
// Each entry: { pattern: RegExp, type: string, description: string }
// Pattern matches the JSX expression content inside { }

const PHI_PATTERNS = [
  // ── Patient identity ──
  { type: 'name',       description: 'Patient name',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:name|fullName|firstName|lastName|givenName|familySurname|patientName)\b/i },
  { type: 'name',       description: 'Direct name variable',
    pattern: /\b(?:patientName|fullName|firstName|lastName)\b(?!\s*[:=])/i },
  { type: 'dob',        description: 'Date of birth',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:dob|dateOfBirth|birthDate|born)\b/i },
  { type: 'dob',        description: 'DOB variable',
    pattern: /\b(?:dob|dateOfBirth|birthDate)\b(?!\s*[:=])/i },
  { type: 'mrn',        description: 'Medical record number',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:mrn|medicalRecordNumber|patientId|pid)\b/i },
  { type: 'mrn',        description: 'MRN variable',
    pattern: /\b(?:mrn|medicalRecordNumber)\b(?!\s*[:=])/i },
  { type: 'nhs',        description: 'NHS number',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:nhsNumber|nhs|nhsNo)\b/i },
  { type: 'nhs',        description: 'NHS number variable',
    pattern: /\b(?:nhsNumber|nhsNo)\b(?!\s*[:=])/i },

  // ── Case / accession ──
  { type: 'accession',  description: 'Accession number',
    pattern: /\b(?:case|c|report|r)\s*(?:\?|\!)?\s*\.\s*(?:accession|accessionNumber|accessionNo|caseId|caseNumber)\b/i },
  { type: 'accession',  description: 'Accession variable',
    pattern: /\b(?:accessionNumber|accessionNo|accession)\b(?!\s*[:=])/i },

  // ── Contact / address ──
  { type: 'address',    description: 'Address',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:address|street|city|postcode|zipCode|zip)\b/i },
  { type: 'phone',      description: 'Phone number',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:phone|phoneNumber|mobile|telephone|tel)\b/i },
  { type: 'email',      description: 'Email address',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:email|emailAddress)\b/i },

  // ── Clinical identifiers ──
  { type: 'diagnosis',  description: 'Diagnosis / clinical finding',
    pattern: /\b(?:case|report|synoptic)\s*(?:\?|\!)?\s*\.\s*(?:diagnosis|primaryDiagnosis|finding|clinicalHistory)\b/i },
  { type: 'insurance',  description: 'Insurance / payer info',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:insurance|insurer|policyNumber|payerId)\b/i },

  // ── Referring / ordering ──
  // Deliberately NOT a pattern here. Direct decision on PS-72's scope:
  // staff/physician names (Requesting Provider, Assign to Pathologist,
  // referring/ordering physician, "created by"/"assigned by" fields, etc.)
  // are staff identity data, not patient PHI — GDPR Special Category Data
  // doesn't cover them, and they're the wrong tool for the job anyway:
  // staff-name protection belongs to RBAC and data minimization (who can
  // see which staff names in the UI at all), not a screenshot-redaction
  // overlay built for patient identifiers. A `referringPhysician` /
  // `orderingPhysician` / `requestingClinician` pattern used to live here
  // and got removed for this reason — don't re-add it without checking
  // with Pete first, since this is a deliberate, direct scope call, not
  // an oversight.

  // ── Age (quasi-identifier) ──
  { type: 'dob',        description: 'Patient age',
    pattern: /\b(?:patient|p)\s*(?:\?|\!)?\s*\.\s*(?:age)\b/i },
];

// JSX inline elements worth tagging
const INLINE_ELEMENTS = ['span', 'td', 'th', 'p', 'div', 'label', 'strong', 'em', 'b', 'li', 'h1', 'h2', 'h3', 'h4'];
// Real bug found and fixed: the closing-tag half of this regex used to be
// <\/(?:span|td|div|...)> — matching ANY inline element name, not
// specifically the one that opened. That let e.g. <span>{x}</div> satisfy
// the whole pattern whenever the real, unrelated </div> for some OUTER
// element happened to appear right after the expression — silently
// consuming and discarding that real closing tag on write, corrupting
// valid JSX. Fixed with a backreference (\1) so the closing tag must be
// the exact same element that opened, not just any element in the list.
const INLINE_RE = new RegExp(
  `<(${INLINE_ELEMENTS.join('|')})(\\s[^>]*)?>\\s*\\{([^}]+)\\}\\s*<\\/\\1>`,
  'g'
);

// ─── File scanner ─────────────────────────────────────────────────────────────

function getAllTsxFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getAllTsxFiles(full));
    else if (entry.name.endsWith('.tsx')) results.push(full);
  }
  return results;
}

function detectPhiInExpression(expr) {
  for (const { type, description, pattern } of PHI_PATTERNS) {
    if (pattern.test(expr)) return { type, description };
  }
  return null;
}

function scanFile(filePath) {
  const src      = fs.readFileSync(filePath, 'utf8');
  const lines    = src.split('\n');
  const findings = [];

  lines.forEach((line, i) => {
    // Look for JSX expressions: {somePhiExpression}
    const exprMatches = [...line.matchAll(/\{([^{}]+)\}/g)];
    for (const match of exprMatches) {
      const expr = match[1].trim();
      const hit  = detectPhiInExpression(expr);
      if (hit) {
        // Check if already tagged
        const alreadyTagged = line.includes('data-phi') || line.includes('data-pii');
        findings.push({
          line:         i + 1,
          col:          match.index + 1,
          expr,
          type:         hit.type,
          description:  hit.description,
          lineText:     line.trimEnd(),
          alreadyTagged,
        });
      }
    }
  });

  return { filePath, findings };
}

// ─── Auto-tagger ──────────────────────────────────────────────────────────────

function tagFile(filePath) {
  let src     = fs.readFileSync(filePath, 'utf8');
  let changed = 0;

  src = src.replace(INLINE_RE, (match, tag, attrs, expr) => {
    // Skip if already has data-phi/data-pii
    if (attrs && (attrs.includes('data-phi') || attrs.includes('data-pii'))) return match;

    const hit = detectPhiInExpression(expr.trim());
    if (!hit) return match;

    const newAttrs = (attrs ?? '') + ` data-phi="${hit.type}"`;
    changed++;
    return `<${tag}${newAttrs}>{${expr}}</${tag}>`;
  });

  return { src, changed };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const files   = getAllTsxFiles(SRC_DIR);
let totalHits = 0;
let totalTagged = 0;
const report  = [];

console.log(`\n🔍 PathScribe PHI Scanner`);
console.log(`   Mode: ${WRITE ? (DRY_RUN ? 'dry-run' : 'write') : 'audit'}`);
console.log(`   Scanning ${files.length} .tsx files in src/\n`);
console.log('─'.repeat(80));

for (const file of files) {
  const { filePath, findings } = scanFile(file);
  const untagged = findings.filter(f => !f.alreadyTagged);

  if (findings.length === 0) continue;

  const rel = path.relative(process.cwd(), filePath);
  console.log(`\n📄 ${rel}`);

  for (const f of findings) {
    const status = f.alreadyTagged ? '✅ already tagged' : '⚠️  needs tag';
    console.log(`   ${status}  line ${String(f.line).padEnd(4)} [${f.type.padEnd(10)}] ${f.description}`);
    console.log(`              ${f.lineText.trim().slice(0, 80)}`);
    totalHits++;
  }

  report.push({ file: rel, total: findings.length, untagged: untagged.length });

  // Auto-tag if --write
  if (WRITE && untagged.length > 0) {
    const { src, changed } = tagFile(filePath);
    if (changed > 0) {
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, src, 'utf8');
        console.log(`   ✏️  Tagged ${changed} element(s) — file updated`);
      } else {
        console.log(`   ✏️  Would tag ${changed} element(s) — dry run, no write`);
      }
      totalTagged += changed;
    }
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(80));
console.log(`\n📊 Summary`);
console.log(`   Files with PHI:     ${report.length}`);
console.log(`   Total PHI hits:     ${totalHits}`);
console.log(`   Already tagged:     ${totalHits - report.reduce((n, r) => n + r.untagged, 0)}`);
console.log(`   Needs tagging:      ${report.reduce((n, r) => n + r.untagged, 0)}`);
if (WRITE && !DRY_RUN) {
  console.log(`   Auto-tagged:        ${totalTagged} elements`);
}

if (!WRITE) {
  console.log(`\n💡 To auto-tag all findings, run:`);
  console.log(`   node scripts/tag-phi.mjs --write --dry-run   ← preview changes`);
  console.log(`   node scripts/tag-phi.mjs --write             ← apply changes`);
}

console.log('');
