// src/services/cytology/mockCytologyReviewRecordService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologyReviewRecordService } from './mockCytologyReviewRecordService';

// Real, minimal localStorage mock - same established pattern every
// other storage-backed service test in this app uses.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const draft = (over: Partial<Parameters<typeof mockCytologyReviewRecordService.create>[0]> = {}) => ({
  specimenId: 'SPEC-1', caseId: 'CASE-1', role: 'primary_screen' as const,
  primaryInterpretationId: 'cyto-gencat-nilm', requiresPathologistReview: false,
  recordedBy: { userId: 'CT-001', userName: 'Jane CT' },
  ...over,
});

describe('mockCytologyReviewRecordService — real, "always written, never edited" review history', () => {
  it('starts empty — no real reviews exist until one is genuinely created', async () => {
    const res = await mockCytologyReviewRecordService.getBySpecimenId('SPEC-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toEqual([]);
  });

  it('a real create() genuinely persists and is visible on the next getBySpecimenId — not just in-memory state', async () => {
    const created = await mockCytologyReviewRecordService.create(draft());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.id).toBeTruthy();
    expect(created.data.recordedAt).toBeTruthy();

    const res = await mockCytologyReviewRecordService.getBySpecimenId('SPEC-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.find(r => r.id === created.data.id)).toBeDefined();
  });

  it('a real case can have MULTIPLE distinct review records — primary, secondary, and pathologist all coexist, none overwriting another', async () => {
    await mockCytologyReviewRecordService.create(draft({ role: 'primary_screen' }));
    await mockCytologyReviewRecordService.create(draft({ role: 'qc_random_selection' }));
    await mockCytologyReviewRecordService.create(draft({ role: 'qc_random_selection' })); // real, per direct guidance: multiple secondary screenings are legitimate
    await mockCytologyReviewRecordService.create(draft({ role: 'secondary_reviewer' }));
    await mockCytologyReviewRecordService.create(draft({ role: 'pathologist_review' }));

    const res = await mockCytologyReviewRecordService.getBySpecimenId('SPEC-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBe(5);
    expect(res.data.filter(r => r.role === 'qc_random_selection').length).toBe(2);
  });

  it('getBySpecimenId only returns reviews for the real, requested specimen — never leaks another specimen\'s history', async () => {
    await mockCytologyReviewRecordService.create(draft({ specimenId: 'SPEC-1' }));
    await mockCytologyReviewRecordService.create(draft({ specimenId: 'SPEC-2' }));

    const res = await mockCytologyReviewRecordService.getBySpecimenId('SPEC-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBe(1);
    expect(res.data[0].specimenId).toBe('SPEC-1');
  });

  it('getByCaseId aggregates every real review across every specimen on that case', async () => {
    await mockCytologyReviewRecordService.create(draft({ specimenId: 'SPEC-1', caseId: 'CASE-1' }));
    await mockCytologyReviewRecordService.create(draft({ specimenId: 'SPEC-2', caseId: 'CASE-1' }));
    await mockCytologyReviewRecordService.create(draft({ specimenId: 'SPEC-9', caseId: 'CASE-9' }));

    const res = await mockCytologyReviewRecordService.getByCaseId('CASE-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBe(2);
  });

  it('each created record gets a real, distinct id — even created back-to-back', async () => {
    const a = await mockCytologyReviewRecordService.create(draft());
    const b = await mockCytologyReviewRecordService.create(draft());
    if (!a.ok || !b.ok) throw new Error('setup failed');
    expect(a.data.id).not.toBe(b.data.id);
  });

  it('a real, complete review — primary + additional interpretations + recommendations + notes — round-trips faithfully', async () => {
    const created = await mockCytologyReviewRecordService.create(draft({
      primaryInterpretationId: 'cyto-squam-hsil',
      additionalInterpretations: [{ categoryId: 'cyto-org-trichomonas', comment: 'scant organisms' }],
      recommendations: [{ categoryId: 'cyto-rec-colposcopy' }],
      requiresPathologistReview: true,
      notes: 'Correlate with prior HSIL history.',
    }));
    if (!created.ok) throw new Error('setup failed');

    const res = await mockCytologyReviewRecordService.getBySpecimenId('SPEC-1');
    if (!res.ok) throw new Error('setup failed');
    const found = res.data.find(r => r.id === created.data.id);
    expect(found?.primaryInterpretationId).toBe('cyto-squam-hsil');
    expect(found?.additionalInterpretations).toEqual([{ categoryId: 'cyto-org-trichomonas', comment: 'scant organisms' }]);
    expect(found?.recommendations).toEqual([{ categoryId: 'cyto-rec-colposcopy' }]);
    expect(found?.notes).toBe('Correlate with prior HSIL history.');
  });

  describe('real, per direct correction: "a User may edit their own review, but no one elses"', () => {
    it('the original author can genuinely edit their own review, and the change persists', async () => {
      const created = await mockCytologyReviewRecordService.create(draft({ recordedBy: { userId: 'CT-001', userName: 'Jane CT' } }));
      if (!created.ok) throw new Error('setup failed');

      const updated = await mockCytologyReviewRecordService.update(created.data.id, 'CT-001', { primaryInterpretationId: 'cyto-squam-lsil' });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.data.primaryInterpretationId).toBe('cyto-squam-lsil');
      expect(updated.data.updatedAt).toBeTruthy();

      const res = await mockCytologyReviewRecordService.getBySpecimenId('SPEC-1');
      if (!res.ok) throw new Error('setup failed');
      expect(res.data.find(r => r.id === created.data.id)?.primaryInterpretationId).toBe('cyto-squam-lsil');
    });

    it('a DIFFERENT user is genuinely refused — never silently allowed to edit someone else\'s review', async () => {
      const created = await mockCytologyReviewRecordService.create(draft({ recordedBy: { userId: 'CT-001', userName: 'Jane CT' } }));
      if (!created.ok) throw new Error('setup failed');

      const attempt = await mockCytologyReviewRecordService.update(created.data.id, 'CT-002', { primaryInterpretationId: 'cyto-squam-lsil' });
      expect(attempt.ok).toBe(false);

      // Real, per direct guidance's own "safely tie a review to a
      // Cytotech" reasoning: confirm the record itself is genuinely
      // untouched by the refused attempt, not just that an error was
      // returned.
      const res = await mockCytologyReviewRecordService.getBySpecimenId('SPEC-1');
      if (!res.ok) throw new Error('setup failed');
      expect(res.data.find(r => r.id === created.data.id)?.primaryInterpretationId).toBe('cyto-gencat-nilm');
    });

    it('an edit never lets recordedBy itself change — the one field the whole permission model depends on stays fixed', async () => {
      const created = await mockCytologyReviewRecordService.create(draft({ recordedBy: { userId: 'CT-001', userName: 'Jane CT' } }));
      if (!created.ok) throw new Error('setup failed');

      // Real: the update() signature itself doesn't even accept
      // recordedBy in `changes` (see ICytologyReviewRecordService's
      // own type) — this test confirms the real, persisted record
      // still carries the real, original author after an otherwise
      // legitimate edit.
      await mockCytologyReviewRecordService.update(created.data.id, 'CT-001', { notes: 'revised' });
      const res = await mockCytologyReviewRecordService.getBySpecimenId('SPEC-1');
      if (!res.ok) throw new Error('setup failed');
      expect(res.data.find(r => r.id === created.data.id)?.recordedBy).toEqual({ userId: 'CT-001', userName: 'Jane CT' });
    });

    it('updating a real, non-existent review id fails honestly, not silently', async () => {
      const attempt = await mockCytologyReviewRecordService.update('does-not-exist', 'CT-001', { notes: 'x' });
      expect(attempt.ok).toBe(false);
    });
  });
});
