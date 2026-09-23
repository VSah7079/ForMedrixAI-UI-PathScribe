// src/components/ValidationStudies/ModelStoreModal.tsx
// ─────────────────────────────────────────────────────────────
// The customer-facing half of the store workflow: browse what
// ForMedrixAI has published, download one into the local catalog.
// Opened from StudyFormModal's "AI Model Being Validated" field —
// per the direct workflow description, this is the point where an
// admin who got the "new model available" email actually goes to get
// it, before continuing the rest of the study form.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { mockModelStoreService, type StoreListing } from '../../services/models/mockModelStoreService';
import type { AIModel, ModelVendor } from '../../services/models/IModelService';
import { isServiceOk } from '../../services/types';

const VENDOR_LABEL: Record<ModelVendor, string> = {
  anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', other: 'Other',
};

interface ModelStoreModalProps {
  /** Fired once a download genuinely succeeds, with the new local
   *  AIModel record — caller is responsible for both refreshing its
   *  own models list and selecting the new one, this modal doesn't
   *  assume either. */
  onDownloaded: (model: AIModel) => void;
  onClose: () => void;
}

export const ModelStoreModal: React.FC<ModelStoreModalProps> = ({ onDownloaded, onClose }) => {
  const { t } = useTranslation();
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Distinct from the general `error` state below — this specifically
   *  means "the org itself isn't entitled to browse the store at
   *  all," gating the whole catalog rather than one failed action.
   *  See mockModelStoreService's checkAuthorization for what a real
   *  implementation of this check would actually verify. */
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    mockModelStoreService.getAvailable().then(res => {
      // Real, direct follow-up (PS-69): this is the exact recurrence site
      // the ticket named ("the UI's own handling of both") — the prior pass
      // fixed ServiceResult's own type (literal `ok: true`/`ok: false`
      // discriminants + an isServiceOk() guard) but never actually applied
      // either here, leaving this `if (res.ok) {} else {}` truthy-check
      // pattern still needing the old `as { ok: false; error: string }`
      // cast. Root cause, confirmed by isolated repro: this project's
      // tsconfig has strictNullChecks: false, and under that setting
      // TypeScript's control-flow narrowing genuinely does not narrow the
      // `else` branch of a plain truthy `if (x.ok)` check on this union —
      // only an explicit `=== true`/`=== false` comparison (or a type
      // predicate like isServiceOk) narrows correctly. isServiceOk() used
      // here for exactly that reason.
      if (isServiceOk(res)) { setListings(res.data); }
      else { setAuthError(res.error); }
      setLoading(false);
    });
  }, []);

  const handleDownload = async (listing: StoreListing) => {
    setDownloadingId(listing.storeId);
    setError(null);
    const res = await mockModelStoreService.download(listing.storeId);
    setDownloadingId(null);
    // `res.ok === false` (strict equality) already narrows correctly even
    // under strictNullChecks: false — kept as isServiceOk()'s negation for
    // consistency with the useEffect block above and so both call sites in
    // this file read the same way.
    if (!isServiceOk(res)) { setError(res.error); return; }
    onDownloaded(res.data);
  };

  return (
    <div className="ps-overlay" onClick={onClose} style={{ zIndex: 9600 }}>
      <div className="ps-modal-dark msm-modal" onClick={e => e.stopPropagation()}>
        <div className="ps-modal-dark-header">
          <span className="ps-modal-dark-title">{t('modelStoreModal.title')}</span>
          <button className="ps-research-close" onClick={onClose}>✕</button>
        </div>
        <div className="msm-body">
          {authError ? (
            <div className="msm-auth-error">
              <div className="msm-auth-error-icon">🔒</div>
              <div className="msm-auth-error-title">{t('modelStoreModal.accessUnavailable')}</div>
              <div className="msm-auth-error-text">{authError}</div>
            </div>
          ) : (
            <>
              <p className="msm-intro">
                {t('modelStoreModal.introPrefix')}{' '}
                <strong className="msm-beta-highlight">{t('modelStoreModal.betaLabel')}</strong>
                {' '}{t('modelStoreModal.introSuffix')}
              </p>

              {loading && (
                <div className="msm-loading">{t('modelStoreModal.loadingCatalog')}</div>
              )}

              {!loading && listings.length === 0 && (
                <div className="msm-empty">
                  {t('modelStoreModal.nothingNew')}
                </div>
              )}

              {error && (
                <div className="msm-error-banner">
                  {error}
                </div>
              )}

              <div className="msm-listings">
            {listings.map(listing => (
              <div key={listing.storeId} className="msm-listing-card">
                <div className="msm-listing-row">
                  <div className="msm-listing-info">
                    <div className="msm-listing-name-row">
                      <span className="msm-listing-name">{listing.name} {listing.version}</span>
                      <span className="msm-listing-vendor">
                        {VENDOR_LABEL[listing.vendor]}
                      </span>
                    </div>
                    <div className="msm-listing-meta">
                      {t('modelStoreModal.published', { date: listing.releaseDate, accuracy: listing.benchmarkAccuracy })}
                    </div>
                    <div className="msm-listing-notes">{listing.releaseNotes}</div>
                  </div>
                  <button
                    className="ps-conf-btn-primary msm-download-btn"
                    disabled={downloadingId === listing.storeId}
                    onClick={() => handleDownload(listing)}
                  >
                    {downloadingId === listing.storeId ? t('modelStoreModal.downloading') : t('modelStoreModal.download')}
                  </button>
                </div>
              </div>
            ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
