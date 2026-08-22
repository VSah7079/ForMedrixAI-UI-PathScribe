/**
 * useLatestResearch.ts — src/hooks/useLatestResearch.ts
 *
 * Boundary between the research feed service and the UI. The component that
 * consumes this holds no fetching, parsing, caching or error handling — it
 * receives an article or it does not.
 *
 * Copyright (c) 2026 ForMedrixAI LLC. All rights reserved.
 */

import { useEffect, useState, useCallback } from 'react';
import type { IResearchFeedService, ResearchArticle } from '@/services/research/IResearchFeedService';
import { pubmedResearchFeedService, setFeaturedArticle, refreshFeaturedArticle } from '@/services/research/pubmedResearchFeedService';
import { useAuth } from '@/contexts/AuthContext';
import { subspecialtyService } from '@/services';

interface LatestResearchState {
  article: ResearchArticle | null;
  isLoading: boolean;
  /** Real feature, per direct follow-up: "If they access the article
   *  and then search and find a different article, can we update the
   *  pubmed article link... so they don't have to search again."
   *  Fetches and pins a specific PMID as today's featured article for
   *  this user. Resolves to the new article on success, null on
   *  failure (invalid PMID, offline, etc.) — the caller's own UI owns
   *  showing that outcome. */
  setFeatured: (pmid: string) => Promise<ResearchArticle | null>;
  /** Real feature, per direct follow-up: "by clicking the pubmed
   *  button, I'd like to trigger a refresh of the presented article."
   *  A real, cache-bypassing re-check — see refreshFeaturedArticle's
   *  own header comment for why it isn't pinned. */
  refresh: () => Promise<ResearchArticle | null>;
  isRefreshing: boolean;
}

export function useLatestResearch(
  service: IResearchFeedService = pubmedResearchFeedService,
): LatestResearchState {
  const { user } = useAuth();
  const [article, setArticle] = useState<ResearchArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subspecialtyNames, setSubspecialtyNames] = useState<string[]>([]);

  // Real feature, per direct follow-up: "I would like the Users
  // subspeciality be taken into consideration when finding recent
  // pubmed articles." Subspecialty.userIds is the real membership list
  // (the user record itself has no field of its own — confirmed
  // directly against the real Staff admin screen and its own service).
  useEffect(() => {
    if (!user?.id) { setSubspecialtyNames([]); return; }
    let active = true;
    subspecialtyService.getAll().then(res => {
      if (!active || !res.ok) return;
      setSubspecialtyNames(
        res.data.filter(s => s.active && s.userIds.includes(user.id)).map(s => s.name)
      );
    }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const fetchLatest = () => {
      // Fire and forget: the dashboard renders immediately and the ticker
      // appears underneath it if and when the feed resolves.
      service
        .getLatestArticle(controller.signal, subspecialtyNames)
        .then((result) => {
          if (!active) return;
          setArticle(result);
          setIsLoading(false);
        })
        .catch(() => {
          // The service contract says it never rejects; this is belt and braces
          // so a future implementation cannot take the dashboard down with it.
          if (!active) return;
          setArticle(null);
          setIsLoading(false);
        });
    };

    fetchLatest();

    // Real fix, per direct follow-up: "I don't think refresh is
    // working. Its been on the same article since we started."
    // Confirmed directly: this effect previously only ever ran once,
    // on mount — the ticker only lives on the Home dashboard, so if a
    // user works a long stretch elsewhere in the app without
    // revisiting Home, the cache's own day-boundary check (now fixed
    // in pubmedResearchFeedService.ts) never gets a chance to even
    // run, regardless of how much real time passes. A real periodic
    // re-check closes that gap — getLatestArticle()'s own cache read
    // means this costs zero network calls except right around the
    // actual day boundary, so this isn't a real cost, just insurance.
    const intervalId = window.setInterval(fetchLatest, 30 * 60 * 1000);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [service, subspecialtyNames]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const setFeatured = useCallback(async (pmid: string) => {
    const result = await setFeaturedArticle(pmid, subspecialtyNames);
    if (result) setArticle(result);
    return result;
  }, [subspecialtyNames]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshFeaturedArticle(article?.id, subspecialtyNames);
      if (result) setArticle(result);
      return result;
    } finally {
      setIsRefreshing(false);
    }
  }, [article?.id, subspecialtyNames]);

  return { article, isLoading, setFeatured, refresh, isRefreshing };
}

export default useLatestResearch;
