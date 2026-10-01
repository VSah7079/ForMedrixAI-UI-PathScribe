/**
 * IResearchFeedService.ts — src/services/research/IResearchFeedService.ts
 *
 * Contract for retrieving recent peer-reviewed literature for the dashboard
 * ticker. Kept behind an interface so the UI never depends on NCBI directly
 * and the feed can be swapped, mocked in tests, or disabled by configuration.
 *
 * Copyright (c) 2026 ForMedrixAI LLC. All rights reserved.
 */

/** A single article, already sanitised and safe to render as plain text. */
export interface ResearchArticle {
  /** PubMed unique identifier (PMID). */
  id: string;
  /** Article title, HTML stripped and trailing period removed. */
  title: string;
  /** Journal name abbreviation, e.g. "Arch Pathol Lab Med". */
  source: string;
  /** Publication date as supplied, typically "2026" or "2026 Jul". */
  pubdate: string;
  /** Canonical public URL for the article. */
  url: string;
}

export interface IResearchFeedService {
  /**
   * Resolves with the most recent matching article, or null when none is
   * available. Implementations must never reject: the dashboard treats an
   * unavailable feed as a non-event, not an error to surface.
   *
   * @param signal Aborts the in-flight request when the caller unmounts.
   * @param subspecialtyNames Real feature, per direct follow-up: "I would
   *   like the Users subspeciality be taken into consideration when
   *   finding recent pubmed articles." The current user's own real,
   *   assigned Subspecialty names (Subspecialty.name, via
   *   subspecialtyService — Subspecialty.userIds is the real
   *   membership list, the user has no field of its own). Optional —
   *   a user with none set, or an implementation that ignores this
   *   entirely, still gets the admin-configured base query.
   */
  getLatestArticle(signal?: AbortSignal, subspecialtyNames?: string[]): Promise<ResearchArticle | null>;
}
