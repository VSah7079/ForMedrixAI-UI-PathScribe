// src/pages/AccessionPage/OrderLookupModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct specification: "Order Lookup & Patient
// Verification" modal. Opens from AccessionPage.tsx's own omnibox search on
// real ambiguity (more than 3 matches, or zero exact matches among whatever
// partial matches came back) or the explicit "Advanced Search" link — see
// that file's own runOrderSearchTrigger/openOrderLookupModal for the exact
// trigger logic.
//
// Genuinely two real, different result pools, not one: pending LIS orders
// (the existing inline list's own data source, IncomingOrder[]) AND the
// real Master Patient Index (IPatientIndexService.searchPatients()) — the
// "& Patient Verification" half of this modal's own name. A patient can
// exist in this lab's real, persistent patient index with no pending order
// at all (a walk-in, a manually-accessioned specimen for someone this lab
// has already seen) — searching only pending orders would silently miss
// that and risk creating a duplicate patient identity, which is exactly
// the real safety problem the MPI (IPatientIndexService.ts's own header
// comment) exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { patientIndexService, type IncomingOrder } from '@/services';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import type { JurisdictionDateFormat } from '@/types/systemConfig';
import { isoDateForSearch, dobIncludesQuery } from '@/utils/isoDateForSearch';
import { normalizeIdForSearch } from '@/utils/normalizeIdForSearch';

interface Props {
  isOpen: boolean;
  initialQuery: string;
  pendingOrders: IncomingOrder[];
  organisationId: string;
  /** Real fix, per direct follow-up: "Does the DOB take into account
   *  locality? UK vs. US." — the modal's own search and grid display
   *  now use the same, real, resolved format AccessionPage.tsx derives
   *  from the current facility/system jurisdiction (see that file's
   *  own searchDobFormat comment), rather than a hardcoded US
   *  mm/dd/yyyy — passed down rather than re-resolved here, so the
   *  omnibox and this modal can never disagree about which format is
   *  correct for the current context. The jurisdiction's own format
   *  (DD.MM.YYYY in Germany, DD-MM-YYYY in the Netherlands, …), not a
   *  BCP-47 locale — see isoDateForSearch.ts's own header comment for
   *  why real toLocaleDateString locale behavior isn't trustworthy
   *  enough for this (confirmed 'en-CA' disagrees with this app's own
   *  declared jurisdiction format). */
  searchDobFormat: JurisdictionDateFormat;
  dobFormatHint: string;
  onSelectOrder: (orderId: string) => void;
  onSelectPatient: (patient: MasterPatientRecord) => void;
  onClose: () => void;
}

export const OrderLookupModal: React.FC<Props> = ({
  isOpen, initialQuery, pendingOrders, organisationId, searchDobFormat, dobFormatHint,
  onSelectOrder, onSelectPatient, onClose,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [patientResults, setPatientResults] = useState<MasterPatientRecord[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);

  // Reset to whatever the omnibox was showing each time the modal is
  // freshly opened — a stale query from a previous open shouldn't
  // silently carry over into an unrelated later search.
  useEffect(() => {
    if (isOpen) setQuery(initialQuery);
  }, [isOpen, initialQuery]);

  const orderMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const qIdNormalized = normalizeIdForSearch(q);
    return pendingOrders.filter(o =>
      o.externalOrderNumber.toLowerCase().includes(q) ||
      `${o.patient.firstName} ${o.patient.lastName}`.toLowerCase().includes(q) ||
      // Real fix, per direct follow-up: "Scotland and Ireland have
      // different formats for their NHS number, would we do the same
      // approach there?" — space/dash-normalized, not multi-interpretation
      // the way DOB is; see normalizeIdForSearch.ts and
      // AccessionPage.tsx's own filteredOrders comment for the full
      // reasoning on why these are genuinely different problems.
      normalizeIdForSearch(o.patient.mrn).includes(qIdNormalized) ||
      o.externalAssigningAuthority.toLowerCase().includes(q) ||
      // Real fix, per direct follow-up: "if you don't have a case, how
      // do you know the client?" — matching now checks every supported
      // date format rather than assuming a single one is correct for
      // whichever specific client this result belongs to. See
      // AccessionPage.tsx's own filteredOrders comment for the full
      // reasoning; searchDobFormat remains display-only here (the
      // grid's own DOB column, below).
      dobIncludesQuery(o.patient.dateOfBirth, q)
    );
  }, [pendingOrders, query]);

  // Real, live search against the Master Patient Index — debounced
  // lightly (250ms) since, unlike the pending-orders filter above
  // (a plain in-memory array already loaded), this is a real async
  // service call; firing one on every keystroke would be wasteful and
  // could race itself on fast typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setPatientResults([]); return; }
    let cancelled = false;
    setPatientSearchLoading(true);
    const timer = setTimeout(() => {
      patientIndexService.searchPatients(organisationId, q)
        .then(results => { if (!cancelled) setPatientResults(results); })
        .catch(() => { if (!cancelled) setPatientResults([]); })
        .finally(() => { if (!cancelled) setPatientSearchLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, organisationId]);

  if (!isOpen) return null;

  const hasQuery = query.trim().length >= 2;
  const noResultsAtAll = hasQuery && orderMatches.length === 0 && patientResults.length === 0 && !patientSearchLoading;

  return (
    <div className="ps-ms-overlay" onClick={onClose}>
      <div className="ps-ms-modal ps-ms-modal--grid" onClick={e => e.stopPropagation()}>
        <div className="ps-ms-header">{t('accessionPage.orderLookupModal.header')}</div>
        <div className="ps-ms-subheader">
          {t('accessionPage.orderLookupModal.subheader')}
        </div>

        <div className="ps-order-lookup-search-row">
          <input
            type="text"
            autoFocus
            className="ps-order-lookup-search-input"
            placeholder={t('accessionPage.orderLookupModal.searchPlaceholder', { format: dobFormatHint })}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="ps-ms-body">
          {!hasQuery ? (
            <div className="ps-order-lookup-empty">{t('accessionPage.orderLookupModal.typeAtLeast2')}</div>
          ) : (
            <>
              <div className="ps-order-lookup-section-label">
                {t('accessionPage.orderLookupModal.pendingOrders')} {orderMatches.length > 0 ? `(${orderMatches.length})` : ''}
              </div>
              {orderMatches.length === 0 ? (
                <div className="ps-order-lookup-empty">{t('accessionPage.orderLookupModal.noMatch')}</div>
              ) : (
                <div className="ps-order-lookup-grid">
                  <div className="ps-order-lookup-grid-header">
                    <div>{t('accessionPage.orderLookupModal.gridOrderNumber')}</div><div>{t('accessionPage.orderLookupModal.gridPatient')}</div><div>{t('accessionPage.orderLookupModal.gridMrn')}</div><div>{t('accessionPage.orderLookupModal.gridDob', { format: dobFormatHint })}</div><div>{t('accessionPage.orderLookupModal.gridFacility')}</div>
                  </div>
                  {orderMatches.map(o => (
                    <div key={o.id} className="ps-order-lookup-grid-row" onClick={() => onSelectOrder(o.id)}>
                      <div><strong>{o.externalOrderNumber}</strong></div>
                      <div data-phi="name">{o.patient.firstName} {o.patient.lastName}</div>
                      <div data-phi="mrn">{o.patient.mrn || '—'}</div>
                      <div data-phi="dob">{o.patient.dateOfBirth ? isoDateForSearch(o.patient.dateOfBirth, searchDobFormat) : '—'}</div>
                      <div>{o.externalAssigningAuthority}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="ps-order-lookup-section-label">
                {t('accessionPage.orderLookupModal.knownPatients')} {patientResults.length > 0 ? `(${patientResults.length})` : ''}
              </div>
              {patientSearchLoading ? (
                <div className="ps-order-lookup-loading">{t('accessionPage.orderLookupModal.searchingIndex')}</div>
              ) : patientResults.length === 0 ? (
                <div className="ps-order-lookup-empty">{t('accessionPage.orderLookupModal.noPatientMatch')}</div>
              ) : (
                <div className="ps-order-lookup-grid">
                  <div className="ps-order-lookup-grid-header">
                    <div>{t('accessionPage.orderLookupModal.gridOrderNumber')}</div><div>{t('accessionPage.orderLookupModal.gridPatient')}</div><div>{t('accessionPage.orderLookupModal.gridMrn')}</div><div>{t('accessionPage.orderLookupModal.gridDob', { format: dobFormatHint })}</div><div>{t('accessionPage.orderLookupModal.gridFacility')}</div>
                  </div>
                  {patientResults.map(p => (
                    <div key={p.id} className="ps-order-lookup-grid-row" onClick={() => onSelectPatient(p)}>
                      <div>—</div>
                      <div>{p.firstName} {p.lastName}{p.needsReview ? ' ⚠' : ''}</div>
                      <div data-phi="mrn">{p.mrn || '—'}</div>
                      <div data-phi="dob">{isoDateForSearch(p.dateOfBirth, searchDobFormat) || '—'}</div>
                      <div>—</div>
                    </div>
                  ))}
                </div>
              )}

              {noResultsAtAll && (
                <div className="ps-order-lookup-empty">
                  {t('accessionPage.orderLookupModal.nothingMatches', { query: query.trim() })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('accessionPage.orderLookupModal.close')}</button>
        </div>
      </div>
    </div>
  );
};

export default OrderLookupModal;
