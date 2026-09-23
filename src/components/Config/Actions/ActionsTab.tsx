import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { mockActionRegistryService } from '../../../services/actionRegistry/mockActionRegistryService';
import { SystemAction } from '../../../services/actionRegistry/IActionRegistryService';
import { toTitleCase } from '../../../utils/formatLabel';
import { WORKSTATION_DISCIPLINES, FUNCTIONAL_AREAS_BY_DISCIPLINE } from '../../../services/workstationGroups/IWorkstationGroupService';

// Real, per PS-289's own comment thread — every real, populated
// functional area across every real discipline, flattened for this
// one multi-select. No current overlap between disciplines' own real
// area names (confirmed directly), so a flat list stays unambiguous.
const ALL_FUNCTIONAL_AREAS = WORKSTATION_DISCIPLINES.flatMap(d => FUNCTIONAL_AREAS_BY_DISCIPLINE[d]);

// Builds the post-import alert() report. A plain function (not a
// hook), so it takes t explicitly — this is UI-facing text the admin
// reads right after a bulk import, distinct from the CSV file's own
// column headers/instructions above (exported/persisted data, which
// stay English per this app's established convention).
function buildImportSummary(
  successLog: string[], errorLog: string[], noChangeCount: number, t: TFunction
): string {
  let summary = `${t('actionsTab.import.summary.header')}\n----------------\n`;
  if (successLog.length > 0) {
    summary += `${t('actionsTab.import.summary.updated', { count: successLog.length })}\n`;
    successLog.slice(0, 5).forEach(s => summary += ` &bull; ${s}\n`);
    if (successLog.length > 5) summary += ` ${t('actionsTab.import.summary.andMore', { count: successLog.length - 5 })}\n`;
    summary += `\n`;
  }
  if (noChangeCount > 0) summary += `${t('actionsTab.import.summary.skipped', { count: noChangeCount })}\n\n`;
  if (errorLog.length > 0) {
    summary += `${t('actionsTab.import.summary.failures', { count: errorLog.length })}\n`;
    errorLog.slice(0, 5).forEach(err => summary += ` &bull; ${err}\n`);
    if (errorLog.length > 5) summary += ` ${t('actionsTab.import.summary.andMore', { count: errorLog.length - 5 })}`;
  }
  return summary;
}

export const ActionsTab: React.FC = () => {
  const { t } = useTranslation();
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
      setShortcutError(t('actionsTab.edit.shortcutConflict', { combo, label: conflict.label }));
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
    const triggers = tempTriggers.split(',').map(trig => trig.trim()).filter(trig => trig !== "");
    await mockActionRegistryService.updateAction(editingAction.id, {
      shortcut: tempShortcut,
      voiceTriggers: triggers,
      stationProfiles: tempStationProfiles.length > 0 ? tempStationProfiles : undefined,
    });
    setActions([...mockActionRegistryService.getActions()]);
    setEditingAction(null);
  };

  // ─── Export Logic ───────────────────────────────────────────────────────
  // Exported CSV content — column headers, editing-rules instructions and
  // the disabled-row marker are all persisted/exported file content, not
  // on-screen UI copy, so they stay English per this app's established
  // convention (exported data keeps its own fixed shape/language).
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
    const blob = new Blob(["﻿", csvContent], { type: 'text/csv;charset=utf-8;' });
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

          const voiceTriggers = triggersRaw.replace(/"/g, '').split(';').map(trig => trig.trim()).filter(trig => trig !== "");

          const original = actions.find(a => a.id === id);

          // 1. Basic Validations
          if (!original) {
            errorLog.push(t('actionsTab.import.errors.unknownId', { line: excelRow, id }));
            return;
          }
          if (seenIds.has(id)) {
            errorLog.push(t('actionsTab.import.errors.duplicateId', { line: excelRow, id }));
            return;
          }
          if (original.label !== label || original.category !== category) {
            errorLog.push(t('actionsTab.import.errors.blockedLabelCategoryChange', { line: excelRow, label: original.label }));
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
            errorLog.push(t('actionsTab.import.errors.blockedDisabled', { line: excelRow, label: original.label }));
            return;
          }

          // 2. Shortcut Collision Detection
          // Check if this shortcut is used by another action in this file
          if (shortcut && usedShortcutsInFile.has(shortcut)) {
            errorLog.push(t('actionsTab.import.errors.shortcutDupInFile', { line: excelRow, shortcut, label: usedShortcutsInFile.get(shortcut) }));
            return;
          }

          // Check if this shortcut is used by an action NOT in this file (global system check)
          const globalCollision = actions.find(a => a.id !== id && a.shortcut.toLowerCase() === shortcut);
          if (shortcut && globalCollision) {
            errorLog.push(t('actionsTab.import.errors.shortcutReserved', { line: excelRow, shortcut, label: globalCollision.label }));
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
          successLog.push(t('actionsTab.import.success.line', { line: excelRow, label: original.label }));
        }
      });

      setActions([...mockActionRegistryService.getActions()]);

      alert(buildImportSummary(successLog, errorLog, noChangeCount, t));
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const allCategories = Array.from(new Set(actions.map(a => a.category)));
  const filterOptions = ['All', ...allCategories];
  const filteredActions = actions.filter(a => {
    const matchesSearch = a.label.toLowerCase().includes(search.toLowerCase()) ||
                         a.voiceTriggers.some(trig => trig.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || a.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const displayedCategories = Array.from(new Set(filteredActions.map(a => a.category)));

  return (
    <div className="ps-actionstab-page">
      <div className="ps-actionstab-header-row">
        <div>
          <h3 className="ps-actionstab-title">⚙️ {t('actionsTab.header.title')}</h3>
          <p className="ps-actionstab-subtitle">{t('actionsTab.header.subtitle')}</p>
        </div>
        <div className="ps-actionstab-header-actions">
            <button onClick={exportCurrentRegistry} className="ps-conf-btn-secondary">{t('actionsTab.header.downloadTemplate')}</button>
            <button onClick={() => fileInputRef.current?.click()} className="ps-conf-btn-secondary">📥 {t('actionsTab.header.bulkImport')}</button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="ps-actionstab-hidden-file-input" accept=".csv" />
        </div>
      </div>

      <input type="text" placeholder={t('actionsTab.search.placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="registry-search-input" />

      <div className="ps-actionstab-filter-row">
        {filterOptions.map(cat => (
          <button key={cat} onClick={() => setSelectedCategory(cat)} className={`ps-conf-category-btn${selectedCategory === cat ? ' active' : ''}`}>{cat === 'All' ? t('actionsTab.filters.all') : toTitleCase(cat)}</button>
        ))}
      </div>

      <div className={`ps-actionstab-table-wrap${editingAction ? ' ps-actionstab-table-wrap--dimmed' : ''}`}>
        <table className="ps-actionstab-table">
          <thead>
            <tr className="ps-actionstab-thead-row">
              <th className="ps-actionstab-th">{t('actionsTab.table.action')}</th>
              <th className="ps-actionstab-th">{t('actionsTab.table.shortcut')}</th>
              <th className="ps-actionstab-th">{t('actionsTab.table.voiceTriggers')}</th>
              <th className="ps-actionstab-th ps-actionstab-th--right">{t('actionsTab.table.settings')}</th>
            </tr>
          </thead>
          <tbody>
            {displayedCategories.map(cat => (
              <React.Fragment key={cat}>
                <tr className="ps-actionstab-category-row">
                  <td colSpan={4} className="ps-actionstab-category-cell">{toTitleCase(cat)}</td>
                </tr>
                {filteredActions.filter(a => a.category === cat).map((action) => (
                  <tr key={action.id} className={`ps-actionstab-row${action.isActive ? '' : ' ps-actionstab-row--inactive'}`}>
                    <td className="ps-actionstab-td ps-actionstab-td--label">
                       <div className="ps-actionstab-label-row">
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
                             title={t('actionsTab.table.disabledBadgeTitle')}
                             className="ps-actionstab-disabled-badge"
                           >
                             {t('actionsTab.table.disabled')}
                           </span>
                         )}
                       </div>
                       <div className="ps-actionstab-role">{action.requiredRole}</div>
                    </td>
                    <td className="ps-actionstab-td"><code className="ps-actionstab-shortcut-code">{action.shortcut}</code></td>
                    <td className="ps-actionstab-td">
                      <div className="ps-actionstab-triggers-wrap">
                        {action.voiceTriggers.map(trig => <span key={trig} className="ps-actionstab-trigger-pill">{trig}</span>)}
                      </div>
                    </td>
                    <td className="ps-actionstab-td ps-actionstab-td--right">
                      <button
                        onClick={() => openEditModal(action)}
                        className={`ps-conf-btn-row${action.isActive ? '' : ' ps-actionstab-edit-btn--disabled'}`}
                        disabled={!action.isActive}
                        title={action.isActive ? undefined : t('actionsTab.table.editDisabledTitle')}
                      >
                        {t('common.edit')}
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
            <h4 className="ps-actionstab-modal-title">{t('actionsTab.edit.title')}</h4>
            <p className="ps-actionstab-modal-subtitle">{editingAction.label}</p>
            <div className="ps-actionstab-field-group">
              <label className="ps-actionstab-field-label">{t('actionsTab.table.shortcut')}</label>
              <div className="ps-actionstab-shortcut-row">
                <input
                  value={isRecording ? t('actionsTab.edit.recordingPlaceholder') : (tempShortcut || t('actionsTab.edit.noneLabel'))}
                  readOnly
                  onKeyDown={handleShortcutKeyDown}
                  onFocus={() => { setIsRecording(true); setShortcutError(''); setShortcutSuggestion(''); }}
                  onBlur={() => setIsRecording(false)}
                  className={`ps-actionstab-shortcut-input${isRecording ? ' ps-actionstab-shortcut-input--recording' : shortcutError ? ' ps-actionstab-shortcut-input--error' : ''}`}
                  placeholder={t('actionsTab.edit.shortcutInputPlaceholder')}
                />
                {tempShortcut && (
                  <button onClick={() => { setTempShortcut(''); setShortcutError(''); setShortcutSuggestion(''); }}
                    className="ps-conf-shortcut-clear">
                    {t('common.clear')}
                  </button>
                )}
              </div>
              <div className="ps-actionstab-shortcut-hint">
                {isRecording ? `🎯 ${t('actionsTab.edit.recordingHint')}` : t('actionsTab.edit.idleHint')}
              </div>
              {shortcutError && (
                <div className="ps-actionstab-shortcut-error">
                  ⚠ {shortcutError}
                  {shortcutSuggestion && (
                    <span
                      onClick={() => { setTempShortcut(shortcutSuggestion); validateShortcut(shortcutSuggestion, editingAction?.id ?? ''); }}
                      className="ps-actionstab-shortcut-suggestion">
                      {t('actionsTab.edit.useSuggestionInstead', { suggestion: shortcutSuggestion })}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="ps-actionstab-field-group ps-actionstab-field-group--wide">
              <label className="ps-actionstab-field-label">{t('actionsTab.edit.voiceTriggersLabel')}</label>
              <textarea value={tempTriggers} onChange={(e) => setTempTriggers(e.target.value)} className="ps-actionstab-triggers-textarea" />
            </div>
            <div className="ps-actionstab-field-group ps-actionstab-field-group--wide">
              <label className="ps-actionstab-field-label">{t('actionsTab.edit.stationProfilesLabel')}</label>
              <div className="ps-actionstab-station-hint">
                {t('actionsTab.edit.stationProfilesHint')}
              </div>
              <div className="ps-actionstab-station-grid">
                {ALL_FUNCTIONAL_AREAS.map(area => {
                  const checked = tempStationProfiles.includes(area);
                  return (
                    <label key={area} className="ps-actionstab-station-checkbox-label">
                      <input type="checkbox" checked={checked}
                        onChange={() => setTempStationProfiles(prev => checked ? prev.filter(a => a !== area) : [...prev, area])} />
                      {area}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="ps-actionstab-modal-footer">
              <button onClick={() => setEditingAction(null)} className="fm-btn-cancel">{t('common.cancel')}</button>
              <button onClick={handleSave} className="ps-conf-btn-primary" disabled={!!shortcutError}>
                {t('actionsTab.edit.saveChanges').toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
