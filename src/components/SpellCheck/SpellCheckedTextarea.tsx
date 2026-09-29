// src/components/SpellCheck/SpellCheckedTextarea.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): a drop-in <textarea> for report free text. Inside a
// SpellCheckProvider it checks the text in the Web Worker after typing
// pauses and draws squiggles on a layer behind the (transparent) text box;
// right-clicking a squiggle opens SpellCheckMenu. Outside a provider it is
// a plain textarea with the browser's own spell check.
//
// The underline layer copies the textarea's class (same font, padding and
// border width), so its text lines up exactly; its own text is invisible.
// A replacement goes through the textarea's native value setter and an
// input event, so the parent's controlled onChange runs as if typed.
// ─────────────────────────────────────────────────────────────────────────────

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SpellIssue } from '@/services/spellcheck/spellCascade';
import { issueAtOffset, splitTextByIssues } from '@/services/spellcheck/editorTextBlocks';
import { useSpellCheckContext } from './SpellCheckContext';
import { SpellCheckMenu, type SpellMenuRequest } from './SpellCheckMenu';
import { DEBOUNCE_MS } from './spellCheckExtension';

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const setNativeValue = (el: HTMLTextAreaElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

export const SpellCheckedTextarea = forwardRef<HTMLTextAreaElement, Props>((props, ref) => {
  const ctx = useSpellCheckContext();
  const inner = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
  const [issues, setIssues] = useState<SpellIssue[]>([]);
  const [menu, setMenu] = useState<SpellMenuRequest | null>(null);
  const text = String(props.value ?? '');
  const active = !!ctx && !props.readOnly && !props.disabled;

  useEffect(() => {
    if (!active || !ctx?.ready) { setIssues([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      ctx.client.check(ctx.locale, [{ key: 't', text }])
        .then(r => { if (!cancelled) setIssues(r.get('t') ?? []); })
        .catch(() => { if (!cancelled) setIssues([]); });
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, ctx?.ready, ctx?.locale, ctx?.revision, ctx?.client, text]);

  const syncScroll = useCallback(() => {
    if (backdrop.current && inner.current) {
      backdrop.current.scrollTop = inner.current.scrollTop;
      backdrop.current.scrollLeft = inner.current.scrollLeft;
    }
  }, []);

  if (!active) return <textarea {...props} ref={inner} />;

  const openMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    props.onContextMenu?.(e);
    const keyboard = e.clientX === 0 && e.clientY === 0;
    let index = -1;
    if (!keyboard) {
      const mark = document.elementsFromPoint(e.clientX, e.clientY).find(el => el instanceof HTMLElement && el.dataset.spellIssue !== undefined) as HTMLElement | undefined;
      if (mark && backdrop.current?.contains(mark)) index = Number(mark.dataset.spellIssue);
    }
    if (index < 0) index = issueAtOffset(issues, inner.current?.selectionStart ?? -1);
    const issue = issues[index];
    if (!issue) return;
    e.preventDefault();
    const box = inner.current!.getBoundingClientRect();
    setMenu({
      x: keyboard ? box.left + 12 : e.clientX,
      y: keyboard ? box.top + 24 : e.clientY,
      issue,
      script: /\p{Script=Hangul}/u.test(issue.word) ? 'hangul' : 'latin',
      replace: replacement => {
        const el = inner.current;
        if (!el || el.value.slice(issue.from, issue.to) !== issue.word) return;
        setNativeValue(el, el.value.slice(0, issue.from) + replacement + el.value.slice(issue.to));
        el.focus();
      },
    });
  };

  return (
    <div className="ps-spelltext">
      <div ref={backdrop} aria-hidden="true" className={`${props.className ?? ''} ps-spelltext__backdrop`}>
        {splitTextByIssues(text, issues).map((seg, i) => (seg.issue === undefined
          ? <span key={i}>{seg.text}</span>
          : <mark key={i} data-spell-issue={seg.issue} className={`ps-spell ps-spell--${issues[seg.issue].reason}`}>{seg.text}</mark>))}
        {'\n'}
      </div>
      <textarea
        {...props}
        ref={inner}
        spellCheck={false}
        className={`${props.className ?? ''} ps-spelltext__input`}
        onScroll={e => { syncScroll(); props.onScroll?.(e); }}
        onContextMenu={openMenu}
      />
      {menu && <SpellCheckMenu request={menu} onClose={() => setMenu(null)} />}
    </div>
  );
});
SpellCheckedTextarea.displayName = 'SpellCheckedTextarea';
