import React, { useState, useRef } from 'react';
import { mockActionRegistryService } from '../../../services/actionRegistry/mockActionRegistryService';
import { SystemAction } from '../../../services/actionRegistry/IActionRegistryService';
import { toTitleCase } from '../../../utils/formatLabel';
import { WORKSTATION_DISCIPLINES, FUNCTIONAL_AREAS_BY_DISCIPLINE } from '../../../services/workstationGroups/IWorkstationGroupService';

// Real, per PS-289's own comment thread — every real, populated
// functional area across every real discipline, flattened for this
// one multi-select. No current overlap between disciplines' own real
// area names (confirmed directly), so a flat list stays unambiguous.
const ALL_FUNCTIONAL_AREAS = WORKSTATION_DISCIPLINES.flatMap(d => FUNCTIONAL_AREAS_BY_DISCIPLINE[d]);

export const ActionsTab: React.FC = () => {
  const [actions, setActions] = useState<SystemAction[]>(mockActionRegistryService.getActions());
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [editingAction, setEditingAction] = useState<SystemAction | null>(null);
  const [tempShortcut, setTempShortcut] = useState('');
  const [tempTriggers, setTempTriggers] = useState('');
  const [tempStationProfiles, setTempStationProfiles] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState('');
  const [shortcutSuggestion, setShortcutSuggestion] = useState('');

  const openEditModal = (action: SystemAction) => {
    setEditingAction(action);
    setTempShortcut(action.shortcut);
    setTempTriggers(action.voiceTriggers.join(', '));
    setTempStationProfiles(action.stationProfiles ?? []);
    setShortcutError('');
    setShortcutSuggestion('');
    setIsRecording(false);
  };

  // Capture key combo from actual keypress
  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey)  parts.push('Meta');

    const key = e.key;
    // Ignore standalone modifier keys
    if (['Control','Alt','Shift','Meta'].includes(key)) return;

    // Normalise key names
    const keyMap: Record<string,string> = {
      ' ': 'Space', 'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
      'Enter': 'Enter', 'Escape': 'Escape', 'Backspace': 'Backspace',
      'Delete': 'Delete', 'Tab': 'Tab', 'Home': 'Home', 'End': 'End',
      'PageUp': 'PageUp', 'PageDown': 'PageDown',
    };
    const normKey = keyMap[key] ?? (key.length === 1 ? key.toUpperCase() : key);
    parts.push(normKey);

    const combo = parts.join('+');
    setTempShortcut(combo);
    setIsRecording(false);
    validateShortcut(combo, editingAction?.id ?? '');
  };

  const validateShortcut = (combo: string, currentId: string) => {
    setShortcutError('');
    setShortcutSuggestion('');
    if (!combo) return;
    const conflict = actions.find(a => a.id !== currentId && a.shortcut.toLowerCase() === combo.toLowerCase());
    if (conflict) {
      setShortcutError('"' + combo + '" is already assigned to "' + conflict.label + '"');
      // Suggest Alt+Shift variant or Ctrl variant
      const base = combo.replace(/^(Ctrl[+]|Alt[+]|Shift[+])*/i, '').replace(/[+]$/, '');
      const suggestions = [
        'Alt+Shift+' + base, 'Ctrl+' + base, 'Ctrl+Shift+' + base
      ].filter(s => !actions.find(a => a.shortcut.toLowerCase() === s.toLowerCase()));
      if (suggestions[0]) setShortcutSuggestion(suggestions[0]);
    }
  };

  const handleSave = async () => {
    if (!editingAction) return;
    if (shortcutError) return;
    const triggers = tempTriggers.split(',').map(t => t.trim()).filter(t => t !== "");
    await mockActionRegistryService.updateAction(editingAction.id, { 
      shortcut: tempShortcut, 
      voiceTriggers: triggers,
      stationProfiles: tempStationProfiles.length > 0 ? tempStationProfiles : undefined,
    });
    setActions([...mockActionRegistryService.getActions()]);
    setEditingAction(null);
  };

  // ─── Export Logic ───────────────────────────────────────────────────────
  const exportCurrentRegistry = () => {
    const instructions = [
      ["# ================================================================================"],
      ["# pathscribe SYSTEM ACTION REGISTRY - EDITING RULES"],
      ["# ================================================================================"],
      ["# 1. ONLY edit columns 'Shortcut' and 'Voice Triggers'."],
      ["# 2. SHORTCUTS MUST BE UNIQUE: The system will block duplicate keyboard combos."],
      ["# 3. DO NOT change ID, Label, or Category columns."],
      ["# 4. DO NOT add new rows. Only existing System Actions are supported."],
      ["# 5. VOICE TRIGGERS: Use a semi-colon (;) to separate multiple phrases."],
      ["# ================================================================================"],
      [""], 
      ["ID (DO NOT ALTER)", "Label (READ ONLY)", "Category (READ ONLY)", "Shortcut (UNIQUE)", "Voice Triggers (EDITABLE)"]
    ];

    const rows = actions.flatMap(a => [
      // Real, per direct follow-up ("someone can edit the action if
      // they really want to type some voice triggers"): confirmed
      // directly — nothing distinguished a disabled action's row from
      // any other in this exported file, so someone editing it in
      // Excel would have no way to know their edits won't take effect.
      // A '#' comment line, not a new column — the import logic
      // already skips '#' lines, and touching the Label column itself
      // would break re-import (it's checked verbatim against the
      // action's real label, so appending text there would make every
      // disabled row fail as a false "Blocked change to Label" error
      // even with no real edit intended).
      ...(a.isActive ? [] : [[`# ^ DISABLED — not voice/keyboard-eligible; editing this row's Shortcut/Voice Triggers below will not make it functional.`]]),
      [
        a.id,
        `"${a.label}"`,
        `"${a.category}"`,
        `"${a.shortcut}"`,
        `"${a.voiceTriggers.join('; ')}"`
      ],
    ]);

    const csvContent = [...instructions, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\uFEFF", csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "pathscribe_system_config.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Import Logic (With Shortcut Collision Detection) ───────────────────
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      
      const successLog: string[] = [];
      const errorLog: string[] = [];
      const seenIds = new Set<string>();
      const usedShortcutsInFile = new Map<string, string>(); // shortcut -> label
      let noChangeCount = 0;

      lines.forEach((line, index) => {
        const excelRow = index + 1;
        if (line.startsWith('#') || line.toLowerCase().includes('(do not alter)')) return;

        const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (parts.length >= 5) {
          const id = parts[0].replace(/["\s]/g, ''); 
          const label = parts[1].replace(/"/g, '').trim();
          const category = parts[2].replace(/"/g, '').trim();
          const shortcut = parts[3].replace(/"/g, '').trim().toLowerCase();
          const triggersRaw = parts[4] || "";
          
          const voiceTriggers = triggersRaw.replace(/"/g, '').split(';').map(t => t.trim()).filter(t => t !== "");

          const original = actions.find(a => a.id === id);
          
          // 1. Basic Validations
          if (!original) {
            errorLog.push(`Line ${excelRow}: Unknown ID "${id}".`);
            return;
          }
          if (seenIds.has(id)) {
            errorLog.push(`Line ${excelRow}: Duplicate ID "${id}" in file.`);
            return;
          }
          if (original.label !== label || original.category !== category) {
            errorLog.push(`Line ${excelRow} (${original.label}): Blocked change to Label/Category.`);
            return;
          }
          // Real, per direct follow-up ("someone can edit the action if
          // they really want to type some voice triggers"): the table's
          // own Edit button is disabled for isActive: false actions, but
          // this bulk-import path is a second, separate way to call
          // updateAction() that didn't share that same protection —
          // confirmed directly, nothing here checked isActive at all.
          // Same "Blocked change" pattern as the check just above.
          if (!original.isActive) {
            errorLog.push(`Line ${excelRow} (${original.label}): Blocked — this action is deliberately disabled (not voice/keyboard-eligible) and editing it here would not make it functional.`);
            return;
          }

          // 2. Shortcut Collision Detection
          // Check if this shortcut is used by another action in this file
          if (shortcut && usedShortcutsInFile.has(shortcut)) {
            errorLog.push(`Line ${excelRow}: Shortcut "${shortcut}" already assigned to "${usedShortcutsInFile.get(shortcut)}" in this file.`);
            return;
          }
          
          // Check if this shortcut is used by an action NOT in this file (global system check)
          const globalCollision = actions.find(a => a.id !== id && a.shortcut.toLowerCase() === shortcut);
          if (shortcut && globalCollision) {
            errorLog.push(`Line ${excelRow}: Shortcut "${shortcut}" is already reserved for "${globalCollision.label}".`);
            return;
          }

          seenIds.add(id);
          usedShortcutsInFile.set(shortcut, label);

          // 3. Change Detection
          const hasShortcutChanged = original.shortcut.toLowerCase() !== shortcut;
          const hasTriggersChanged = JSON.stringify([...original.voiceTriggers].sort()) !== JSON.stringify([...voiceTriggers].sort());

          if (!hasShortcutChanged && !hasTriggersChanged) {
            noChangeCount++;
            return;
          }

          mockActionRegistryService.updateAction(id, { shortcut, voiceTriggers });
          successLog.push(`Line ${excelRow}: ${original.label}`);
        }
      });

      setActions([...mockActionRegistryService.getActions()]);

      let summary = `Import Report\n----------------\n`;
      if (successLog.length > 0) {
        summary += `✅ UPDATED (${successLog.length}):\n`;
        successLog.slice(0, 5).forEach(s => summary += ` &bull; ${s}\n`);
        if (successLog.length > 5) summary += ` ...and ${successLog.length - 5} more.\n`;
        summary += `\n`;
      }
      if (noChangeCount > 0) summary += `ℹ️ ${noChangeCount} rows skipped (no changes).\n\n`;
      if (errorLog.length > 0) {
        summary += `❌ FAILURES/COLLISIONS (${errorLog.length}):\n`;
        errorLog.slice(0, 5).forEach(err => summary += ` &bull; ${err}\n`);
        if (errorLog.length > 5) summary += ` ...and ${errorLog.length - 5} more.`;
      }
      alert(summary);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const allCategories = Array.from(new Set(actions.map(a => a.category)));
  const filterOptions = ['All', ...allCategories];
  const filteredActions = actions.filter(a => {
    const matchesSearch = a.label.toLowerCase().includes(search.toLowerCase()) || 
                         a.voiceTriggers.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || a.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const displayedCategories = Array.from(new Set(filteredActions.map(a => a.category)));

  return (
    <div style={{ padding: '24px', color: 'var(--ps-conf-text)' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '24px', marginBottom: '8px' }}>⚙️ System Action Registry</h3>
          <p style={{ color: 'var(--ps-conf-text-2)' }}>Admin-only command configuration. Keyboard shortcuts must be unique system-wide.</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button onClick={exportCurrentRegistry} className="ps-conf-btn-secondary">Download Template</button>
            <button onClick={() => fileInputRef.current?.click()} className="ps-conf-btn-secondary">📥 Bulk Import</button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept=".csv" />
        </div>
      </div>

      <input type="text" placeholder="Search actions..." value={search} onChange={(e) => setSearch(e.target.value)} className="registry-search-input" />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {filterOptions.map(cat => (
          <button key={cat} onClick={() => setSelectedCategory(cat)} className={`ps-conf-category-btn${selectedCategory === cat ? ' active' : ''}`}>{cat === 'All' ? cat : toTitleCase(cat)}</button>
        ))}
      </div>

      <div style={{ overflowX: 'auto', opacity: editingAction ? 0.2 : 1, pointerEvents: editingAction ? 'none' : 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.2)', color: 'var(--ps-conf-text-3)', fontSize: '12px', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--ps-conf-bg)', zIndex: 2 }}>
              <th style={{ padding: '12px' }}>Action</th>
              <th style={{ padding: '12px' }}>Shortcut</th>
              <th style={{ padding: '12px' }}>Voice Triggers</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Settings</th>
            </tr>
          </thead>
          <tbody>
            {displayedCategories.map(cat => (
              <React.Fragment key={cat}>
                <tr style={{ background: 'rgba(10,15,30,0.98)', borderTop: '1px solid rgba(255,255,255,0.15)', borderBottom: '1px solid rgba(255,255,255,0.15)', position: 'sticky', top: '41px', zIndex: 1 }}>
                  <td colSpan={4} style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 'bold', color: '#38bdf8' }}>{toTitleCase(cat)}</td>
                </tr>
                {filteredActions.filter(a => a.category === cat).map((action) => (
                  <tr key={action.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: action.isActive ? 1 : 0.5 }}>
                    <td style={{ padding: '16px 32px' }}>
                       <div style={{ fontWeight: '500', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                         {action.label}
                         {/* Real, per direct follow-up ("someone can edit the
                             action if they really want to type some voice
                             triggers"): confirmed directly — this screen has
                             no isActive toggle at all, so an admin could type
                             real new triggers here for an action that will
                             never actually fire no matter what's typed,
                             with nothing telling them why. This badge is
                             that missing signal. */}
                         {!action.isActive && (
                           <span
                             title="Deliberately not voice/keyboard-enabled — a real, per-row action with no safe default target for a bare trigger (see this action's own comment in mockActionRegistryService.ts). Editing here would not make it functional."
                             style={{ fontSize: '9px', fontWeight: 'bold', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '4px', padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                           >
                             Disabled
                           </span>
                         )}
                       </div>
                       <div style={{ fontSize: '10px', color: '#475569' }}>{action.requiredRole}</div>
                    </td>
                    <td style={{ padding: '16px' }}><code style={{ background: 'var(--ps-conf-surface)', padding: '4px 8px', borderRadius: '4px', color: '#38bdf8' }}>{action.shortcut}</code></td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {action.voiceTriggers.map(t => <span key={t} style={{ background: 'rgba(8, 145, 178, 0.15)', color: '#22d3ee', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', border: '1px solid rgba(34, 211, 238, 0.2)' }}>{t}</span>)}
                      </div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <button
                        onClick={() => openEditModal(action)}
                        className="ps-conf-btn-row"
                        disabled={!action.isActive}
                        title={action.isActive ? undefined : 'Disabled — editing would not make this action functional (see the Disabled badge)'}
                        style={action.isActive ? undefined : { opacity: 0.4, cursor: 'not-allowed' }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {editingAction && (
        <div className="ps-conf-edit-modal-overlay">
          <div className="ps-conf-edit-modal">
            <h4 style={{ fontSize: '20px', marginBottom: '4px' }}>Edit Action</h4>
            <p style={{ color: 'var(--ps-conf-text-3)', fontSize: '14px', marginBottom: '24px' }}>{editingAction.label}</p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--ps-conf-text-2)', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>Shortcut</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={isRecording ? '⏺ Press your keys now…' : (tempShortcut || 'None')}
                  readOnly
                  onKeyDown={handleShortcutKeyDown}
                  onFocus={() => { setIsRecording(true); setShortcutError(''); setShortcutSuggestion(''); }}
                  onBlur={() => setIsRecording(false)}
                  style={{ flex: 1, background: isRecording ? 'rgba(56,189,248,0.1)' : 'var(--ps-conf-surface)', border: `1px solid ${isRecording ? '#38bdf8' : shortcutError ? '#ef4444' : 'var(--ps-conf-border)'}`, color: isRecording ? '#38bdf8' : 'var(--ps-conf-text)', padding: '12px', borderRadius: '6px', outline: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 14 }}
                  placeholder="Click then press keys"
                />
                {tempShortcut && (
                  <button onClick={() => { setTempShortcut(''); setShortcutError(''); setShortcutSuggestion(''); }}
                    className="ps-conf-shortcut-clear">
                    Clear
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 5 }}>
                {isRecording ? '🎯 Recording — press your key combination now' : 'Click the field and press the key combination you want to assign'}
              </div>
              {shortcutError && (
                <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#f87171' }}>
                  ⚠ {shortcutError}
                  {shortcutSuggestion && (
                    <span
                      onClick={() => { setTempShortcut(shortcutSuggestion); validateShortcut(shortcutSuggestion, editingAction?.id ?? ''); }}
                      style={{ marginLeft: 10, color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}>
                      {'Use "' + shortcutSuggestion + '" instead?'}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', color: 'var(--ps-conf-text-2)', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>Voice Triggers (Comma Separated)</label>
              <textarea value={tempTriggers} onChange={(e) => setTempTriggers(e.target.value)} style={{ width: '100%', background: 'var(--ps-conf-surface)', border: '1px solid #334155', color: '#fff', padding: '12px', borderRadius: '6px', height: '100px', resize: 'none', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', color: 'var(--ps-conf-text-2)', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>Station Profiles</label>
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>
                Scopes this action to the selected functional areas — eligible whenever a technician has a matching station selected, alongside its existing category.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxHeight: 140, overflowY: 'auto', border: '1px solid #334155', borderRadius: 6, padding: 10 }}>
                {ALL_FUNCTIONAL_AREAS.map(area => {
                  const checked = tempStationProfiles.includes(area);
                  return (
                    <label key={area} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ps-conf-text-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setTempStationProfiles(prev => checked ? prev.filter(a => a !== area) : [...prev, area])} />
                      {area}
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingAction(null)} className="fm-btn-cancel">Cancel</button>
              <button onClick={handleSave} className="ps-conf-btn-primary" disabled={!!shortcutError}>
                SAVE CHANGES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
