/**
 * pubmedResearchFeedService.ts — src/services/research/pubmedResearchFeedService.ts
 *
 * NCBI eUtils implementation of IResearchFeedService, tuned for VDI estates
 * where many concurrent sessions share one public egress IP.
 *
 * Two-stage pipeline, as eUtils requires:
 *   1. esearch.fcgi  -> most recent PMID matching the domain query
 *   2. esummary.fcgi -> title, journal and publication date for that PMID
 *
 * Rate-limit posture:
 *
 * - A 24 hour localStorage cache means a returning user costs zero network
 *   calls. First visit of the day costs two.
 *
 * - A 429 response parks the feed for 30 minutes. Without this, every session
 *   behind a throttled gateway retries on every dashboard mount and keeps the
 *   shared IP pinned at the limit. This matters more than the success cache:
 *   it is the difference between one slow morning and a self-sustaining
 *   throttle.
 *
 * - VITE_NCBI_API_KEY, when set, raises the shared limit from 3 to 10 req/sec.
 *   Note this key is inlined into the client bundle and is therefore public.
 *
 * - Endpoints, the article URL template and the search query are NOT
 *   hardcoded here. They come from mockResearchFeedConfigService, so an NCBI
 *   restructure is an admin edit rather than a release — the same lesson
 *   services/externalResources/ was built from. Every outcome is stamped via
 *   recordHealth(), so a permanently dead feed is distinguishable from a
 *   transient blip.
 *
 * Never throws. Every failure path resolves to null.
 *
 * Copyright (c) 2026 ForMedrixAI LLC. All rights reserved.
 */

import type { IResearchFeedService, ResearchArticle } from './IResearchFeedService';
import { mockResearchFeedConfigService } from './mockResearchFeedConfigService';

/** Identifies us to NCBI, per their usage guidelines. */
const TOOL = 'PathScribe';
const CONTACT = 'support@formedrixai.com';



/** Per request. Two sequential calls, so the worst case before giving up is 6s. */
const REQUEST_TIMEOUT_MS = 3_000;

const CACHE_KEY_BASE = 'pathscribe_pubmed_ticker_cache';
// Real fix, per direct follow-up: "I don't think refresh is working.
// Its been on the same article since we started." Confirmed directly:
// the OLD design (a rolling 24h window from the last fetch) was
// mechanically correct but paired with a hook that only ever checked
// on mount (see useLatestResearch.ts) — if the ticker's host page
// simply isn't revisited soon after the cache happens to expire, it
// can go stale far longer than a day with nothing wrong in this file
// at all. Switched to a genuine calendar-day boundary (valid only
// through the end of the day it was fetched, real local time) — more
// precisely matches "refresh each day" than a rolling window ever did,
// and combined with the new periodic re-check in useLatestResearch.ts,
// no longer depends on when the user happens to revisit.
function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

// Real feature, per direct follow-up: "I would like the Users
// subspeciality be taken into consideration." Different users now get
// genuinely different queries — a single, shared cache key would let
// whichever user happens to load the ticker first each day silently
// overwrite the article for everyone else, regardless of their own
// subspecialty. Each distinct set of subspecialty names gets its own
// real, separate cache entry.
function cacheKeyFor(subspecialtyNames: string[] | undefined): string {
  const suffix = (subspecialtyNames && subspecialtyNames.length > 0)
    ? '_' + [...subspecialtyNames].sort().join('|')
    : '_default';
  return CACHE_KEY_BASE + suffix;
}

/** How long to stop calling NCBI after a 429. */
const BACKOFF_KEY = 'pathscribe_pubmed_ticker_backoff';
const BACKOFF_MS = 30 * 60 * 1000;

/** Matches the schema in the VDI addendum. */
interface CacheEnvelope {
  timestamp: number;
  data: ResearchArticle | null;
  /** Real feature, per direct follow-up: "If they access the article
   *  and then search and find a different article, can we update the
   *  pubmed article link... so they don't have to search again." A
   *  manually-set article (via setFeaturedArticle below) is real,
   *  deliberate user intent — the periodic re-check in
   *  useLatestResearch.ts must never silently replace it with the
   *  automated pick later the same day. Cleared naturally once the
   *  calendar day rolls over, same as any other cache entry — a
   *  pinned choice is "for today," not permanent. */
  pinned?: boolean;
}

function apiKey(): string | undefined {
  const key = (import.meta as unknown as { env?: Record<string, string> })
    .env?.VITE_NCBI_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

/* ------------------------------------------------------------------ cache */

function readCache(cacheKey: string): ResearchArticle | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!isSameLocalDay(Date.now(), parsed.timestamp)) return undefined;
    return parsed.data;
  } catch {
    // Corrupt entry, storage disabled, private browsing — all mean "no
    // cache", never "fail".
    return undefined;
  }
}

function isPinned(cacheKey: string): boolean {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    return !!parsed.pinned && isSameLocalDay(Date.now(), parsed.timestamp);
  } catch {
    return false;
  }
}

function writeCache(cacheKey: string, data: ResearchArticle | null, pinned = false): void {
  try {
    const envelope: CacheEnvelope = { timestamp: Date.now(), data, pinned };
    localStorage.setItem(cacheKey, JSON.stringify(envelope));
  } catch {
    /* caching is an optimisation, not a requirement */
  }
}

function isBackedOff(): boolean {
  try {
    const until = Number(localStorage.getItem(BACKOFF_KEY) ?? 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function startBackoff(): void {
  try {
    localStorage.setItem(BACKOFF_KEY, String(Date.now() + BACKOFF_MS));
  } catch {
    /* no storage: the request simply retries next mount */
  }
}

/* ----------------------------------------------------------- personalisation */

// Real feature, per direct follow-up: "I would like the Users
// subspeciality be taken into consideration when finding recent
// pubmed articles." Maps each real Subspecialty.name (see
// mockSubspecialtyService.ts's own seed list) to a real PubMed
// Title/Abstract search term. Deliberately not exhaustive of every
// possible subspecialty an admin might add later — an unmapped name
// is silently skipped rather than breaking the query, so a genuine
// admin-added subspecialty with no mapping here still gets the base,
// unpersonalised query rather than an error.
const SUBSPECIALTY_QUERY_TERMS: Record<string, string> = {
  'Gastrointestinal': 'gastrointestinal pathology',
  'Breast': 'breast pathology',
  'Dermatopathology': 'dermatopathology',
  'Neuropathology': 'neuropathology',
  'Hematopathology': 'hematopathology',
  // Renamed from 'Gynecological' alongside the real Subspecialty
  // record's own name (mockSubspecialtyService.ts, id 'gyn') — see
  // that file's comment. Kept in sync here too, or a GYN-subspecialty
  // user would silently lose their personalized PubMed feed term.
  'Surgical GYN': 'gynecologic pathology',
  'Urological': 'genitourinary pathology',
  'Thoracic': 'thoracic pathology',
  'General Pathology': 'surgical pathology',
};

/**
 * Real, deliberate design choice, corrected after a real bug found
 * while building this: OR-wrapping the whole admin query would have
 * let the subspecialty branch bypass every one of the base query's own
 * quality filters (english[Language], NOT retracted/preprint/
 * editorial/comment/letter) — those clauses only bind to the original
 * OR-branch, not globally, in raw PubMed query syntax. AND-wrapping
 * two fully self-contained, parenthesized expressions together has no
 * such issue regardless of either side's internal structure, so this
 * narrows to the real intersection first — genuinely more personal
 * when a match exists — and getLatestArticle() below falls back to
 * the plain base query if that intersection comes up empty, rather
 * than ever showing nothing.
 */
function personalizeQuery(baseQuery: string, subspecialtyNames: string[] | undefined): string | null {
  if (!subspecialtyNames || subspecialtyNames.length === 0) return null;
  const terms = subspecialtyNames
    .map(name => SUBSPECIALTY_QUERY_TERMS[name])
    .filter((t): t is string => !!t);
  if (terms.length === 0) return null;
  const subspecialtyClause = terms.map(t => `(${t}[Title/Abstract])`).join(' OR ');
  return `(${baseQuery}) AND (${subspecialtyClause})`;
}

/* ------------------------------------------------------------- sanitising */

/**
 * Reduces a PubMed title to plain text. PubMed returns inline markup for
 * taxonomic names and superscripts, plus HTML entities. DOMParser decodes and
 * strips both without executing anything, unlike innerHTML on a live node.
 */
function toPlainText(raw: string): string {
  if (!raw) return '';
  let text = raw;
  try {
    text = new DOMParser().parseFromString(raw, 'text/html').body.textContent ?? raw;
  } catch {
    text = raw.replace(/<[^>]*>/g, '');
  }
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');   // PubMed titles carry a trailing period
}

/* ------------------------------------------------------------- networking */

class RateLimitedError extends Error {}

function buildUrl(baseUrl: string, endpoint: string, params: Record<string, string>): string {
  const url = new URL(`${baseUrl}/${endpoint}`);
  const key = apiKey();
  Object.entries({
    ...params,
    tool: TOOL,
    email: CONTACT,
    ...(key ? { api_key: key } : {}),
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

/**
 * Fetch with a hard timeout, honouring an externally supplied abort signal.
 * The signal alone does not cover a connection the hospital proxy accepts and
 * then never answers, which would leave the ticker loading indefinitely.
 */
async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) throw new RateLimitedError('eUtils rate limit');
    if (!response.ok) throw new Error(`eUtils responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* ----------------------------------------------------------------- service */

/** Real, shared two-stage fetch — esearch for a term, then esummary for
 *  whatever PMID it returns. Used for both the base and (when tried
 *  first) the personalized query, so the two attempts share identical,
 *  real sanitising/error handling rather than two subtly different
 *  copies of the same logic. */
async function fetchLatestForTerm(
  config: { apiBaseUrl: string; articleUrlTemplate: string },
  term: string,
  signal: AbortSignal | undefined,
  /** Real feature, per direct follow-up: "by clicking the pubmed
   *  button, I'd like to trigger a refresh of the presented article."
   *  NCBI's "most recent" for an unchanged query often returns the
   *  exact same top result if nothing new has actually been
   *  published — a refresh that just re-shows the same article would
   *  feel broken even though it genuinely re-checked. Fetching a few
   *  real candidates and skipping whichever PMID is already on screen
   *  makes an explicit refresh click actually show something
   *  different whenever a real alternative exists, honest when it
   *  genuinely doesn't (falls back to the same, real top result). */
  excludePmid?: string,
): Promise<ResearchArticle | null> {
  const search = await getJson(
    buildUrl(config.apiBaseUrl, 'esearch.fcgi', {
      db: 'pubmed', term, retmode: 'json', retmax: excludePmid ? '5' : '1', sort: 'pub_date',
    }),
    signal,
  );
  const candidates: string[] = search?.esearchresult?.idlist ?? [];
  if (candidates.length === 0) return null;
  const pmid = (excludePmid ? candidates.find(id => id !== excludePmid) : candidates[0]) ?? candidates[0];

  const summary = await getJson(
    buildUrl(config.apiBaseUrl, 'esummary.fcgi', { db: 'pubmed', id: pmid, retmode: 'json' }),
    signal,
  );
  const record = summary?.result?.[pmid];
  const title = toPlainText(record?.title ?? '');
  if (!title) return null;

  return {
    id: pmid,
    title,
    source: toPlainText(record?.source ?? ''),
    pubdate: toPlainText(record?.pubdate ?? ''),
    url: config.articleUrlTemplate.replace('{PMID}', pmid),
  };
}

export const pubmedResearchFeedService: IResearchFeedService = {
  async getLatestArticle(signal?: AbortSignal, subspecialtyNames?: string[]): Promise<ResearchArticle | null> {
    // URLs and query come from admin config, so an NCBI restructure is an
    // admin edit rather than a release. Every field falls back to its
    // built-in default independently — see the config service.
    const config = await mockResearchFeedConfigService.getConfig();
    if (!config.enabled) return null;

    const cacheKey = cacheKeyFor(subspecialtyNames);

    // Real feature, per direct follow-up: a manually pasted-in article
    // (setFeaturedArticle below) is real, deliberate user intent for
    // today — never silently overwritten by the periodic auto-refresh
    // in useLatestResearch.ts just because it happens to run again the
    // same day.
    if (isPinned(cacheKey)) {
      const pinnedArticle = readCache(cacheKey);
      if (pinnedArticle !== undefined) return pinnedArticle;
    }

    const cached = readCache(cacheKey);
    if (cached !== undefined) return cached;

    // Shared egress IP is currently throttled; do not add to it.
    if (isBackedOff()) return null;

    try {
      const personalizedTerm = personalizeQuery(config.query, subspecialtyNames);

      // Real feature, per direct follow-up: try the real, narrowed
      // intersection (base domain AND the user's own subspecialty)
      // first — genuinely more personal when it exists. Falls back to
      // the plain, unpersonalized base query if that intersection is
      // empty, rather than ever showing nothing just because a
      // narrow, two-way match doesn't exist today.
      let article = personalizedTerm ? await fetchLatestForTerm(config, personalizedTerm, signal) : null;
      if (!article) article = await fetchLatestForTerm(config, config.query, signal);

      if (!article) {
        mockResearchFeedConfigService.recordHealth('empty');
        writeCache(cacheKey, null);
        return null;
      }

      mockResearchFeedConfigService.recordHealth('success');
      writeCache(cacheKey, article);
      return article;
    } catch (error) {
      if (error instanceof RateLimitedError) {
        startBackoff();
        mockResearchFeedConfigService.recordHealth('rate-limited');
      } else {
        mockResearchFeedConfigService.recordHealth('error');
      }
      // Offline, blocked by network policy, timed out, rate limited,
      // malformed payload, or aborted on unmount. All are non-events: the
      // ticker does not render. Failures are not cached, so the next visit
      // retries — except after a 429, which parks the feed above.
      return null;
    }
  },
};

/**
 * Real feature, per direct follow-up: "If they access the article and
 * then search and find a different article, can we update the pubmed
 * article link to the new article so they don't have to search
 * again." A real PMID (already parsed/validated by the caller — see
 * parsePubMedInput in PubMedTicker.tsx) fetched directly via esummary
 * (no esearch stage — the caller already knows exactly which article
 * they want) and pinned as today's featured article for this user's
 * own real cache key, so the periodic auto-refresh in
 * useLatestResearch.ts leaves it alone for the rest of the day.
 */
export async function setFeaturedArticle(
  pmid: string,
  subspecialtyNames?: string[],
  signal?: AbortSignal,
): Promise<ResearchArticle | null> {
  const config = await mockResearchFeedConfigService.getConfig();
  try {
    const summary = await getJson(
      buildUrl(config.apiBaseUrl, 'esummary.fcgi', { db: 'pubmed', id: pmid, retmode: 'json' }),
      signal,
    );
    const record = summary?.result?.[pmid];
    const title = toPlainText(record?.title ?? '');
    if (!title) return null;

    const article: ResearchArticle = {
      id: pmid,
      title,
      source: toPlainText(record?.source ?? ''),
      pubdate: toPlainText(record?.pubdate ?? ''),
      url: config.articleUrlTemplate.replace('{PMID}', pmid),
    };
    writeCache(cacheKeyFor(subspecialtyNames), article, /* pinned */ true);
    return article;
  } catch {
    // Invalid PMID, offline, rate limited — all non-events for this
    // manual, best-effort action. The caller's own UI shows its own
    // "couldn't find that article" state; this never throws into it.
    return null;
  }
}

/**
 * Real feature, per direct follow-up: "by clicking the pubmed button,
 * I'd like to trigger a refresh of the presented article." A real,
 * explicit, cache-bypassing re-check — unlike getLatestArticle() above
 * (which reads the real, still-valid same-day cache first), this
 * always hits the network, tries the same personalized-then-base
 * fallback as the automatic path, and skips whichever PMID is
 * currently on screen when a real alternative exists. Not pinned:
 * a refresh is "check again right now," a genuinely different intent
 * from setFeaturedArticle's "I specifically chose this one" — the
 * periodic 30-minute auto-check in useLatestResearch.ts is fine to
 * read this back later the same day rather than being locked out of it.
 */
export async function refreshFeaturedArticle(
  currentPmid: string | undefined,
  subspecialtyNames?: string[],
  signal?: AbortSignal,
): Promise<ResearchArticle | null> {
  const config = await mockResearchFeedConfigService.getConfig();
  if (!config.enabled) return null;

  try {
    const personalizedTerm = personalizeQuery(config.query, subspecialtyNames);
    let article = personalizedTerm ? await fetchLatestForTerm(config, personalizedTerm, signal, currentPmid) : null;
    if (!article) article = await fetchLatestForTerm(config, config.query, signal, currentPmid);

    if (!article) {
      mockResearchFeedConfigService.recordHealth('empty');
      return null;
    }
    mockResearchFeedConfigService.recordHealth('success');
    writeCache(cacheKeyFor(subspecialtyNames), article, /* pinned */ false);
    return article;
  } catch (error) {
    if (error instanceof RateLimitedError) {
      startBackoff();
      mockResearchFeedConfigService.recordHealth('rate-limited');
    } else {
      mockResearchFeedConfigService.recordHealth('error');
    }
    return null;
  }
}

export default pubmedResearchFeedService;
