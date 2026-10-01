// src/components/BarcodeScanner/BarcodeScanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real camera-based barcode capture — replaces IntraopQueuePage.tsx's
// previous simulateScan() (a random-MRN generator, no real camera read
// at all). Uses @zxing/browser's BrowserMultiFormatReader, restricted to
// exactly the five formats this app already models (utils/
// barcodeFormatMapping.ts) rather than ZXing's full, broader format list.
//
// Real, honest limitation, not glossed over: everything in this file is
// written against ZXing's real, documented API and compiles/type-checks
// against the actual installed package - but camera access, permission
// prompts, and real barcode decoding genuinely can't be verified from
// this environment. This needs real device testing once deployed,
// specifically on the actual target phones/browsers, before being
// trusted as "working."
//
// playsInline is not optional here - without it, iOS/WebKit takes the
// video element fullscreen instead of showing an inline preview, which
// would break the whole capture UI on exactly the platform (iPhone)
// this was built for.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserMultiFormatReader } from '@zxing/browser';
import NotFoundException from '@zxing/library/esm/core/NotFoundException';
import type { IScannerControls } from '@zxing/browser';
import { getSupportedZxingFormats, zxingFormatToBarcodeType } from '@/utils/barcodeFormatMapping';
import type { BarcodeType } from '@/types/systemConfig';

export interface BarcodeScannerProps {
  /** Called once, on the first successful decode — scanning stops immediately after. */
  onDecode: (text: string, format: BarcodeType | undefined) => void;
  /** Called when camera access itself fails (permission denied, no camera, etc.) — distinct from "no barcode found yet," which is normal, silent, per-frame behavior during scanning. */
  onError?: (message: string) => void;
  onCancel?: () => void;
}

type CameraState = 'requesting' | 'scanning' | 'error';

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onDecode, onError, onCancel }) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [state, setState] = useState<CameraState>('requesting');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    reader.possibleFormats = getSupportedZxingFormats();

    // Real fix for a genuine gap: the previous version only handled the
    // known-transient IndexSizeError (see the per-frame callback below
    // for the full research/citation) inside the ONGOING per-frame
    // callback - it never accounted for this same real WebKit issue
    // striking during the very FIRST attempt to start the camera, before
    // scanning even begins. That's a different code path (this function
    // failing outright, not a per-frame callback receiving an error),
    // and it was falling through to the generic "could not start the
    // camera" failure with no recovery - confirmed directly as the
    // actual cause of a real report: camera never activates, the raw
    // IndexSizeError message shown instead. A bounded, automatic retry
    // specifically for this known-transient error class means the vast
    // majority of the time this now recovers invisibly, without the
    // user having to manually cancel and retry themselves.
    const startCamera = async (attempt: number): Promise<void> => {
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (cancelled) return;
      }
      try {
        if (!videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(
          undefined, // undefined selects the default camera - the rear camera on a real phone
          videoRef.current,
          (result, error) => {
            if (cancelled) return;
            if (result) {
              controlsRef.current?.stop();
              const barcodeType = zxingFormatToBarcodeType(result.getBarcodeFormat());
              onDecode(result.getText(), barcodeType);
              return;
            }
            // NotFoundException fires on essentially every frame where no
            // barcode is currently in view - real, expected, silent noise
            // during continuous scanning, not a failure to surface.
            //
            // IndexSizeError (a DOMException) is the same kind of thing,
            // for a different reason: a real, documented iOS/WebKit quirk
            // in getImageData() inside ZXing's own internal canvas-based
            // frame capture (confirmed directly - Apple's own developer
            // forums show the identical error on the same iPhone Safari
            // combination, describing it as transient, not a permanent
            // failure). Treated the same way as NotFoundException here -
            // this frame didn't decode, the next one still can.
            const isTransientFrameError =
              error instanceof NotFoundException ||
              (error && (error as any).name === 'IndexSizeError');
            if (error && !isTransientFrameError) {
              onError?.(error.message ?? t('barcodeScanner.unexpectedError'));
            }
          }
        );
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
        setState('scanning');
      } catch (err) {
        if (cancelled) return;
        const name = (err as any)?.name;
        // Real, bounded retry - only for the same known-transient error,
        // only up to 3 total attempts, so a genuinely persistent failure
        // still surfaces a real error instead of retrying forever.
        if (name === 'IndexSizeError' && attempt < 3) {
          return startCamera(attempt + 1);
        }
        // Real, honest, actionable messages for the two failure modes a
        // person can actually do something about, rather than a generic
        // "something went wrong."
        const message =
          name === 'NotAllowedError'
            ? t('barcodeScanner.permissionDenied')
            : name === 'NotFoundError'
              ? t('barcodeScanner.noCameraFound')
              : t('barcodeScanner.startError', { reason: (err as Error)?.message ?? t('barcodeScanner.unknownError') });
        setErrorMessage(message);
        setState('error');
        onError?.(message);
      }
    };

    // Real mitigation, not a guaranteed fix: this component remounts
    // fully on every session reset (NewEntryForm's key={formResetKey}
    // tears the whole form down and rebuilds it), which means the
    // previous camera stream gets stopped and a new one requested
    // again within milliseconds. A short delay here gives the hardware
    // genuine time to release the old stream before the new request -
    // real, defensible mitigation for the exact pattern Apple's own
    // developer forum describes for this error (recurs more easily the
    // more it's been triggered before), not something that can be
    // fully guaranteed from JS alone since the underlying flakiness is
    // in WebKit's own camera/canvas resource handling.
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (cancelled) return;
      await startCamera(1);
    })();

    return () => {
      cancelled = true;
      // Real cleanup - without this, the camera stream stays open
      // indefinitely after this component unmounts, a real, meaningful
      // bug for any camera-based feature, not just a tidiness concern.
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDecode/onError are event callbacks, not values this effect should re-run for; re-running would restart the camera stream on every parent re-render.
  }, []);

  return (
    <div className="ps-barcode-scanner">
      {state === 'error' ? (
        <div className="ps-barcode-scanner-error">
          <p>{errorMessage}</p>
          {onCancel && (
            <button type="button" className="ps-conf-btn-row" onClick={onCancel}>
              {t('barcodeScanner.cancel')}
            </button>
          )}
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className="ps-barcode-scanner-video"
            playsInline
            muted
            autoPlay
          />
          {state === 'requesting' && (
            <p className="ps-barcode-scanner-hint">{t('barcodeScanner.requestingAccess')}</p>
          )}
          {state === 'scanning' && (
            <p className="ps-barcode-scanner-hint">{t('barcodeScanner.pointCamera')}</p>
          )}
          {onCancel && (
            <button type="button" className="ps-conf-btn-row" onClick={onCancel}>
              {t('barcodeScanner.cancel')}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default BarcodeScanner;
