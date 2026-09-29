// src/utils/labelStyleVars.ts
// ─────────────────────────────────────────────────────────────────────────────
// A report template's label formatting (LabelConfig: case, weight,
// underline, size, font) as CSS custom properties, for screens that show
// a label outside the report preview (OrchestratorSectionEditor's specimen
// section titles). The consuming CSS rule reads --label-* with the
// element's normal look as each fallback, so only configured values
// change anything. Batch 338 (replaces an inline style={labelStyle(…)}).
//
// Batch 367 (PS-74): `prefix` names the properties (--<prefix>-size, …), so
// nested elements each read their own: the report preview's page, header,
// footer, section headings and field labels, and the label-style previews
// in Document Style and Template Assembly. Custom properties inherit, so
// one shared name would leak a page's settings into its headings.
// ─────────────────────────────────────────────────────────────────────────────

import type React from 'react';
import type { LabelConfig } from '@/types/template';

export function labelStyleVars(cfg?: Partial<LabelConfig>, prefix = 'label'): React.CSSProperties {
  const vars: Record<string, string> = {};
  if (cfg?.transform && cfg.transform !== 'none') vars[`--${prefix}-transform`] = cfg.transform;
  if (cfg?.weight) vars[`--${prefix}-weight`] = cfg.weight === 'bold' ? '700' : '400';
  if (cfg?.decoration && cfg.decoration !== 'none') vars[`--${prefix}-decoration`] = cfg.decoration;
  if (cfg?.fontSize) vars[`--${prefix}-size`] = `${cfg.fontSize}px`;
  if (cfg?.fontFamily) vars[`--${prefix}-family`] = cfg.fontFamily;
  return vars as React.CSSProperties;
}
