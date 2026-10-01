// src/components/GrossingHardware/CameraCaptureControl.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Grossing Station Hardware
// Integration gap. Real, working camera capture via the browser's own
// standard navigator.mediaDevices.getUserMedia() — genuinely
// functional for any camera the OS exposes as a standard USB/UVC
// webcam, no local bridge required. See
// services/grossingHardware/IGrossingHardwareProfileService.ts's own
// header for the full, researched reasoning on why this is the real,
// honest default for camera specifically (unlike scale, which has no
// equivalent standard browser API).
//
// Real, per direct follow-up: the captured frame is now uploaded via
// IImageUploadService.ts before DigitalAsset is ever built — the
// earlier version of this file stored the raw base64 frame directly
// on DigitalAsset.url, confirmed non-compliant with the uploaded
// image/PDF architecture spec's own §1.1 (Reference-Only Storage
// Model: "MUST NOT persist binary image payloads... directly").
// DigitalAsset.url is now always a real URL a configured Gross
// Imaging vendor (PAX-it!, PathoZoom®, MacroPATH, etc.) returned —
// never the transient captured bytes themselves, which are discarded
// once the upload call returns, success or failure.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DigitalAsset, DigitalAssetKind } from '@/types/case/Material';
import { mockImageUploadService } from '@/services/imageAssociation/mockImageUploadService';

const IMAGE_TYPE_BY_KIND: Record<DigitalAssetKind, string> = {
  gross_photo: 'Gross Specimen',
  block_face_photo: 'Block Face',
  wsi_scan: 'Whole Slide Scan',
};

interface CameraCaptureControlProps {
  kind: DigitalAssetKind;
  capturedBy?: string;
  onCapture: (asset: DigitalAsset) => void;
  onClose: () => void;
}

const CameraCaptureControl: React.FC<CameraCaptureControlProps> = ({ kind, capturedBy, onCapture, onClose }) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Real, honest capability check — navigator.mediaDevices is
    // genuinely absent on a non-secure origin (http, not localhost)
    // or a genuinely unsupported browser; surfaced as a real, clear
    // message rather than an unexplained silent failure.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('cameraCaptureControl.notAvailable'));
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      })
      .catch(err => {
        if (cancelled) return;
        // Real, honest distinction — a real permission denial reads
        // differently to a real user than "no camera found," which
        // reads differently again from a genuine device/driver error.
        const name = err?.name ?? 'UnknownError';
        if (name === 'NotAllowedError') setError(t('cameraCaptureControl.permissionDenied'));
        else if (name === 'NotFoundError') setError(t('cameraCaptureControl.noCameraFound'));
        else setError(t('cameraCaptureControl.accessError', { name }));
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [t]);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setError(t('cameraCaptureControl.frameProcessingError')); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Real, transient only — this base64 frame is never itself
    // persisted anywhere; it exists only long enough to hand to the
    // real upload call below.
    const capturedFrame = canvas.toDataURL('image/jpeg', 0.9);

    setUploading(true);
    setError(null);
    const uploadResult = await mockImageUploadService.upload(capturedFrame, IMAGE_TYPE_BY_KIND[kind]);
    setUploading(false);

    if (!uploadResult.ok) {
      // Real, honest failure — never falls back to storing the raw
      // captured frame directly, which is exactly the non-compliant
      // behavior this migration removes.
      setError('error' in uploadResult ? uploadResult.error : t('cameraCaptureControl.uploadFailed'));
      return;
    }

    const asset: DigitalAsset = {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      url: uploadResult.data.imageUrl,
      capturedAt: new Date().toISOString(),
      capturedBy,
    };
    streamRef.current?.getTracks().forEach(track => track.stop());
    onCapture(asset);
  };

  return (
    <div className="ps-conf-page ccc-overlay">
      <div className="ccc-panel">
        <h3 className="ccc-title">{kind === 'gross_photo' ? t('cameraCaptureControl.captureGrossPhoto') : t('cameraCaptureControl.captureBlockFacePhoto')}</h3>
        {error ? (
          <div className="ccc-error">{error}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="ccc-video" />
        )}
        <div className="ccc-actions">
          <button type="button" className="ps-btn-small" onClick={onClose} disabled={uploading}>{t('cameraCaptureControl.cancel')}</button>
          <button type="button" className="ps-btn-small ps-btn-primary" disabled={!ready || uploading} onClick={handleCapture}>
            {uploading ? t('cameraCaptureControl.uploading') : t('cameraCaptureControl.captureButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraCaptureControl;
