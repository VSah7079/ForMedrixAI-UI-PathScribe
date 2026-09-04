/**
 * ScannerProvider.tsx
 * src/contexts/ScannerProvider.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global barcode / QR scanner listener.
 *
 * HID scanners behave like a keyboard — they fire a rapid burst of characters
 * followed by an Enter keystroke. This provider distinguishes scanner input
 * from normal typing by measuring inter-keystroke timing:
 *
 *   Human typing:  >100ms between keystrokes
 *   Scanner input: <50ms between keystrokes (typically 5–20ms)
 *
 * On a complete scan (Enter received after fast-burst input):
 *   1. Validates the buffer against every ENABLED accession/mrn format from
 *      SystemConfig — not just one. Fixed June 2026: this used to test only
 *      against config.identifierFormats.accessionPattern/mrnPattern, which
 *      deriveLegacyFormats() populates from the FIRST enabled format of each
 *      kind — meaning if an admin enabled both the US and UK accession
 *      formats on the Identifier Formats config screen, only whichever one
 *      happened to be first in the array actually got tested. A UK-format
 *      scan would silently fail to match even though the toggle for it was
 *      on. Same bug existed in SearchPage.tsx's manual identifier box,
 *      fixed alongside this.
 *   2. If accession match → navigate to /case/{accession}/synoptic
 *   3. If MRN match → navigate to worklist filtered by MRN (future)
 *   4. Fires a SCANNER_EVENT custom event so components can react (e.g. flash)
 *
 * No focus required — the listener is global and works anywhere in the app.
 *
 * simulateScan() is exposed via useScanner() for testing without physical
 * scanner hardware — it runs the exact same handleScan() logic a real scan
 * would, just skipping the keystroke-timing capture step. See the
 * "Simulate a scan" tool on the Identifier Formats config page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useEnabledIdentifierFormats } from '../hooks/useEnabledIdentifierFormats';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanType = 'accession' | 'mrn' | 'unknown';

export interface ScanEvent {
  raw:      string;
  type:     ScanType;
  matchedAccession?: string;
}

interface ScannerContextValue {
  lastScan: ScanEvent | null;
  /** Runs a value through the same detection logic a real scan would, for
   *  testing without a physical scanner. */
  simulateScan: (value: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ScannerContext = createContext<ScannerContextValue>({ lastScan: null, simulateScan: () => {} });
export const useScanner = () => useContext(ScannerContext);

// ─── Constants ────────────────────────────────────────────────────────────────

// Max ms between keystrokes to be considered a scanner burst
const SCAN_SPEED_THRESHOLD_MS = 50;
// Minimum characters for a valid scan (avoids misfires on short strings)
const MIN_SCAN_LENGTH = 5;

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ScannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate      = useNavigate();
  const location       = useLocation();
  const enabledFormats = useEnabledIdentifierFormats();
  const { user }      = useAuth();
  const bufferRef     = useRef<string>('');
  const lastKeyTime   = useRef<number>(0);
  const lastScanRef   = useRef<ScanEvent | null>(null);
  const [lastScan, setLastScan] = React.useState<ScanEvent | null>(null);

  // Every ENABLED format of a given kind, not just one derived pattern.
  // Real, per direct guidance: enabledFormats itself already falls
  // back to IDENTIFIER_FORMAT_LIBRARY's own defaults when no real
  // Enterprise has configured this yet — see
  // useEnabledIdentifierFormats.ts's own doc comment.
  const getEnabledPatterns = useCallback((kind: 'accession' | 'mrn'): RegExp[] => {
    return enabledFormats
      .filter(f => f.kind === kind && f.enabled)
      .map(f => { try { return new RegExp(f.pattern, 'i'); } catch { return null; } })
      .filter((r): r is RegExp => r !== null);
  }, [enabledFormats]);

  const handleScan = useCallback((raw: string) => {
    const cleaned = raw.trim();
    if (cleaned.length < MIN_SCAN_LENGTH) return;

    const accessionPatterns = getEnabledPatterns('accession');
    const mrnPatterns       = getEnabledPatterns('mrn');

    let type: ScanType = 'unknown';
    let matchedAccession: string | undefined;

    if (accessionPatterns.some(re => re.test(cleaned))) {
      type = 'accession';
      matchedAccession = cleaned;
    } else if (mrnPatterns.some(re => re.test(cleaned))) {
      type = 'mrn';
    }

    const scanEvent: ScanEvent = { raw: cleaned, type, matchedAccession };
    lastScanRef.current = scanEvent;
    setLastScan(scanEvent);

    // Fire custom event so components can react (e.g. flash the search bar)
    window.dispatchEvent(new CustomEvent('PATHSCRIBE_SCAN', { detail: scanEvent }));

    // Real feature, per direct, detailed specification: "Barcode Listener &
    // Form Auto-Ingestion." The Accession page has its own, real
    // PATHSCRIBE_SCAN listener (AccessionPage.tsx) that resolves a scan
    // against pending orders/patient records and auto-fills the case form
    // directly — a genuinely different, more specific real outcome than
    // this provider's own generic "navigate to an existing case" default.
    // Auto-navigating away here first would fight that: an accessioner
    // scanning a NEW specimen label whose payload happens to also match a
    // configured accession-number pattern would be yanked off the very
    // page they're using to create the case. The event above still
    // dispatches unconditionally — this only suppresses the navigation
    // side effect specifically, on this one real, known-conflicting route.
    if (location.pathname.startsWith('/accession')) return;

    // Navigate based on scan type
    if (type === 'accession' && matchedAccession) {
      navigate(`/case/${matchedAccession}/synoptic`);
    }
    // MRN: could navigate to worklist filtered by MRN — placeholder for now
    // if (type === 'mrn') navigate(`/worklist?mrn=${cleaned}`);

  }, [getEnabledPatterns, navigate, location.pathname]);

  useEffect(() => {
    // Only activate when user is authenticated
    if (!user) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Guard against synthetic/extension key events (Bitwarden, autofill etc.)
      if (!e || !e.key) return;

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTime.current;
      lastKeyTime.current = now;

      // If Enter received — check if we have a buffered scan
      if (e.key === 'Enter') {
        const buffer = bufferRef.current;
        bufferRef.current = '';

        // Never consume Enter if a form element has focus — let it propagate
        const active = document.activeElement;
        const inputFocused =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLSelectElement ||
          active instanceof HTMLButtonElement ||
          (active instanceof HTMLElement && active.isContentEditable);

        if (!inputFocused && buffer.length >= MIN_SCAN_LENGTH && timeSinceLastKey < SCAN_SPEED_THRESHOLD_MS * 3) {
          e.preventDefault();
          e.stopPropagation();
          handleScan(buffer);
        }
        return;
      }

      // Ignore modifier keys, function keys, etc.
      if (!e.key || e.key.length !== 1) return;

      // If typing is slow (human), clear the buffer
      if (timeSinceLastKey > SCAN_SPEED_THRESHOLD_MS * 4 && bufferRef.current.length > 0) {
        // Don't clear immediately — scanner might have a slow start
        // Only clear if we've been idle for a while (>500ms)
        if (timeSinceLastKey > 500) {
          bufferRef.current = '';
        }
      }

      // Ignore if an input, textarea or contenteditable has focus
      // (let the focused element handle normal typing)
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      if (isInputFocused && timeSinceLastKey > SCAN_SPEED_THRESHOLD_MS) {
        // Human typing into an input — don't capture
        bufferRef.current = '';
        return;
      }

      // Accumulate the character
      bufferRef.current += e.key;
    };

    const onMouseDown = () => { bufferRef.current = ''; };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [handleScan, user]);

  return (
    <ScannerContext.Provider value={{ lastScan, simulateScan: handleScan }}>
      {children}
    </ScannerContext.Provider>
  );
};

export default ScannerProvider;
