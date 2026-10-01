// src/utils/resetConfigScroll.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared fix, per direct report: "when changing across the
// different config/system settings, the page does[n't] begin at the
// top, so you have to scroll up to see the add button and column
// headers." Confirmed directly: switching either a top-level
// Configuration tab (ConfigurationPage.tsx's own handleTabChange) or
// a section within one (Config/System/index.tsx's own internal
// setActive — Config/Integrations/index.tsx used to have the same
// pattern too, before that file was deleted) is a plain React state
// update — none of them ever reset scroll position, and the actual
// scrollable element (.ps-cfgpage-scroll, confirmed via its own
// overflow-y: auto) sits two component levels above where these
// state changes actually happen, so a prop can't reach it without
// threading it through multiple components. Kept as a small, direct
// DOM lookup rather than a larger prop-threading refactor —
// .ps-cfgpage-scroll is a real, singular, well-known container (only
// ConfigurationPage.tsx ever renders it), not a fragile guess at an
// arbitrary selector.
// ─────────────────────────────────────────────────────────────────────────────

export function resetConfigScroll(): void {
  document.querySelector('.ps-cfgpage-scroll')?.scrollTo({ top: 0 });
}
