import { describe, it, expect } from 'vitest';
import { resolveSynopticTranslationSignOutAuditEvent } from './resolveSynopticTranslationSignOutAuditEvent';
import { CYTOLOGY_SYNOPTIC_TEMPLATES } from './cytologySynopticTemplateRegistry';
import type { PathologyLexiconEntry } from '@/types/cytology/PathologyLexicon';

const thyroidId = CYTOLOGY_SYNOPTIC_TEMPLATES.find(t => t.id === 'thyroid_fna_cytology')!.id;
const pathologist = { userId: 'u-path', displayName: 'Dr. Pathologist', role: 'pathologist' };
const cytotechnologist = { userId: 'u-ct', displayName: 'Dr. Screener', role: 'cytotechnologist' };

describe('resolveSynopticTranslationSignOutAuditEvent', () => {
  it('a real review with no synoptic data at all produces no real audit event', () => {
    expect(resolveSynopticTranslationSignOutAuditEvent({}, 'fr', [], pathologist, 'S26-0001')).toBeUndefined();
  });

  it('the real canonical locale (en) is never flagged, since it IS the source language', () => {
    const review = { synopticData: { templateId: thyroidId, answers: { bethesda_category: 'ii_benign' } } };
    expect(resolveSynopticTranslationSignOutAuditEvent(review, 'en', [], pathologist, 'S26-0001')).toBeUndefined();
  });

  it('a real review with no real unvalidated terms currently present produces no real audit event \u2014 the ordinary STANDARD sign-out is never logged here', () => {
    const review = { synopticData: { templateId: thyroidId, answers: { procedure: 'us_guided_fna' } } };
    expect(resolveSynopticTranslationSignOutAuditEvent(review, 'fr', [], pathologist, 'S26-0001')).toBeUndefined();
  });

  it('a real, explicit acknowledgment that genuinely covers all currently-unvalidated terms produces EXPLICIT_ACKNOWLEDGMENT, regardless of role', () => {
    const review = {
      synopticData: {
        templateId: thyroidId,
        answers: { bethesda_category: 'ii_benign' },
        translationValidationAcknowledgment: {
          acknowledgedBy: 'u-ct', acknowledgedByName: 'Dr. Screener', acknowledgedAt: '2026-09-12T21:00:00Z',
          acknowledgedUnvalidatedTermKeys: ['bethesda.thyroid.category.ii'],
        },
      },
    };
    const result = resolveSynopticTranslationSignOutAuditEvent(review, 'fr', [], cytotechnologist, 'S26-4401');
    expect(result).toBeDefined();
    expect(result!.event).toBe('Signed Out With Unvalidated Translation');
    expect(result!.caseId).toBe('S26-4401');
    const detail = JSON.parse(result!.detail);
    expect(detail.authorizationMode).toBe('EXPLICIT_ACKNOWLEDGMENT');
    expect(detail.userAcknowledgedUnvalidatedTerms).toBe(true);
    expect(detail.signedOutBy).toEqual({ userId: 'u-ct', role: 'cytotechnologist' });
    expect(detail.unvalidatedTerms).toEqual([
      { termKey: 'bethesda.thyroid.category.ii', fallbackLocaleUsed: 'fr', renderedText: 'II \u2014 Benign' },
    ]);
  });

  it('a real Pathologist who DID explicitly check the acknowledgment box is credited with EXPLICIT_ACKNOWLEDGMENT, never reclassified as a role bypass', () => {
    const review = {
      synopticData: {
        templateId: thyroidId,
        answers: { bethesda_category: 'ii_benign' },
        translationValidationAcknowledgment: {
          acknowledgedBy: 'u-path', acknowledgedByName: 'Dr. Pathologist', acknowledgedAt: '2026-09-12T21:00:00Z',
          acknowledgedUnvalidatedTermKeys: ['bethesda.thyroid.category.ii'],
        },
      },
    };
    const result = resolveSynopticTranslationSignOutAuditEvent(review, 'fr', [], pathologist, 'S26-4402');
    const detail = JSON.parse(result!.detail);
    expect(detail.authorizationMode).toBe('EXPLICIT_ACKNOWLEDGMENT');
    expect(detail.userAcknowledgedUnvalidatedTerms).toBe(true);
  });

  it('unvalidated terms with NO real acknowledgment at all produce PATHOLOGIST_ROLE_BYPASS \u2014 the one real state a Cytotechnologist could never reach', () => {
    const review = { synopticData: { templateId: thyroidId, answers: { bethesda_category: 'ii_benign' } } };
    const result = resolveSynopticTranslationSignOutAuditEvent(review, 'fr', [], pathologist, 'S26-4403');
    const detail = JSON.parse(result!.detail);
    expect(detail.authorizationMode).toBe('PATHOLOGIST_ROLE_BYPASS');
    expect(detail.userAcknowledgedUnvalidatedTerms).toBe(false);
  });

  it('a real, STALE acknowledgment \u2014 one that does not cover a real, newly-appeared unvalidated term \u2014 is honestly treated as PATHOLOGIST_ROLE_BYPASS, never silently trusted as EXPLICIT_ACKNOWLEDGMENT', () => {
    const review = {
      synopticData: {
        templateId: thyroidId,
        answers: { bethesda_category: 'ii_benign' },
        translationValidationAcknowledgment: {
          acknowledgedBy: 'u-ct', acknowledgedByName: 'Dr. Screener', acknowledgedAt: '2026-09-12T20:00:00Z',
          // Real, deliberately stale \u2014 covers a DIFFERENT real term
          // than the one actually unvalidated in this exact answer set.
          acknowledgedUnvalidatedTermKeys: ['bethesda.thyroid.category.iii'],
        },
      },
    };
    const result = resolveSynopticTranslationSignOutAuditEvent(review, 'fr', [], pathologist, 'S26-4404');
    const detail = JSON.parse(result!.detail);
    expect(detail.authorizationMode).toBe('PATHOLOGIST_ROLE_BYPASS');
    expect(detail.userAcknowledgedUnvalidatedTerms).toBe(false);
  });

  it('a real, validated lexicon entry for the current locale means the term is no longer unvalidated at all, so no real audit event fires', () => {
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'bethesda.thyroid.category.ii', canonicalTerm: 'II \u2014 Benign', translations: {
        fr: { text: 'II \u2014 B\u00e9nin', validatedBy: 'Dr. Real Reviewer', validatedAt: '2026-01-01', version: 1 },
      } },
    ];
    const review = { synopticData: { templateId: thyroidId, answers: { bethesda_category: 'ii_benign' } } };
    expect(resolveSynopticTranslationSignOutAuditEvent(review, 'fr', lexicon, pathologist, 'S26-4405')).toBeUndefined();
  });

  it('an unvalidated fallback\u2019s renderedText uses the option\u2019s own full canonical narrativePhrase, not the lexicon entry\u2019s shorter canonicalTerm', () => {
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'bethesda.thyroid.category.iii', canonicalTerm: 'III \u2014 AUS/FLUS', translations: {} },
    ];
    const review = { synopticData: { templateId: thyroidId, answers: { bethesda_category: 'iii_aus_flus' } } };
    const result = resolveSynopticTranslationSignOutAuditEvent(review, 'fr', lexicon, pathologist, 'S26-4406');
    const detail = JSON.parse(result!.detail);
    expect(detail.unvalidatedTerms[0].renderedText).toBe('III \u2014 Atypia of Undetermined Significance / Follicular Lesion of Undetermined Significance (AUS/FLUS)');
  });
});
