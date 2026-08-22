// src/utils/computeDraftDiff.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "I thought we were display the
// changes that would be applied to the case." Confirmed directly:
// DraftRecoveryModal.tsx's own header comment already documented this
// as a known, deliberate Phase 1 simplification — "the diff UI is a
// real, worthwhile upgrade for later, not dropped, just sequenced
// after the simpler version is proven." This is that upgrade.
//
// A genuinely full, deep, recursive diff of the entire cached Case
// object would be noisy and unreadable for a pathologist deciding
// whether to restore — most of Case's own ~60 top-level fields are
// metadata (version, updatedAt, lastUpdatedFromStation, etc.) that
// always differ between two saves regardless of anything a person
// actually edited. This is a real, deliberately shallow, top-level
// diff instead: compares each meaningful field for actual content
// difference, skips known noise fields entirely, and gives a few key
// fields (specimens, synoptic answers, comments) a real, specific
// summary rather than a generic "changed."
// ─────────────────────────────────────────────────────────────────────────────

// Fields that legitimately, always differ between the cached draft and
// the current case regardless of any real, human edit — comparing
// these would produce false-positive "changes" on every single
// restore prompt, drowning out the real ones.
// Real, additional fields found via live testing, not assumed: a
// genuine restore prompt showed "First Opened At" as a "change" even
// though nothing was actually edited — traced to Case.firstOpenedAt's
// own doc comment (system-set, TAT-calculation metadata, idempotent
// but genuinely absent on an older cached draft taken before it was
// ever set) — the same real reasoning applies to grossCompletedAt,
// documented right alongside it as the same kind of field.
const NOISE_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt', 'version', 'lastUpdatedFromStation',
  'lastAccessedAt', 'lastAccessedBy', 'firstOpenedAt', 'grossCompletedAt',
]);

// Real, human-readable labels for fields a pathologist would
// recognize — anything not listed here falls back to a
// title-cased version of its own field name.
const FIELD_LABELS: Record<string, string> = {
  specimens: 'Specimen data',
  synopticReports: 'Synoptic report answers',
  grossingReports: 'Grossing report answers',
  __orchSectionsDraft: 'Report narrative sections',
  order: 'Case comments/order info',
  priority: 'Priority',
  status: 'Case status',
  flags: 'Flags',
  participants: 'Care team',
};

export interface DraftDiffEntry {
  field: string;
  label: string;
  summary: string;
}

/** Real, specific summaries for a few fields worth being precise
 *  about, rather than a generic "N items differ" for everything. */
function summarizeField(field: string, oldVal: unknown, newVal: unknown): string {
  if (field === 'specimens' && Array.isArray(oldVal) && Array.isArray(newVal)) {
    const oldLabels = new Set((oldVal as any[]).map(s => s?.label));
    const newLabels = new Set((newVal as any[]).map(s => s?.label));
    const changedCount = (newVal as any[]).filter(s => JSON.stringify(s) !== JSON.stringify((oldVal as any[]).find(o => o?.label === s?.label))).length;
    if (newLabels.size !== oldLabels.size) return `${newVal.length} specimen(s) in the draft (was ${oldVal.length})`;
    return `${changedCount} specimen${changedCount === 1 ? '' : 's'} with edited content`;
  }
  if (field === 'order' && oldVal && newVal && typeof oldVal === 'object' && typeof newVal === 'object') {
    const oldComments = (oldVal as any).caseComments?.length ?? 0;
    const newComments = (newVal as any).caseComments?.length ?? 0;
    if (newComments !== oldComments) return `${newComments} case comment(s) in the draft (was ${oldComments})`;
    return 'Case-level order info edited';
  }
  if (field === '__orchSectionsDraft' && Array.isArray(newVal)) {
    return `${newVal.length} section(s) in the draft`;
  }
  if (field === 'priority') return `Changed to "${newVal}"`;
  if (field === 'status') return `Changed to "${newVal}"`;
  return 'Edited in the draft';
}

/** Real, top-level, shallow diff between the currently-loaded case
 *  data and a cached draft payload — see this file's own header
 *  comment for why shallow-and-curated beats deep-and-complete here. */
export function computeDraftDiff(current: Record<string, unknown> | null, draft: Record<string, unknown> | null): DraftDiffEntry[] {
  if (!current || !draft) return [];
  const entries: DraftDiffEntry[] = [];
  const keys = new Set([...Object.keys(current), ...Object.keys(draft)]);

  for (const key of keys) {
    if (NOISE_FIELDS.has(key)) continue;
    const oldVal = current[key];
    const newVal = draft[key];
    // Cheap, real deep-equality check via serialization — the Case
    // slice being compared is already known-JSON-safe (it's exactly
    // what useDraftCache itself just serialized to persist it).
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    entries.push({
      field: key,
      label: FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
      summary: summarizeField(key, oldVal, newVal),
    });
  }
  return entries;
}
