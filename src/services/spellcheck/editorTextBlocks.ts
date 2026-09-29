// src/services/spellcheck/editorTextBlocks.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): maps between a rich-text editor's document positions
// and the plain paragraph text the spell checker sees. The editor plugin
// walks its paragraphs and hands each one here as text runs with their
// document positions (inline nodes such as a line break count as one
// space); checker offsets are mapped back to document positions for the
// squiggles and for replacing a word. Pure.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpellIssue } from './spellCascade';

export interface TextRun {
  text: string;
  /** Document position of the run's first character. */
  pos: number;
}

export interface EditorTextBlock {
  key: string;
  text: string;
  runs: { offset: number; pos: number; length: number }[];
}

export function buildEditorTextBlock(key: string, runs: readonly TextRun[]): EditorTextBlock {
  let offset = 0;
  const mapped: EditorTextBlock['runs'] = [];
  let text = '';
  for (const r of runs) {
    mapped.push({ offset, pos: r.pos, length: r.text.length });
    text += r.text;
    offset += r.text.length;
  }
  return { key, text, runs: mapped };
}

/** Document position of a character offset in the block's text. */
export function offsetToPos(block: EditorTextBlock, offset: number): number {
  for (const r of block.runs) {
    if (offset >= r.offset && offset <= r.offset + r.length) return r.pos + (offset - r.offset);
  }
  const last = block.runs[block.runs.length - 1];
  return last ? last.pos + last.length : 0;
}

export interface IssueRange { from: number; to: number; issue: SpellIssue }

/** Checker issues as document ranges. An issue that spans two runs whose
 *  positions aren't contiguous (text split by an inline node) is dropped
 *  rather than drawn across the gap. */
export function issuesToRanges(block: EditorTextBlock, issues: readonly SpellIssue[]): IssueRange[] {
  const out: IssueRange[] = [];
  for (const issue of issues) {
    const from = offsetToPos(block, issue.from);
    const to = offsetToPos(block, issue.to);
    if (to - from === issue.to - issue.from) out.push({ from, to, issue });
  }
  return out;
}

/** The issue under a document position, if any. */
export function issueAt(ranges: readonly IssueRange[], pos: number): IssueRange | undefined {
  return ranges.find(r => pos >= r.from && pos <= r.to);
}

/** Plain-text segments for drawing squiggles under a text box: flagged
 *  segments carry their issue index. Overlapping issues keep the first. */
export function splitTextByIssues(text: string, issues: readonly SpellIssue[]): { text: string; issue?: number }[] {
  const out: { text: string; issue?: number }[] = [];
  let at = 0;
  [...issues.map((iss, i) => ({ iss, i }))]
    .sort((a, b) => a.iss.from - b.iss.from)
    .forEach(({ iss, i }) => {
      if (iss.from < at || iss.to > text.length) return;
      if (iss.from > at) out.push({ text: text.slice(at, iss.from) });
      out.push({ text: text.slice(iss.from, iss.to), issue: i });
      at = iss.to;
    });
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** The issue covering a character offset (for keyboard-opened menus). */
export function issueAtOffset(issues: readonly SpellIssue[], offset: number): number {
  return issues.findIndex(i => offset >= i.from && offset <= i.to);
}
