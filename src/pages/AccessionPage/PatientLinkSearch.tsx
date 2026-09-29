// src/pages/AccessionPage/PatientLinkSearch.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("Family relations could be an optional
// field"): extracted out of AccessionPage.tsx's own original Outside
// Patient "Check for Existing Patient" widget, so the SAME real
// search/confirm mechanism can be reused for the new, general,
// optional Family Relation field too — never a second, parallel
// implementation of the same real debounced search
// (mockPatientIndexService.searchPatients(), same 250ms debounce
// convention as OrderLookupModal.tsx). The two real, distinct
// relationshipType uses (same_person, family_relation) share this one
// component; only the label/help text/confirm-button copy and which
// relationshipType the caller ultimately links with differ.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { MasterPatientRecord } from '@/services/patients/IPatientIndexService';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';

export interface PatientLinkSearchProps {
  organisationId: string;
  confirmed: MasterPatientRecord | null;
  onConfirm: (record: MasterPatientRecord | null) => void;
  title: string;
  helpText: string;
  confirmButtonLabel: string;
  confirmedLabel: string;
}

export const PatientLinkSearch: React.FC<PatientLinkSearchProps> = ({
  organisationId, confirmed, onConfirm, title, helpText, confirmButtonLabel, confirmedLabel,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MasterPatientRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      mockPatientIndexService.searchPatients(organisationId, q)
        .then(r => { if (!cancelled) setResults(r); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, organisationId]);

  return (
    <div className="ps-accession-outside-section">
      <div className="ps-accession-outside-section-title">{title}</div>
      <p className="ps-accession-outside-subtitle ps-accession-outside-subtitle--spaced">{helpText}</p>
      {confirmed ? (
        <div className="ps-accession-outside-link-confirmed">
          <span data-phi="true">✓ {confirmedLabel}: <strong>{confirmed.firstName} {confirmed.lastName}</strong> ({t('accessionPage.patientLinkSearch.mrnDob', { mrn: confirmed.mrn, dob: new Date(confirmed.dateOfBirth).toLocaleDateString() })})</span>
          <button type="button" className="ps-btn-ghost-dark" onClick={() => onConfirm(null)}>{t('accessionPage.patientLinkSearch.undo')}</button>
        </div>
      ) : (
        <>
          <input className="ps-input-dark" value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t('accessionPage.patientLinkSearch.searchPlaceholder')} />
          {loading && <div className="ps-accession-outside-link-status">{t('accessionPage.patientLinkSearch.searching')}</div>}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="ps-accession-outside-link-status">{t('accessionPage.patientLinkSearch.noMatch')}</div>
          )}
          {results.length > 0 && (
            <div className="ps-accession-outside-link-results">
              {results.map(r => (
                <div key={r.id} className="ps-accession-outside-link-result">
                  <span data-phi="true">{r.firstName} {r.lastName} — {t('accessionPage.patientLinkSearch.resultMrnDob', { mrn: r.mrn, dob: new Date(r.dateOfBirth).toLocaleDateString() })}</span>
                  <button type="button" className="ps-conf-btn-secondary" onClick={() => { onConfirm(r); setQuery(''); setResults([]); }}>
                    {confirmButtonLabel}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
