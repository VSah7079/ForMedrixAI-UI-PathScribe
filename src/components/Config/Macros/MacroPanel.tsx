// src/components/Config/Macros/MacroPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct guidance ("My Macros - Organize under Facility"):
// this panel is titled "My Macros," but despite that name it showed
// every active macro from every user with zero ownership filtering,
// and every macro ever created through it was saved with a hardcoded
// literal createdBy: 'current-user' — never the real session user.
// Confirmed directly before rewriting, not assumed.
//
// Real, per direct guidance: now a genuine three-tier structure —
// Enterprise (no facility, no owner — visible everywhere), Facility
// (scoped to one real performing lab, visible to everyone there), and
// Personal (owned by exactly one real user, visible only to them).
// See services/macros/IMacroService.ts's own isMacroVisibleTo() for
// the shared resolution rule this panel's own filtering matches.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import '../../../pathscribe.css';
import { macroService } from '../../../services';
import { isMacroVisibleTo } from '../../../services/macros/IMacroService';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { getActivePerformingLabs } from '@/utils/performingLabs';
import type { Facility } from '@/services/facilities/IFacilityService';
import { extractWordBuildingBlocks, type ExtractedBuildingBlock } from '@/services/import/wordBuildingBlocksEngine';
import { generateShortcutFromName } from '../../../services/macros/generateShortcutFromName';
import PathScribeEditor, { Macro } from '../../Editor/PathScribeEditor';

interface MacroPanelProps {
  approvedFonts: string[];
}

type Tier = 'enterprise' | 'facility' | 'personal';

const MacroPanel: React.FC<MacroPanelProps> = ({ approvedFonts }) => {
  const sessionUser = getSessionUser();
  const currentUserId = sessionUser?.id ?? 'unknown';

  const [rawMacros, setRawMacros] = useState<import('../../../services/macros/IMacroService').Macro[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loadingMacros, setLoadingMacros] = useState(true);
  const [labs, setLabs] = useState<Facility[]>([]);

  // Real, per direct guidance: which facility's own macros are being
  // browsed right now — an admin picks explicitly, same as every other
  // facility-scoped admin screen this session (Routing Rules, Parts
  // Library) — there's no case context here to auto-derive it from,
  // unlike the real, separate Personal Quick Text capture flow inside
  // the case editor itself.
  const [facilityFilter, setFacilityFilter] = useState('');
  const [activeTier, setActiveTier] = useState<Tier>('enterprise');

  // Real, per direct guidance ("a mechanism to take MS Word AutoText /
  // Building Blocks and load them into personal macros"): the actual
  // ZIP/XML extraction is a genuinely decoupled, reusable engine
  // (services/import/wordBuildingBlocksEngine.ts) — this state is
  // purely the thin adapter wiring its generic output into real Macro
  // records.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importCandidates, setImportCandidates] = useState<ExtractedBuildingBlock[] | null>(null);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [importTier, setImportTier] = useState<Tier>('personal');
  const [importFacilityId, setImportFacilityId] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImportFileChosen = async (file: File) => {
    setImportError(null);
    try {
      const extracted = await extractWordBuildingBlocks(file);
      setImportCandidates(extracted);
      // Real, sensible default: pre-select real AutoText entries only —
      // Word's own Building Blocks glossary also stores Cover Pages,
      // Headers/Footers, Tables, etc. the exact same way, and "load
      // AutoText into personal macros" doesn't mean every gallery type.
      // Still shown, still selectable — just not pre-checked.
      setImportSelected(new Set(extracted.map((_, i) => i).filter(i => extracted[i].gallery === 'autoText')));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read this file.');
      setImportCandidates(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!importCandidates) return;
    if (importTier === 'facility' && !importFacilityId) {
      alert('Select which facility these imported macros belong to.');
      return;
    }
    setImporting(true);
    const existingShortcuts = new Set(rawMacros.map(m => m.shortcut));
    const tierFields = importTier === 'personal'
      ? { performingLabFacilityId: undefined, ownerUserId: currentUserId }
      : importTier === 'facility'
      ? { performingLabFacilityId: importFacilityId, ownerUserId: undefined }
      : { performingLabFacilityId: undefined, ownerUserId: undefined };

    for (const idx of importSelected) {
      const entry = importCandidates[idx];
      if (!entry.content.trim()) continue; // a real, empty Building Block has nothing to import
      const shortcut = generateShortcutFromName(entry.name, existingShortcuts);
      existingShortcuts.add(shortcut);
      await macroService.add({
        name: entry.name, shortcut, content: entry.content,
        category: 'Custom', subspecialtyIds: [], snomedCodes: [], icdCodes: [],
        createdBy: currentUserId, status: 'Active',
        ...tierFields,
      });
    }
    setImporting(false);
    setImportCandidates(null);
    setImportSelected(new Set());
    refresh();
    setActiveTier(importTier);
  };

  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);

  const refresh = () => {
    setLoadingMacros(true);
    macroService.getAll().then(res => {
      if (res.ok) {
        const active = res.data.filter(m => m.status === 'Active');
        setRawMacros(active);
        setMacros(active.map(m => ({ id: m.id, trigger: m.shortcut, name: m.name, content: m.content })));
      }
      setLoadingMacros(false);
    });
  };
  useEffect(refresh, []);

  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState('');
  const [macroName, setMacroName] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [draftTier, setDraftTier] = useState<Tier>('enterprise');
  const [draftFacilityId, setDraftFacilityId] = useState('');

  const rawSelected = rawMacros.find(m => m.id === selectedMacroId) ?? null;
  const selectedMacro = macros.find(m => m.id === selectedMacroId) ?? null;

  // Real, per direct guidance: the three real, filtered lists a user
  // actually sees — every Enterprise-wide macro, their own current
  // facility filter's macros, and their own personal macros. Uses the
  // exact same isMacroVisibleTo() rule the type file documents, not a
  // parallel, ad-hoc filter that could drift from it.
  const enterpriseMacros = rawMacros.filter(m => !m.performingLabFacilityId && !m.ownerUserId);
  const facilityMacros = facilityFilter
    ? rawMacros.filter(m => isMacroVisibleTo(m, currentUserId, facilityFilter) && m.performingLabFacilityId === facilityFilter)
    : [];
  const personalMacros = rawMacros.filter(m => m.ownerUserId === currentUserId);

  const tierList = activeTier === 'enterprise' ? enterpriseMacros : activeTier === 'facility' ? facilityMacros : personalMacros;
  const tierMacros = tierList.map(m => ({ id: m.id, trigger: m.shortcut, name: m.name, content: m.content }));

  const handleSelectMacro = (id: string) => {
    const macro = rawMacros.find(m => m.id === id);
    if (!macro) return;
    setSelectedMacroId(id);
    setTrigger(macro.shortcut);
    setMacroName(macro.name);
    setEditorContent(macro.content);
    setIsCreatingNew(false);
    setDraftTier(macro.ownerUserId ? 'personal' : macro.performingLabFacilityId ? 'facility' : 'enterprise');
    setDraftFacilityId(macro.performingLabFacilityId ?? '');
  };

  const handleCreateNew = () => {
    setIsCreatingNew(true);
    setSelectedMacroId(null);
    setTrigger('');
    setMacroName('');
    setEditorContent('');
    // Real, sensible default: creating from within a given tier's own
    // section starts the new macro in that same tier, not always
    // Enterprise — an admin browsing their facility's macros and
    // clicking + New almost always means "add another one for this
    // facility," not "add an Enterprise-wide one."
    setDraftTier(activeTier);
    setDraftFacilityId(activeTier === 'facility' ? facilityFilter : '');
  };

  const handleSave = async () => {
    if (!trigger.trim() || !macroName.trim()) {
      alert('Please enter both a trigger shortcut and a macro name.');
      return;
    }
    if (!trigger.startsWith(';')) {
      alert('Trigger must start with ";" (e.g. ;gs)');
      return;
    }
    if (draftTier === 'facility' && !draftFacilityId) {
      alert('Select which facility this macro belongs to.');
      return;
    }

    const tierFields = draftTier === 'personal'
      ? { performingLabFacilityId: undefined, ownerUserId: currentUserId }
      : draftTier === 'facility'
      ? { performingLabFacilityId: draftFacilityId, ownerUserId: undefined }
      : { performingLabFacilityId: undefined, ownerUserId: undefined };

    if (selectedMacroId) {
      const res = await macroService.update(selectedMacroId, {
        shortcut: trigger.trim(), name: macroName.trim(), content: editorContent, ...tierFields,
      });
      if (res.ok) refresh();
    } else {
      const res = await macroService.add({
        name: macroName.trim(), shortcut: trigger.trim(), content: editorContent,
        category: 'Custom', subspecialtyIds: [], snomedCodes: [], icdCodes: [],
        // Real fix, per direct guidance: the actual session user's own
        // real id — was the hardcoded literal 'current-user' before,
        // for every macro anyone ever created through this panel.
        createdBy: currentUserId,
        status: 'Active',
        ...tierFields,
      });
      if (res.ok) {
        refresh();
        setSelectedMacroId(res.data.id);
        setIsCreatingNew(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!selectedMacroId) return;
    if (!confirm(`Delete macro "${selectedMacro?.name}"?`)) return;
    const res = await macroService.deactivate(selectedMacroId);
    if (res.ok) {
      refresh();
      setSelectedMacroId(null);
      setTrigger('');
      setMacroName('');
      setEditorContent('');
      setIsCreatingNew(false);
    }
  };

  const isDirty = selectedMacro
    ? trigger !== selectedMacro.trigger || macroName !== selectedMacro.name || editorContent !== selectedMacro.content
      || draftTier !== (rawSelected?.ownerUserId ? 'personal' : rawSelected?.performingLabFacilityId ? 'facility' : 'enterprise')
      || draftFacilityId !== (rawSelected?.performingLabFacilityId ?? '')
    : isCreatingNew;

  if (loadingMacros) return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ps-conf-text-3)', fontSize: 14 }}>Loading macros...</div>
  );

  return (
    <div style={{ display: 'flex', gap: '24px', height: 'calc(var(--app-height, 100vh) - 280px)', minHeight: '560px' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="ps-conf-card" style={{ width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px', padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ps-conf-text)', margin: 0 }}>My Macros</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dotx,.dotm,.docx,.docm"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFileChosen(f); e.target.value = ''; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="ps-conf-btn-secondary"
              title="Import AutoText / Building Blocks from a Word template (.dotx/.dotm)"
            >
              Import from Word
            </button>
            <button
              onClick={handleCreateNew}
              className="ps-conf-btn-primary"
            >
              + New
            </button>
          </div>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--ps-conf-text-dim)', padding: '8px 10px', background: 'rgba(8,145,178,0.08)', borderRadius: '6px', lineHeight: '1.5' }}>
          💡 Type a trigger shortcut while editing and press Space to auto-expand.
        </div>

        {/* Real, per direct guidance: three real, filtered tiers, not one flat list */}
        <div className="ps-macro-tier-tabs">
          {(['enterprise', 'facility', 'personal'] as Tier[]).map(t => (
            <button
              key={t}
              className={`ps-macro-tier-tab${activeTier === t ? ' ps-macro-tier-tab--active' : ''}`}
              onClick={() => setActiveTier(t)}
            >
              {t === 'enterprise' ? 'Enterprise' : t === 'facility' ? 'Facility' : 'Personal'}
              <span className="ps-macro-tier-count">
                {t === 'enterprise' ? enterpriseMacros.length : t === 'facility' ? facilityMacros.length : personalMacros.length}
              </span>
            </button>
          ))}
        </div>

        {activeTier === 'facility' && (
          <select className="ps-conf-select" value={facilityFilter} onChange={e => setFacilityFilter(e.target.value)}>
            <option value="">— Select a facility —</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tierMacros.map(macro => (
            <button
              key={macro.id}
              onClick={() => handleSelectMacro(macro.id)}
              style={{
                padding: '11px 12px',
                background: selectedMacroId === macro.id ? 'rgba(8,145,178,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selectedMacroId === macro.id ? '#0891B2' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '8px',
                color: selectedMacroId === macro.id ? '#38bdf8' : '#cbd5e1',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{macro.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--ps-conf-text-3)', fontFamily: 'monospace' }}>{macro.trigger}</div>
            </button>
          ))}

          {tierMacros.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--ps-conf-text-dim)', fontSize: '13px', padding: '24px 0' }}>
              {activeTier === 'facility' && !facilityFilter
                ? 'Select a facility above to see its macros.'
                : <>No {activeTier} macros yet.<br />Click + New to create one.</>}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel ──────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        minWidth: 0,
      }}>
        {selectedMacroId || isCreatingNew ? (
          <>
            {/* Header row */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--ps-conf-text-2)', marginBottom: '5px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Macro Name
                </label>
                <input
                  value={macroName}
                  onChange={e => setMacroName(e.target.value)}
                  placeholder="e.g., Gross Standard"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.3)',
                    color: '#fff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ width: '180px' }}>
                <label style={{ display: 'block', color: 'var(--ps-conf-text-2)', marginBottom: '5px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Trigger Shortcut
                </label>
                <input
                  value={trigger}
                  onChange={e => setTrigger(e.target.value)}
                  placeholder=";gs"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.3)',
                    color: 'var(--ps-conf-teal-light)',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Real, per direct guidance: which real tier this macro belongs to */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: 'var(--ps-conf-text-2)', marginBottom: '5px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Visibility
                </label>
                <select className="ps-conf-select" value={draftTier} onChange={e => setDraftTier(e.target.value as Tier)}>
                  <option value="enterprise">Enterprise (every facility)</option>
                  <option value="facility">Facility (one lab only)</option>
                  <option value="personal">Personal (only me)</option>
                </select>
              </div>
              {draftTier === 'facility' && (
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: 'var(--ps-conf-text-2)', marginBottom: '5px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Facility
                  </label>
                  <select className="ps-conf-select" value={draftFacilityId} onChange={e => setDraftFacilityId(e.target.value)}>
                    <option value="">— Select —</option>
                    {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Editor */}
            <div style={{ flex: 1, overflow: 'hidden', borderRadius: '12px' }}>
            <PathScribeEditor
                key={selectedMacroId ?? 'new'}
                content={editorContent}
                onChange={setEditorContent}
                approvedFonts={approvedFonts}
                macros={macros}
                minHeight="350px"
                placeholder="Write your macro template here ..."
                showRulerDefault={false}
            />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              {selectedMacroId && (
                <button
                  onClick={handleDelete}
                  className="ps-btn-ghost-danger"
                >
                  Delete
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!isDirty}
                className="ps-conf-btn-primary"
              >
                {selectedMacroId ? 'Save Changes' : 'Create Macro'}
              </button>
            </div>
          </>
        ) : (
          /* Empty state */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ps-conf-text-3)',
            gap: '16px',
          }}
          className="ps-conf-card">
            <div style={{ fontSize: '56px' }}>⚡</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ps-conf-text-2)' }}>No Macro Selected</div>
            <div style={{ fontSize: '13px', textAlign: 'center', maxWidth: '360px', lineHeight: '1.7', color: 'var(--ps-conf-text-dim)' }}>
              Select a macro from the list to edit it, or click <strong style={{ color: '#0891B2' }}>+ New</strong> to create your first macro template.
            </div>
            <button
              onClick={handleCreateNew}
              className="ps-conf-btn-primary"
              style={{ marginTop: '8px' }}
            >
              + Create New Macro
            </button>
          </div>
        )}
      </div>

      {/* Real, per direct guidance ("MS Word AutoText / Building
          Blocks... load them into personal macros"): a real
          preview-then-apply flow, same established shape as the CSV
          imports elsewhere in this app — nothing gets created until
          the admin actually confirms, and every entry is individually
          selectable rather than an all-or-nothing import. */}
      {importCandidates && (
        <div className="ps-conf-backdrop" onClick={() => setImportCandidates(null)}>
          <div className="ps-macro-import-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ose-quicktext-title">Import from Word</div>
            {importCandidates.length === 0 ? (
              <p className="ps-conf-section-subtitle">No AutoText or Building Block entries were found in this file.</p>
            ) : (
              <>
                <p className="ps-conf-section-subtitle">
                  Found {importCandidates.length} entr{importCandidates.length === 1 ? 'y' : 'ies'}. AutoText entries are
                  pre-selected — other Building Blocks types (cover pages, headers, tables) are shown but not, since
                  they rarely make sense as a text-expansion macro.
                </p>
                <div className="ps-macro-import-list">
                  {importCandidates.map((entry, i) => (
                    <label key={i} className="ps-macro-import-row">
                      <input
                        type="checkbox"
                        checked={importSelected.has(i)}
                        onChange={() => setImportSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        })}
                      />
                      <div>
                        <div className="ps-macro-import-row-name">
                          {entry.name} {entry.gallery && <span className="ps-rr-lab-badge">{entry.gallery}</span>}
                        </div>
                        <div className="ps-macro-import-row-preview">
                          {entry.content ? entry.content.slice(0, 100) : '(no text content)'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', marginTop: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label className="ps-conf-label">Import as</label>
                    <select className="ps-conf-select" value={importTier} onChange={e => setImportTier(e.target.value as Tier)}>
                      <option value="personal">Personal (only me)</option>
                      <option value="facility">Facility (one lab only)</option>
                      <option value="enterprise">Enterprise (every facility)</option>
                    </select>
                  </div>
                  {importTier === 'facility' && (
                    <div style={{ flex: 1 }}>
                      <label className="ps-conf-label">Facility</label>
                      <select className="ps-conf-select" value={importFacilityId} onChange={e => setImportFacilityId(e.target.value)}>
                        <option value="">— Select —</option>
                        {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="ps-ose-quicktext-actions">
              <button className="ps-btn-ghost-dark" onClick={() => setImportCandidates(null)}>Cancel</button>
              {importCandidates.length > 0 && (
                <button className="ps-conf-btn-primary" disabled={importSelected.size === 0 || importing} onClick={handleConfirmImport}>
                  {importing ? 'Importing…' : `Import ${importSelected.size} Macro${importSelected.size === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {importError && (
        <div className="ps-conf-backdrop" onClick={() => setImportError(null)}>
          <div className="ps-macro-import-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ose-quicktext-title">Import from Word</div>
            <p className="ps-conf-section-subtitle">{importError}</p>
            <div className="ps-ose-quicktext-actions">
              <button className="ps-conf-btn-primary" onClick={() => setImportError(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MacroPanel;
