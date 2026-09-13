// src/services/cytology/resolveSynopticFieldLabel.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed sequencing — the ONE, real
// place a field/option/section's display label is decided. Today,
// every real template only ever has a plain-string label; once a
// real, future template carries a labelKey (per the later i18n-keyed
// "Custom Synoptic Template Engine" spec), THIS function is the only
// real place that needs to change to prefer it — the renderer itself
// (SynopticFormDrawer.tsx) never inspects label vs. labelKey directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { SynopticField, SynopticFieldOption, SynopticSection } from '@/types/cytology/SynopticTemplate';

/** Real, per direct guidance's own migration design — `t` is accepted
 *  now so every real call site is already migration-shaped, even
 *  though no real template today has a labelKey for it to resolve. */
export function resolveSynopticFieldLabel(field: Pick<SynopticField, 'label' | 'labelKey'>, t: (key: string) => string): string {
  return field.labelKey ? t(field.labelKey) : field.label;
}

export function resolveSynopticOptionLabel(option: Pick<SynopticFieldOption, 'label' | 'labelKey'>, t: (key: string) => string): string {
  return option.labelKey ? t(option.labelKey) : option.label;
}

export function resolveSynopticSectionTitle(section: Pick<SynopticSection, 'title' | 'titleKey'>, t: (key: string) => string): string {
  return section.titleKey ? t(section.titleKey) : section.title;
}

/** Real, Layer C companion to the three resolvers above — same exact
 *  pattern, same exact reasoning, applied to
 *  SynopticField.narrativeSentenceTemplate/narrativeSentenceTemplateKey
 *  (compileCytologySynopticNarrative.ts's own real, single call site
 *  for this). Undefined narrativeSentenceTemplate means the field
 *  itself never contributes a narrative sentence at all — that
 *  authoring decision belongs to compileCytologySynopticNarrative.ts,
 *  never to this resolver, so this function is only ever called once
 *  that's already been confirmed true. */
export function resolveSynopticNarrativeSentenceTemplate(field: Pick<SynopticField, 'narrativeSentenceTemplate' | 'narrativeSentenceTemplateKey'>, t: (key: string) => string): string | undefined {
  return field.narrativeSentenceTemplateKey ? t(field.narrativeSentenceTemplateKey) : field.narrativeSentenceTemplate;
}
