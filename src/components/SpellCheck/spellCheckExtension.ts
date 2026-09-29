// src/components/SpellCheck/spellCheckExtension.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): the TipTap/ProseMirror plugin that draws spell-check
// squiggles in PathScribeEditor and opens the right-click menu.
//
//   • After typing pauses (DEBOUNCE_MS), every paragraph's text goes to the
//     Web Worker via SpellCheckClient, which only re-checks paragraphs it
//     hasn't seen (AC4); nothing heavy runs on the UI thread.
//   • Results arrive as decorations. Between checks, existing squiggles are
//     mapped through each edit so they move with the text.
//   • A result computed for an older version of the document is discarded
//     and re-requested, so a squiggle is never drawn in the wrong place.
//   • Right-click on a squiggle opens SpellCheckMenu (via onMenu); the
//     browser's own menu is used everywhere else.
// Paragraph ↔ document-position mapping is in services/spellcheck/editorTextBlocks.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { buildEditorTextBlock, issueAt, issuesToRanges, type EditorTextBlock, type IssueRange, type TextRun } from '@/services/spellcheck/editorTextBlocks';
import type { SpellCheckContextValue } from './SpellCheckContext';
import type { SpellMenuRequest } from './SpellCheckMenu';

export const DEBOUNCE_MS = 300;
export const spellCheckKey = new PluginKey<SpellPluginState>('pathscribeSpellCheck');

interface SpellPluginState { decos: DecorationSet; ranges: IssueRange[]; recheckStamp: number }

type Meta = { ranges: IssueRange[] } | { recheck: true };

/** Every paragraph (textblock) in the document as checker text + positions. */
export function collectTextBlocks(doc: PMNode): EditorTextBlock[] {
  const blocks: EditorTextBlock[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const runs: TextRun[] = [];
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset;
      if (child.isText && child.text) runs.push({ text: child.text, pos: childPos });
      else runs.push({ text: ' ', pos: childPos }); // line break or other inline node
    });
    blocks.push(buildEditorTextBlock(`b${blocks.length}`, runs));
    return false;
  });
  return blocks;
}

function decorationsFor(doc: PMNode, ranges: readonly IssueRange[]): DecorationSet {
  return DecorationSet.create(doc, ranges.map(r => Decoration.inline(r.from, r.to, {
    class: `ps-spell ps-spell--${r.issue.reason}`,
    'data-spell-word': r.issue.word,
  })));
}

export function createSpellCheckExtension(
  getContext: () => SpellCheckContextValue | null,
  onMenu: (request: SpellMenuRequest) => void,
) {
  return Extension.create({
    name: 'pathscribeSpellCheck',
    addProseMirrorPlugins() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let generation = 0;

      const run = async (view: EditorView) => {
        const ctx = getContext();
        if (!ctx || !view.editable) {
          // No report checker here (or read-only): clear any old squiggles.
          if (spellCheckKey.getState(view.state)?.ranges.length) view.dispatch(view.state.tr.setMeta(spellCheckKey, { ranges: [] } satisfies Meta));
          return;
        }
        if (!ctx.ready) return;
        const doc = view.state.doc;
        const mine = ++generation;
        const blocks = collectTextBlocks(doc);
        try {
          const results = await ctx.client.check(ctx.locale, blocks.map(b => ({ key: b.key, text: b.text })));
          if (mine !== generation || view.isDestroyed) return;
          if (view.state.doc !== doc) { schedule(view); return; }
          const ranges = blocks.flatMap(b => issuesToRanges(b, results.get(b.key) ?? []));
          view.dispatch(view.state.tr.setMeta(spellCheckKey, { ranges } satisfies Meta));
        } catch (e) {
          console.error('[spellCheck] check failed:', e);
        }
      };

      const schedule = (view: EditorView, delay = DEBOUNCE_MS) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => run(view), delay);
      };

      return [
        new Plugin<SpellPluginState>({
          key: spellCheckKey,
          state: {
            init: () => ({ decos: DecorationSet.empty, ranges: [], recheckStamp: 0 }),
            apply(tr, prev, _old, state: EditorState) {
              const meta = tr.getMeta(spellCheckKey) as Meta | undefined;
              if (meta && 'ranges' in meta) return { ...prev, decos: decorationsFor(state.doc, meta.ranges), ranges: meta.ranges };
              if (meta && 'recheck' in meta) return { ...prev, recheckStamp: prev.recheckStamp + 1 };
              if (!tr.docChanged) return prev;
              const ranges = prev.ranges
                .map(r => ({ ...r, from: tr.mapping.map(r.from), to: tr.mapping.map(r.to, -1) }))
                .filter(r => r.to > r.from);
              return { ...prev, decos: prev.decos.map(tr.mapping, tr.doc), ranges };
            },
          },
          view(view) {
            schedule(view, 0);
            return {
              update(v, prevState) {
                const stampChanged = spellCheckKey.getState(v.state)?.recheckStamp !== spellCheckKey.getState(prevState)?.recheckStamp;
                if (v.state.doc !== prevState.doc) schedule(v);
                else if (stampChanged) schedule(v, 0);
              },
              destroy() { if (timer) clearTimeout(timer); generation++; },
            };
          },
          props: {
            decorations: state => spellCheckKey.getState(state)?.decos,
            handleDOMEvents: {
              contextmenu(view, event) {
                const keyboard = event.clientX === 0 && event.clientY === 0;
                const pos = keyboard ? view.state.selection.from : view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
                if (pos == null) return false;
                const hit = issueAt(spellCheckKey.getState(view.state)?.ranges ?? [], pos);
                if (!hit) return false;
                event.preventDefault();
                const at = keyboard ? view.coordsAtPos(hit.from) : { left: event.clientX, bottom: event.clientY };
                onMenu({
                  x: at.left,
                  y: at.bottom,
                  issue: hit.issue,
                  script: /\p{Script=Hangul}/u.test(hit.issue.word) ? 'hangul' : 'latin',
                  replace: text => {
                    const current = issueAt(spellCheckKey.getState(view.state)?.ranges ?? [], hit.from);
                    const range = current ?? hit;
                    view.dispatch(view.state.tr.insertText(text, range.from, range.to));
                    view.focus();
                  },
                });
                return true;
              },
            },
          },
        }),
      ];
    },
  });
}

/** Ask the plugin to re-check now (language or word lists changed). */
export function requestSpellRecheck(view: EditorView | undefined | null) {
  if (view && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(spellCheckKey, { recheck: true } satisfies Meta));
}
