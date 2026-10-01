/**
 * hooks/useScreenCapture.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Captures a PHI-redacted screenshot of the current viewport.
 *
 * Two redaction strategies run in sequence before capture:
 *
 *   1. PHI element overlay  — elements matching PHI_SELECTORS get a
 *      [REDACTED] block overlaid on top before canvas capture.
 *
 *   2. PDF viewer swap      — <iframe>, <embed>, <object> PDF viewers and
 *      any element marked data-pdf-viewer="true" are temporarily replaced
 *      with a styled placeholder div. The original element is restored
 *      immediately after capture.
 *
 * Both strategies are fully reversible — the DOM is always restored even
 * if the capture throws.
 *
 * Install: npm install html2canvas
 *
 * Drop-in path: src/hooks/useScreenCapture.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useState } from 'react';
import { PHI_SELECTORS, REDACTION_LABEL, REDACTION_STYLE, REDACTION_LABEL_STYLE } from '../services/phiSelectors';

export interface ScreenCaptureResult {
  dataUrl:            string;
  redactedCount:      number;   // PHI overlay count
  pdfRedactedCount:   number;   // PDF viewer placeholder count
  captureHideCount:   number;   // Whole-section hide count (e.g. worklist table)
  timestamp:          string;
  width:              number;
  height:             number;
}

export interface UseScreenCaptureReturn {
  capture:     () => Promise<ScreenCaptureResult | null>;
  isCapturing: boolean;
  error:       string | null;
}

// ─── PHI overlay management ───────────────────────────────────────────────────

interface RedactionOverlay {
  element: Element;
  overlay: HTMLElement;
}

// Real, direct follow-up (PS-72) — found while verifying the new toast
// redaction (PhiToastMessage): a freshly-fired react-toastify toast is
// still mid slide-in/bounce transition for a few hundred ms after it
// mounts. getBoundingClientRect() below used to run the instant capture()
// was called, with no allowance for that — so redacting a toast captured
// quickly after it appeared could measure a stale, smaller-than-final
// rect, undersizing the overlay and leaving part of the real message
// visible. Confirmed directly: reproduced with a fast capture, then fixed
// and reproduced again to confirm the overlay now fully covers the
// settled toast.
//
// Deliberately scoped to the matched element's own ancestor chain
// (getAnimations() per node, not a page-wide document.getAnimations()) —
// the fix targets "is THIS element (or whatever is transitioning it in)
// still moving," not "is anything animating anywhere on the page," which
// would also catch unrelated, intentionally-infinite animations (e.g. a
// loading spinner elsewhere on screen) and needlessly delay every real
// capture waiting for something that was never going to finish. Bounded
// (maxWaitMs) so a genuinely infinite animation on the element itself
// can't hang the capture.
async function waitForElementToSettle(el: Element, maxWaitMs = 800, maxAncestorDepth = 8): Promise<void> {
  const running: Animation[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < maxAncestorDepth) {
    running.push(...node.getAnimations().filter(a => a.playState === 'running'));
    node = node.parentElement;
    depth++;
  }
  if (running.length === 0) return;
  const timeout = new Promise<void>(res => setTimeout(res, maxWaitMs));
  const settled = Promise.all(running.map(a => a.finished.catch(() => undefined))).then(() => undefined);
  await Promise.race([settled, timeout]);
}

async function applyRedactionOverlays(): Promise<RedactionOverlay[]> {
  const overlays: RedactionOverlay[] = [];

  for (const selector of PHI_SELECTORS) {
    let matches: Element[];
    try {
      matches = Array.from(document.querySelectorAll(selector));
    } catch {
      continue; // invalid selector — skip
    }
    for (const el of matches) {
      const htmlEl = el as HTMLElement;
      await waitForElementToSettle(htmlEl);
      const rect   = htmlEl.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const overlay = document.createElement('div');
      overlay.setAttribute('data-phi-overlay', 'true');
      Object.assign(overlay.style, REDACTION_STYLE, {
        position:       'fixed',
        left:           `${rect.left + window.scrollX}px`,
        top:            `${rect.top  + window.scrollY}px`,
        width:          `${Math.max(rect.width,  80)}px`,
        height:         `${Math.max(rect.height, 18)}px`,
        zIndex:         '999999',
        display:        'flex', // deliberate override of REDACTION_STYLE's inline-block, needed to center the label
        alignItems:     'center',
        justifyContent: 'center',
        pointerEvents:  'none',
      });
      const label = document.createElement('span');
      label.textContent = REDACTION_LABEL;
      Object.assign(label.style, REDACTION_LABEL_STYLE, { userSelect: 'none' });
      overlay.appendChild(label);
      document.body.appendChild(overlay);
      overlays.push({ element: el, overlay });
    }
  }

  return overlays;
}

function removeRedactionOverlays(overlays: RedactionOverlay[]): void {
  overlays.forEach(({ overlay }) => overlay.parentNode?.removeChild(overlay));
}

// ─── PDF viewer swap management ───────────────────────────────────────────────

interface PdfSwap {
  original:    HTMLElement;
  placeholder: HTMLElement;
  parent:      HTMLElement;
  nextSibling: Node | null;
}

// Selectors that identify PDF viewer elements
const PDF_SELECTORS = [
  'iframe[src*=".pdf"]',
  'iframe[src*="blob:"]',
  'iframe[data-pdf]',
  'embed[type="application/pdf"]',
  'object[type="application/pdf"]',
  '[data-pdf-viewer="true"]',
  '.pdf-viewer',
  '.react-pdf__Document',   // react-pdf
  '.pdfViewer',             // pdf.js
  '#pdf-container',
];

function buildPdfPlaceholder(rect: DOMRect): HTMLElement {
  const ph = document.createElement('div');
  ph.setAttribute('data-pdf-placeholder', 'true');
  ph.style.cssText = `
    position:        fixed;
    left:            ${rect.left}px;
    top:             ${rect.top}px;
    width:           ${rect.width}px;
    height:          ${rect.height}px;
    background:      #1e293b;
    border:          1px solid #334155;
    border-radius:   8px;
    z-index:         999998;
    display:         flex;
    flex-direction:  column;
    align-items:     center;
    justify-content: center;
    gap:             12px;
    pointer-events:  none;
  `;

  const icon = document.createElement('div');
  icon.textContent = '📄';
  icon.style.cssText = 'font-size: 40px; line-height: 1;';

  const title = document.createElement('div');
  title.textContent = 'Clinical Report';
  title.style.cssText = `
    font-size:   14px;
    font-weight: 700;
    color:       #94a3b8;
    font-family: system-ui, sans-serif;
  `;

  const sub = document.createElement('div');
  sub.textContent = 'Redacted for enhancement request submission';
  sub.style.cssText = `
    font-size:   11px;
    color:       #475569;
    font-family: monospace;
    letter-spacing: 0.04em;
  `;

  const badge = document.createElement('div');
  badge.textContent = '🔒 PHI PROTECTED';
  badge.style.cssText = `
    margin-top:      8px;
    padding:         4px 12px;
    border-radius:   99px;
    background:      rgba(8,145,178,0.1);
    border:          1px solid rgba(8,145,178,0.25);
    font-size:       10px;
    font-weight:     700;
    color:           #0891B2;
    font-family:     system-ui, sans-serif;
    letter-spacing:  0.06em;
  `;

  ph.appendChild(icon);
  ph.appendChild(title);
  ph.appendChild(sub);
  ph.appendChild(badge);

  return ph;
}

function applyPdfSwaps(): PdfSwap[] {
  const swaps: PdfSwap[] = [];

  PDF_SELECTORS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        const htmlEl = el as HTMLElement;
        const rect   = htmlEl.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        // Hide the original, inject placeholder at same position
        const placeholder = buildPdfPlaceholder(rect);
        htmlEl.style.visibility = 'hidden';
        document.body.appendChild(placeholder);

        swaps.push({
          original:    htmlEl,
          placeholder,
          parent:      htmlEl.parentElement as HTMLElement,
          nextSibling: htmlEl.nextSibling,
        });
      });
    } catch { /* invalid selector — skip */ }
  });

  return swaps;
}

function removePdfSwaps(swaps: PdfSwap[]): void {
  swaps.forEach(({ original, placeholder }) => {
    original.style.visibility = '';
    placeholder.parentNode?.removeChild(placeholder);
  });
}


// ─── Capture-hide management ──────────────────────────────────────────────────
// Elements with data-capture-hide="true": we inject a solid overlay div that
// covers the element using absolute positioning relative to document, then
// remove it after capture. This works regardless of scroll, overflow, or
// whether html2canvas supports the CSS property.
interface CaptureHideSwap { original: HTMLElement; placeholder: HTMLElement; }

function applyCaptureHideSwaps(): CaptureHideSwap[] {
  const swaps: CaptureHideSwap[] = [];

  document.querySelectorAll<HTMLElement>('[data-capture-hide="true"]').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const ph = document.createElement('div');
    ph.setAttribute('data-capture-hide-placeholder', 'true');
    ph.style.cssText = [
      'position:fixed',
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${Math.max(rect.width, 10)}px`,
      `height:${Math.max(rect.height, 10)}px`,
      'background:#1e293b',
      'border-radius:6px',
      'z-index:2147483647',
      'pointer-events:none',
    ].join(';');

    document.body.appendChild(ph);
    swaps.push({ original: el, placeholder: ph });
  });

  return swaps;
}

function restoreCaptureHideSwaps(swaps: CaptureHideSwap[]): void {
  swaps.forEach(({ placeholder }) => {
    placeholder.parentNode?.removeChild(placeholder);
  });
}


export function useScreenCapture(): UseScreenCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const capture = useCallback(async (): Promise<ScreenCaptureResult | null> => {
    setIsCapturing(true);
    setError(null);

    const phiOverlays:      RedactionOverlay[]  = [];
    const pdfSwaps:        PdfSwap[]           = [];
    const captureHideSwaps: CaptureHideSwap[]  = [];

    try {
      const html2canvas = (await import('html2canvas')).default;

      // 1. Apply PHI overlays
      phiOverlays.push(...(await applyRedactionOverlays()));

      // 2. Swap PDF viewers with placeholders
      pdfSwaps.push(...applyPdfSwaps());

      // 3. Hide capture-hide elements (whole sections of PHI like worklist tables)
      captureHideSwaps.push(...applyCaptureHideSwaps());

      // Yield for two animation frames so both paint before capture
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

      // 3. Capture
      const canvas = await html2canvas(document.body, {
        useCORS:         true,
        allowTaint:      false,
        foreignObjectRendering: false,
        scale:           window.devicePixelRatio ?? 1,
        logging:         false,
        ignoreElements:  (el: Element) =>
          el.hasAttribute('data-enhancement-modal'),
      });

      return {
        dataUrl:           canvas.toDataURL('image/png'),
        redactedCount:     phiOverlays.length,
        pdfRedactedCount:  pdfSwaps.length,
        captureHideCount:  captureHideSwaps.length,
        timestamp:         new Date().toISOString(),
        width:             canvas.width,
        height:            canvas.height,
      };

    } catch (err) {
      const msg = (err as Error)?.message ?? 'Screen capture failed';
      setError(msg);
      console.error('[useScreenCapture]', err);
      return null;
    } finally {
      // Always restore DOM — even on error
      removeRedactionOverlays(phiOverlays);
      removePdfSwaps(pdfSwaps);
      restoreCaptureHideSwaps(captureHideSwaps);
      setIsCapturing(false);
    }
  }, []);

  return { capture, isCapturing, error };
}
