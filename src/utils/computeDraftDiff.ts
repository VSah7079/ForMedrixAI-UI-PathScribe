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
//
// i18n note: this is a plain utility file, not a component, so it has
// no `useTranslation()` of its own — it returns translation KEYS (and,
// for summaries, interpolation params) rather than pre-rendered
// English text, and DraftRecoveryModal.tsx (the actual consumer) does
// the `t()` resolution at render time. `labelFallback` (a title-cased
// version of a field name PathScribe doesn't have a known label for
// yet) is a derived-from-a-schema-identifier fallback, not authored
// UI copy, so it stays untranslated; `priority`/`status`'s
// interpolated `value` is the real, persisted enum value itself, also
// left untranslated as data.

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

// Real, human-readable label KEYS for fields a pathologist would
// recognize — anything not listed here falls back to a
// title-cased version of its own field name (see `labelFallback`).
const FIELD_LABEL_KEY: Record<string, string> = {
  specimens: 'computeDraftDiff.fieldLabels.specimens',
  synopticReports: 'computeDraftDiff.fieldLabels.synopticReports',
  grossingReports: 'computeDraftDiff.fieldLabels.grossingReports',
  __orchSectionsDraft: 'computeDraftDiff.fieldLabels.orchSectionsDraft',
  order: 'computeDraftDiff.fieldLabels.order',
  // "Priority"/"Flags" reuse existing exact-text keys already shared
  // across many other screens rather than duplicating such common,
  // generic words under this file's own namespace.
  priority: 'accessionPage.priority.label',
  status: 'computeDraftDiff.fieldLabels.caseStatus',
  flags: 'searchPage.sections.flags',
  participants: 'computeDraftDiff.fieldLabels.careTeam',
};

export interface DraftDiffEntry {
  field: string;
  /** i18n key for the field's label, or null when no known label
   *  exists yet (use `labelFallback` instead). */
  labelKey: string | null;
  /** Derived, title-cased fallback text for a field with no known
   *  label — not translated, since it's derived from the field's own
   *  internal identifier rather than authored UI copy. */
  labelFallback: string;
  /** i18n key for the summary sentence, resolved with `summaryParams`
   *  via `t(summaryKey, summaryParams)` — pluralized keys use the
   *  `count` param the standard react-i18next way. */
  summaryKey: string;
  summaryParams?: Record<string, unknown>;
}

/** Real, specific summaries for a few fields worth being precise
 *  about, rather than a generic "N items differ" for everything.
 *  Returns a translation key + params rather than a rendered string —
 *  see this file's own i18n note. */
function summarizeField(field: string, oldVal: unknown, newVal: unknown): { key: string; params?: Record<string, unknown> } {
  if (field === 'specimens' && Array.isArray(oldVal) && Array.isArray(newVal)) {
    const oldLabels = new Set((oldVal as any[]).map(s => s?.label));
    const newLabels = new Set((newVal as any[]).map(s => s?.label));
    const changedCount = (newVal as any[]).filter(s => JSON.stringify(s) !== JSON.stringify((oldVal as any[]).find(o => o?.label === s?.label))).length;
    if (newLabels.size !== oldLabels.size) {
      return { key: 'computeDraftDiff.summary.specimenCountChanged', params: { count: newVal.length, oldCount: oldVal.length } };
    }
    return { key: 'computeDraftDiff.summary.specimensEdited', params: { count: changedCount } };
  }
  if (field === 'order' && oldVal && newVal && typeof oldVal === 'object' && typeof newVal === 'object') {
    const oldComments = (oldVal as any).caseComments?.length ?? 0;
    const newComments = (newVal as any).caseComments?.length ?? 0;
    if (newComments !== oldComments) {
      return { key: 'computeDraftDiff.summary.commentCountChanged', params: { count: newComments, oldCount: oldComments } };
    }
    return { key: 'computeDraftDiff.summary.orderInfoEdited' };
  }
  if (field === '__orchSectionsDraft' && Array.isArray(newVal)) {
    return { key: 'computeDraftDiff.summary.sectionsInDraft', params: { count: newVal.length } };
  }
  if (field === 'priority' || field === 'status') return { key: 'computeDraftDiff.summary.changedTo', params: { value: newVal } };
  return { key: 'computeDraftDiff.summary.editedInDraft' };
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

    const summary = summarizeField(key, oldVal, newVal);
    entries.push({
      field: key,
      labelKey: FIELD_LABEL_KEY[key] ?? null,
      labelFallback: key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
      summaryKey: summary.key,
      summaryParams: summary.params,
    });
  }
  return entries;
}
