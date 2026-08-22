/**
 * PubMedTicker.tsx — src/components/Common/PubMedTicker.tsx
 *
 * Displays the most recent peer-reviewed article matching the pathology
 * domain query (personalized by the current user's own real subspecialty
 * assignments, when set), opening it in a companion window. Also offers a
 * lightweight way to override today's featured article by pasting a PMID
 * or PubMed link directly — see the header comment on the paste field
 * below for why this is a plain <input>, not the Clipboard API.
 *
 * Presentation only. Fetching, sanitising, caching, personalization and
 * rate-limit backoff all live in src/services/research and useLatestResearch;
 * window placement and position memory come from the shared
 * useCompanionWindow hook — the same launcher the EMR Sidecar uses, rather
 * than a second parallel mechanism.
 *
 * Copyright (c) 2026 ForMedrixAI LLC. All rights reserved.
 */

import React, { useState } from 'react';
import { useLatestResearch } from '@hooks/useLatestResearch';
import { useCompanionWindow } from '@hooks/useCompanionWindow';
import { parsePubMedInput } from '@/utils/parsePubMedInput';

const ExternalLinkIcon: React.FC = () => (
  <svg
    className="ps-litfeed-external"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

type PasteState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'success' } | { kind: 'error'; message: string };

const PubMedTicker: React.FC = () => {
  const { article, isLoading, setFeatured, refresh, isRefreshing } = useLatestResearch();

  // Reference material, not patient context: closeOnUnmount is false so
  // navigating away from the dashboard does not shut a paper the user is
  // still reading.
  const { openCompanion } = useCompanionWindow({
    windowName: 'PathScribePubMedRef',
    preferredWidth: 900,
    preferredHeight: 800,
    closeOnUnmount: false,
  });

  // Once a launch has been blocked, stop intercepting clicks and let the
  // anchor behave normally. The EMR Sidecar answers 'blocked' with an
  // embedded drawer; PubMed sets X-Frame-Options and cannot be embedded, so
  // an ordinary new tab is the honest fallback here.
  const [popupBlocked, setPopupBlocked] = useState(false);

  // Real feature, per direct follow-up: "If they access the article and
  // then search and find a different article, can we update the pubmed
  // article link to the new article so they don't have to search again."
  // A plain, visible <input> the user pastes into — deliberately not
  // navigator.clipboard.readText() on window focus. Reading the clipboard
  // programmatically needs real, explicit browser permission (a cold read
  // fails outright until granted, confirmed directly), and this app
  // targets VDI/Citrix estates where clipboard redirection between the
  // session and the local machine is often restricted by IT policy
  // regardless. A normal paste into a visible field needs no special
  // permission at all and works everywhere.
  const [pasteValue, setPasteValue] = useState('');
  const [pasteState, setPasteState] = useState<PasteState>({ kind: 'idle' });

  const handlePasteSubmit = async () => {
    const pmid = parsePubMedInput(pasteValue);
    if (!pmid) {
      setPasteState({ kind: 'error', message: "Couldn't find a PMID or PubMed link in that." });
      return;
    }
    setPasteState({ kind: 'loading' });
    const result = await setFeatured(pmid);
    if (result) {
      setPasteState({ kind: 'success' });
      setPasteValue('');
      window.setTimeout(() => setPasteState({ kind: 'idle' }), 2500);
    } else {
      setPasteState({ kind: 'error', message: "Couldn't find that article — check the ID and try again." });
    }
  };

  if (isLoading) {
    return (
      <div className="ps-litfeed" aria-hidden="true">
        <span className="ps-litfeed-badge">
          <span className="ps-litfeed-dot" />
          From PubMed
        </span>
        <span className="ps-litfeed-skeleton" />
      </div>
    );
  }

  // Nothing to show — no feed, no network, nothing published. Collapse
  // silently rather than leaving an empty shell on the dashboard.
  if (!article) return null;

  const metadata = [article.source, article.pubdate].filter(Boolean).join(' · ');

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (popupBlocked) return;                                   // let the anchor work
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

    // preventDefault has to happen synchronously, before openCompanion is
    // awaited — the click gesture is spent by the time the promise settles.
    event.preventDefault();

    void openCompanion(article.url).then((result) => {
      if (result !== 'blocked') return;
      setPopupBlocked(true);
      // One best-effort attempt at a plain tab; if enterprise policy blocks
      // popups outright this also fails, and the next click falls through to
      // the anchor's own navigation.
      window.open(article.url, '_blank', 'noopener,noreferrer');
    });
  };

  return (
    <div className="ps-litfeed-wrap">
      <div className="ps-litfeed">
        {/* Names the source rather than implying endorsement. This is an
            automated feed of the most recent matching article, not a curated
            or reviewed selection. */}
        {/* Names the source rather than implying endorsement, and — per
            direct follow-up: "by clicking the pubmed button, I'd like
            to trigger a refresh of the presented article" — doubles as
            a real, explicit refresh trigger. Deliberately a <button>,
            not part of the <a> below, so clicking it never navigates
            or opens the companion window; it only re-checks. */}
        <button
          type="button"
          className="ps-litfeed-badge ps-litfeed-badge--button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          title={isRefreshing ? 'Checking for a more recent article…' : 'Click to check for a more recent article'}
        >
          <span className={`ps-litfeed-dot${isRefreshing ? ' ps-litfeed-dot--refreshing' : ''}`} />
          From PubMed
        </button>

        <a
          className="ps-litfeed-link"
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          aria-label={`Open the PubMed listing for "${article.title}" in a companion window`}
        >
          <span className="ps-litfeed-title">{article.title}</span>
          {metadata && <span className="ps-litfeed-meta">{metadata}</span>}
          <ExternalLinkIcon />
        </a>
      </div>

      <div className="ps-litfeed-paste">
        <input
          className="ps-litfeed-paste-input"
          type="text"
          value={pasteValue}
          onChange={e => { setPasteValue(e.target.value); if (pasteState.kind === 'error') setPasteState({ kind: 'idle' }); }}
          onKeyDown={e => { if (e.key === 'Enter') void handlePasteSubmit(); }}
          placeholder="Found a better one? Paste the PMID or PubMed link"
          disabled={pasteState.kind === 'loading'}
        />
        {pasteValue.trim().length > 0 && pasteState.kind !== 'success' && (
          <button
            className="ps-litfeed-paste-btn"
            onClick={() => void handlePasteSubmit()}
            disabled={pasteState.kind === 'loading'}
          >
            {pasteState.kind === 'loading' ? 'Checking…' : 'Apply'}
          </button>
        )}
        {pasteState.kind === 'success' && (
          <span className="ps-litfeed-paste-success">✓ Updated</span>
        )}
        {pasteState.kind === 'error' && (
          <span className="ps-litfeed-paste-error">{pasteState.message}</span>
        )}
      </div>
    </div>
  );
};

export default PubMedTicker;
