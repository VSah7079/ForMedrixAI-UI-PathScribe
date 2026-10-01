// src/utils/openComposeTo.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix (PS-304 — Worklist "Staff" column: "A link to send that
// person a message, defaulting the subject to the case number"). The
// messaging drawer/compose UI lives in AppShell.tsx, mounted once at
// the app-shell level, outside any individual page's own component
// tree — the same real reason config-section deep links already use a
// window CustomEvent bridge (PATHSCRIBE_SYSTEM_NAVIGATE) rather than
// prop-drilling or a context provider rewrite. This is that same real
// pattern, applied to "open compose, pre-addressed to a specific
// person, with a pre-filled subject" — AppShell.tsx listens for
// PATHSCRIBE_MSG_COMPOSE_TO and does the actual drawer/state work; any
// page just calls this one function.
// ─────────────────────────────────────────────────────────────────────────────

export function openComposeTo(staffId: string, subject: string): void {
  window.dispatchEvent(new CustomEvent('PATHSCRIBE_MSG_COMPOSE_TO', { detail: { staffId, subject } }));
}
