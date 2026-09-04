// src/pages/BillingLogsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own follow-up: replaces the earlier Case
// Billing Audit Trail (removed from QA and Configuration > System
// entirely) with a dedicated, standalone search experience living
// under Audit Page > Financial.
//
// Real, per direct guidance's own second follow-up ("the screen
// doesn't look like I imagined... reuse those css classes"): this
// isn't just SearchPage.tsx's outer shell (sidebar/results-pane) —
// the actual filter fields now genuinely reuse its own real, dense
// visual language (SectionLabel, ps-searchpage-filter-input, the
// compact "+ Save Query"/"N filters" header pattern, bottom-anchored
// Clear/Search buttons) rather than the spacious ps-conf-* classes
// built for admin config screens. Staff is a real, multi-select
// "Browse (N)" picker against the actual staff directory
// (userService.getAll()), reusing the shared LookupModal component
// directly - the exact same real pattern SearchPage.tsx already uses
// for Pathologist and Attending Physician, confirmed via direct
// comparison against its own UserLookupContent.
//
// All real search/aggregation logic still lives in
// searchBillingAuditLog.ts (services/billing/) - this component only
// renders filter inputs and that function's own, already-computed
// result, same discipline as the code it replaces.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import '../pathscribe.css';
import { LookupModal, LookupItem, LookupEmpty } from '../components/Common/LookupModal';
import { useAuth } from '@/contexts/AuthContext';
import {
  searchBillingAuditLog,
  BILLING_AUDIT_LOG_KIND_LABEL,
} from '@/services/billing/searchBillingAuditLog';
import type { BillingAuditLogFilters, BillingAuditLogEntry, BillingAuditLogEventKind } from '@/services/billing/searchBillingAuditLog';
import { userService, facilityService } from '@/services';
import { downloadCSV, buildMetaHeader } from '@/utils/csvExport';

const LS_KEY = 'pathscribe:savedBillingLogQueries';
interface SavedQuery { id: string; name: string; filters: BillingAuditLogFilters; createdAt: string; }
const lsLoad = (): SavedQuery[] => { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } };
const lsSave = (s: SavedQuery[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* best-effort */ } };

interface StaffStub { id: string; name: string; roles: string; }
interface FacilityStub { id: string; name: string; }

const STATUS_OPTIONS: { value: NonNullable<BillingAuditLogFilters['approvalStatus']> | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'EXPORTED', label: 'Exported' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'HOLD', label: 'Hold' },
];

const BILLING_TYPE_OPTIONS: { value: BillingAuditLogFilters['billingType'] | ''; label: string }[] = [
  { value: '', label: 'All Billing Types' },
  { value: 'TC', label: 'TC (Technical Component)' },
  { value: '26', label: '26 (Professional Component)' },
  { value: 'Global', label: 'Global (Combined)' },
];

const TYPE_OPTIONS: { value: BillingAuditLogEventKind | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'charge', label: 'Charge' },
  { value: 'credit', label: 'Credit' },
  { value: 'deficiency', label: 'Deficiency' },
  { value: 'code_review', label: 'Code Review' },
  { value: 'dispatch', label: 'Dispatch' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'audit', label: 'Audit' },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function emptyFilters(): BillingAuditLogFilters {
  return {
    caseNumber: '', patientName: '', patientId: '', serviceDateFrom: '', serviceDateTo: '', type: undefined, detail: '', staff: [],
    dateOfServiceFrom: '', dateOfServiceTo: '', signOutDateFrom: '', signOutDateTo: '',
    signingPathologist: [], clientIds: [], billingType: undefined, approvalStatus: undefined,
    patientNameRangeFrom: '', patientNameRangeTo: '',
  };
}

function summarizeFilters(f: BillingAuditLogFilters): string {
  const parts: string[] = [];
  if (f.caseNumber) parts.push(`Case ${f.caseNumber}`);
  if (f.patientName) parts.push(`Patient "${f.patientName}"`);
  if (f.patientId) parts.push(`ID ${f.patientId}`);
  if (f.patientNameRangeFrom || f.patientNameRangeTo) parts.push(`Name ${f.patientNameRangeFrom || 'A'}\u2013${f.patientNameRangeTo || 'Z'}`);
  if (f.serviceDateFrom || f.serviceDateTo) parts.push(`Billing Event ${f.serviceDateFrom || '…'} – ${f.serviceDateTo || '…'}`);
  if (f.dateOfServiceFrom || f.dateOfServiceTo) parts.push(`DOS ${f.dateOfServiceFrom || '…'} – ${f.dateOfServiceTo || '…'}`);
  if (f.signOutDateFrom || f.signOutDateTo) parts.push(`Sign-out ${f.signOutDateFrom || '…'} – ${f.signOutDateTo || '…'}`);
  if (f.type) parts.push(BILLING_AUDIT_LOG_KIND_LABEL[f.type]);
  if (f.billingType) parts.push(f.billingType);
  if (f.approvalStatus) parts.push(f.approvalStatus);
  if (f.staff && f.staff.length > 0) parts.push(`Staff: ${f.staff.join(', ')}`);
  if (f.signingPathologist && f.signingPathologist.length > 0) parts.push(`Pathologist: ${f.signingPathologist.join(', ')}`);
  if (f.clientIds && f.clientIds.length > 0) parts.push(`Facility: ${f.clientIds.length}`);
  if (f.detail) parts.push(`"${f.detail}"`);
  return parts.join(', ') || 'All billing events';
}

// SectionLabel, Chip, BrowseBtn — same real, small components SearchPage.tsx
// defines locally (not exported from a shared file), reproduced here
// identically rather than reaching across page files for private helpers.
const SectionLabel: React.FC<{ title: string }> = ({ title }) => (
  <div className="ps-searchpage-section-label">{title}</div>
);

const Chip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <span className="ps-searchpage-chip" style={{ '--accent': '#0891B2' } as React.CSSProperties}>
    {label}
    <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }} className="ps-searchpage-chip-remove">×</button>
  </span>
);

const BrowseBtn: React.FC<{ onClick: () => void; count?: number }> = ({ onClick, count }) => (
  <button type="button" onClick={onClick} className="ps-searchpage-browse-btn">
    {count ? `Browse (${count})` : 'Browse'}
  </button>
);

const toggle = (val: string, list: string[], setter: (v: string[]) => void) =>
  list.includes(val) ? setter(list.filter(x => x !== val)) : setter([...list, val]);

const initials = (name: string) => {
  const p = name.replace(/^(Dr|Mr|Ms|Mrs|Prof|Mx)\.\s*/i, '').split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0]?.[0]?.toUpperCase() ?? '?';
};

/** Real, per direct guidance - the same real Browse-modal content
 *  shape as SearchPage.tsx's own UserLookupContent, simplified to a
 *  single search field since a general staff picker (any real role,
 *  not just pathologists tied to a subspecialty or attendings tied to
 *  a client) has no second, meaningful axis to search by. */
const StaffLookupContent: React.FC<{ staff: StaffStub[]; selected: string[]; onToggle: (name: string) => void }> = ({ staff, selected, onToggle }) => {
  const [q, setQ] = useState('');
  const filtered = staff.filter(s => q.length < 1 || s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="ps-searchpage-user-search-row">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…" className="ps-searchpage-user-search-input" />
      </div>
      {filtered.length === 0
        ? <LookupEmpty query={q} />
        : filtered.map(s => (
            <LookupItem key={s.id} selected={selected.includes(s.name)} onToggle={() => onToggle(s.name)}
              primary={s.name} secondary={s.roles} badge={initials(s.name)} />
          ))
      }
    </>
  );
};

/** Real, per direct follow-up - the same real Browse-modal content
 *  shape as SearchPage.tsx's own FacilityLookupContent. */
const FacilityLookupContent: React.FC<{ facilities: FacilityStub[]; selected: string[]; onToggle: (id: string) => void }> = ({ facilities, selected, onToggle }) => {
  const [q, setQ] = useState('');
  const filtered = facilities.filter(c => q.length < 1 || c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="ps-searchpage-user-search-row">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by facility name…" className="ps-searchpage-user-search-input" />
      </div>
      {filtered.length === 0
        ? <LookupEmpty query={q} />
        : filtered.map(c => (
            <LookupItem key={c.id} selected={selected.includes(c.id)} onToggle={() => onToggle(c.id)}
              primary={c.name} secondary={c.id.toUpperCase()} badge={initials(c.name)} />
          ))
      }
    </>
  );
};

const BillingLogsSection: React.FC = () => {
  const { user: storedUser } = useAuth();
  const requestedByLabel = storedUser?.name ?? storedUser?.email ?? 'Unknown';

  const [caseNumber, setCaseNumber] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [nameRangeFrom, setNameRangeFrom] = useState('');
  const [nameRangeTo, setNameRangeTo] = useState('');
  const [serviceDateFrom, setServiceDateFrom] = useState('');
  const [serviceDateTo, setServiceDateTo] = useState('');
  const [dateOfServiceFrom, setDateOfServiceFrom] = useState('');
  const [dateOfServiceTo, setDateOfServiceTo] = useState('');
  const [signOutDateFrom, setSignOutDateFrom] = useState('');
  const [signOutDateTo, setSignOutDateTo] = useState('');
  const [type, setType] = useState<BillingAuditLogEventKind | ''>('');
  const [billingType, setBillingType] = useState<BillingAuditLogFilters['billingType'] | ''>('');
  const [approvalStatus, setApprovalStatus] = useState<BillingAuditLogFilters['approvalStatus'] | ''>('');
  const [detail, setDetail] = useState('');
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [staffModal, setStaffModal] = useState(false);
  const [pathologistNames, setPathologistNames] = useState<string[]>([]);
  const [pathologistModal, setPathologistModal] = useState(false);
  const [facilityIds, setFacilityIds] = useState<string[]>([]);
  const [facilityModal, setFacilityModal] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<BillingAuditLogEntry[] | null>(null);
  const [casesCapped, setCasesCapped] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [staffOptions, setStaffOptions] = useState<StaffStub[]>([]);
  const [pathologistOptions, setPathologistOptions] = useState<StaffStub[]>([]);
  const [facilityOptions, setFacilityOptions] = useState<FacilityStub[]>([]);
  useEffect(() => {
    userService.getAll().then(res => {
      if (!res.ok) return;
      const active = res.data.filter(u => u.status === 'Active');
      setStaffOptions(active.map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, roles: u.roles.join(', ') })));
      // Real, per direct follow-up: signing pathologist is a real,
      // separate concept from staff above (whoever handled an
      // individual billing event) - scoped to the real, active
      // pathologist role, matching SearchPage.tsx's own Pathologist
      // picker.
      setPathologistOptions(active.filter(u => u.roles.includes('Pathologist')).map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, roles: u.roles.join(', ') })));
    }).catch(() => {});
    facilityService.getAll().then(res => {
      if (res.ok) setFacilityOptions(res.data.map(c => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(lsLoad);
  const [activeSavedId, setActiveSavedId] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const saveInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (showSaveInput) saveInputRef.current?.focus(); }, [showSaveInput]);
  useEffect(() => { lsSave(savedQueries); }, [savedQueries]);

  const currentFilters = (): BillingAuditLogFilters => ({
    caseNumber, patientName, patientId, serviceDateFrom, serviceDateTo,
    type: type || undefined, detail, staff: staffNames,
    dateOfServiceFrom, dateOfServiceTo, signOutDateFrom, signOutDateTo,
    signingPathologist: pathologistNames, clientIds: facilityIds,
    billingType: billingType || undefined, approvalStatus: approvalStatus || undefined,
    patientNameRangeFrom: nameRangeFrom, patientNameRangeTo: nameRangeTo,
  });

  const activeCount = [
    caseNumber, patientName, patientId, detail, nameRangeFrom, nameRangeTo,
    serviceDateFrom ? 'df' : '', serviceDateTo ? 'dt' : '',
    dateOfServiceFrom ? 'dosf' : '', dateOfServiceTo ? 'dost' : '',
    signOutDateFrom ? 'sof' : '', signOutDateTo ? 'sot' : '',
    type, billingType, approvalStatus, ...staffNames, ...pathologistNames, ...facilityIds,
  ].filter(Boolean).length;

  const applyFilters = (f: BillingAuditLogFilters) => {
    setCaseNumber(f.caseNumber ?? '');
    setPatientName(f.patientName ?? '');
    setPatientId(f.patientId ?? '');
    setNameRangeFrom(f.patientNameRangeFrom ?? '');
    setNameRangeTo(f.patientNameRangeTo ?? '');
    setServiceDateFrom(f.serviceDateFrom ?? '');
    setServiceDateTo(f.serviceDateTo ?? '');
    setDateOfServiceFrom(f.dateOfServiceFrom ?? '');
    setDateOfServiceTo(f.dateOfServiceTo ?? '');
    setSignOutDateFrom(f.signOutDateFrom ?? '');
    setSignOutDateTo(f.signOutDateTo ?? '');
    setType(f.type ?? '');
    setBillingType(f.billingType ?? '');
    setApprovalStatus(f.approvalStatus ?? '');
    setDetail(f.detail ?? '');
    setStaffNames(f.staff ?? []);
    setPathologistNames(f.signingPathologist ?? []);
    setFacilityIds(f.clientIds ?? []);
  };

  const handleSearch = async (filters: BillingAuditLogFilters) => {
    setBusy(true);
    setErrorMsg(null);
    setHasSearched(true);
    const res = await searchBillingAuditLog(filters);
    setBusy(false);
    if (res.ok === false) { setErrorMsg(res.error); setResults(null); return; }
    setResults(res.data.entries);
    setCasesCapped(res.data.casesCapped);
  };

  const handleClear = () => {
    applyFilters(emptyFilters());
    setActiveSavedId('');
  };

  const handleSaveQuery = () => {
    const name = saveNameInput.trim();
    if (!name || activeCount === 0) return;
    const nq: SavedQuery = { id: crypto.randomUUID(), name, filters: currentFilters(), createdAt: new Date().toISOString() };
    setSavedQueries(p => [...p, nq]);
    setActiveSavedId(nq.id);
    setSaveNameInput('');
    setShowSaveInput(false);
  };

  const handleLoadQuery = (id: string) => {
    const q = savedQueries.find(x => x.id === id);
    if (!q) return;
    applyFilters(q.filters);
    setActiveSavedId(id);
    void handleSearch(q.filters);
  };

  const handleDeleteQuery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedQueries(p => p.filter(x => x.id !== id));
    if (activeSavedId === id) setActiveSavedId('');
  };

  /** Real, per direct request: "just need to add the export
   *  capability." Reuses the same shared buildMetaHeader/downloadCSV
   *  helpers the other 4 real AuditLogPage.tsx exports already use
   *  (extracted to utils/csvExport.ts for this) - but passes
   *  containsPatientIdentifiers: true, since this export's own rows
   *  genuinely include patient name and MRN/MPI, unlike those 4. */
  const handleExportCSV = () => {
    if (!results || results.length === 0) return;
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const meta = buildMetaHeader(
      'Billing Log',
      requestedByLabel,
      {
        'Case': caseNumber, 'Patient Name': patientName, 'Patient ID': patientId,
        'Name Range': nameRangeFrom || nameRangeTo ? `${nameRangeFrom || 'A'} to ${nameRangeTo || 'Z'}` : '',
        'Billing Event Date': serviceDateFrom || serviceDateTo ? `${serviceDateFrom || '…'} to ${serviceDateTo || '…'}` : '',
        'Date of Service': dateOfServiceFrom || dateOfServiceTo ? `${dateOfServiceFrom || '…'} to ${dateOfServiceTo || '…'}` : '',
        'Sign-out Date': signOutDateFrom || signOutDateTo ? `${signOutDateFrom || '…'} to ${signOutDateTo || '…'}` : '',
        'Type': type, 'Billing Type': billingType ?? '', 'Status': approvalStatus ?? '',
        'Staff': staffNames.join('; '), 'Pathologist': pathologistNames.join('; '),
        'Facility': facilityIds.map(id => facilityOptions.find(c => c.id === id)?.name ?? id).join('; '),
        'Detail': detail,
      },
      results.length,
      true,
    );
    const data = [
      ['Case', 'Patient', 'Patient ID', 'Timestamp', 'Type', 'Billing Type', 'Status', 'Event', 'Detail', 'Staff', 'Pathologist', 'Facility'].join(','),
      ...results.map(e => [
        e.caseNumber, e.patientName, e.patientId, e.timestamp, BILLING_AUDIT_LOG_KIND_LABEL[e.kind],
        e.billingType ?? '', e.approvalStatus ?? '', e.label, e.detail, e.staff, e.signingPathologist ?? '', e.clientName ?? '',
      ].map(esc).join(',')),
    ];
    downloadCSV(meta + data.join('\n'), `pathscribe-billing-log-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="ps-search-shell" style={{ height: '100%' }}>
      <div className="ps-search-header">
        <div className="ps-search-header-row">
          <div>
            <div className="ps-search-title-block-title">Billing Logs</div>
            <div className="ps-search-title-block-sub">
              Search every real billing event — charges, credits, corrections, deficiencies, code review
              activity, dispatch history, and amendments — across cases.
            </div>
          </div>
          <div className="ps-search-saved-chips">
            {savedQueries.map(q => (
              <button key={q.id} type="button" onClick={() => handleLoadQuery(q.id)} className={`ps-searchpage-saved-chip${activeSavedId === q.id ? ' ps-searchpage-saved-chip--active' : ''}`} title={summarizeFilters(q.filters)}>
                {q.name}
                <span onClick={e => handleDeleteQuery(q.id, e)} className="ps-searchpage-saved-chip-remove">×</span>
              </button>
            ))}
            {showSaveInput ? (
              <div className="ps-searchpage-save-row">
                <input ref={saveInputRef} type="text" value={saveNameInput} onChange={e => setSaveNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveQuery(); if (e.key === 'Escape') { setShowSaveInput(false); setSaveNameInput(''); } }}
                  placeholder="Name this query…" className="ps-searchpage-save-input" />
                <button type="button" onClick={handleSaveQuery} className="ps-searchpage-save-btn">Save</button>
                <button type="button" onClick={() => { setShowSaveInput(false); setSaveNameInput(''); }} className="ps-searchpage-save-cancel-btn">✕</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowSaveInput(true)} className="ps-searchpage-save-new-btn">+ Save Query</button>
            )}
            {activeCount > 0 && <span className="ps-searchpage-active-count-badge">{activeCount} filter{activeCount !== 1 ? 's' : ''}</span>}
          </div>
        </div>
      </div>

      <main className="ps-search-main">
        <div className="ps-search-row">
          <aside className={`ps-search-sidebar ${sidebarCollapsed ? 'collapsed' : 'expanded'}`}>
            {sidebarCollapsed ? (
              <div className="ps-search-rail">
                <button type="button" className="ps-search-rail-toggle" onClick={() => setSidebarCollapsed(false)} title="Expand filters">
                  &rsaquo;
                </button>
                <div className="ps-search-rail-badge">Filters</div>
              </div>
            ) : (
              <>
                <button type="button" className="ps-search-sidebar-toggle" onClick={() => setSidebarCollapsed(true)} title="Collapse filters">
                  &lsaquo;
                </button>
                <form onSubmit={e => { e.preventDefault(); void handleSearch(currentFilters()); }} className="ps-search-form">

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Case Number" /></div>
                  <input className="ps-searchpage-filter-input" value={caseNumber} onChange={e => setCaseNumber(e.target.value)} placeholder="Accession or case ID" />

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Patient Name" /></div>
                  <input className="ps-searchpage-filter-input" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Last, First" />

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Patient Name Range (A\u2013Z)" /></div>
                  <div className="ps-searchpage-date-grid">
                    <div>
                      <div className="ps-searchpage-date-label">From</div>
                      <input className="ps-searchpage-filter-input" value={nameRangeFrom} onChange={e => setNameRangeFrom(e.target.value)} placeholder="e.g. Smith" />
                    </div>
                    <div>
                      <div className="ps-searchpage-date-label">To</div>
                      <input className="ps-searchpage-filter-input" value={nameRangeTo} onChange={e => setNameRangeTo(e.target.value)} placeholder="e.g. Williams" />
                    </div>
                  </div>

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Patient ID (MRN, MPI)" /></div>
                  <input className="ps-searchpage-filter-input" value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="MRN or MPI" />

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Billing Event Date" /></div>
                  <div className="ps-searchpage-date-grid">
                    <div>
                      <div className="ps-searchpage-date-label">From</div>
                      <input type="date" value={serviceDateFrom} onChange={e => setServiceDateFrom(e.target.value)} aria-label="Event date from" className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                    </div>
                    <div>
                      <div className="ps-searchpage-date-label">To</div>
                      <input type="date" value={serviceDateTo} onChange={e => setServiceDateTo(e.target.value)} aria-label="Event date to" className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                    </div>
                  </div>

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Date of Service" /></div>
                  <div className="ps-searchpage-date-grid">
                    <div>
                      <div className="ps-searchpage-date-label">From</div>
                      <input type="date" value={dateOfServiceFrom} onChange={e => setDateOfServiceFrom(e.target.value)} aria-label="Date of service from" className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                    </div>
                    <div>
                      <div className="ps-searchpage-date-label">To</div>
                      <input type="date" value={dateOfServiceTo} onChange={e => setDateOfServiceTo(e.target.value)} aria-label="Date of service to" className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                    </div>
                  </div>

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Report Sign-out Date" /></div>
                  <div className="ps-searchpage-date-grid">
                    <div>
                      <div className="ps-searchpage-date-label">From</div>
                      <input type="date" value={signOutDateFrom} onChange={e => setSignOutDateFrom(e.target.value)} aria-label="Sign-out date from" className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                    </div>
                    <div>
                      <div className="ps-searchpage-date-label">To</div>
                      <input type="date" value={signOutDateTo} onChange={e => setSignOutDateTo(e.target.value)} aria-label="Sign-out date to" className="ps-searchpage-filter-input ps-searchpage-filter-input--date" />
                    </div>
                  </div>

                  <div className="ps-searchpage-inline-grid">
                    <div>
                      <div className="ps-searchpage-section-mb4"><SectionLabel title="Type" /></div>
                      <select className="ps-searchpage-filter-input" value={type} onChange={e => setType(e.target.value as BillingAuditLogEventKind | '')}>
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="ps-searchpage-section-mb4"><SectionLabel title="Billing Type" /></div>
                      <select className="ps-searchpage-filter-input" value={billingType} onChange={e => setBillingType(e.target.value as BillingAuditLogFilters['billingType'] | '')}>
                        {BILLING_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Status" /></div>
                  <select className="ps-searchpage-filter-input" value={approvalStatus} onChange={e => setApprovalStatus(e.target.value as BillingAuditLogFilters['approvalStatus'] | '')}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>

                  <div className="ps-searchpage-header-row">
                    <SectionLabel title="Staff" />
                    <BrowseBtn onClick={() => setStaffModal(true)} count={staffOptions.length} />
                  </div>
                  {staffNames.length > 0 && (
                    <div className="ps-searchpage-pill-row">
                      {staffNames.map(n => <Chip key={n} label={n} onRemove={() => toggle(n, staffNames, setStaffNames)} />)}
                    </div>
                  )}

                  <div className="ps-searchpage-header-row">
                    <SectionLabel title="Signing Pathologist" />
                    <BrowseBtn onClick={() => setPathologistModal(true)} count={pathologistOptions.length} />
                  </div>
                  {pathologistNames.length > 0 && (
                    <div className="ps-searchpage-pill-row">
                      {pathologistNames.map(n => <Chip key={n} label={n} onRemove={() => toggle(n, pathologistNames, setPathologistNames)} />)}
                    </div>
                  )}

                  <div className="ps-searchpage-header-row">
                    <SectionLabel title="Ordering Facility" />
                    <BrowseBtn onClick={() => setFacilityModal(true)} count={facilityOptions.length} />
                  </div>
                  {facilityIds.length > 0 && (
                    <div className="ps-searchpage-pill-row">
                      {facilityIds.map(id => <Chip key={id} label={facilityOptions.find(c => c.id === id)?.name ?? id} onRemove={() => toggle(id, facilityIds, setFacilityIds)} />)}
                    </div>
                  )}

                  <div className="ps-searchpage-section-mb4"><SectionLabel title="Detail" /></div>
                  <input className="ps-searchpage-filter-input" value={detail} onChange={e => setDetail(e.target.value)} placeholder="Search within event detail" />

                  <div className="ps-search-actions">
                    <button type="button" onClick={handleClear} className="ps-search-btn-clear">Clear</button>
                    <button type="submit" disabled={busy} className="ps-search-btn-submit">
                      {busy ? 'Searching…' : 'Search'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </aside>

          <div data-capture-hide="true" className="ps-search-results-pane">
            <div className="ps-search-summary-bar">
              {hasSearched ? (
                <p className="ps-searchpage-summary-text">{summarizeFilters(currentFilters())}</p>
              ) : (
                <p className="ps-searchpage-summary-empty">Set filters and press <strong className="ps-searchpage-summary-cta">Search</strong> to begin</p>
              )}
              <div className="ps-search-summary-actions">
                {results !== null && <span className="ps-searchpage-result-count">{results.length} event{results.length !== 1 ? 's' : ''}</span>}
                {results !== null && results.length > 0 && (
                  <button type="button" onClick={handleExportCSV} className="ps-searchpage-export-btn">Export CSV</button>
                )}
              </div>
            </div>

            {errorMsg && <p className="ps-conf-error-text">{errorMsg}</p>}
            {casesCapped && <p className="ps-billing-reason-hint">Case limit reached — narrow the search (case number, patient name, or ID) for a complete result.</p>}

            <div className="ps-search-table-wrap">
              {hasSearched ? (
                results && results.length > 0 ? (
                  <div className="ps-conf-table-wrap">
                    <div className="ps-conf-table-scroll">
                      <table className="ps-conf-table">
                        <thead className="ps-conf-thead-sticky"><tr>{['Case', 'Patient', 'Patient ID', 'Timestamp', 'Type', 'Billing Type', 'Status', 'Event', 'Detail', 'Staff', 'Pathologist', 'Facility'].map(h => <th key={h} className={h === 'Detail' ? 'ps-conf-th ps-billinglog-detail-col' : 'ps-conf-th'}>{h}</th>)}</tr></thead>
                        <tbody>
                          {results.map(e => (
                            <tr key={e.id} className="ps-conf-tr">
                              <td className="ps-conf-td">{e.caseNumber}</td>
                              <td className="ps-conf-td">{e.patientName}</td>
                              <td className="ps-conf-td">{e.patientId}</td>
                              <td className="ps-conf-td">{formatDateTime(e.timestamp)}</td>
                              <td className="ps-conf-td">{BILLING_AUDIT_LOG_KIND_LABEL[e.kind]}</td>
                              <td className="ps-conf-td">{e.billingType ?? '—'}</td>
                              <td className="ps-conf-td">{e.approvalStatus ?? '—'}</td>
                              <td className="ps-conf-td">{e.label}</td>
                              <td className="ps-conf-td ps-billinglog-detail-col">{e.detail}</td>
                              <td className="ps-conf-td">{e.staff}</td>
                              <td className="ps-conf-td">{e.signingPathologist ?? '—'}</td>
                              <td className="ps-conf-td">{e.clientName ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="ps-searchpage-no-search">No real billing events match these filters.</div>
                )
              ) : (
                <div className="ps-searchpage-no-search">No search run yet</div>
              )}
            </div>
          </div>
        </div>
      </main>

      {staffModal && (
        <LookupModal title="Staff" subtitle="Filter by staff member associated with the event" selectedCount={staffNames.length} onClose={() => setStaffModal(false)}>
          <StaffLookupContent staff={staffOptions} selected={staffNames} onToggle={name => toggle(name, staffNames, setStaffNames)} />
        </LookupModal>
      )}

      {pathologistModal && (
        <LookupModal title="Signing Pathologist" subtitle="Filter by the case's own real signing pathologist" selectedCount={pathologistNames.length} onClose={() => setPathologistModal(false)}>
          <StaffLookupContent staff={pathologistOptions} selected={pathologistNames} onToggle={name => toggle(name, pathologistNames, setPathologistNames)} />
        </LookupModal>
      )}

      {facilityModal && (
        <LookupModal title="Ordering Facility" subtitle="Filter by the case's own real ordering facility" selectedCount={facilityIds.length} onClose={() => setFacilityModal(false)}>
          <FacilityLookupContent facilities={facilityOptions} selected={facilityIds} onToggle={id => toggle(id, facilityIds, setFacilityIds)} />
        </LookupModal>
      )}
    </div>
  );
};

export default BillingLogsSection;
