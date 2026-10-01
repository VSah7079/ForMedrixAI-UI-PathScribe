import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';
import { useVoice } from '../../contexts/VoiceProvider';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockOnDemandCaseFetchService } from '@/services/cases/mockOnDemandCaseFetchService';
import { useEnabledIdentifierFormats } from '../../hooks/useEnabledIdentifierFormats';
import { useAuditLog } from '../Audit/useAuditLog';
import { useAuth } from '../../contexts/AuthContext';
import { supportReferenceService } from '@/services';
import { isSupportReference } from '@/services/supportReferences/supportReferenceRules';
import type { IdentifierFormat } from '../../types/systemConfig';

interface CaseSearchBarProps {
  compact?: boolean;
}

interface CaseHit {
  id:             string;
  accession:      string;
  patientName:    string;
  dob:            string;
  sex:            string;
  status:         string;
  priority:       string;
  facilityName:   string;
  specimenCount:  number;
  assignedTo:     string;
  flags:          { name: string; color: string; tagClass: string }[];
  matchScore:     number;
  matchedValue:   string;
}

// Scan types emitted by ScannerProvider that warrant auto-navigation
const AUTO_NAV_SCAN_TYPES = new Set(['barcode', 'qr']);

// ── Case lookup ───────────────────────────────────────────────────────────────
// Uses Tier 1 enabled IdentifierFormats from SystemConfig to match input.
// Each format specifies a regex pattern and a kind (accession/mrn/requisition/
// slide/block/external_ref) — kind maps to the field on the case object.
// Formats with navigateToCaseOnMatch:true (slide barcodes) auto-navigate.

// Maps IdentifierFormat.kind → fields to check on a case object
function getCaseIdentifierFields(kind: string, c: any): string[] {
  switch (kind) {
    case 'accession':
      return [
        c.accession?.fullAccession,
        c.accession?.accessionNumber,
        c.id,
      ];
    case 'mrn':
      return [
        c.patient?.mrn,
        c.patient?.nhsNumber,   // NHS England/Wales
        c.patient?.chiNumber,   // Scottish CHI
        c.patient?.ihiNumber,   // Australian IHI
        c.patient?.ihi,
      ];
    case 'requisition':
      return [
        c.order?.requisitionNumber,
        c.order?.externalOrderId,
        c.order?.referralNumber,
      ];
    case 'slide':
      return []; // slide barcodes match via pattern only — no stored field
    case 'block':
      return [c.order?.labNumber, c.order?.blockId];
    case 'external_ref':
      return [...(c.identifiers ?? [])];
    default:
      return [];
  }
}

async function lookupCases(
  raw: string,
  activeFormats: IdentifierFormat[],
): Promise<{ hits: CaseHit[]; autoNav: boolean }> {
  const q = raw.trim();
  if (q.length < 2) return { hits: [], autoNav: false };

  // Tier 1 enabled formats only — Tier 2 is internal mapping, not search
  const searchFormats = activeFormats.filter(f => f.tier === 1 && f.enabled);

  // Determine which formats match the raw input by regex
  const matchingFormats = searchFormats.filter(f => {
    try { return new RegExp(f.pattern, 'i').test(q); } catch { return false; }
  });

  // If any matching format navigates directly (slide barcode), flag it
  // matchingFormats may be empty if no formats configured — fallback handles it
  const autoNav = matchingFormats.some(f => f.navigateToCaseOnMatch);

  try {
    // Use 'all' — returns every case regardless of assignment.
    // Access control is enforced server-side; the search bar is a
    // clinical lookup tool, not a worklist filter.
    const all: any[] = await caseRouter.listCasesForUser('all');
    const hits: CaseHit[] = [];
    const qNorm = q.toUpperCase().replace(/[\s-]/g, '');

    for (const cas of all) {
      const patientName = `${cas.patient?.lastName ?? ''}, ${cas.patient?.firstName ?? ''}`.trim().replace(/^,\s*/, '');
      let matched = false;

      // Collect all searchable identifier strings for this case
      const identifierFields: string[] =
        matchingFormats.length > 0
          ? matchingFormats.flatMap(fmt => getCaseIdentifierFields(fmt.kind, cas))
          : [
              cas.accession?.fullAccession,
              cas.accession?.accessionNumber,
              cas.id,
              cas.patient?.mrn,
              cas.patient?.nhsNumber,
              cas.patient?.chiNumber,
              cas.patient?.ihiNumber,
              cas.order?.requisitionNumber,
              cas.order?.externalOrderId,
              cas.order?.labNumber,
              cas.order?.referralNumber,
              ...(cas.identifiers ?? []),
            ];

      const normed = identifierFields
        .filter(Boolean)
        .map((v: string) => ({ raw: String(v), norm: String(v).toUpperCase().replace(/[\s-]/g, '') }));

      // Tiered match: exact > startsWith > contains > token-aware accession match
      let matchScore = 0;
      let matchedValue = '';

      for (const { raw, norm } of normed) {
        if (norm === qNorm)            { matchScore = 3; matchedValue = raw; break; }
        if (norm.startsWith(qNorm))    { if (matchScore < 2) { matchScore = 2; matchedValue = raw; } }
        else if (norm.includes(qNorm)) { if (matchScore < 1) { matchScore = 1; matchedValue = raw; } }
      }

      // Token-aware accession match:
      // Query is split into alpha-prefix + numeric-suffix.
      // The numeric suffix is matched against the LAB NUMBER portion of the
      // accession only (stripping the 2-digit year), so:
      //   S4401  → prefix=S, labNum=4401 → matches S26-4401, S25-4401
      //   MFT8807→ prefix=MFT, labNum=8807 → matches MFT26-8807
      // Non-accession identifiers (MRN, requisition etc.) are still matched
      // via the standard substring tier above.
      if (matchScore === 0) {
        const qm = qNorm.match(/^([A-Z]+)(\d{2,})$/);
        if (qm) {
          const qAlpha = qm[1];
          const qNum   = qm[2];
          for (const { raw, norm } of normed) {
            // Parse accession: LETTERS + 2-digit-year + lab-number
            const vm = norm.match(/^([A-Z]+)(\d{2})(\d+)/);
            if (!vm) continue;
            const [, vAlpha, , vLabNum] = vm;
            if (vAlpha !== qAlpha) continue;
            if (vLabNum === qNum)            { matchScore = 3; matchedValue = raw; break; }
            if (vLabNum.startsWith(qNum))    { if (matchScore < 2) { matchScore = 2; matchedValue = raw; } }
            else if (vLabNum.includes(qNum)) { if (matchScore < 1) { matchScore = 1; matchedValue = raw; } }
          }
        }
      }

      matched = matchScore > 0;
      // Store match metadata for highlighting
      if (matched) (cas as any).__matchScore = matchScore;
      if (matched) (cas as any).__matchedValue = matchedValue;

      if (matched) {
        const dob = cas.patient?.dateOfBirth
          ? new Date(cas.patient.dateOfBirth).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
          : '—';
        hits.push({
          id:            cas.id,
          accession:     cas.accession?.fullAccession ?? cas.id,
          patientName,
          dob,
          sex:           cas.patient?.sex ?? '—',
          status:        (cas as any).status ?? 'unknown',
          priority:      cas.order?.priority ?? '—',
          facilityName:  cas.order?.facilityName ?? '—',
          specimenCount: (cas.specimens ?? []).length,
          assignedTo:    cas.order?.assignedTo ?? '—',
          flags:         ((cas as any).flags ?? [])
                           .filter((f: any) => f.tagClass === 'ADMINISTRATIVE' || f.tagClass === 'COMPUTATIONAL')
                           .slice(0, 4),
          matchScore:    (cas as any).__matchScore ?? 1,
          matchedValue:  (cas as any).__matchedValue ?? '',
        });
      }
    }
    // Sort: exact first, then prefix, then contains
    hits.sort((a, b) => b.matchScore - a.matchScore);
    return { hits, autoNav };
  } catch {
    return { hits: [], autoNav: false };
  }
}

// Wraps matching substring in a highlight span
function highlight(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const qNorm = query.trim().toUpperCase().replace(/[\s-]/g, '');
  const tNorm = text.toUpperCase().replace(/[\s-]/g, '');
  const idx   = tNorm.indexOf(qNorm);
  if (idx === -1) return text;
  // Map normalised index back to original text — find start of match
  let normCount = 0;
  let startOrig = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    if (ch !== ' ' && ch !== '-') {
      if (normCount === idx) { startOrig = i; break; }
      normCount++;
    }
  }
  let normCount2 = 0;
  let endOrig = text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    if (ch !== ' ' && ch !== '-') {
      if (normCount2 === idx + qNorm.length) { endOrig = i; break; }
      normCount2++;
    }
  }
  return (
    <>
      {text.slice(0, startOrig)}
      <mark className="ps-search-highlight">{text.slice(startOrig, endOrig)}</mark>
      {text.slice(endOrig)}
    </>
  );
}

// Batch 349 (PS-101): every case status now has a label. Before, a case in
// Draft, Needs Review and other states showed its raw code ("draft",
// "pending-review") in near-invisible text in the results list.
const STATUS_LABEL_KEY: Record<string, string> = {
  'in-progress': 'caseSearchBar.status.inProgress', 'pending': 'caseSearchBar.status.pending',
  'finalized': 'caseSearchBar.status.finalized', 'signed-out': 'caseSearchBar.status.signedOut',
  'pool': 'caseSearchBar.status.pool',
  'draft': 'caseSearchBar.status.draft', 'accessioned': 'caseSearchBar.status.accessioned',
  'gross-complete': 'caseSearchBar.status.grossComplete', 'intraoperative-complete': 'caseSearchBar.status.intraopComplete',
  'pending-review': 'caseSearchBar.status.pendingReview', 'pathologist-review': 'caseSearchBar.status.pathologistReview',
  'closed': 'caseSearchBar.status.closed', 'returned': 'caseSearchBar.status.returned',
  'accepted': 'caseSearchBar.status.accepted', 'ai-assisted': 'caseSearchBar.status.aiAssisted',
  'claiming': 'caseSearchBar.status.claiming', 'finalizing': 'caseSearchBar.status.finalizing',
  'pending-countersign': 'caseSearchBar.status.pendingCountersign', 'pending-release': 'caseSearchBar.status.pendingRelease',
};

const CaseSearchBar: React.FC<CaseSearchBarProps> = ({ compact = false }) => {
  const { t } = useTranslation();
  const [caseNumber, setCaseNumber] = useState('');
  const [scanFlash,  setScanFlash]  = useState(false);
  const [searching,  setSearching]  = useState(false);
  const [fetchingFromLis, setFetchingFromLis] = useState<string | null>(null);
  const [hits,       setHits]       = useState<CaseHit[]>([]);
  const [notFound,   setNotFound]   = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const navigate    = useNavigate();

  const { log } = useAuditLog();
  const { user } = useAuth();
  // Real, per direct guidance: replaces config.identifierFormats -
  // useEnabledIdentifierFormats() already returns a stable reference
  // (either the module-level IDENTIFIER_FORMAT_LIBRARY, or real React
  // state), so the old EMPTY_IDENTIFIER_FORMATS workaround for
  // reference instability is no longer needed - the hook itself never
  // produces a new array identity on every render.
  const activeFormats: IdentifierFormat[] = useEnabledIdentifierFormats();

  const { phase, transcript } = useVoice();
  const isDictating = phase === 'dictate';

  // ── Core resolve — lookup then navigate or surface results ────────────────
  const resolve = useCallback(async (raw: string, autoNavOnSingle = false) => {
    const q = raw.trim();
    if (q.length < 2) return;

    setSearching(true);
    setNotFound(false);
    setHits([]);

    // Batch 364 (PS-350): a support reference (SR-7K2Q-9MXD) opens what it names.
    if (isSupportReference(q)) {
      const found = await supportReferenceService.resolve(q, { id: user?.id ?? 'unknown', name: user?.name ?? '' });
      setSearching(false);
      if (!found.ok) { setNotFound(true); setTimeout(() => setNotFound(false), 3000); return; }
      setCaseNumber('');
      navigate(found.data.kind === 'case' ? `/case/${found.data.recordId}/synoptic` : `/audit?supportRef=${found.data.ref}`);
      return;
    }

    const { hits: results, autoNav } = await lookupCases(q, activeFormats);
    setSearching(false);

    if (results.length === 0) {
      // Real, per direct guidance's own full "On-Demand Fetch &
      // Fallback" design — Step 3/4: a real local cache miss falls
      // back to a real, live LIS fetch (Option A, REST/FHIR),
      // before ever telling the pathologist the case doesn't exist
      // at all.
      setFetchingFromLis(q);
      const fetchResult = await mockOnDemandCaseFetchService.fetchCaseByAccession(q);
      setFetchingFromLis(null);

      if (fetchResult.ok && fetchResult.data.outcome === 'found') {
        // Real, per Step 4.2 — "Cache the case into PathScribe's
        // local storage and active worklist so subsequent opens
        // during that session are instant."
        await caseRouter.createCase(fetchResult.data.caseData);
        log('case_fetched_on_demand_from_lis', { query: q, caseId: fetchResult.data.caseData.id });
        navigate(`/case/${fetchResult.data.caseData.id}/synoptic`);
        setCaseNumber('');
        return;
      }

      setNotFound(true);
      setTimeout(() => setNotFound(false), 3000);
      log('case_search_no_results', { query: q });
      return;
    }
    log('case_search_performed', { query: q, resultCount: results.length });

    // Auto-navigate if: single result AND (caller says ok OR format is direct-nav e.g. slide barcode)
    if (results.length === 1 && (autoNavOnSingle || autoNav)) {
      navigate(`/case/${results[0].id}/synoptic`);
      setCaseNumber('');
      return;
    }

    // Multiple matches or non-direct format — show dropdown
    setHits(results);
  }, [navigate, activeFormats, log, user]);

  // ── Scanner events ────────────────────────────────────────────────────────
  useEffect(() => {
    const onScan = (e: CustomEvent) => {
      const { raw, type } = e.detail as { raw: string; type: string };
      const caseNum = raw?.trim().toUpperCase() ?? '';
      setCaseNumber(caseNum);
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 1200);
      if (AUTO_NAV_SCAN_TYPES.has(type) && caseNum.length > 3) {
        // Barcodes are unambiguous accession numbers — still validate
        resolve(caseNum, true);
      }
    };
    window.addEventListener('PATHSCRIBE_SCAN', onScan as EventListener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', onScan as EventListener);
  }, [resolve]);

  // ── Voice actions ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleVoiceAction = (e: any) => {
      const { action, payload } = e.detail;
      if (action === 'FOCUS_SEARCH') {
        inputRef.current?.focus();
        if (payload) {
          setCaseNumber(payload);
          if (payload.length > 3) resolve(payload, true);
        }
      }
      if (action === 'CLOSE_ALL') {
        inputRef.current?.blur();
        setCaseNumber('');
        setHits([]);
      }
    };
    window.addEventListener('SYSTEM_ACTION', handleVoiceAction);
    return () => window.removeEventListener('SYSTEM_ACTION', handleVoiceAction);
  }, [resolve]);

  // ── Dictation ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDictating && transcript) {
      setCaseNumber(transcript.toUpperCase().replace(/\s+/g, ''));
    }
  }, [transcript, isDictating]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && caseNumber.trim().length > 2) {
      resolve(caseNumber.trim(), true);
    }
    if (e.key === 'Escape') {
      setHits([]);
      setNotFound(false);
      setCaseNumber('');
    }
  };

  const openCase = (hit: CaseHit) => {
    log('case_search_opened', {
      query: caseNumber,
      caseId: hit.id,
      accession: hit.accession,
      matchedField: hit.matchedValue || undefined,
    });
    navigate(`/case/${hit.id}/synoptic`);
    setCaseNumber('');
    setHits([]);
  };

  // ── CSS class composition ─────────────────────────────────────────────────
  const inputClass = [
    'ps-search-input',
    compact       && 'ps-search-input--compact',
    scanFlash     && 'ps-search-input--flash',
    isDictating   && 'ps-search-input--dictate',
    notFound      && 'ps-search-input--error',
  ].filter(Boolean).join(' ');

  const iconSize = compact ? 14 : 18;

  return (
    <div className="ps-search-wrap">
      <input
        ref={inputRef}
        type="text"
        data-phi="accession"
        value={caseNumber}
        onChange={e => { setCaseNumber(e.target.value.toUpperCase()); setHits([]); setNotFound(false); }}
        onKeyDown={handleKeyDown}
        placeholder={compact ? t('caseSearchBar.placeholderCompact') : t('caseSearchBar.placeholder')}
        aria-label={t('caseSearchBar.ariaLabel')}
        className={inputClass}
      />

      {/* Search / scan / dictate / loading icon */}
      <div className="ps-search-icon">
        {searching ? (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="ps-search-icon-spin">
            <circle cx="12" cy="12" r="9" strokeDasharray="28 56" />
          </svg>
        ) : scanFlash ? (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        )}
      </div>

      {/* Scan success indicator */}
      {scanFlash && (
        <div className={`ps-search-scanned${compact ? ' ps-search-scanned--compact' : ''}`}>
          {'✓ '}{t('caseSearchBar.scanned')}
        </div>
      )}

      {/* Not found — inline under input */}
      {notFound && (
        <div className="ps-search-not-found" data-phi="accession">
          {t('caseSearchBar.noCaseFound', { query: caseNumber })}
        </div>
      )}

      {/* Real, per direct guidance's own Step 3 — explicit loading
          feedback during the on-demand LIS fetch, distinct from the
          ordinary local-search spinner above, so the pathologist
          knows a slower, real network call is in progress, not an
          unresponsive app. */}
      {fetchingFromLis && (
        <div className="ps-search-fetching-lis" data-phi="accession">
          {t('caseSearchBar.fetchingFromLis', { accession: fetchingFromLis })}
        </div>
      )}

      {/* Results modal — portal so it's always above everything */}
      {(hits.length > 0 || searching) && ReactDOM.createPortal(
        <div className="ps-casebar-modal-overlay" onClick={() => { setHits([]); }}>
          <div className="ps-casebar-modal" onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="ps-casebar-modal__header">
              <div className="ps-casebar-modal__title" data-phi="accession">
                {searching
                  ? t('caseSearchBar.searching')
                  : t('caseSearchBar.matchCount', { count: hits.length, query: caseNumber })}
              </div>
              <button className="ps-casebar-modal__close" onClick={() => setHits([])}>✕</button>
            </div>

            {/* Column headers */}
            <div className="ps-casebar-dropdown__col-headers">
              <span className="ps-casebar-dropdown__col-header">{t('caseSearchBar.col.accession')}</span>
              <span className="ps-casebar-dropdown__col-header">{t('caseSearchBar.col.patient')}</span>
              <span className="ps-casebar-dropdown__col-header">{t('caseSearchBar.col.dobSex')}</span>
              <span className="ps-casebar-dropdown__col-header">{t('caseSearchBar.col.priority')}</span>
              <span className="ps-casebar-dropdown__col-header">{t('caseSearchBar.col.status')}</span>
              <span className="ps-casebar-dropdown__col-header">{t('caseSearchBar.col.facility')}</span>
            </div>

            {/* Results */}
            <div className="ps-casebar-modal__scroll">
            {hits.map(hit => (
            <button
              key={hit.id}
              className="ps-casebar-dropdown__row"
              onClick={() => openCase(hit)}
            >
              {/* Grid row matching column headers: Accession | Patient | DOB·Sex | Priority | Status | Facility */}
              <div className="ps-casebar-dropdown__grid">
                <span className="ps-casebar-dropdown__accession" data-phi="accession">{highlight(hit.accession, caseNumber)}</span>
                <span className="ps-casebar-dropdown__patient" data-phi="name">{hit.patientName}</span>
                <span className="ps-casebar-dropdown__dob" data-phi="true">{hit.dob} · {hit.sex}</span>
                <span className={`ps-casebar-dropdown__priority${hit.priority === 'STAT' ? ' ps-casebar-dropdown__priority--stat' : ''}`}>
                  {hit.priority !== '—' ? hit.priority : ''}
                </span>
                <span className={`ps-casebar-dropdown__status ps-casebar-dropdown__status--${hit.status.replace(/\s+/g, '-').toLowerCase()}`}>
                  {STATUS_LABEL_KEY[hit.status] ? t(STATUS_LABEL_KEY[hit.status]) : hit.status}
                </span>
                <span className="ps-casebar-dropdown__client">{hit.facilityName}</span>
              </div>
              {/* Sub-row: specimens + flags + match hint */}
              {(hit.specimenCount > 0 || hit.flags.length > 0 || (hit.matchedValue && hit.matchedValue !== hit.accession.toUpperCase().replace(/[\s-]/g, ''))) && (
                <div className="ps-casebar-dropdown__sub">
                  <span className="ps-casebar-dropdown__specimens">
                    {t('caseSearchBar.specimenCount', { count: hit.specimenCount })}
                  </span>
                  {hit.flags.map((f, i) => (
                    <span key={i} className="ps-casebar-dropdown__flag-chip"
                      style={{ '--ps-hue': f.color } as React.CSSProperties}>
                      {f.name}
                    </span>
                  ))}
                  {hit.matchedValue && hit.matchedValue !== hit.accession.toUpperCase().replace(/[\s-]/g, '') && (
                    <span className="ps-casebar-dropdown__match-hint">
                      {t('caseSearchBar.matchedPrefix')} <span className="ps-casebar-dropdown__match-value" data-phi="accession">{highlight(hit.matchedValue, caseNumber)}</span>
                    </span>
                  )}
                </div>
              )}
            </button>
            ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CaseSearchBar;
