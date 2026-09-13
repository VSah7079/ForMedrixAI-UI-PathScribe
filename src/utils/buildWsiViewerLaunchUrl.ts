// src/utils/buildWsiViewerLaunchUrl.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "we just pass info and launch the app
// and route the unique id so that the correct scan is placed in
// their viewer." Pure, testable — the entire real mechanism this
// architecture needs: substitute the one real placeholder into an
// admin-configured template. PathScribe never implements DICOMweb,
// never renders an image, never needs the vendor's own API
// credentials — the vendor's own real viewer application owns
// everything after the browser navigates to the built URL.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER = '{{wsiUniqueId}}';

export type BuildWsiViewerLaunchUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Real, honest validation before ever attempting a real browser
 * navigation: refuses (never silently no-ops, never opens a broken
 * URL) when the template is empty (no real vendor configured yet) or
 * doesn't actually contain the real placeholder (a real admin typo —
 * a URL with no way to route to a specific slide would just open the
 * vendor's own generic landing page every time, silently wrong).
 */
export function buildWsiViewerLaunchUrl(launchUrlTemplate: string, wsiUniqueId: string): BuildWsiViewerLaunchUrlResult {
  if (!launchUrlTemplate.trim()) {
    return { ok: false, error: 'No WSI viewer launch URL is configured for this vendor yet.' };
  }
  if (!launchUrlTemplate.includes(PLACEHOLDER)) {
    return { ok: false, error: `This vendor's launch URL template is missing the required ${PLACEHOLDER} placeholder.` };
  }
  if (!wsiUniqueId.trim()) {
    return { ok: false, error: 'This slide has no real, scannable identifier to route to yet.' };
  }
  return { ok: true, url: launchUrlTemplate.split(PLACEHOLDER).join(encodeURIComponent(wsiUniqueId)) };
}
