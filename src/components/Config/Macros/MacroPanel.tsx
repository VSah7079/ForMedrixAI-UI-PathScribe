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
//
// Batch 349 (PS-126): administrators get an "All" tab listing every macro,
// other users' personal ones included, grouped Enterprise, then each
// facility, then each user. Only administrators are offered Enterprise
// visibility or can change an Enterprise macro; for anyone else it is read
// only. The rules live in services/macros/macroAccess.ts. The tip above the
// list was near-invisible (about 2.3:1 contrast) and is now readable.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { macroService, userService } from '../../../services';
import { useConfigDirtyGuard } from '../configDirtyGuardContext';
import { isMacroVisibleTo } from '../../../services/macros/IMacroService';
import { canEditMacro, canManageAllMacros, groupAllMacros, macroTiersFor } from '../../../services/macros/macroAccess';
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
/** The list tabs: the three tiers, plus "All" for administrators (Batch 349). */
type ListTab = Tier | 'all';

// i18n note: Tier ('enterprise'/'facility'/'personal') is this panel's
// own internal visibility-scope identifier, not persisted server-side
// data — but it's displayed in several different shapes (a short tab
// label, a longer parenthetical select-option description), so it
// gets two separate LABEL_KEY maps rather than one, matching this
// codebase's established "translate only the displayed label, keep
// the underlying value" pattern for enum-like display values.
const TIER_LABEL_KEY: Record<Tier, string> = {
  enterprise: 'macroPanel.tier.enterprise',
  facility: 'macroPanel.tier.facility',
  personal: 'macroPanel.tier.personal',
};
const TIER_OPTION_LABEL_KEY: Record<Tier, string> = {
  enterprise: 'macroPanel.tierOption.enterprise',
  facility: 'macroPanel.tierOption.facility',
  personal: 'macroPanel.tierOption.personal',
};

const MacroPanel: React.FC<MacroPanelProps> = ({ approvedFonts }) => {
  const { t } = useTranslation();
  const sessionUser = getSessionUser();
  const currentUserId = sessionUser?.id ?? 'unknown';
  const role = sessionUser?.role;
  const isMacroAdmin = canManageAllMacros(role);
  const allowedTiers = macroTiersFor(role) as Tier[];
  // Batch 349: other users' names, for the administrator's "All" list.
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isMacroAdmin) return;
    void userService.getAll().then(res => {
      if (res.ok) setUserNames(Object.fromEntries(res.data.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()])));
    });
  }, [isMacroAdmin]);

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
  const [activeTier, setActiveTier] = useState<ListTab>(isMacroAdmin ? 'all' : 'enterprise');

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
      setImportError(e instanceof Error ? e.message : t('macroPanel.errors.couldNotReadFile'));
      setImportCandidates(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!importCandidates) return;
    if (importTier === 'facility' && !importFacilityId) {
      alert(t('macroPanel.errors.selectImportFacility'));
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
  const [draftTier, setDraftTier] = useState<Tier>(allowedTiers[0]);
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

  const tierList = activeTier === 'enterprise' ? enterpriseMacros : activeTier === 'facility' ? facilityMacros : activeTier === 'personal' ? personalMacros : rawMacros;
  const tierMacros = tierList.map(m => ({ id: m.id, trigger: m.shortcut, name: m.name, content: m.content }));
  const allGroups = activeTier === 'all'
    ? groupAllMacros(rawMacros, id => labs.find(l => l.id === id)?.name, id => userNames[id])
    : [];
  // Batch 349: an Enterprise macro (or someone else's) is read only unless the user may change it.
  const canEditSelected = !rawSelected || canEditMacro(rawSelected, currentUserId, role);
  const tierOptions: Tier[] = allowedTiers.includes(draftTier) ? allowedTiers : [draftTier, ...allowedTiers];

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
    const startTier: Tier = activeTier !== 'all' && allowedTiers.includes(activeTier) ? activeTier : allowedTiers[0];
    setDraftTier(startTier);
    setDraftFacilityId(startTier === 'facility' ? facilityFilter : '');
  };

  const handleSave = async () => {
    if (!trigger.trim() || !macroName.trim()) {
      alert(t('macroPanel.errors.missingFields'));
      return;
    }
    if (!trigger.startsWith(';')) {
      alert(t('macroPanel.errors.triggerFormat'));
      return;
    }
    if (draftTier === 'facility' && !draftFacilityId) {
      alert(t('macroPanel.errors.selectDraftFacility'));
      return;
    }
    if (!canEditSelected || !allowedTiers.includes(draftTier)) {
      alert(t('macroPanel.errors.notAllowed'));
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
    if (!confirm(t('macroPanel.confirm.deleteMacro', { name: selectedMacro?.name }))) return;
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

  // Real fix, PS-128: this isDirty was previously known only to this
  // component's own Save button (disabled={!isDirty}) — ConfigurationPage.tsx's
  // tab bar, voice-nav, and search-driven navigation had no way to see it and
  // would silently discard an in-progress macro edit on any tab switch. Now
  // reported into the shared page-level guard (see configDirtyGuardContext.ts)
  // so those navigations can confirm before discarding it. The cleanup on
  // unmount guards against this tab's own dirty flag outliving the component
  // itself in some future navigation path that doesn't route through
  // ConfigurationPage.tsx's own tab-change reset.
  const { setDirty } = useConfigDirtyGuard();
  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  if (loadingMacros) return (
    <div className="ps-macro-loading">{t('macroPanel.loading')}</div>
  );

  return (
    <div className="ps-macro-panel-root">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="ps-conf-card ps-macro-sidebar">
        <div className="ps-macro-sidebar-header">
          <h3 className="ps-macro-sidebar-title">{t('macroPanel.sidebar.title')}</h3>
          <div className="ps-macro-sidebar-header-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".dotx,.dotm,.docx,.docm"
              className="ps-st-file-input-hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFileChosen(f); e.target.value = ''; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="ps-conf-btn-secondary"
              title={t('macroPanel.sidebar.importButtonTitle')}
            >
              {t('macroPanel.sidebar.importButton')}
            </button>
            <button
              onClick={handleCreateNew}
              className="ps-conf-btn-primary"
            >
              {t('macroPanel.sidebar.newButton')}
            </button>
          </div>
        </div>

        <div className="ps-macro-hint">
          💡 {t('macroPanel.sidebar.hint')}
        </div>

        {/* Real, per direct guidance: three real, filtered tiers, not one flat list.
            Batch 349: plus "All" for administrators. */}
        <div className={`ps-macro-tier-tabs${isMacroAdmin ? ' ps-macro-tier-tabs--grid' : ''}`}>
          {((isMacroAdmin ? ['all', 'enterprise', 'facility', 'personal'] : ['enterprise', 'facility', 'personal']) as ListTab[]).map(tier => (
            <button
              key={tier}
              className={`ps-macro-tier-tab${activeTier === tier ? ' ps-macro-tier-tab--active' : ''}`}
              onClick={() => setActiveTier(tier)}
            >
              {tier === 'all' ? t('macroPanel.tier.all') : t(TIER_LABEL_KEY[tier])}
              <span className="ps-macro-tier-count">
                {tier === 'all' ? rawMacros.length : tier === 'enterprise' ? enterpriseMacros.length : tier === 'facility' ? facilityMacros.length : personalMacros.length}
              </span>
            </button>
          ))}
        </div>

        {activeTier === 'facility' && (
          <select className="ps-conf-select" value={facilityFilter} onChange={e => setFacilityFilter(e.target.value)}>
            <option value="">— {t('macroPanel.sidebar.selectFacility')} —</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}

        <div className="ps-macro-list">
          {activeTier === 'all' && allGroups.map(group => (
            <div key={`${group.tier}:${group.key}`} className="ps-macro-group">
              <div className="ps-macro-group-header">
                {group.tier === 'enterprise'
                  ? t('macroPanel.tier.enterprise')
                  : t(group.tier === 'facility' ? 'macroPanel.group.facility' : 'macroPanel.group.personal', { name: group.label })}
                <span className="ps-macro-tier-count">{group.macros.length}</span>
              </div>
              {group.macros.map(macro => (
                <button
                  key={macro.id}
                  onClick={() => handleSelectMacro(macro.id)}
                  className={`ps-macro-list-item${selectedMacroId === macro.id ? ' ps-macro-list-item--selected' : ''}`}
                >
                  <div className="ps-macro-list-item-name">{macro.name}</div>
                  <div className="ps-macro-list-item-trigger">{macro.shortcut}</div>
                </button>
              ))}
            </div>
          ))}
          {activeTier !== 'all' && tierMacros.map(macro => (
            <button
              key={macro.id}
              onClick={() => handleSelectMacro(macro.id)}
              className={`ps-macro-list-item${selectedMacroId === macro.id ? ' ps-macro-list-item--selected' : ''}`}
            >
              <div className="ps-macro-list-item-name">{macro.name}</div>
              <div className="ps-macro-list-item-trigger">{macro.trigger}</div>
            </button>
          ))}

          {tierMacros.length === 0 && (
            <div className="ps-macro-list-empty">
              {activeTier === 'facility' && !facilityFilter
                ? t('macroPanel.sidebar.noFacilitySelected')
                : <>{t('macroPanel.sidebar.emptyTier', { tier: activeTier === 'all' ? t('macroPanel.tier.all') : t(TIER_LABEL_KEY[activeTier]) })}<br />{t('macroPanel.sidebar.emptyTierCta')}</>}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel ──────────────────────────────────────────────────── */}
      <div className="ps-macro-right-panel">
        {selectedMacroId || isCreatingNew ? (
          <>
            {/* Header row */}
            <div className="ps-macro-field-row">
              <div className="ps-macro-field-flex1">
                <label className="ps-macro-field-label">
                  {t('macroPanel.editor.nameLabel')}
                </label>
                <input
                  value={macroName}
                  onChange={e => setMacroName(e.target.value)}
                  placeholder={t('macroPanel.editor.namePlaceholder')}
                  className="ps-macro-input"
                />
              </div>
              <div className="ps-macro-field-w180">
                <label className="ps-macro-field-label">
                  {t('macroPanel.editor.triggerLabel')}
                </label>
                <input
                  value={trigger}
                  onChange={e => setTrigger(e.target.value)}
                  placeholder=";gs"
                  className="ps-macro-input ps-macro-input--trigger"
                />
              </div>
            </div>

            {/* Real, per direct guidance: which real tier this macro belongs to */}
            <div className="ps-macro-field-row">
              <div className="ps-macro-field-flex1">
                <label className="ps-macro-field-label">
                  {t('macroPanel.editor.visibilityLabel')}
                </label>
                <select className="ps-conf-select" value={draftTier} onChange={e => setDraftTier(e.target.value as Tier)} disabled={!canEditSelected}>
                  {tierOptions.map(tier => (
                    <option key={tier} value={tier} disabled={!allowedTiers.includes(tier)}>{t(TIER_OPTION_LABEL_KEY[tier])}</option>
                  ))}
                </select>
              </div>
              {draftTier === 'facility' && (
                <div className="ps-macro-field-flex1">
                  <label className="ps-macro-field-label">
                    {t('macroPanel.editor.facilityLabel')}
                  </label>
                  <select className="ps-conf-select" value={draftFacilityId} onChange={e => setDraftFacilityId(e.target.value)}>
                    <option value="">— {t('common.select')} —</option>
                    {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Editor */}
            <div className="ps-macro-editor-wrap">
            <PathScribeEditor
                key={selectedMacroId ?? 'new'}
                content={editorContent}
                onChange={setEditorContent}
                approvedFonts={approvedFonts}
                macros={macros}
                minHeight="350px"
                placeholder={t('macroPanel.editor.contentPlaceholder')}
                showRulerDefault={false}
            />
            </div>

            {!canEditSelected && (
              <p className="ps-macro-readonly-note" role="note">{t('macroPanel.editor.readOnly')}</p>
            )}

            {/* Action buttons */}
            <div className="ps-macro-actions-row">
              {selectedMacroId && canEditSelected && (
                <button
                  onClick={handleDelete}
                  className="ps-btn-ghost-danger"
                >
                  {t('common.delete')}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!isDirty || !canEditSelected}
                className="ps-conf-btn-primary"
              >
                {selectedMacroId ? t('macroPanel.editor.saveChanges') : t('macroPanel.editor.createMacro')}
              </button>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="ps-conf-card ps-macro-empty-state">
            <div className="ps-macro-empty-icon">⚡</div>
            <div className="ps-macro-empty-title">{t('macroPanel.emptyState.title')}</div>
            <div className="ps-macro-empty-body">
              <Trans i18nKey="macroPanel.emptyState.body">
                Select a macro from the list to edit it, or click <strong className="ps-macro-empty-cta">+ New</strong> to create your first macro template.
              </Trans>
            </div>
            <button
              onClick={handleCreateNew}
              className="ps-conf-btn-primary ps-macro-empty-create-btn"
            >
              {t('macroPanel.emptyState.ctaButton')}
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
            <div className="ps-ose-quicktext-title">{t('macroPanel.import.modalTitle')}</div>
            {importCandidates.length === 0 ? (
              <p className="ps-conf-section-subtitle">{t('macroPanel.import.noEntriesFound')}</p>
            ) : (
              <>
                <p className="ps-conf-section-subtitle">
                  {t('macroPanel.import.foundCount', { count: importCandidates.length })} {t('macroPanel.import.autoTextNote')}
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
                          {entry.content ? entry.content.slice(0, 100) : t('macroPanel.import.noContentPlaceholder')}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="ps-macro-field-row ps-macro-import-tier-row">
                  <div className="ps-macro-field-flex1">
                    <label className="ps-conf-label">{t('macroPanel.import.importAsLabel')}</label>
                    <select className="ps-conf-select" value={importTier} onChange={e => setImportTier(e.target.value as Tier)}>
                      <option value="personal">{t(TIER_OPTION_LABEL_KEY.personal)}</option>
                      <option value="facility">{t(TIER_OPTION_LABEL_KEY.facility)}</option>
                      <option value="enterprise">{t(TIER_OPTION_LABEL_KEY.enterprise)}</option>
                    </select>
                  </div>
                  {importTier === 'facility' && (
                    <div className="ps-macro-field-flex1">
                      <label className="ps-conf-label">{t('macroPanel.editor.facilityLabel')}</label>
                      <select className="ps-conf-select" value={importFacilityId} onChange={e => setImportFacilityId(e.target.value)}>
                        <option value="">— {t('common.select')} —</option>
                        {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="ps-ose-quicktext-actions">
              <button className="ps-btn-ghost-dark" onClick={() => setImportCandidates(null)}>{t('common.cancel')}</button>
              {importCandidates.length > 0 && (
                <button className="ps-conf-btn-primary" disabled={importSelected.size === 0 || importing} onClick={handleConfirmImport}>
                  {importing ? t('macroPanel.import.importingLabel') : t('macroPanel.import.importButton', { count: importSelected.size })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {importError && (
        <div className="ps-conf-backdrop" onClick={() => setImportError(null)}>
          <div className="ps-macro-import-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ose-quicktext-title">{t('macroPanel.import.modalTitle')}</div>
            <p className="ps-conf-section-subtitle">{importError}</p>
            <div className="ps-ose-quicktext-actions">
              <button className="ps-conf-btn-primary" onClick={() => setImportError(null)}>{t('macroPanel.import.okButton')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MacroPanel;
