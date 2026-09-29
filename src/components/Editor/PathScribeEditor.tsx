import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { X } from "../Icons";
import type { PathScribeEditorHandle } from './PathScribeEditorRef';
import { getUiPreference, setUiPreference } from '@/utils/uiPreferences';
import { useSpellCheckContext } from '../SpellCheck/SpellCheckContext';
import { SpellCheckMenu, type SpellMenuRequest } from '../SpellCheck/SpellCheckMenu';
import { createSpellCheckExtension, requestSpellRecheck } from '../SpellCheck/spellCheckExtension';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Subscript as SubscriptIcon, Superscript as SuperscriptIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered,
  IndentIncrease, IndentDecrease,
  Heading1, Heading2, Heading3,
  Highlighter, Baseline,
  Table as TableIcon,
  Search,
  Undo2, Redo2,
  Sun, Moon,
  PilcrowSquare,
  Zap, PenLine,
  ArrowUpDown, PaintBucket, SquareDashedBottom,
  SplitSquareHorizontal,
  Rows3, Columns3, Combine,
} from 'lucide-react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import Paragraph from '@tiptap/extension-paragraph';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface Macro {
  id: string;
  trigger: string;
  name: string;
  content: string;
}

export interface PathScribeEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  approvedFonts?: string[];
  macros?: Macro[];
  placeholder?: string;
  showRulerDefault?: boolean;
  minHeight?: string;
  readOnly?: boolean;
  // ── Multi-instance toolbar sharing ──────────────────────────────────────────
  // suppressToolbar=true + toolbarPortalId → portal toolbar to that DOM node
  // suppressToolbar=true + no toolbarPortalId → render NO toolbar (unfocused)
  // suppressToolbar omitted/false → render toolbar inline (default, backward compat)
  suppressToolbar?: boolean;
  toolbarPortalId?: string;
  theme?: 'light' | 'dark';
  /** Shows a real toggle button in the toolbar letting the user switch
   *  themes themselves. `theme` above becomes only the STARTING point --
   *  once the user has ever clicked the toggle anywhere it appears, that
   *  becomes their real preference (kept by utils/uiPreferences.ts), shared
   *  across every editor instance that opts into this, overriding
   *  whatever `theme` any individual screen was built with. Off by
   *  default so contexts that shouldn't show it (e.g. a small font
   *  preview box) don't get one uninvited. */
  allowThemeToggle?: boolean;
  // ── Tab width — industry-standard user preference ────────────────────────────
  // Number of spaces a Tab keypress inserts. Word/Docs/Notion all expose this as
  // a user setting rather than hardcoding it. Defaults to 4, persisted by the
  // parent (e.g. via utils/uiPreferences or the user profile) and passed back in on mount.
  tabWidthChars?: number;
  onTabWidthChange?: (chars: number) => void;
}

// ─── THEME CONTEXT ────────────────────────────────────────────────────────────
// Set once at the PathScribeEditor root; consumed by TBtn, Divider, Ruler,
// MacroModal, FindReplacePanel, InsertTableModal, and any other sub-component
// without prop drilling. This is what prevents the "forgot to pass theme"
// class of bugs we hit repeatedly when theme was a plain prop on every
// sub-component — a sub-component rendered without a Provider simply falls
// back to LIGHT_THEME instead of crashing.

export interface EditorThemeTokens {
  toolbarBg: string; toolbarBorder: string;
  btnBg: string; btnBgActive: string; btnBorder: string; btnBorderActive: string;
  btnHoverBg: string;
  btnText: string; btnTextActive: string; btnTextDisabled: string;
  dividerColor: string;
  panelBg: string; panelBorder: string; panelShadow: string; panelText: string; panelHoverBg: string;
  inputBg: string; inputBorder: string; inputText: string;
  contentBg: string; contentText: string; contentBorder: string;
  rulerBg: string; rulerBorder: string; rulerMarkColor: string;
  accent: string; accentText: string;
}

const LIGHT_THEME: EditorThemeTokens = {
  toolbarBg: 'white', toolbarBorder: '#e2e8f0',
  btnBg: 'white', btnBgActive: '#0891B2', btnBorder: '#e2e8f0', btnBorderActive: '#0891B2',
  btnHoverBg: '#f1f5f9',
  btnText: '#1e293b', btnTextActive: 'white', btnTextDisabled: '#cbd5e1',
  dividerColor: '#e2e8f0',
  panelBg: 'white', panelBorder: '#e2e8f0', panelShadow: '0 8px 24px rgba(0,0,0,0.12)', panelText: '#1e293b', panelHoverBg: '#f1f5f9',
  inputBg: 'white', inputBorder: '#e2e8f0', inputText: '#1e293b',
  contentBg: 'white', contentText: '#1e293b', contentBorder: '#e2e8f0',
  rulerBg: '#f8fafc', rulerBorder: '#e2e8f0', rulerMarkColor: '#64748b',
  accent: '#0891B2', accentText: 'white',
};

const DARK_THEME: EditorThemeTokens = {
  toolbarBg: 'transparent', toolbarBorder: 'transparent',
  btnBg: 'transparent', btnBgActive: 'transparent', btnBorder: 'transparent', btnBorderActive: 'transparent',
  btnHoverBg: 'rgba(148,163,184,0.14)',
  btnText: '#cbd5e1', btnTextActive: 'white', btnTextDisabled: '#5b6573',
  dividerColor: 'rgba(148,163,184,0.18)',
  panelBg: '#252d3a', panelBorder: 'rgba(148,163,184,0.18)', panelShadow: '0 8px 24px rgba(0,0,0,0.5)', panelText: '#e9edf2', panelHoverBg: 'rgba(148,163,184,0.12)',
  inputBg: 'rgba(148,163,184,0.08)', inputBorder: 'rgba(148,163,184,0.18)', inputText: '#e2e8f0',
  contentBg: '#0f172a', contentText: '#e2e8f0', contentBorder: 'rgba(148,163,184,0.15)',
  rulerBg: '#1a212c', rulerBorder: 'rgba(148,163,184,0.15)', rulerMarkColor: '#94a3b8',
  accent: '#22b8d8', accentText: 'white',
};

/** Batch 338 (standing rule: no inline CSS): the theme as CSS custom
 *  properties, set on the editor wrapper and on the toolbar (which can be
 *  portalled outside the wrapper); pathscribe.css's .pse-* rules read them. */
const themeVars = (theme: EditorThemeTokens): React.CSSProperties => ({
  '--pse-toolbar-bg': theme.toolbarBg, '--pse-toolbar-border': theme.toolbarBorder,
  '--pse-btn-hover-bg': theme.btnHoverBg, '--pse-btn-text': theme.btnText, '--pse-btn-text-disabled': theme.btnTextDisabled,
  '--pse-divider-color': theme.dividerColor, '--pse-panel-bg': theme.panelBg, '--pse-panel-text': theme.panelText,
  '--pse-input-bg': theme.inputBg, '--pse-input-border': theme.inputBorder, '--pse-input-text': theme.inputText,
  '--pse-content-bg': theme.contentBg, '--pse-content-border': theme.contentBorder, '--pse-accent': theme.accent,
  '--pse-content-text': theme.contentText,
} as React.CSSProperties);

/** The editor wrapper's custom properties: theme, minimum height and font (Batch 367). */
const editorWrapVars = (theme: EditorThemeTokens, minHeight: string, font?: string): React.CSSProperties => ({
  ...themeVars(theme),
  '--pse-min-height': minHeight,
  '--pse-font-family': `${font || 'Arial'}, sans-serif`,
} as React.CSSProperties);


// ─── IMPERATIVE HANDLE ────────────────────────────────────────────────────────
// Exposed via forwardRef so the Orchestrator Engine and NarrativeEditor
// can drive the editor programmatically without going through React props.
//
// FIXED (July 2026): this used to re-declare its own separate
// PathScribeEditorHandle interface here, structurally identical to (but
// nominally distinct from) the one in PathScribeEditorRef.ts — which
// every external consumer (NarrativeEditor.tsx, OrchestratorReportPanel.tsx,
// OrchestratorSectionEditor.tsx) actually imports. Two independent
// declarations of the same shape, kept in sync only by manual discipline —
// exactly the class of drift bug found live elsewhere in this codebase
// this session (aiProviderService, protocolRegistry/protocolShared, the
// reportingMode mismatch — see services/cases/caseFilterUtils.ts's own
// comment). Consolidated to a single source of truth — now imported at
// the top of this file instead of re-declared here.

// ─── MACRO HOTKEY EXTENSION ───────────────────────────────────────────────────

const createMacroExtension = (
  macros: Macro[],
  onUnknownTrigger: (partial: string) => void
) =>
  Extension.create({
    name: 'macroHotkey',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('macroHotkey'),
          props: {
            handleKeyDown(view, event) {
              if (event.key !== ' ' && event.key !== 'Enter') return false;

              const { state } = view;
              const { $from } = state.selection;
              const textBefore = $from.nodeBefore?.text ?? '';

              const match = textBefore.match(/(;[a-zA-Z0-9]+)$/);
              if (!match) return false;

              const typed = match[1];
              const macro = macros.find(m => m.trigger === typed);

              if (macro) {
                const from = $from.pos - typed.length;
                const to = $from.pos;
                const { tr } = state;
                tr.delete(from, to);
                view.dispatch(tr);

                view.dom.dispatchEvent(
                  new CustomEvent('insertMacroContent', {
                    detail: { content: macro.content },
                    bubbles: true,
                  })
                );

                if (event.key === ' ') event.preventDefault();
                return true;
              }

              if (typed.length > 1) {
                onUnknownTrigger(typed);
              }

              return false;
            },
          },
        }),
      ];
    },
  });

// ─── TAB KEY EXTENSION ────────────────────────────────────────────────────────

// ─── TAB KEY EXTENSION ────────────────────────────────────────────────────────
// Industry-standard behaviour:
//   • In a list item → Tab/Shift-Tab sink/lift the item (indent level), same
//     as Word, Google Docs, Notion.
//   • In plain text → Tab inserts a fixed-width space run sized by the user's
//     tabWidthChars setting (default 4) — this is what "tab width" means in
//     every code editor and most word processors when no ruler/tab-stops
//     are in play. We use non-breaking spaces inside a styled span so the
//     run can't collapse or wrap, and so it copies/pastes as plain spaces.
//   • Shift-Tab in plain text removes one tab-width of leading whitespace
//     from the start of the current line, mirroring "Reduce Indent".

const DEFAULT_TAB_WIDTH_CHARS = 4;

const createTabExtension = (tabWidthChars: number) =>
  Extension.create({
    name: 'tabKey',
    addKeyboardShortcuts() {
      const spaces = '\u00A0'.repeat(Math.max(1, tabWidthChars));
      return {
        Tab: ({ editor }) => {
          if (editor.can().sinkListItem('listItem')) {
            editor.chain().focus().sinkListItem('listItem').run();
            return true;
          }
          editor.chain().focus().insertContent(spaces).run();
          return true;
        },
        'Shift-Tab': ({ editor }) => {
          if (editor.can().liftListItem('listItem')) {
            editor.chain().focus().liftListItem('listItem').run();
            return true;
          }
          // Remove up to one tab-width of leading nbsp/space immediately
          // before the cursor, if present — best-effort "reduce indent".
          const { state } = editor;
          const { $from } = state.selection;
          const lineStart = $from.start();
          const textBefore = state.doc.textBetween(lineStart, $from.pos, '\n', '\n');
          const trailingSpaces = textBefore.match(/[\u00A0 ]+$/)?.[0] ?? '';
          if (trailingSpaces.length > 0) {
            const removeCount = Math.min(trailingSpaces.length, tabWidthChars);
            editor.chain().focus()
              .deleteRange({ from: $from.pos - removeCount, to: $from.pos })
              .run();
          }
          return true;
        },
      };
    },
  });

// ─── FONT SIZE EXTENSION ──────────────────────────────────────────────────────
// Tiptap has no built-in font-size command (unlike FontFamily, which ships as
// its own package). This extends TextStyle with a `fontSize` attribute and
// setFontSize/unsetFontSize commands, mirroring how FontFamily itself works
// internally. Without this, the font-size dropdown was purely cosmetic —
// it updated its own label but never touched the editor at all.

const FontSize = TextStyle.extend({
  name: 'textStyle', // intentionally reuse the same mark name as TextStyle so
                      // font-family and font-size attributes live on one mark
                      // instead of competing/nesting marks for the same text
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize || null,
        renderHTML: (attributes: { fontSize?: string | null }) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize: (size: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

// ─── PARAGRAPH SHADING & BORDERS ──────────────────────────────────────────────
// Extends Tiptap's default Paragraph node with `shading` (background colour)
// and `borderStyle` attributes, applied to the WHOLE paragraph block — not
// selected text. This is block-level formatting, like a callout box or table
// row shading in Word, distinct from the existing text-highlight mark (which
// stays as-is and colors only selected characters).
//
// Both attributes are no-selection-required: setParagraphShading/setBorder
// act on whichever paragraph the cursor currently sits in, the same way
// setTextAlign works on the current block regardless of selection.
//
// Border styles render via individual side properties so "Left Border" etc.
// can be combined or replaced cleanly without fighting a single shorthand.

type BorderStyle = 'none' | 'box' | 'left' | 'right' | 'top' | 'bottom';

const BORDER_CSS: Record<BorderStyle, string> = {
  none:   '',
  box:    'border: 1.5px solid #475569;',
  left:   'border-left: 3px solid #475569;',
  right:  'border-right: 3px solid #475569;',
  top:    'border-top: 3px solid #475569;',
  bottom: 'border-bottom: 3px solid #475569;',
};

const ShadedParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      shading: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
        renderHTML: (attributes: { shading?: string | null }) => {
          if (!attributes.shading) return {};
          return { style: `background-color: ${attributes.shading}; padding: 6px 10px; border-radius: 4px;` };
        },
      },
      borderStyle: {
        default: null,
        parseHTML: (element: HTMLElement) => (element.getAttribute('data-border') as BorderStyle) || null,
        renderHTML: (attributes: { borderStyle?: BorderStyle | null }) => {
          if (!attributes.borderStyle || attributes.borderStyle === 'none') return {};
          return {
            'data-border': attributes.borderStyle,
            style: BORDER_CSS[attributes.borderStyle] + ' padding: 6px 10px;',
          };
        },
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setParagraphShading: (color: string | null) => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { shading: color }),
      setParagraphBorder: (style: BorderStyle) => ({ commands }: any) =>
        commands.updateAttributes('paragraph', { borderStyle: style === 'none' ? null : style }),
    } as any;
  },
});

// ─── FORMATTING MARKS EXTENSION ───────────────────────────────────────────────
// Shows visible markers for whitespace characters that are otherwise
// invisible — regular spaces, non-breaking spaces (used by Tab), and
// paragraph ends. This is the "¶ Show Formatting Marks" feature found in
// Word/Google Docs, essential for debugging whitespace issues (e.g.
// confirming Tab actually inserted characters, or that trailing spaces
// weren't silently dropped).
//
// Implemented as a ProseMirror decoration plugin rather than pure CSS,
// because CSS pseudo-elements can't target individual characters inside a
// text run — only an inline decoration per character position can do that.

const formatMarksVisibleRef = { current: false };

const FormatMarksExtension = Extension.create({
  name: 'formatMarks',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('formatMarks'),
        props: {
          decorations(state) {
            if (!formatMarksVisibleRef.current) return null;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (let i = 0; i < node.text.length; i++) {
                const ch = node.text[i];
                if (ch === ' ' || ch === '\u00A0') {
                  const from = pos + i;
                  const isNbsp = ch === '\u00A0';
                  decorations.push(
                    Decoration.inline(from, from + 1, {
                      class: isNbsp ? 'ps-fm-nbsp' : 'ps-fm-space',
                    })
                  );
                }
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

// ─── TOOLBAR BUTTON ───────────────────────────────────────────────────────────
// Colours come from the --pse-* custom properties themeVars() sets on the
// toolbar (see pathscribe.css), so no theme prop or context is needed.

const TBtn: React.FC<{
  onClick: () => void; isActive?: boolean; title?: string;
  disabled?: boolean; children: React.ReactNode; width?: string;
}> = ({ onClick, isActive, title, disabled, children, width }) => {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className={isActive ? 'pse-tbtn pse-tbtn--active' : 'pse-tbtn'}
      style={width ? ({ '--pse-tbtn-min': width } as React.CSSProperties) : undefined}
    >
      {children}
    </button>
  );
};

const Divider = () => <div className="pse-divider" />;

// ─── FIND/REPLACE PANEL ───────────────────────────────────────────────────────

const FindReplacePanel: React.FC<{ editor: any; onClose: () => void }> = ({ editor, onClose }) => {
  const { t } = useTranslation();
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [mode, setMode] = useState<'find' | 'replace'>('find');
  const [matchCount, setMatchCount] = useState(0);

  const doFind = () => {
    if (!findText || !editor) return;
    const html = editor.getHTML();
    const count = (html.match(new RegExp(findText, 'gi')) || []).length;
    setMatchCount(count);
    window.find(findText);
  };

  const doReplaceAll = () => {
    if (!findText || !editor) return;
    const html = editor.getHTML();
    const newHtml = html.replace(new RegExp(findText, 'gi'), replaceText);
    editor.commands.setContent(newHtml);
    setMatchCount(0);
  };

  return (
    <div className="pse-dropdown-panel pse-findreplace-panel">
      <div className="pse-findreplace-header">
        <div className="pse-findreplace-tabs">
          <button onClick={() => setMode('find')} className={`pse-findreplace-tab${mode === 'find' ? ' pse-findreplace-tab--active' : ''}`}>{t('pathScribeEditor.findReplace.find')}</button>
          <button onClick={() => setMode('replace')} className={`pse-findreplace-tab${mode === 'replace' ? ' pse-findreplace-tab--active' : ''}`}>{t('pathScribeEditor.findReplace.replace')}</button>
        </div>
        <button onClick={onClose} className="pse-dropdown-close" aria-label={t('pathScribeEditor.close')}>✕</button>
      </div>
      <input value={findText} onChange={e => setFindText(e.target.value)} onKeyDown={e => e.key === 'Enter' && doFind()} placeholder={t('pathScribeEditor.findReplace.findPlaceholder')} autoFocus className="pse-dropdown-input" />
      {mode === 'replace' && <input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder={t('pathScribeEditor.findReplace.replacePlaceholder')} className="pse-dropdown-input" />}
      {matchCount > 0 && <div className="pse-findreplace-matchcount">{t('pathScribeEditor.findReplace.matchesFound', { count: matchCount })}</div>}
      <div className="pse-findreplace-actions">
        <button onClick={doFind} className="pse-btn-primary-block">{mode === 'find' ? t('pathScribeEditor.findReplace.findNext') : t('pathScribeEditor.findReplace.find')}</button>
        {mode === 'replace' && <button onClick={doReplaceAll} className="pse-btn-secondary-block">{t('pathScribeEditor.findReplace.replaceAll')}</button>}
      </div>
    </div>
  );
};

// ─── INSERT TABLE MODAL ───────────────────────────────────────────────────────

const InsertTableModal: React.FC<{ onInsert: (rows: number, cols: number) => void; onClose: () => void }> = ({ onInsert, onClose }) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<{ rows: number; cols: number } | null>(null);
  const maxR = 8, maxC = 10;
  return (
    <div className="pse-dropdown-panel pse-inserttable-panel">
      <div className="pse-inserttable-label">{hovered ? t('pathScribeEditor.insertTable.size', { rows: hovered.rows, cols: hovered.cols }) : t('pathScribeEditor.insertTable.selectSize')}</div>
      <div className="pse-inserttable-grid" style={{ '--pse-grid-cols': maxC } as React.CSSProperties}>
        {Array.from({ length: maxR }, (_, r) =>
          Array.from({ length: maxC }, (_, c) => (
            <div key={`${r}-${c}`} onMouseEnter={() => setHovered({ rows: r + 1, cols: c + 1 })} onMouseLeave={() => setHovered(null)} onClick={() => { onInsert(r + 1, c + 1); onClose(); }}
              className={`pse-inserttable-cell${hovered && r < hovered.rows && c < hovered.cols ? ' pse-inserttable-cell--active' : ''}`} />
          ))
        )}
      </div>
    </div>
  );
};

// ─── MACRO MODAL ─────────────────────────────────────────────────────────────

const MacroModal: React.FC<{ macros: Macro[]; initialSearch?: string; onSelect: (macro: Macro) => void; onClose: () => void }> = ({ macros, initialSearch = '', onSelect, onClose }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState(initialSearch);
  const filtered = macros.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.trigger.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="ps-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="pse-macromodal">
        <div className="pse-macromodal-header">
          <div className="pse-macromodal-header-row">
            <h3 className="pse-macromodal-title">{'⚡ '}{t('pathScribeEditor.macroModal.title')}</h3>
            <button onClick={onClose} className="pse-macromodal-close" aria-label={t('pathScribeEditor.close')}>✕</button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('pathScribeEditor.macroModal.searchPlaceholder')} autoFocus className="pse-macromodal-search" />
        </div>
        <div className="pse-macromodal-list">
          {filtered.length === 0 ? (
            <div className="pse-macromodal-empty">{t('pathScribeEditor.macroModal.noMacrosFound')}</div>
          ) : filtered.map(macro => (
            <button key={macro.id} onClick={() => { onSelect(macro); onClose(); }} className="pse-macromodal-row">
              <div className="pse-macromodal-trigger">{macro.trigger}</div>
              <div>
                <div className="pse-macromodal-name">{macro.name}</div>
                <div className="pse-macromodal-preview">{macro.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 80)}...</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── SPACING DROPDOWN ─────────────────────────────────────────────────────────

const SpacingDropdown: React.FC<{ editor: any; onClose: () => void }> = ({ editor, onClose }) => {
  const { t } = useTranslation();
  const lineSpacings = [
    { labelKey: 'pathScribeEditor.spacing.single', value: '1' },
    { labelKey: 'pathScribeEditor.spacing.oneOneFive', value: '1.15' },
    { labelKey: 'pathScribeEditor.spacing.oneFive', value: '1.5' },
    { labelKey: 'pathScribeEditor.spacing.double', value: '2' },
  ];
  const setLineHeight = (_lh: string) => { if (!editor) return; editor.chain().focus().run(); onClose(); };
  return (
    <div className="pse-dropdown-panel pse-spacing-panel">
      <div className="pse-dropdown-section-label">{t('pathScribeEditor.spacing.lineSpacing')}</div>
      {lineSpacings.map(s => (
        <button key={s.value} onClick={() => setLineHeight(s.value)} className="pse-dropdown-item">{t(s.labelKey)}</button>
      ))}
      <div className="pse-spacing-divider">
        <div className="pse-dropdown-section-label pse-dropdown-section-label--nopad">{t('pathScribeEditor.spacing.paragraphSpacing')}</div>
        <button onClick={() => { editor?.chain().focus().run(); onClose(); }} className="pse-dropdown-item">{t('pathScribeEditor.spacing.addSpaceBefore')}</button>
        <button onClick={() => { editor?.chain().focus().run(); onClose(); }} className="pse-dropdown-item">{t('pathScribeEditor.spacing.addSpaceAfter')}</button>
      </div>
    </div>
  );
};

// ─── COLOR PICKER ─────────────────────────────────────────────────────────────

const COLORS = [
  '#000000', '#1e293b', '#475569', '#94a3b8', '#e2e8f0', '#ffffff',
  '#dc2626', '#ea580c', '#d97706', '#65a30d', '#0891B2', '#7c3aed',
  '#fca5a5', '#fdba74', '#fde68a', '#bbf7d0', '#a5f3fc', '#ddd6fe',
  '#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7', '#e0f2fe', '#ede9fe',
];

const ColorPicker: React.FC<{ onSelect: (color: string | null) => void; onClose: () => void; title: string }> = ({ onSelect, onClose, title }) => {
  const { t } = useTranslation();
  return (
    <div className="pse-dropdown-panel pse-colorpicker-panel">
      <div className="pse-dropdown-section-label">{title}</div>
      <div className="pse-colorpicker-grid">
        {COLORS.map(color => (
          <div key={color} onClick={() => { onSelect(color); onClose(); }}
            className={`pse-colorpicker-swatch${color === '#ffffff' ? ' pse-colorpicker-swatch--outlined' : ''}`}
            style={{ '--swatch-color': color } as React.CSSProperties} />
        ))}
      </div>
      <button onClick={() => { onSelect(null); onClose(); }} className="pse-colorpicker-noneBtn">{t('pathScribeEditor.colorPicker.noColor')}</button>
    </div>
  );
};

// ─── BORDER DROPDOWN ──────────────────────────────────────────────────────────

const BorderDropdown: React.FC<{ onSelect: (style: BorderStyle) => void; onClose: () => void }> = ({ onSelect, onClose }) => {
  const { t } = useTranslation();
  const borders: { labelKey: string; value: BorderStyle; svg: React.ReactNode }[] = [
    { labelKey: 'pathScribeEditor.border.box',    value: 'box',    svg: <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" fill="none" stroke="#1e293b" strokeWidth="1.5"/></svg> },
    { labelKey: 'pathScribeEditor.border.left',   value: 'left',   svg: <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="1" y2="13" stroke="#1e293b" strokeWidth="2"/><rect x="1" y="1" width="12" height="12" fill="none" stroke="#cbd5e1" strokeWidth="0.5"/></svg> },
    { labelKey: 'pathScribeEditor.border.right',  value: 'right',  svg: <svg width="14" height="14" viewBox="0 0 14 14"><line x1="13" y1="1" x2="13" y2="13" stroke="#1e293b" strokeWidth="2"/><rect x="1" y="1" width="12" height="12" fill="none" stroke="#cbd5e1" strokeWidth="0.5"/></svg> },
    { labelKey: 'pathScribeEditor.border.top',    value: 'top',    svg: <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="1" stroke="#1e293b" strokeWidth="2"/><rect x="1" y="1" width="12" height="12" fill="none" stroke="#cbd5e1" strokeWidth="0.5"/></svg> },
    { labelKey: 'pathScribeEditor.border.bottom', value: 'bottom', svg: <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="13" x2="13" y2="13" stroke="#1e293b" strokeWidth="2"/><rect x="1" y="1" width="12" height="12" fill="none" stroke="#cbd5e1" strokeWidth="0.5"/></svg> },
    { labelKey: 'pathScribeEditor.border.none',   value: 'none',   svg: <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2"/></svg> },
  ];
  return (
    <div className="pse-dropdown-panel pse-border-panel">
      {borders.map(b => (
        <button key={b.value} onClick={() => { onSelect(b.value); onClose(); }} className="pse-dropdown-item pse-dropdown-item--withicon">
          {b.svg} {t(b.labelKey)}
        </button>
      ))}
    </div>
  );
};

// ─── MAIN EDITOR COMPONENT ───────────────────────────────────────────────────
// Wrapped with forwardRef so the Orchestrator Engine can acquire a ref
// and call imperative methods (insertAtPos, appendToken, setEditable, etc.)
// without going through React props/state.

const PathScribeEditor = forwardRef<PathScribeEditorHandle, PathScribeEditorProps>((
  {
    content = '',
    onChange,
    approvedFonts = ['Arial', 'Times New Roman', 'Courier New', 'Calibri'],
    macros = [],
    placeholder,
    minHeight = '400px',
    readOnly = false,
    suppressToolbar = false,
    toolbarPortalId,
    theme: themeProp = 'light',
    allowThemeToggle = false,
    tabWidthChars = DEFAULT_TAB_WIDTH_CHARS,
    onTabWidthChange,
  },
  ref
) => {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder ?? t('pathScribeEditor.defaultPlaceholder');

  // themeProp is only the STARTING point -- see allowThemeToggle's doc
  // comment above. A real saved user preference, once one exists, always
  // wins over whatever theme an individual screen was built with.
  // Batch 338: kept through utils/uiPreferences.ts (deployment-neutral UI).
  const THEME_PREF_KEY = 'editorTheme';
  const [activeThemeName, setActiveThemeName] = useState<'light' | 'dark'>(() => {
    if (!allowThemeToggle) return themeProp;
    const saved = getUiPreference<string>(THEME_PREF_KEY, '');
    return saved === 'light' || saved === 'dark' ? saved : themeProp;
  });
  const theme = activeThemeName === 'dark' ? DARK_THEME : LIGHT_THEME;
  const toggleTheme = () => {
    const next = activeThemeName === 'dark' ? 'light' : 'dark';
    setActiveThemeName(next);
    setUiPreference(THEME_PREF_KEY, next);
  };

  // ── UI State ──────────────────────────────────────────────────────────────
  const [showFormatMarks, setShowFormatMarks] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showMacroModal, setShowMacroModal]   = useState(false);
  const [macroModalSearch, setMacroModalSearch] = useState('');
  const [showFontColor, setShowFontColor]     = useState(false);
  const [showHighlight, setShowHighlight]     = useState(false);
  const [showShading, setShowShading]         = useState(false);
  const [showBorder, setShowBorder]           = useState(false);
  const [showSpacing, setShowSpacing]         = useState(false);
  const [showTabWidthMenu, setShowTabWidthMenu] = useState(false);
  const [selectedFont, setSelectedFont]       = useState(approvedFonts[0] || 'Arial');
  const [fontSize, setFontSize]               = useState('12');

  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // ── Editor Setup ──────────────────────────────────────────────────────────
  const handleUnknownTrigger = useCallback((partial: string) => {
    setMacroModalSearch(partial);
    setShowMacroModal(true);
  }, []);

  const macroExtension = React.useMemo(
    () => createMacroExtension(macros, handleUnknownTrigger),
    [macros, handleUnknownTrigger]
  );

  const tabExtension = React.useMemo(
    () => createTabExtension(tabWidthChars),
    [tabWidthChars]
  );

  const placeholderExtension = React.useMemo(
    () => Placeholder.configure({ placeholder: effectivePlaceholder }),
    [effectivePlaceholder]
  );

  // Tracks whether the next content-prop change originated from this
  // editor's own typing (via onUpdate) vs. an external source (AI
  // generation, template switch). See the content-sync useEffect below.
  const isInternalChange = useRef(false);

  // ── Spell check (PS-342, Batch 338) ───────────────────────────────────────
  // Inside a report screen's SpellCheckProvider the report's own checker
  // (the case's language + medical/facility/personal dictionaries) draws the
  // squiggles and the browser's spell check is switched off; elsewhere the
  // browser's spell check stays on. The extension is always installed and
  // reads the context through a ref, since TipTap fixes extensions at mount.
  const spell = useSpellCheckContext();
  const spellRef = useRef(spell);
  spellRef.current = spell;
  const [spellMenu, setSpellMenu] = useState<SpellMenuRequest | null>(null);
  const spellExtension = React.useMemo(
    () => createSpellCheckExtension(() => spellRef.current, setSpellMenu),
    []
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false, paragraph: false }),
      ShadedParagraph,
      FontSize, FontFamily, Color, Underline, Subscript, Superscript,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      macroExtension, tabExtension, FormatMarksExtension, placeholderExtension,
      spellExtension,
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      isInternalChange.current = true;
      onChange?.(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      // Keep the font/size dropdowns honest — show what's actually at the
      // cursor or selection, not just "whatever was last picked." Without
      // this, the dropdown looked unresponsive: picking a font for a
      // selection would apply correctly (as an inline mark) but the
      // dropdown itself wouldn't reflect it when you clicked elsewhere,
      // making it seem like font changes weren't taking effect at all.
      const attrs = editor.getAttributes('textStyle');
      const fontAttr = attrs.fontFamily as string | undefined;
      setSelectedFont(fontAttr || approvedFonts[0] || 'Arial');
      const sizeAttr = attrs.fontSize as string | undefined; // e.g. "14pt"
      setFontSize(sizeAttr ? sizeAttr.replace(/pt$/, '') : '12');
    },
    editorProps: {
      attributes: () => ({ class: 'ps-editor-content', spellcheck: spellRef.current ? 'false' : 'true' }),
    },
  });

  // Re-check when the language or the word lists change (and when the
  // provider appears or goes away, which also flips the browser check).
  const spellActive = !!spell;
  useEffect(() => {
    requestSpellRecheck(editor?.view);
  }, [editor, spellActive, spell?.locale, spell?.revision]);

  // Keep the module-level ref in sync with state, and force ProseMirror to
  // recompute decorations immediately (decorations() only re-runs when the
  // editor state changes, so a no-op transaction nudges it after toggling).
  useEffect(() => {
    formatMarksVisibleRef.current = showFormatMarks;
    if (editor) {
      editor.view.dispatch(editor.state.tr);
    }
  }, [showFormatMarks, editor]);

  // ── Imperative handle — exposes the editor to the Orchestrator ────────────
  useImperativeHandle(ref, () => ({
    getEditor: () => editor ?? null,

    insertAtPos: (pos: number, html: string) => {
      editor
        ?.chain()
        .insertContentAt(pos, html, {
          updateSelection: false,
          parseOptions: { preserveWhitespace: 'full' },
        })
        .run();
    },

    appendToken: (token: string) => {
      const end = editor?.state.doc.content.size ?? 0;
      editor
        ?.chain()
        .insertContentAt(end, token, {
          updateSelection: false,
          parseOptions: { preserveWhitespace: 'full' },
        })
        .run();
    },

    setContent: (html: string) => {
      editor?.commands.setContent(html);
    },

    clearContent: () => {
      editor?.commands.clearContent();
    },

    focus: () => {
      editor?.chain().focus().run();
    },

    isEditable: () => editor?.isEditable ?? false,

    setEditable: (editable: boolean) => {
      editor?.setEditable(editable);
    },
  }), [editor]);

  // ── Listen for macro insert events ────────────────────────────────────────
  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    if (!wrapper || !editor) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.content) {
        editor.chain().focus().insertContent(detail.content).run();
      }
    };
    wrapper.addEventListener('insertMacroContent', handler);
    return () => wrapper.removeEventListener('insertMacroContent', handler);
  }, [editor]);

  // ── Update content when prop changes ──────────────────────────────────────
  // IMPORTANT: only apply external content changes (AI generation, template
  // switch, etc.) — never re-apply content that originated from this editor's
  // own typing. Without this guard, every keystroke triggers React re-render
  // → new content prop → setContent() → which can silently drop or collapse
  // characters (notably trailing/plain spaces, which HTML serializers treat
  // as collapsible whitespace) and resets the cursor to the start.

  useEffect(() => {
    if (!editor) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false }); // don't emit another update event
    }
  }, [content, editor]);

  const insertMacro = (macro: Macro) => {
    editor?.chain().focus().insertContent(macro.content).run();
  };

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      setShowFindReplace(false); setShowTablePicker(false);
      setShowFontColor(false);   setShowHighlight(false);
      setShowBorder(false);      setShowSpacing(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!editor) return (
    <div className="pse-loading-wrap" style={{ '--pse-min-height': minHeight } as React.CSSProperties}>
      <span className="pse-loading-text">{t('pathScribeEditor.loadingEditor')}</span>
    </div>
  );

  const IC = 14;

  const renderToolbar = () => (
    <div onMouseDown={e => e.stopPropagation()} className="pse-toolbar" style={themeVars(theme)}>
      <select value={selectedFont} onChange={e => { setSelectedFont(e.target.value); editor.chain().focus().setFontFamily(e.target.value).run(); }} className="pse-toolbar-font-select">
        {approvedFonts.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <select value={fontSize} onChange={e => { setFontSize(e.target.value); (editor.chain().focus() as any).setFontSize(`${e.target.value}pt`).run(); }} className="pse-toolbar-size-select">
        {['8','9','10','11','12','14','16','18','20','24','28','32','36','48','72'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title={t('pathScribeEditor.toolbar.bold')}><Bold size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title={t('pathScribeEditor.toolbar.italic')}><Italic size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title={t('pathScribeEditor.toolbar.underline')}><UnderlineIcon size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title={t('pathScribeEditor.toolbar.strikethrough')}><Strikethrough size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={editor.isActive('subscript')} title={t('pathScribeEditor.toolbar.subscript')}><SubscriptIcon size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={editor.isActive('superscript')} title={t('pathScribeEditor.toolbar.superscript')}><SuperscriptIcon size={IC} /></TBtn>
      <Divider />
      <div className="pse-toolbar-anchor" onMouseDown={e => e.stopPropagation()}>
        <TBtn onClick={() => { setShowFontColor(v => !v); setShowHighlight(false); setShowShading(false); setShowBorder(false); setShowSpacing(false); }} title={t('pathScribeEditor.toolbar.fontColor')}>
          <span className="pse-toolbar-swatch-icon"><Baseline size={IC} /><span className="pse-toolbar-swatch-bar pse-toolbar-swatch-bar--red" /></span>
        </TBtn>
        {showFontColor && <ColorPicker title={t('pathScribeEditor.toolbar.fontColor')} onSelect={color => color ? editor.chain().focus().setColor(color).run() : editor.chain().focus().unsetColor().run()} onClose={() => setShowFontColor(false)} />}
      </div>
      <div className="pse-toolbar-anchor" onMouseDown={e => e.stopPropagation()}>
        <TBtn onClick={() => { setShowHighlight(v => !v); setShowFontColor(false); setShowShading(false); setShowBorder(false); setShowSpacing(false); }} title={t('pathScribeEditor.toolbar.highlightColor')}>
          <span className="pse-toolbar-swatch-icon"><Highlighter size={IC} /><span className="pse-toolbar-swatch-bar pse-toolbar-swatch-bar--yellow" /></span>
        </TBtn>
        {showHighlight && <ColorPicker title={t('pathScribeEditor.toolbar.highlight')} onSelect={color => color ? editor.chain().focus().setHighlight({ color }).run() : editor.chain().focus().unsetHighlight().run()} onClose={() => setShowHighlight(false)} />}
      </div>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title={t('pathScribeEditor.toolbar.alignLeft')}><AlignLeft size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title={t('pathScribeEditor.toolbar.alignCenter')}><AlignCenter size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title={t('pathScribeEditor.toolbar.alignRight')}><AlignRight size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title={t('pathScribeEditor.toolbar.justify')}><AlignJustify size={IC} /></TBtn>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title={t('pathScribeEditor.toolbar.bulletList')}><List size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title={t('pathScribeEditor.toolbar.numberedList')}><ListOrdered size={IC} /></TBtn>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().sinkListItem('listItem').run()} title={t('pathScribeEditor.toolbar.increaseIndent')} disabled={!editor.can().sinkListItem('listItem')}><IndentIncrease size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().liftListItem('listItem').run()} title={t('pathScribeEditor.toolbar.decreaseIndent')} disabled={!editor.can().liftListItem('listItem')}><IndentDecrease size={IC} /></TBtn>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title={t('pathScribeEditor.toolbar.heading1')}><Heading1 size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title={t('pathScribeEditor.toolbar.heading2')}><Heading2 size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title={t('pathScribeEditor.toolbar.heading3')}><Heading3 size={IC} /></TBtn>
      <Divider />
      <div className="pse-toolbar-anchor" onMouseDown={e => e.stopPropagation()}>
        <TBtn onClick={() => { setShowSpacing(v => !v); setShowFontColor(false); setShowHighlight(false); setShowShading(false); setShowBorder(false); }} title={t('pathScribeEditor.toolbar.lineParagraphSpacing')}><ArrowUpDown size={IC} /></TBtn>
        {showSpacing && <SpacingDropdown editor={editor} onClose={() => setShowSpacing(false)} />}
      </div>
      <TBtn onClick={() => setShowFormatMarks(v => !v)} isActive={showFormatMarks} title={t('pathScribeEditor.toolbar.toggleFormattingMarks')}><PilcrowSquare size={IC} /></TBtn>
      <Divider />
      <div className="pse-toolbar-anchor" onMouseDown={e => e.stopPropagation()}>
        <TBtn onClick={() => { setShowShading(v => !v); setShowFontColor(false); setShowHighlight(false); setShowBorder(false); setShowSpacing(false); }} title={t('pathScribeEditor.toolbar.paragraphShading')}>
          <PaintBucket size={IC} />
        </TBtn>
        {showShading && (
          <ColorPicker
            title={t('pathScribeEditor.toolbar.paragraphShadingShort')}
            onSelect={color => (editor.chain().focus() as any).setParagraphShading(color).run()}
            onClose={() => setShowShading(false)}
          />
        )}
      </div>
      <div className="pse-toolbar-anchor" onMouseDown={e => e.stopPropagation()}>
        <TBtn onClick={() => { setShowBorder(v => !v); setShowFontColor(false); setShowHighlight(false); setShowShading(false); setShowSpacing(false); }} title={t('pathScribeEditor.toolbar.borders')}><SquareDashedBottom size={IC} /></TBtn>
        {showBorder && (
          <BorderDropdown
            onSelect={style => (editor.chain().focus() as any).setParagraphBorder(style).run()}
            onClose={() => setShowBorder(false)}
          />
        )}
      </div>
      <Divider />
      <div className="pse-toolbar-anchor" onMouseDown={e => e.stopPropagation()}>
        <TBtn onClick={() => { setShowTablePicker(v => !v); setShowFindReplace(false); }} isActive={showTablePicker} title={t('pathScribeEditor.toolbar.insertTable')}><TableIcon size={IC} /></TBtn>
        {showTablePicker && <InsertTableModal onInsert={(rows, cols) => { editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(); }} onClose={() => setShowTablePicker(false)} />}
      </div>
      {editor.isActive('table') && (
        <>
          <Divider />
          <TBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title={t('pathScribeEditor.toolbar.addColumnAfter')}><Columns3 size={IC} /></TBtn>
          <TBtn onClick={() => editor.chain().focus().addRowAfter().run()} title={t('pathScribeEditor.toolbar.addRowAfter')}><Rows3 size={IC} /></TBtn>
          <TBtn onClick={() => editor.chain().focus().deleteColumn().run()} title={t('pathScribeEditor.toolbar.deleteColumn')}><span className="pse-toolbar-icon-badge"><Columns3 size={IC} /><span className="pse-toolbar-icon-x"><X size={8} /></span></span></TBtn>
          <TBtn onClick={() => editor.chain().focus().deleteRow().run()} title={t('pathScribeEditor.toolbar.deleteRow')}><span className="pse-toolbar-icon-badge"><Rows3 size={IC} /><span className="pse-toolbar-icon-x"><X size={8} /></span></span></TBtn>
          <TBtn onClick={() => editor.chain().focus().mergeCells().run()} title={t('pathScribeEditor.toolbar.mergeCells')}><Combine size={IC} /></TBtn>
          <TBtn onClick={() => editor.chain().focus().splitCell().run()} title={t('pathScribeEditor.toolbar.splitCell')}><SplitSquareHorizontal size={IC} /></TBtn>
          <TBtn onClick={() => editor.chain().focus().deleteTable().run()} title={t('pathScribeEditor.toolbar.deleteTable')}><span className="pse-toolbar-icon-badge"><TableIcon size={IC} /><span className="pse-toolbar-icon-x"><X size={8} /></span></span></TBtn>
        </>
      )}
      <Divider />
      <TBtn onClick={() => { setMacroModalSearch(''); setShowMacroModal(true); }} title={t('pathScribeEditor.toolbar.insertMacro')} width="68px"><Zap size={IC} /><span className="pse-toolbar-macro-label">{t('pathScribeEditor.toolbar.macro')}</span></TBtn>
      <Divider />
      <TBtn onClick={() => { const sig = `<p><br/></p><p>_____________________________ &nbsp;&nbsp;&nbsp; ${t('pathScribeEditor.signatureLine.date')}: ___________</p><p><em>${t('pathScribeEditor.signatureLine.pathologistSignature')}</em></p><p><br/></p>`; editor.chain().focus().insertContent(sig).run(); }} title={t('pathScribeEditor.toolbar.insertSignatureLine')}><PenLine size={IC} /></TBtn>
      <Divider />
      <div className="pse-toolbar-anchor" onMouseDown={e => e.stopPropagation()}>
        <TBtn onClick={() => { setShowFindReplace(v => !v); setShowTablePicker(false); }} isActive={showFindReplace} title={t('pathScribeEditor.toolbar.findReplace')}><Search size={IC} /></TBtn>
        {showFindReplace && <FindReplacePanel editor={editor} onClose={() => setShowFindReplace(false)} />}
      </div>
      <Divider />
      <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={t('pathScribeEditor.toolbar.undo')}><Undo2 size={IC} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={t('pathScribeEditor.toolbar.redo')}><Redo2 size={IC} /></TBtn>
      {allowThemeToggle && (
        <TBtn onClick={toggleTheme} title={activeThemeName === 'dark' ? t('pathScribeEditor.toolbar.switchToLightMode') : t('pathScribeEditor.toolbar.switchToDarkMode')}>
          {activeThemeName === 'dark' ? <Sun size={IC} /> : <Moon size={IC} />}
        </TBtn>
      )}
      <Divider />
      <div className="pse-toolbar-anchor" onMouseDown={e => e.stopPropagation()}>
        <TBtn onClick={() => setShowTabWidthMenu(v => !v)} isActive={showTabWidthMenu} title={t('pathScribeEditor.toolbar.tabWidth', { count: tabWidthChars })} width="auto">
          {t('pathScribeEditor.toolbar.tabShort', { count: tabWidthChars })}
        </TBtn>
        {showTabWidthMenu && (
          <div
            className="pse-tabwidth-menu"
            style={{ '--pse-tw-bg': theme.panelBg, '--pse-tw-border': theme.panelBorder, '--pse-tw-shadow': theme.panelShadow } as React.CSSProperties}
          >
            {[2, 4, 6, 8].map(n => (
              <button key={n} onClick={() => { onTabWidthChange?.(n); setShowTabWidthMenu(false); }}
                className="pse-tabwidth-item"
                style={{
                  '--pse-tw-item-bg': n === tabWidthChars ? theme.btnBgActive : 'transparent',
                  '--pse-tw-item-color': n === tabWidthChars ? theme.btnTextActive : theme.panelText,
                } as React.CSSProperties}
              >
                {t('pathScribeEditor.toolbar.spacesCount', { count: n })}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={editorWrapperRef}
      className={`pse-editor-wrap${showFormatMarks ? ' pse-editor-wrap--marks' : ''}`}
      style={editorWrapVars(theme, minHeight, approvedFonts[0])}
    >

      {/* Toolbar — portal-aware:
          suppressToolbar=false (default) → inline (backward compat for every
          other usage of this component across the app)
          suppressToolbar=true + toolbarPortalId → portal to shared sticky header
          suppressToolbar=true + no portalId → render nothing (unfocused instance) */}
      {!suppressToolbar && renderToolbar()}
      {suppressToolbar && toolbarPortalId && (() => {
        const node = typeof document !== 'undefined' ? document.getElementById(toolbarPortalId) : null;
        return node ? createPortal(renderToolbar(), node) : null;
      })()}

      <div className="pse-editor-body" style={{ '--pse-min-height': minHeight } as React.CSSProperties}>
        <EditorContent editor={editor} />
      </div>

      {showMacroModal && (
        <MacroModal macros={macros} initialSearch={macroModalSearch} onSelect={insertMacro} onClose={() => { setShowMacroModal(false); setMacroModalSearch(''); }} />
      )}

      {spellMenu && <SpellCheckMenu request={spellMenu} onClose={() => setSpellMenu(null)} />}

    </div>
  );
});

PathScribeEditor.displayName = 'PathScribeEditor';

export default PathScribeEditor;
