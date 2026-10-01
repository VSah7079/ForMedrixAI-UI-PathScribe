// src/components/SpellCheck/SpellCheckMenu.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): the right-click menu for a flagged word (AC5):
// suggestions, Ignore, Add to my dictionary, and (admins, when the case's
// lab is known) Add to the facility dictionary. What it offers comes from
// services/spellcheck/spellMenuModel.ts; this only renders and dispatches.
// Keyboard: focus starts on the first item; arrow keys move; Escape closes.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { buildSpellMenuModel, type SpellMenuModel } from '@/services/spellcheck/spellMenuModel';
import type { SpellIssue } from '@/services/spellcheck/spellCascade';
import type { SpellToken } from '@/services/spellcheck/tokenizeForSpelling';
import { useSpellCheckContext } from './SpellCheckContext';

export interface SpellMenuRequest {
  x: number;
  y: number;
  issue: Pick<SpellIssue, 'word' | 'reason' | 'preferred'>;
  script: SpellToken['script'];
  replace(text: string): void;
}

export const SpellCheckMenu: React.FC<{ request: SpellMenuRequest; onClose: () => void }> = ({ request, onClose }) => {
  const { t } = useTranslation();
  const ctx = useSpellCheckContext();
  const [model, setModel] = useState<SpellMenuModel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    const build = (suggestions: string[]) => {
      if (!cancelled) setModel(buildSpellMenuModel(request.issue, suggestions, ctx));
    };
    ctx.client.suggest(ctx.locale, request.issue.word, request.script).then(build).catch(() => build([]));
    return () => { cancelled = true; };
  }, [ctx, request]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [model]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  if (!ctx) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const choose = (text: string) => { request.replace(text); onClose(); };
  const act = async (fn: () => Promise<unknown> | void) => { await fn(); onClose(); };
  const addFacility = async () => {
    const ok = await ctx.addToFacility(request.issue.word);
    if (ok) onClose(); else setNotice(t('spellCheck.menu.facilityRefused'));
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('spellCheck.menu.label', { word: request.issue.word })}
      className="ps-spellmenu"
      style={{ '--spellmenu-x': `${request.x}px`, '--spellmenu-y': `${request.y}px` } as React.CSSProperties}
      onKeyDown={onKeyDown}
    >
      {request.issue.reason === 'regionalVariant' && (
        <div className="ps-spellmenu__hint">{t('spellCheck.menu.regionalHint', { locale: t(`spellCheck.locales.${ctx.locale}`) })}</div>
      )}
      {!model && <div className="ps-spellmenu__hint">{t('spellCheck.menu.loading')}</div>}
      {model && model.suggestions.length === 0 && <div className="ps-spellmenu__hint">{t('spellCheck.menu.noSuggestions')}</div>}
      {model?.suggestions.map(s => (
        <button key={s} type="button" role="menuitem" className="ps-spellmenu__item ps-spellmenu__item--suggestion" onClick={() => choose(s)}>{s}</button>
      ))}
      {model && (
        <>
          <div className="ps-spellmenu__sep" role="separator" />
          <button type="button" role="menuitem" className="ps-spellmenu__item" onClick={() => act(() => ctx.ignore(request.issue.word))}>{t('spellCheck.menu.ignore')}</button>
          <button type="button" role="menuitem" className="ps-spellmenu__item" onClick={() => act(() => ctx.addToPersonal(request.issue.word))}>{t('spellCheck.menu.addPersonal')}</button>
          {model.canAddFacility && (
            <button type="button" role="menuitem" className="ps-spellmenu__item" onClick={addFacility}>
              {t('spellCheck.menu.addFacility', { facility: model.facilityLabel ?? '' })}
            </button>
          )}
        </>
      )}
      {notice && <div className="ps-spellmenu__hint ps-spellmenu__hint--error">{notice}</div>}
    </div>,
    document.body,
  );
};
