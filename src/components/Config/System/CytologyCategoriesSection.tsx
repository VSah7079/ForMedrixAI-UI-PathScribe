// src/components/Config/System/CytologyCategoriesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Cytology & Cervical Screening — Bethesda System category dictionary.
// Phase 1 of the Cytology module (see the uploaded requirements doc's
// own "Integrated Bethesda System Reporting" ask). Real, per direct
// guidance: configuration for this module lives here, as a new subtab
// under the existing System configuration screen — same established
// pattern as every other admin dictionary (ParticipationTypesSection,
// SubspecialtiesSection, GoverningBodiesSection, etc.), not a new,
// separate configuration surface.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import '../../../pathscribe.css';
import { mockCytologyCategoryService } from '../../../services/cytology/mockCytologyCategoryService';
import type {
  CytologyCategoryEntry,
  CytologyCategorySection,
  CytologyNomenclatureSystem,
  NewCytologyCategoryEntry,
} from '../../../services/cytology/ICytologyCategoryService';

// ─── Small chip helpers ─────────────────────────────────────────────────────

const Chip: React.FC<{ label: string; color: string; filled?: boolean }> = ({ label, color, filled = true }) => (
  <span style={{
    fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
    background: filled ? color + '18' : 'rgba(255,255,255,0.04)',
    color: filled ? color : '#4b5563',
    border: `1px solid ${filled ? color + '33' : 'rgba(255,255,255,0.06)'}`,
  }}>
    {label}
  </span>
);

const SEVERITY_COLOR: Record<string, string> = { Abnormal: '#f59e0b', Critical: '#f97316', Malignant: '#ef4444' };

// ─── Section tabs ────────────────────────────────────────────────────────────

const SECTION_TABS: { id: CytologyCategorySection; label: string }[] = [
  { id: 'adequacy', label: 'Specimen Adequacy' },
  { id: 'general_categorization', label: 'General Categorization' },
  { id: 'interpretation_result', label: 'Interpretation / Result' },
  { id: 'recommendation', label: 'Recommendations' },
];

// Real, per direct guidance: closing the real, self-documented gap
// emptyDraft's own prior comment named directly — "hasn't been
// extended with a real nomenclature-system selector yet." All five
// real systems ICytologyCategoryService.ts's own CytologyNomenclatureSystem
// type already names, shown regardless of real, current seed-data
// coverage (bscc_rcpath/munchen_iiib are fully seeded; sfcc/palga_cisoea
// are real, separate, still-open gaps with zero entries today) — an
// admin managing an as-yet-unseeded system is exactly who this
// selector exists for.
const NOMENCLATURE_SYSTEMS: { id: CytologyNomenclatureSystem; label: string }[] = [
  { id: 'bethesda', label: 'Bethesda System' },
  { id: 'bscc_rcpath', label: 'BSCC / RCPath (UK, Scotland, Ireland)' },
  { id: 'munchen_iiib', label: 'München III (Germany)' },
  { id: 'sfcc', label: 'SFCC (France)' },
  { id: 'palga_cisoea', label: 'PALGA CISOE-A (Netherlands)' },
];

// ─── Draft / modal ───────────────────────────────────────────────────────────

type Draft = NewCytologyCategoryEntry;

const emptyDraft = (section: CytologyCategorySection, nomenclatureSystem: CytologyNomenclatureSystem): Draft => ({
  // Real, direct fix: this used to hardcode 'bethesda' regardless of
  // which real system the admin was actually viewing — a new entry
  // added while managing BSCC/RCPath would have been silently
  // mis-tagged as Bethesda. Now takes the real, currently-selected
  // system directly.
  section, nomenclatureSystem, group: undefined, label: '', abbreviation: undefined, description: undefined,
  requiresPathologistReview: false, suggestedAbnormalSeverity: undefined, active: true,
});

const CategoryModal: React.FC<{
  mode: 'add' | 'edit';
  section: CytologyCategorySection;
  nomenclatureSystem: CytologyNomenclatureSystem;
  entry?: CytologyCategoryEntry;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}> = ({ mode, section, nomenclatureSystem, entry, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft(section, nomenclatureSystem));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 14, width: 480, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', padding: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>
          {mode === 'add' ? 'Add Category' : 'Edit Category'}
        </h2>

        <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Label</label>
        <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })}
          style={{ width: '100%', padding: '9px 12px', fontSize: 13, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 14, outline: 'none' }} />

        {/* Real, per direct guidance on SFCC (France): SFCC has no
            entries of its own — it's these same Bethesda entries with
            French text substituted (mockCytologyCategoryService.ts's
            own getByNomenclatureSystem). Editable only here, on the
            real Bethesda record, never through a derived SFCC view —
            editing a derived row would silently overwrite the
            canonical English label/description instead. */}
        {draft.nomenclatureSystem === 'bethesda' && (
          <>
            <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>French Label (SFCC) — optional</label>
            <input value={draft.labelFr ?? ''} onChange={e => setDraft({ ...draft, labelFr: e.target.value || undefined })}
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 14, outline: 'none' }} />
          </>
        )}

        <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Abbreviation (optional)</label>
        <input value={draft.abbreviation ?? ''} onChange={e => setDraft({ ...draft, abbreviation: e.target.value || undefined })}
          style={{ width: '100%', padding: '9px 12px', fontSize: 13, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 14, outline: 'none' }} />

        {section === 'interpretation_result' && (
          <>
            <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Group (e.g. "Epithelial Cell Abnormality — Squamous")</label>
            <input value={draft.group ?? ''} onChange={e => setDraft({ ...draft, group: e.target.value || undefined })}
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 14, outline: 'none' }} />
          </>
        )}

        <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Description (optional)</label>
        <textarea value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value || undefined })}
          rows={2}
          style={{ width: '100%', padding: '9px 12px', fontSize: 13, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />

        {draft.nomenclatureSystem === 'bethesda' && (
          <>
            <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>French Description (SFCC) — optional</label>
            <textarea value={draft.descriptionFr ?? ''} onChange={e => setDraft({ ...draft, descriptionFr: e.target.value || undefined })}
              rows={2}
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d1d5db', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.requiresPathologistReview}
            onChange={e => setDraft({ ...draft, requiresPathologistReview: e.target.checked })} />
          Requires pathologist review before sign-out
        </label>

        <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Suggested Abnormal-Detection Severity (optional)</label>
        <select value={draft.suggestedAbnormalSeverity ?? ''} onChange={e => setDraft({ ...draft, suggestedAbnormalSeverity: (e.target.value || undefined) as any })}
          className="ps-conf-select" style={{ width: '100%', marginBottom: 14 }}>
          <option value="">— None —</option>
          <option value="Abnormal">Abnormal</option>
          <option value="Critical">Critical</option>
          <option value="Malignant">Malignant</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d1d5db', marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.active}
            onChange={e => setDraft({ ...draft, active: e.target.checked })} />
          Active
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#9ca3af', background: 'transparent', border: '1px solid #374151', borderRadius: 8, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => draft.label.trim() && onSave(draft)}
            disabled={!draft.label.trim()}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#0a0a0a', background: draft.label.trim() ? '#8AB4F8' : '#374151', border: 'none', borderRadius: 8, cursor: draft.label.trim() ? 'pointer' : 'not-allowed' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

const CytologyCategoriesSection: React.FC = () => {
  const [entries, setEntries] = useState<CytologyCategoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CytologyCategorySection>('adequacy');
  const [nomenclatureSystem, setNomenclatureSystem] = useState<CytologyNomenclatureSystem>('bethesda');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: CytologyCategoryEntry } | null>(null);

  const refresh = () => {
    setLoading(true);
    // Real, per this file's own direct fix — fetches the real,
    // correctly-scoped set for whichever system is selected. For
    // 'sfcc' this returns Bethesda's own entries with French text
    // substituted (mockCytologyCategoryService's own real, derived
    // view) — never a second, independently-stored set.
    mockCytologyCategoryService.getByNomenclatureSystem(nomenclatureSystem).then(res => {
      if (res.ok) setEntries(res.data);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, [nomenclatureSystem]);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'add') {
      await mockCytologyCategoryService.add(draft);
    } else if (modal?.entry) {
      await mockCytologyCategoryService.update(modal.entry.id, draft);
    }
    refresh();
    setModal(null);
  };

  const toggleActive = async (entry: CytologyCategoryEntry) => {
    if (entry.active) await mockCytologyCategoryService.deactivate(entry.id);
    else await mockCytologyCategoryService.reactivate(entry.id);
    refresh();
  };

  // Real, per direct guidance ("is there a mechanism to update them...
  // via CSV file?") — mirrors the same real, established XLSX
  // import/export pattern already used by StainDictionarySection.tsx
  // and other admin dictionaries in this app, not a new, invented
  // mechanism. Deliberately scoped to just the French text fields
  // (id + English label/description for real, human context + the
  // two French fields to fill in), not a general bulk category
  // editor — the real, stated need here is translating Bethesda's own
  // existing 46 entries quickly, not adding new categories via CSV.
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportFrenchTranslations = async () => {
    const res = await mockCytologyCategoryService.getByNomenclatureSystem('bethesda');
    if (!res.ok) return;
    const rows = res.data.map(e => ({
      Id: e.id, Section: e.section, EnglishLabel: e.label, EnglishDescription: e.description ?? '',
      FrenchLabel: e.labelFr ?? '', FrenchDescription: e.descriptionFr ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SFCC French Translations');
    XLSX.writeFile(wb, 'BethesdaFrenchTranslations.xlsx');
  };

  const handleImportFrenchTranslations = (file: File) => {
    const reader = new FileReader();
    reader.onload = async evt => {
      const data = evt.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      // Real, matched by Id — never by label text, which could
      // legitimately change independently of the row's own identity.
      for (const row of rows) {
        const id = String(row['Id'] ?? '').trim();
        if (!id) continue;
        const labelFr = String(row['FrenchLabel'] ?? '').trim();
        const descriptionFr = String(row['FrenchDescription'] ?? '').trim();
        await mockCytologyCategoryService.update(id, {
          labelFr: labelFr || undefined,
          descriptionFr: descriptionFr || undefined,
        });
      }
      refresh();
    };
    reader.readAsBinaryString(file);
  };

  const visible = entries
    .filter(e => e.section === activeTab)
    .filter(e => showInactive || e.active);

  // Real Bethesda structure: interpretation_result entries are grouped
  // by their own real sub-group (Organisms, Reactive Changes, Squamous,
  // Glandular, etc.); adequacy/general_categorization entries have no
  // sub-group and render as one flat list.
  const groups = Array.from(new Set(visible.map(e => e.group ?? '__none__')));

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Interpretation and Recommendations</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, maxWidth: 640 }}>
            Standardized specimen adequacy, general categorization, interpretation/result,
            and clinical recommendation vocabulary used across GYN cytology screening and reporting.
          </p>
        </div>
        {/* Real, per this file's own direct fix — SFCC is a derived
            view over Bethesda's own entries (see CategoryModal's own
            comment), never independently editable. Adding here would
            create a real, standalone entry incorrectly tagged
            nomenclatureSystem: 'sfcc', which getByNomenclatureSystem
            never reads for that system. */}
        {nomenclatureSystem !== 'sfcc' && (
          <button className="ps-section-add-btn" onClick={() => setModal({ mode: 'add' })}>
            + Add Category
          </button>
        )}
        <button onClick={handleExportFrenchTranslations}
          style={{ marginLeft: 8, padding: '9px 14px', fontSize: 12, fontWeight: 600, color: '#e5e7eb', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>
          ⬇ Export French Translations
        </button>
        <button onClick={() => importFileInputRef.current?.click()}
          style={{ marginLeft: 8, padding: '9px 14px', fontSize: 12, fontWeight: 600, color: '#e5e7eb', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>
          ⬆ Import French Translations
        </button>
        <input ref={importFileInputRef} type="file" hidden accept=".csv,.xlsx"
          onChange={e => { if (e.target.files?.[0]) handleImportFrenchTranslations(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {nomenclatureSystem === 'sfcc' && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#38bdf818', border: '1px solid #38bdf833', color: '#38bdf8', fontSize: 12 }}>
          SFCC uses Bethesda's own categories with French text substituted — not a separate system. Switch to
          Bethesda to add, edit, or translate an entry.
        </div>
      )}

      {/* Real, per this file's own direct fix — the real, previously-
          missing nomenclature-system selector. Defaults to 'bethesda',
          matching this dictionary's own original, real default. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>Nomenclature System</label>
        <select value={nomenclatureSystem} onChange={e => setNomenclatureSystem(e.target.value as CytologyNomenclatureSystem)}
          style={{ padding: '6px 10px', fontSize: 13, color: '#e5e7eb', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 6 }}>
          {NOMENCLATURE_SYSTEMS.map(s => (<option key={s.id} value={s.id}>{s.label}</option>))}
        </select>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #1f2937' }}>
        {SECTION_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #8AB4F8' : '2px solid transparent',
              color: activeTab === t.id ? '#8AB4F8' : '#6b7280',
            }}>
            {t.label}
          </button>
        ))}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', cursor: 'pointer', paddingBottom: 10 }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {loading && <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Loading…</div>}

      {!loading && groups.map(group => (
        <div key={group} style={{ marginBottom: 24 }}>
          {group !== '__none__' && (
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 8 }}>
              {group}
            </div>
          )}
          <div style={{ border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
            {visible.filter(e => (e.group ?? '__none__') === group).map((e, i, arr) => (
              <div key={e.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderBottom: i < arr.length - 1 ? '1px solid #111827' : 'none',
                  opacity: e.active ? 1 : 0.5,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {e.abbreviation && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#8AB4F822', color: '#8AB4F8', border: '1px solid #8AB4F844' }}>
                        {e.abbreviation}
                      </span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{e.label}</span>
                    {e.isSystem && <span style={{ fontSize: 10, color: '#4b5563' }}>built-in</span>}
                  </div>
                  {e.description && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{e.description}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {e.requiresPathologistReview && <Chip label="Pathologist Review" color="#f59e0b" />}
                  {e.suggestedAbnormalSeverity && <Chip label={e.suggestedAbnormalSeverity} color={SEVERITY_COLOR[e.suggestedAbnormalSeverity]} />}
                  {!e.active && <Chip label="Inactive" color="#4b5563" />}
                </div>
                {nomenclatureSystem !== 'sfcc' && (
                  <>
                    <button onClick={() => toggleActive(e)}
                      style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#9ca3af', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>
                      {e.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button onClick={() => setModal({ mode: 'edit', entry: e })}
                      style={{ padding: '5px 16px', fontSize: 12, fontWeight: 600, color: '#e5e7eb', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>
                      Edit
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!loading && visible.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
          No categories in this section match the current filter.
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#374151' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#22c55e' }}>●</span> System Live Sync
        </div>
        <div>{entries.filter(e => e.active).length} active · {entries.length} total</div>
      </div>

      {modal && (
        <CategoryModal
          mode={modal.mode}
          section={activeTab}
          nomenclatureSystem={nomenclatureSystem}
          entry={modal.entry}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default CytologyCategoriesSection;
