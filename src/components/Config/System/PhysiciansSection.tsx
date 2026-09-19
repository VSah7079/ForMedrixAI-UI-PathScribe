// src/components/Config/System/PhysiciansSection.tsx
// ─────────────────────────────────────────────────────────────
// Migrated off the inline-style-constant pattern (FIELD/LABEL/INPUT/
// SELECT/ROW2 objects) and off modalStyles.ts onto pathscribe.css's
// ps-conf-* classes, June 2026. modalStyles.ts's own header marks it
// deprecated in favor of CSS classes and lists this file as a consumer
// still needing the refactor — this is that refactor.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '../../../utils/csv';
import '../../../pathscribe.css';
import { physicianService, facilityService } from '../../../services';
import type { Physician } from '../../../services';
import { SuffixSelect } from '../../Common/SuffixSelect';
import { formatFullDisplayName } from '../../../utils/personName';
import { preparePersonDuplicate } from '../../../utils/duplicateEntry';
import { findDuplicate } from '../../../utils/validateUnique';

// Physician imported from services/physicians/IPhysicianService.ts (via
// the services barrel) rather than redeclared locally — see git history
// for the reconciliation story (this component used to have its own
// diverged copy, status: 'Active' | 'Inactive' only, no autoCreated).

function initials(p: Physician) { return (p.givenNames[0] + p.familyNames[0]).toUpperCase(); }
function fullName(p: Physician) { return formatFullDisplayName(p); }

// Person-specific/identity fields cleared when duplicating a physician
// (PS-73) — name, NPI, physician code, and direct contact info. NOT
// cleared: specialty, clientIds, preferredContact, status — those are
// organizational context, the actual point of the starting-template
// clone (see preparePersonDuplicate's own header for the full
// reasoning on why this isn't prepareDuplicate's generic "(Copy)"
// suffix behavior).
const PHYSICIAN_PERSON_FIELDS: (keyof Physician)[] = [
  'namePrefix', 'givenNames', 'familyNames', 'preferredName', 'nameSuffix',
  'firstName', 'lastName', 'npi', 'physicianCode', 'phone', 'fax', 'email',
];

// ─── Toggle ───────────────────────────────────────────────────────────────────
const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <div className="ps-conf-toggle-row">
    <div onClick={() => onChange(!value)} className={`ps-conf-toggle-track ${value ? 'ps-conf-toggle-track--active' : ''}`}>
      <div className="ps-conf-toggle-thumb" />
    </div>
    <span className={`ps-conf-toggle-label ${value ? 'ps-conf-toggle-label--active' : ''}`}>{value ? 'Active' : 'Inactive'}</span>
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
type Draft = Omit<Physician, 'id'> & { active: boolean };

const emptyDraft: Draft = {
  namePrefix: 'Dr.', givenNames: '', familyNames: '', preferredName: '', nameSuffix: '',
  firstName: '', lastName: '', // stale by design — mockPhysicianService always recomputes these from givenNames/familyNames on save
  physicianCode: '', npi: '', specialty: '', phone: '', fax: '',
  email: '', preferredContact: 'Email', clientIds: [], status: 'Active', active: true,
};

interface PhysicianModalProps {
  mode: 'add' | 'edit';
  physician?: Physician;
  /** Display name of the source physician, when `physician` is a
   *  duplicate-template prefill rather than the real record being
   *  edited. Header-only — the draft's own name fields are already
   *  cleared by preparePersonDuplicate before this modal ever opens
   *  (see PhysiciansSection's own handleClonePhysician), so there's no
   *  name left in `physician` to read for the header text. */
  cloneSourceName?: string;
  facilities: { id: string; name: string }[];
  existingEntries: Physician[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const PhysicianModal: React.FC<PhysicianModalProps> = ({ mode, physician, cloneSourceName, facilities, existingEntries, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(
    physician
      ? { ...physician, active: physician.status === 'Active' }
      : emptyDraft
  );
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [facilitySearch, setFacilitySearch] = useState('');

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const toggleFacility = (id: string) => {
    setDraft(prev => ({
      ...prev,
      clientIds: prev.clientIds.includes(id) ? prev.clientIds.filter(x => x !== id) : [...prev.clientIds, id],
    }));
  };

  // excludeId only applies in real 'edit' mode — in 'add' mode
  // (including a duplicate template, which prefills but is still a
  // real add) nothing is excluded, so saving a clone without giving it
  // its own physician code/NPI is correctly caught, same convention as
  // every sibling dictionary's own required+unique field.
  const excludeId = mode === 'edit' ? physician?.id : undefined;

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.givenNames.trim()) e.givenNames = 'Required';
    if (!draft.familyNames.trim())  e.familyNames  = 'Required';

    // Physician Code: required, unique across the whole directory
    // (PS-73) — independent of NPI, so checked as its own single-key
    // collision, not compounded with anything else.
    if (!draft.physicianCode.trim()) {
      e.physicianCode = 'Required';
    } else {
      const codeCollision = findDuplicate(existingEntries, { physicianCode: draft.physicianCode.trim() }, ['physicianCode'], excludeId);
      if (codeCollision) e.physicianCode = `Physician code "${codeCollision.physicianCode}" is already assigned to ${fullName(codeCollision)}.`;
    }

    // NPI: optional (confirmed — not every physician has one, e.g. UK
    // physicians) — uniqueness only checked when a value is actually
    // present, never against another blank.
    if (draft.npi.trim()) {
      const npiCollision = findDuplicate(existingEntries, { npi: draft.npi.trim() }, ['npi'], excludeId);
      if (npiCollision) e.npi = `NPI ${npiCollision.npi} is already assigned to ${fullName(npiCollision)}.`;
    }

    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  const filteredFacilities = facilities.filter(c =>
    !facilitySearch || c.name.toLowerCase().includes(facilitySearch.toLowerCase())
  );

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide">
        <div className="ps-ms-header">
          {mode === 'edit'
            ? `Edit — ${formatFullDisplayName(physician!)}`
            : cloneSourceName
              ? `New Physician — from ${cloneSourceName} template`
              : 'Add Physician'}
        </div>

        <div className="ps-ms-body">

          {/* Name */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="physician-prefix">Prefix</label>
              <select id="physician-prefix" className="ps-conf-select" value={draft.namePrefix ?? ''} onChange={e => set('namePrefix', e.target.value)}>
                <option value="">None</option>
                <option value="Mr.">Mr.</option>
                <option value="Mrs.">Mrs.</option>
                <option value="Ms.">Ms.</option>
                <option value="Mx.">Mx.</option>
                <option value="Dr.">Dr.</option>
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Suffix</label>
              <SuffixSelect value={draft.nameSuffix ?? ''} onChange={v => set('nameSuffix', v)} selectClassName="ps-conf-select" inputClassName="ps-conf-input" />
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Given Name(s) <span className="ps-conf-required">*</span></label>
              <input data-phi="name" className={`ps-conf-input ${errors.givenNames ? 'ps-conf-input--error' : ''}`}
                value={draft.givenNames} onChange={e => set('givenNames', e.target.value)} placeholder="All first/middle names" />
              {errors.givenNames && <span className="ps-conf-error-text" data-phi="name">{errors.givenNames}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Family Name(s) <span className="ps-conf-required">*</span></label>
              <input data-phi="name" className={`ps-conf-input ${errors.familyNames ? 'ps-conf-input--error' : ''}`}
                value={draft.familyNames} onChange={e => set('familyNames', e.target.value)} placeholder="Surname(s)" />
              {errors.familyNames && <span className="ps-conf-error-text" data-phi="name">{errors.familyNames}</span>}
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Preferred Name (optional)</label>
            <input data-phi="name" className="ps-conf-input" value={draft.preferredName ?? ''} onChange={e => set('preferredName', e.target.value)} placeholder="What staff should call them, if different" />
          </div>

          {/* Physician Code + NPI */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Physician Code <span className="ps-conf-required">*</span></label>
              <input className={`ps-conf-input ${errors.physicianCode ? 'ps-conf-input--error' : ''}`}
                value={draft.physicianCode} onChange={e => set('physicianCode', e.target.value)} placeholder="Internal identifier, e.g. PHY-0231" />
              {errors.physicianCode && <span className="ps-conf-error-text">{errors.physicianCode}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">NPI Number</label>
              <input className={`ps-conf-input ${errors.npi ? 'ps-conf-input--error' : ''}`}
                value={draft.npi} onChange={e => set('npi', e.target.value)} placeholder="10-digit NPI — optional, not every physician has one" />
              {errors.npi && <span className="ps-conf-error-text">{errors.npi}</span>}
            </div>
          </div>

          {/* Specialty */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Specialty</label>
            <input className="ps-conf-input" value={draft.specialty} onChange={e => set('specialty', e.target.value)} placeholder="e.g. Gastroenterology" />
          </div>

          {/* Phone + Fax */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Phone</label>
              <input className="ps-conf-input" value={draft.phone} onChange={e => set('phone', e.target.value)} placeholder="555-0100" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Fax</label>
              <input className="ps-conf-input" value={draft.fax} onChange={e => set('fax', e.target.value)} placeholder="555-0101" />
            </div>
          </div>

          {/* Email + Preferred Contact */}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Email</label>
              <input className="ps-conf-input" value={draft.email} onChange={e => set('email', e.target.value)} placeholder="dr@clinic.org" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="physician-preferred-contact">Preferred Contact</label>
              <select id="physician-preferred-contact" className="ps-conf-select" value={draft.preferredContact} onChange={e => set('preferredContact', e.target.value)}>
                <option value="Email">Email</option>
                <option value="Fax">Fax</option>
                <option value="Phone">Phone</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
            <Toggle value={draft.active} onChange={v => set('active', v)} />
          </div>

          {/* Facility Affiliations — confirmed, not assumed (PS-75): this
              existing clientIds[] multi-facility model is the right
              mechanism for physicians and is deliberately NOT the same
              thing as ContainerTypesSection/DelegationTypeSection's own
              PS-75 "Performing Lab" pattern (a single
              performingLabFacilityId used to scope one dictionary
              entry's ownership+uniqueness to one lab). A physician is a
              real person who can validly submit to several
              ordering/submitting facilities at once — clientIds here is
              unfiltered by FacilityRole (unlike getActivePerformingLabs,
              which filters to role: 'performing_lab' specifically) —
              so adding a separate single-valued Performing Lab field
              would be modeling the wrong cardinality for what a
              physician's real-world facility relationship is. */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Facility Affiliations</label>
            <div className="ps-conf-picker">
              <div className="ps-conf-picker-search-wrap">
                <input type="text" placeholder="Search facilities..." value={facilitySearch}
                  onChange={e => setFacilitySearch(e.target.value)} className="ps-conf-picker-search" />
              </div>
              <div className="ps-conf-picker-list">
                {filteredFacilities.length === 0
                  ? <div className="ps-conf-picker-empty">No facilities match.</div>
                  : filteredFacilities.map(c => {
                      const checked = draft.clientIds.includes(c.id);
                      return (
                        <div key={c.id} onClick={() => toggleFacility(c.id)}
                          className={`ps-conf-picker-item ${checked ? 'ps-conf-picker-item--checked' : ''}`}>
                          <div className={`ps-conf-picker-checkbox ${checked ? 'ps-conf-picker-checkbox--checked' : ''}`}>
                            {checked && <span className="ps-conf-picker-check-icon">✓</span>}
                          </div>
                          <span className="ps-conf-picker-item-label">{c.name}</span>
                        </div>
                      );
                    })
                }
              </div>
            </div>
            {draft.clientIds.length > 0 && (
              <div className="ps-conf-badge-list ps-conf-picker-selected">
                {draft.clientIds.map(id => {
                  const c = facilities.find(x => x.id === id);
                  return c ? <span key={id} className="ps-conf-badge">{c.name}</span> : null;
                })}
              </div>
            )}
          </div>

        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? 'Add Physician' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main PhysiciansSection ───────────────────────────────────────────────────
const PhysiciansSection: React.FC = () => {
  const [physicians,   setPhysicians]   = useState<Physician[]>([]);
  const [facilities,   setFacilities]   = useState<{ id: string; name: string }[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive' | 'Unverified'>('All');
  const [modal,        setModal]        = useState<{ mode: 'add' | 'edit'; physician?: Physician; cloneSourceName?: string } | null>(null);

  // ── Spreadsheet import/export — same two-step preview-then-apply
  // shape as Stain Dictionary/Specimen Dictionary, matched rather than
  // reinvented. Match key preference: NPI first (a real, portable,
  // external identifier a hospital's own roster will actually carry),
  // then physicianCode (PathScribe's own internal id, only meaningful
  // for a re-export/re-import round trip) — either matching an
  // existing physician is treated as an update, never a duplicate.
  const physImportFileInputRef = useRef<HTMLInputElement>(null);
  type PhysImportRow = Omit<Physician, 'id'> & { existingId?: string; codeWasGenerated?: boolean };
  const [physImportPreview, setPhysImportPreview] = useState<PhysImportRow[] | null>(null);

  useEffect(() => {
    Promise.all([
      physicianService.getAll(),
      facilityService.getAll(),
    ]).then(([physRes, clientRes]) => {
      if (physRes.ok)   setPhysicians(physRes.data);
      if (clientRes.ok) setFacilities(clientRes.data.map(c => ({ id: c.id, name: c.name })));
      setLoading(false);
    });
  }, []);

  const filtered = physicians.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !search
      || fullName(p).toLowerCase().includes(q)
      || p.physicianCode.toLowerCase().includes(q)
      || p.npi.includes(search)
      || p.specialty.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleSave = async (draft: Draft) => {
    const payload = { ...draft, status: (draft.active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await physicianService.add({ ...payload, autoCreated: false });
      if (res.ok) setPhysicians(prev => [...prev, res.data]);
    } else if (modal?.physician) {
      const res = await physicianService.update(modal.physician.id, payload);
      if (res.ok) setPhysicians(prev => prev.map(p => p.id === res.data.id ? res.data : p));
    }
    setModal(null);
  };

  // Opens the Add modal pre-filled as a real starting TEMPLATE, not a
  // literal duplicate (PS-73) — a physician is a real person, so
  // cloning must clear identity/direct-contact fields (name, NPI,
  // physician code, phone/fax/email) rather than suffix a "(Copy)"
  // onto a name like every other dictionary's own generic
  // prepareDuplicate does. specialty/clientIds/preferredContact carry
  // over as the actual organizational starting point; status resets to
  // Active and autoCreated/autoCreatedAt reset — this is a fresh,
  // staff-initiated record, not a snapshot from intake. mode: 'add' is
  // what makes handleSave treat this as a real create(), matching the
  // proven, confirmed-working pattern already used by
  // ContainerTypesSection.tsx/StainDictionarySection.tsx (PS-73).
  const handleClonePhysician = (source: Physician) => {
    const template = preparePersonDuplicate(source, PHYSICIAN_PERSON_FIELDS);
    setModal({
      mode: 'add',
      physician: { ...template, id: '__clone__', status: 'Active', autoCreated: false, autoCreatedAt: undefined },
      cloneSourceName: fullName(source),
    });
  };

  const handleVerify = async (id: string) => {
    const res = await physicianService.verify(id);
    if (res.ok) setPhysicians(prev => prev.map(p => p.id === id ? res.data : p));
  };

  const handleDownloadPhysicians = () => {
    const rows = physicians.map(p => ({
      NamePrefix: p.namePrefix ?? '', GivenNames: p.givenNames, FamilyNames: p.familyNames, NameSuffix: p.nameSuffix ?? '',
      PhysicianCode: p.physicianCode, NPI: p.npi, Specialty: p.specialty,
      Phone: p.phone, Fax: p.fax, Email: p.email, PreferredContact: p.preferredContact,
      Facilities: p.clientIds.map(id => facilities.find(c => c.id === id)?.name ?? id).join('; '),
      Status: p.status,
    }));
    downloadCsv('Physicians.csv', toCsv(rows));
  };

  // Next sequential PHY-#### code, matching the seed data's own
  // convention — only ever used for a genuinely new row with no
  // PhysicianCode column value and no NPI match, so a real customer
  // roster (which won't have PathScribe's own internal codes) doesn't
  // need to invent one just to satisfy the required+unique field.
  const nextPhysicianCode = (taken: Set<string>): string => {
    let max = 0;
    for (const p of physicians) {
      const m = /^PHY-(\d+)$/i.exec(p.physicianCode);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    let n = max + 1;
    while (taken.has(`PHY-${String(n).padStart(4, '0')}`)) n++;
    const code = `PHY-${String(n).padStart(4, '0')}`;
    taken.add(code);
    return code;
  };

  const handlePhysicianFileUpload = async (file: File) => {
    if (!isCsvFile(file)) {
      alert(`"${file.name}" isn't a CSV file. Export/download the template, edit it in your spreadsheet editor, and save it as .csv before importing.`);
      return;
    }
    const text = await readFileAsText(file);
    const rows: any[] = parseCsv(text);

    const get = (row: any, ...keys: string[]) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim(); return ''; };
    const takenCodes = new Set(physicians.map(p => p.physicianCode));

    const preview: PhysImportRow[] = rows.map(row => {
        const givenNames  = get(row, 'GivenNames', 'Given Names', 'FirstName', 'First Name');
        const familyNames = get(row, 'FamilyNames', 'Family Names', 'LastName', 'Last Name');
        const npi = get(row, 'NPI', 'npi');
        const codeInSheet = get(row, 'PhysicianCode', 'Physician Code');
        const existing = (npi && physicians.find(p => p.npi === npi))
          ?? (codeInSheet && physicians.find(p => p.physicianCode.toLowerCase() === codeInSheet.toLowerCase()));

        let physicianCode = codeInSheet || existing?.physicianCode || '';
        let codeWasGenerated = false;
        if (!physicianCode) { physicianCode = nextPhysicianCode(takenCodes); codeWasGenerated = true; }
        else takenCodes.add(physicianCode);

        const facilitiesText = get(row, 'Facilities', 'Facility', 'Clients');
        const clientIds = facilitiesText
          ? facilitiesText.split(/[;,]/).map(n => n.trim()).filter(Boolean)
            .map(n => facilities.find(c => c.name.toLowerCase() === n.toLowerCase())?.id)
            .filter((id): id is string => Boolean(id))
          : (existing?.clientIds ?? []);

        const statusText = get(row, 'Status', 'status');
        const status = (['Active', 'Inactive', 'Unverified'] as const).find(s => s.toLowerCase() === statusText.toLowerCase())
          ?? existing?.status ?? 'Active';
        const preferredContactText = get(row, 'PreferredContact', 'Preferred Contact');
        const preferredContact = (['Email', 'Fax', 'Phone'] as const).find(c => c.toLowerCase() === preferredContactText.toLowerCase())
          ?? existing?.preferredContact ?? 'Email';

        return {
          namePrefix: get(row, 'NamePrefix', 'Name Prefix', 'Prefix') || existing?.namePrefix || 'Dr.',
          givenNames: givenNames || existing?.givenNames || '',
          familyNames: familyNames || existing?.familyNames || '',
          preferredName: get(row, 'PreferredName', 'Preferred Name') || existing?.preferredName,
          nameSuffix: get(row, 'NameSuffix', 'Name Suffix', 'Suffix') || existing?.nameSuffix,
          firstName: givenNames || existing?.firstName || '', lastName: familyNames || existing?.lastName || '',
          physicianCode, npi: npi || existing?.npi || '',
          specialty: get(row, 'Specialty', 'specialty') || existing?.specialty || '',
          phone: get(row, 'Phone', 'phone') || existing?.phone || '',
          fax: get(row, 'Fax', 'fax') || existing?.fax || '',
          email: get(row, 'Email', 'email') || existing?.email || '',
          preferredContact, clientIds, status,
          existingId: existing?.id, codeWasGenerated,
        };
    }).filter(r => r.givenNames || r.familyNames);

    setPhysImportPreview(preview);
  };

  const handleApplyPhysicianImport = async () => {
    if (!physImportPreview) return;
    await Promise.all(physImportPreview.map(({ existingId, codeWasGenerated, ...draft }) =>
      existingId ? physicianService.update(existingId, draft) : physicianService.add({ ...draft, autoCreated: false })
    ));
    setPhysImportPreview(null);
    physicianService.getAll().then(res => { if (res.ok) setPhysicians(res.data); });
  };

  if (loading) return <div className="ps-conf-loading">Loading physicians...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Physicians</h3>
          <p className="ps-conf-section-subtitle">Manage ordering and submitting physicians and their facility affiliations.</p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Physician</button>
      </div>

      <div className="ps-conf-form-row">
        <button className="ps-conf-btn-secondary" onClick={handleDownloadPhysicians}>Export</button>
        <button className="ps-conf-btn-secondary" onClick={() => physImportFileInputRef.current?.click()}>Import Spreadsheet</button>
        <input ref={physImportFileInputRef} type="file" hidden accept=".csv,text/csv" onChange={e => { if (e.target.files?.[0]) handlePhysicianFileUpload(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {physImportPreview && (
        <div className="ps-conf-import-preview">
          <p>
            {physImportPreview.filter(r => r.existingId).length} to update, {physImportPreview.filter(r => !r.existingId).length} new
            {physImportPreview.some(r => r.codeWasGenerated) && ` (${physImportPreview.filter(r => r.codeWasGenerated).length} assigned a new Physician Code — none was given in the sheet)`}.
          </p>
          <button className="ps-conf-btn-primary" onClick={handleApplyPhysicianImport}>Apply Import</button>
          <button className="ps-conf-btn-row" onClick={() => setPhysImportPreview(null)}>Cancel</button>
        </div>
      )}

      <div className="ps-conf-form-row">
        <input type="text" placeholder="Search by name, code, NPI, or specialty..." value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Unverified">Unverified</option>
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {['Physician', 'Specialty', 'Contact', 'Facilities', 'Status', 'Actions'].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-cell">
                      <div className="ps-conf-avatar">{initials(p)}</div>
                      <div>
                        <div className="ps-conf-identity-name" data-phi="name">{fullName(p)}</div>
                        <div className="ps-conf-identity-sub">Code: {p.physicianCode}{p.npi ? ` · NPI: ${p.npi}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="ps-conf-td">{p.specialty || '—'}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-contact-cell" data-phi="email">
                      {p.preferredContact === 'Email' && <div>✉ {p.email || '—'}</div>}
                      {p.preferredContact === 'Fax'   && <div>📠 {p.fax || '—'}</div>}
                      {p.preferredContact === 'Phone' && <div data-phi="phone">📞 {p.phone || '—'}</div>}
                      <div className="ps-conf-contact-via">via {p.preferredContact}</div>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    {p.clientIds.length === 0
                      ? <span className="ps-conf-badge-none">None</span>
                      : <div className="ps-conf-badge-list">
                          {p.clientIds.map(id => {
                            const c = facilities.find(x => x.id === id);
                            return c ? <span key={id} className="ps-conf-badge">{c.name}</span> : null;
                          })}
                        </div>
                    }
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${p.status === 'Active' ? 'ps-conf-status-dot--active' : p.status === 'Unverified' ? 'ps-conf-status-dot--pending' : ''}`} />
                      <span className={`ps-conf-status-text ${p.status === 'Active' ? 'ps-conf-status-text--active' : p.status === 'Unverified' ? 'ps-conf-status-text--pending' : ''}`}>{p.status}</span>
                    </div>
                    {p.autoCreated && (
                      <div className="ps-conf-auto-note">
                        Auto-created{p.autoCreatedAt ? ` ${p.autoCreatedAt}` : ''} — from order intake
                      </div>
                    )}
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      {p.status === 'Unverified' && (
                        <button className="ps-conf-btn-verify" onClick={() => handleVerify(p.id)}>Verify</button>
                      )}
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', physician: p })}>Edit</button>
                      <button className="ps-conf-btn-row" onClick={() => handleClonePhysician(p)}>Duplicate</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>No physicians match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <PhysicianModal
          mode={modal.mode}
          physician={modal.physician}
          cloneSourceName={modal.cloneSourceName}
          facilities={facilities}
          existingEntries={physicians}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default PhysiciansSection;
