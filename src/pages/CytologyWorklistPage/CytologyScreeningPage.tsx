// src/pages/CytologyWorklistPage/CytologyScreeningPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real screening/review-entry page. Rebuilt per direct UI-review
// follow-up:
// - Real, two-column layout using the available horizontal space,
//   rather than one narrow, centered column.
// - Specimen Adequacy is now a real, multi-select field, each
//   selection carrying its own free-text comment; Additional
//   Interpretations and Recommendations already were multi-select but
//   now carry per-item comments too; Primary Interpretation stays
//   single-select, with one optional comment of its own.
// - Real, searchable pick lists instead of a native multi-select
//   listbox — with ~100 real dictionary entries in some sections, an
//   always-visible listbox doesn't scale; typing narrows to a short,
//   real match list instead.
// - Role is no longer a manual dropdown — resolveCytologyReviewerRole
//   (this phase) computes it automatically: no reviews yet -> Primary
//   Screener; a review exists and you're not a Pathologist -> Secondary
//   Reviewer; you're a Pathologist -> Pathologist Review, with a real
//   QC-role override when a pending QC flag needs a specific reviewer.
// - A pending QC flag can be genuinely un-flagged, not just added.
// - Real, minimal LMP field (Patient.lastMenstrualPeriod) and an HPV
//   Testing widget over the existing, real hpvCoTestOrdered/hpvResult
//   fields — both real, per direct follow-up; the full clinical-history
//   dictionary itself stays separate, deferred work.
// - Review History shows each review's own, complete real content
//   (every selection and its comment), not a one-line summary, and
//   marks the real primary_screen review as "Initial Review" — every
//   other role is labeled a secondary or Pathologist review.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import '../../pathscribe.css';
import { useAuth } from '@contexts/AuthContext';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockSpecimenDictionaryService } from '@/services/specimenDictionary/mockSpecimenDictionaryService';
import { mockCytologyCategoryService } from '@/services/cytology/mockCytologyCategoryService';
import { mockCytologyReviewRecordService } from '@/services/cytology/mockCytologyReviewRecordService';
import { mockCytologyQcSettingsService } from '@/services/cytology/mockCytologyQcSettingsService';
import { mockFacilityCytologyQcOverrideService } from '@/services/cytology/mockFacilityCytologyQcOverrideService';
import { mockStaffCytologyQcOverrideService } from '@/services/cytology/mockStaffCytologyQcOverrideService';
import { resolveEffectiveCytologyQcSettings } from '@/services/cytology/resolveEffectiveCytologyQcSettings';
import { resolveCytologyRandomQcSelection } from '@/services/cytology/resolveCytologyRandomQcSelection';
import { resolveCytologyReviewerRole } from '@/services/cytology/resolveCytologyReviewerRole';
import { cloneCytologyReviewAsDraft } from '@/services/cytology/cloneCytologyReviewAsDraft';
import { resolveCytologyReviewRequirement } from '@/services/cytology/resolveCytologyReviewRequirement';
import { resolveCytologyFinalDiagnosisSnapshot } from '@/services/cytology/resolveCytologyFinalDiagnosisSnapshot';
import { resolveCytologySignOutGate } from '@/services/cytology/resolveCytologySignOutGate';
import { resolveCanSignOutCytology } from '@/services/cytology/resolveCanSignOutCytology';
import { resolveCytologyStructuredWorkflowAccess } from '@/services/cytology/resolveCytologyStructuredWorkflowAccess';
import { resolveCytologyReportContent } from '@/services/cytology/resolveCytologyReportContent';
import { mockCytologySignOutRecordService } from '@/services/cytology/mockCytologySignOutRecordService';
import { mockCytologyOutboundResultQueueService } from '@/services/cytology/mockCytologyOutboundResultQueueService';
import { buildCytologyOruR01Payload } from '@/services/cytology/buildCytologyOruR01Payload';
import { buildCytologyRegistryReportPayload } from '@/services/cytology/buildCytologyRegistryReportPayload';
import { mockCytologyRegistrySettingsService } from '@/services/cytology/mockCytologyRegistrySettingsService';
import { mockFacilityCytologyRegistryOverrideService } from '@/services/cytology/mockFacilityCytologyRegistryOverrideService';
import { resolveEffectiveCytologyRegistrySettings } from '@/services/cytology/resolveEffectiveCytologyRegistrySettings';
import { mockCytologyRegistryOutboundQueueService } from '@/services/cytology/mockCytologyRegistryOutboundQueueService';
import { dispatchInterfaceMessage } from '@/services/interfaceDispatch/dispatchInterfaceMessage';
import { mockPatientIndexService } from '@/services/patients/mockPatientIndexService';
import { mockCytologyNomenclatureSettingsService } from '@/services/cytology/mockCytologyNomenclatureSettingsService';
import { mockFacilityCytologyNomenclatureOverrideService } from '@/services/cytology/mockFacilityCytologyNomenclatureOverrideService';
import { resolveEffectiveCytologyNomenclatureSettings } from '@/services/cytology/resolveEffectiveCytologyNomenclatureSettings';
import { allCytologyInterpretationIds } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyReviewRecord, CytologyReviewRole, CytologyCategorySelection } from '@/types/cytology/CytologyReviewRecord';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';
import type { CytologyCategoryEntry } from '@/services/cytology/ICytologyCategoryService';
import type { Case } from '@/types/case/Case';

const ROLE_LABELS: Record<CytologyReviewRole, string> = {
  primary_screen: 'Primary Screener',
  qc_random_selection: 'QC — Random Selection',
  qc_targeted_high_risk: 'QC — Targeted High-Risk',
  secondary_reviewer: 'Secondary Reviewer',
  pathologist_review: 'Pathologist Review',
};

// ── Small, real, reusable search-select components ──────────────────────────

function SingleSearchSelect({ options, value, comment, onChange, onCommentChange, placeholder }: {
  options: CytologyCategoryEntry[];
  value: string;
  comment: string;
  onChange: (id: string) => void;
  onCommentChange: (comment: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.id === value);
  const matches = query.trim()
    ? options.filter(o => (o.abbreviation ? `${o.abbreviation} ${o.label}` : o.label).toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  if (selected) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#111827', border: '1px solid #1f2937', borderRadius: 7 }}>
          <span style={{ flex: 1, fontSize: 12.5, color: '#e5e7eb' }}>{selected.description ?? (selected.abbreviation ? `${selected.abbreviation} — ${selected.label}` : selected.label)}</span>
          <button onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
        <input value={comment} onChange={e => onCommentChange(e.target.value)} placeholder="Comment (optional)"
          style={{ width: '100%', marginTop: 4, padding: '5px 9px', fontSize: 12, color: '#9ca3af', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 6 }} />
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, color: '#e5e7eb', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 7 }} />
      {matches.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 8, marginTop: 3, maxHeight: 220, overflowY: 'auto' }}>
          {matches.map(o => (
            <div key={o.id} onClick={() => { onChange(o.id); setQuery(''); }}
              style={{ padding: '7px 10px', fontSize: 12, color: '#d1d5db', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1f2937')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {o.abbreviation ? `${o.abbreviation} — ${o.label}` : o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSearchSelect({ options, selections, onChange, placeholder, categoryLabel }: {
  options: CytologyCategoryEntry[];
  selections: CytologyCategorySelection[];
  onChange: (next: CytologyCategorySelection[]) => void;
  placeholder: string;
  categoryLabel: (id: string) => string;
}) {
  const [query, setQuery] = useState('');
  const selectedIds = new Set(selections.map(s => s.categoryId));
  const matches = query.trim()
    ? options.filter(o => !selectedIds.has(o.id) && (o.abbreviation ? `${o.abbreviation} ${o.label}` : o.label).toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const add = (categoryId: string) => { onChange([...selections, { categoryId }]); setQuery(''); };
  const remove = (categoryId: string) => onChange(selections.filter(s => s.categoryId !== categoryId));
  const setComment = (categoryId: string, comment: string) => onChange(selections.map(s => s.categoryId === categoryId ? { ...s, comment } : s));

  return (
    <div style={{ marginBottom: 12 }}>
      {selections.map(s => (
        <div key={s.categoryId} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#111827', border: '1px solid #1f2937', borderRadius: 7 }}>
            <span style={{ flex: 1, fontSize: 12.5, color: '#e5e7eb' }}>{categoryLabel(s.categoryId)}</span>
            <button onClick={() => remove(s.categoryId)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
          <input value={s.comment ?? ''} onChange={e => setComment(s.categoryId, e.target.value)} placeholder="Comment (optional)"
            style={{ width: '100%', marginTop: 4, padding: '5px 9px', fontSize: 12, color: '#9ca3af', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 6 }} />
        </div>
      ))}
      <div style={{ position: 'relative' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, color: '#e5e7eb', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 7 }} />
        {matches.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 8, marginTop: 3, maxHeight: 220, overflowY: 'auto' }}>
            {matches.map(o => (
              <div key={o.id} onClick={() => add(o.id)}
                style={{ padding: '7px 10px', fontSize: 12, color: '#d1d5db', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1f2937')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {o.abbreviation ? `${o.abbreviation} — ${o.label}` : o.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const fieldLabel = (text: string, hint?: string) => (
  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#9ca3af', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>
    {text}{hint && <span style={{ fontWeight: 400, textTransform: 'none', color: '#4b5563', marginLeft: 6, letterSpacing: 0 }}>{hint}</span>}
  </label>
);

interface Draft {
  generalCategorizationId: string;
  adequacySelections: CytologyCategorySelection[];
  primaryInterpretationId: string;
  primaryInterpretationComment: string;
  additionalInterpretations: CytologyCategorySelection[];
  recommendations: CytologyCategorySelection[];
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  generalCategorizationId: '', adequacySelections: [],
  primaryInterpretationId: '', primaryInterpretationComment: '',
  additionalInterpretations: [], recommendations: [], notes: '',
};

export default function CytologyScreeningPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPathologist = user?.role === 'pathologist' || user?.role === 'pathologist-admin';

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [specimenId, setSpecimenId] = useState<string | null>(null);
  const [isGynCytology, setIsGynCytology] = useState(true);
  const [categories, setCategories] = useState<CytologyCategoryEntry[]>([]);
  const [reviews, setReviews] = useState<CytologyReviewRecord[]>([]);
  const [signOutRecords, setSignOutRecords] = useState<CytologySignOutRecord[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [lmpDraft, setLmpDraft] = useState('');

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const [c, dictRes, catRes] = await Promise.all([
        caseRouter.getCase(caseId, user?.id ?? 'current'),
        mockSpecimenDictionaryService.getAll(),
        mockCytologyCategoryService.getAll(),
      ]);
      setCaseData(c ?? null);
      setLmpDraft(c?.patient?.lastMenstrualPeriod ?? '');

      // Real, per direct guidance's own confirmed Product Need: "Form
      // fields and diagnostic drop-downs must dynamically swap
      // nomenclature based on the lab's geographical profile." Resolve
      // THIS case's own real, effective nomenclature system (Enterprise
      // default, overridden by this case's own performing facility if
      // one exists) and filter the whole dictionary down to just that
      // one real system's own entries — never a mix of two systems in
      // the same picker.
      const facilityId = (c as any)?.order?.facilityId;
      const [enterpriseNomenclatureRes, facilityNomenclatureRes] = await Promise.all([
        mockCytologyNomenclatureSettingsService.get(),
        facilityId ? mockFacilityCytologyNomenclatureOverrideService.getForFacility(facilityId) : Promise.resolve({ ok: true as const, data: null }),
      ]);
      const effectiveNomenclature = resolveEffectiveCytologyNomenclatureSettings(
        enterpriseNomenclatureRes.ok ? enterpriseNomenclatureRes.data : { nomenclatureSystem: 'bethesda' },
        facilityNomenclatureRes.ok ? facilityNomenclatureRes.data : null,
      );
      setCategories(catRes.ok ? catRes.data.filter(cat => cat.active && cat.nomenclatureSystem === effectiveNomenclature.nomenclatureSystem) : []);

      const dictionary = dictRes.ok ? dictRes.data : [];
      const dictById = new Map(dictionary.map(e => [e.id, e]));
      const cytoSpecimen = c?.specimens?.find((sp: any) => {
        const entry = sp.specimenDictionaryEntryId ? dictById.get(sp.specimenDictionaryEntryId) : undefined;
        return entry && (entry.type === 'Cytology' || entry.type === 'FNA');
      }) as any;
      const resolvedSpecimenId = cytoSpecimen?.id ?? null;
      setSpecimenId(resolvedSpecimenId);
      const dictEntry = cytoSpecimen?.specimenDictionaryEntryId ? dictById.get(cytoSpecimen.specimenDictionaryEntryId) : undefined;
      setIsGynCytology(dictEntry?.isGynCytology === true);

      if (resolvedSpecimenId) {
        const reviewsRes = await mockCytologyReviewRecordService.getBySpecimenId(resolvedSpecimenId);
        setReviews(reviewsRes.ok ? reviewsRes.data : []);
        const signOutRes = await mockCytologySignOutRecordService.getBySpecimenId(resolvedSpecimenId);
        setSignOutRecords(signOutRes.ok ? signOutRes.data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [caseId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const currentSpecimen = (caseData?.specimens as any[])?.find(sp => sp.id === specimenId);
  const currentQcFlag = currentSpecimen?.cytologyScreening?.qcFlag;
  const currentFinalDiagnosis = currentSpecimen?.cytologyScreening?.finalDiagnosis;
  const currentHpv: { hpvCoTestOrdered?: boolean; hpvResult?: string; hpvGenotypeDetail?: { hpv16: boolean; hpv18Or45: boolean; otherHighRisk: boolean }; hpvOrderReason?: 'co_test' | 'ascus_reflex' | 'post_treatment_surveillance' } = currentSpecimen?.cytologyScreening ?? {};

  const resolvedRole = useMemo(() => resolveCytologyReviewerRole(reviews, isPathologist, currentQcFlag), [reviews, isPathologist, currentQcFlag]);

  const adequacyOptions = categories.filter(c => c.section === 'adequacy');
  const generalCatOptions = categories.filter(c => c.section === 'general_categorization');
  const primaryOptions = categories.filter(c => c.section === 'interpretation_result' && (c.usage === 'primary' || c.usage === 'both'));
  const additionalOptions = categories.filter(c =>
    c.section === 'interpretation_result' && (c.usage === 'secondary' || c.usage === 'both') && c.id !== draft.primaryInterpretationId
  );
  const recommendationOptions = categories.filter(c => c.section === 'recommendation');
  // Real, per direct follow-up: "The contents of that description
  // field is what is use to populate the reviews and report" — this is
  // what actually populates review history and, eventually, report
  // content. Falls back to label/abbreviation only for the rare real
  // entry that genuinely has no description yet.
  const categoryLabel = (id: string) => {
    const c = categories.find(x => x.id === id);
    if (!c) return id;
    return c.description ?? (c.abbreviation ? `${c.abbreviation} — ${c.label}` : c.label);
  };

  const updateSpecimen = async (patch: Record<string, any>) => {
    if (!caseData || !specimenId) return;
    const updatedSpecimens = (caseData.specimens as any[]).map(sp =>
      sp.id === specimenId ? { ...sp, cytologyScreening: { ...sp.cytologyScreening, ...patch } } : sp
    );
    await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
  };

  const handleClone = (sourceId: string) => {
    const source = reviews.find(r => r.id === sourceId);
    if (!source || !user?.id) return;
    const cloned = cloneCytologyReviewAsDraft(source, { userId: user.id, userName: user.name }, resolvedRole);
    setDraft({
      generalCategorizationId: cloned.generalCategorizationId ?? '',
      adequacySelections: cloned.adequacySelections ?? [],
      primaryInterpretationId: cloned.primaryInterpretationId,
      primaryInterpretationComment: '',
      additionalInterpretations: cloned.additionalInterpretations ?? [],
      recommendations: cloned.recommendations ?? [],
      notes: '',
    });
  };

  const handleSave = async () => {
    if (!specimenId || !caseId || !user?.id || !draft.primaryInterpretationId) return;
    setSaving(true);
    try {
      const requiresPathologistReview = resolveCytologyReviewRequirement(
        allCytologyInterpretationIds({ primaryInterpretationId: draft.primaryInterpretationId, additionalInterpretations: draft.additionalInterpretations }),
        categories,
      );
      const created = await mockCytologyReviewRecordService.create({
        specimenId, caseId, role: resolvedRole,
        adequacySelections: draft.adequacySelections.length ? draft.adequacySelections : undefined,
        generalCategorizationId: draft.generalCategorizationId || undefined,
        primaryInterpretationId: draft.primaryInterpretationId,
        primaryInterpretationComment: draft.primaryInterpretationComment || undefined,
        additionalInterpretations: draft.additionalInterpretations.length ? draft.additionalInterpretations : undefined,
        recommendations: draft.recommendations.length ? draft.recommendations : undefined,
        requiresPathologistReview,
        notes: draft.notes || undefined,
        recordedBy: { userId: user.id, userName: user.name },
      });
      if (created.ok) {
        // Real, per direct correction: the random QC selection
        // algorithm runs automatically, right here, the moment the
        // real INITIAL review (primary_screen) is saved — never a
        // manual user action, and never for a later secondary/
        // pathologist review, since a case is only genuinely eligible
        // for this specific real selection mechanism once.
        if (created.data.role === 'primary_screen' && caseData?.order?.facilityId) {
          const facilityId = caseData.order.facilityId;
          const [enterpriseRes, facilityRes, staffRes] = await Promise.all([
            mockCytologyQcSettingsService.get(),
            mockFacilityCytologyQcOverrideService.getForFacility(facilityId),
            mockStaffCytologyQcOverrideService.getForStaff(user.id),
          ]);
          if (enterpriseRes.ok && facilityRes.ok && staffRes.ok) {
            const effective = resolveEffectiveCytologyQcSettings(enterpriseRes.data, facilityRes.data, staffRes.data);
            const isNegative = !created.data.requiresPathologistReview;
            const selected = resolveCytologyRandomQcSelection(isNegative, effective, Math.random());
            if (selected) {
              await updateSpecimen({ qcFlag: { reason: 'random_selection', flaggedBy: 'system', flaggedByName: 'Automatic Random QC Selection', flaggedAt: new Date().toISOString() } });
              toast.info('This case was randomly selected for mandatory QC review.');
            }
          }
        }
        setDraft(EMPTY_DRAFT);
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFinalDiagnosis = async (reviewId: string) => {
    const review = reviews.find(r => r.id === reviewId);
    if (!review || !user?.id) return;
    const snapshot = resolveCytologyFinalDiagnosisSnapshot(review);
    await updateSpecimen({ finalDiagnosis: { ...snapshot, selectedBy: user.id, selectedByName: user.name, selectedAt: new Date().toISOString() } });
    await load();
  };

  // Real, per direct guidance: the actual Sign Out action. Requires a
  // real Final Diagnosis already selected (Set as Final, above) — a
  // real report cannot be signed without one. Authorization is real,
  // per resolveCanSignOutCytology (this phase): a Pathologist can
  // always sign; a Cytotechnologist only when the real CT-eligibility
  // gate (PS-163) allows it for the Final Diagnosis review specifically.
  const handleSignOut = async () => {
    if (!caseData || !specimenId || !user?.id || !currentFinalDiagnosis) return;
    const finalReview = reviews.find(r => r.id === currentFinalDiagnosis.reviewRecordId);
    if (!finalReview) return;

    const gate = resolveCytologySignOutGate(
      { adequacyCategoryIds: finalReview.adequacySelections?.map(s => s.categoryId), requiresPathologistReview: finalReview.requiresPathologistReview },
      isGynCytology, currentQcFlag ? true : false, categories,
    );
    if (!resolveCanSignOutCytology(isPathologist, gate)) return;

    setSigningOut(true);
    try {
      const screener = reviews.find(r => r.role === 'primary_screen');
      const patientName = caseData.patient ? `${caseData.patient.firstName ?? ''} ${caseData.patient.lastName ?? ''}`.trim() : 'Unknown Patient';
      const signedAtIso = new Date().toISOString();

      const reportContent = resolveCytologyReportContent(
        finalReview, categories,
        { name: patientName, dateOfBirth: caseData.patient?.dateOfBirth, mrn: caseData.patient?.mrn, lastMenstrualPeriod: caseData.patient?.lastMenstrualPeriod },
        { accessionNumber: caseData.accession?.fullAccession ?? caseData.id, orderingProvider: caseData.order?.requestingProvider },
        {
          typeDescription: currentSpecimen?.description ?? 'Cytology specimen',
          collectedAt: currentSpecimen?.collectedAt, receivedAt: currentSpecimen?.receivedAt,
          preparationMethod: currentSpecimen?.cytologyScreening?.preparationMethod,
          computerAssistedScreening: currentSpecimen?.cytologyScreening?.computerAssistedScreening,
          hpvResult: currentHpv.hpvResult, hpvGenotypeDetail: currentHpv.hpvGenotypeDetail, hpvOrderReason: currentHpv.hpvOrderReason, educationalNotes: currentSpecimen?.cytologyScreening?.educationalNotes,
        },
        screener ? { name: screener.recordedBy.userName } : undefined,
        { name: user.name, isPathologist }, signedAtIso,
      );

      const created = await mockCytologySignOutRecordService.create({
        caseId: caseData.id, specimenId, reviewRecordId: finalReview.id,
        reportContent, signedBy: { userId: user.id, userName: user.name, isPathologist },
      });
      if (created.ok) {
        await caseRouter.updateCase(caseData.id, { status: 'finalized' } as any);

        // Real, per direct guidance ("we trigger the json packages and
        // the interface engine generates the formatted messages"):
        // dispatch the real, signed result to the real interface-engine
        // stand-in, mirroring dispatchCaseInstances.ts's own real
        // enqueue -> dispatch -> markSent/markFailed pattern exactly.
        // Only ever reached for an orchestrator-mode case — this whole
        // page is already gated to that (resolveCytologyStructuredWorkflowAccess).
        const patientId = (caseData as any)?.patient?.id;
        const patientRecord = patientId ? await mockPatientIndexService.getById(patientId) : null;
        if (patientRecord) {
          const enqueueRes = await mockCytologyOutboundResultQueueService.enqueue({
            caseId: caseData.id, signOutRecordId: created.data.id, resultState: 'FINAL',
            organisationId: (patientRecord as any).organisationId,
          });
          if (enqueueRes.ok) {
            const payload = buildCytologyOruR01Payload(created.data);
            const dispatchResult = await dispatchInterfaceMessage(enqueueRes.data.id, 'ORU_R01', payload as any);
            if (dispatchResult.ok) {
              await mockCytologyOutboundResultQueueService.markSent(enqueueRes.data.id);
            } else {
              await mockCytologyOutboundResultQueueService.markFailed(enqueueRes.data.id, {
                errorCode: dispatchResult.errorCode ?? 'DISPATCH_REJECTED',
                errorMessage: dispatchResult.error ?? 'Unknown dispatch failure.',
                maxRetriesExceeded: false,
              });
            }
          }
        }

        // Real, per direct guidance's own South Korea information:
        // "pathology laboratories are legally required to report all
        // cervical screening results to the NCSR [equivalent]" — a
        // genuinely separate real dispatch, to a genuinely different
        // real destination (a centralized national registry, not the
        // ordering provider's own EHR), using the same real,
        // established transport (dispatchInterfaceMessage) and the
        // same real enqueue -> dispatch -> markSent/markFailed
        // pattern. Only fires when this case's own facility has a
        // real, effective registry configured — 'none' is the real,
        // correct default for facilities with no such obligation.
        const facilityId = caseData.order?.facilityId;
        if (facilityId) {
          const [enterpriseRegistryRes, facilityRegistryRes] = await Promise.all([
            mockCytologyRegistrySettingsService.get(),
            mockFacilityCytologyRegistryOverrideService.getForFacility(facilityId),
          ]);
          const effectiveRegistry = resolveEffectiveCytologyRegistrySettings(
            enterpriseRegistryRes.ok ? enterpriseRegistryRes.data : { registryId: 'none' },
            facilityRegistryRes.ok ? facilityRegistryRes.data : null,
          );
          if (effectiveRegistry.registryId !== 'none') {
            const registryEnqueueRes = await mockCytologyRegistryOutboundQueueService.enqueue({
              caseId: caseData.id, signOutRecordId: created.data.id, registryId: effectiveRegistry.registryId,
            });
            if (registryEnqueueRes.ok) {
              const registryPayload = buildCytologyRegistryReportPayload(created.data, effectiveRegistry.registryId, facilityId, caseData.order?.facilityName);
              const registryDispatchResult = await dispatchInterfaceMessage(registryEnqueueRes.data.id, 'REGISTRY_REPORT', registryPayload as any);
              if (registryDispatchResult.ok) {
                await mockCytologyRegistryOutboundQueueService.markSent(registryEnqueueRes.data.id);
              } else {
                await mockCytologyRegistryOutboundQueueService.markFailed(registryEnqueueRes.data.id, {
                  errorCode: registryDispatchResult.errorCode ?? 'DISPATCH_REJECTED',
                  errorMessage: registryDispatchResult.error ?? 'Unknown dispatch failure.',
                  maxRetriesExceeded: false,
                });
              }
            }
          }
        }

        toast.success('Report signed out.');
        await load();
      }
    } finally {
      setSigningOut(false);
    }
  };

  // Real, per direct correction: only High-Risk QC remains a real,
  // honest manual action — the automatic high-risk detection algorithm
  // (PS-164) genuinely lacks real accessioning-time input data yet.
  // Random selection is no longer manual at all; see handleSave's own
  // real, automatic wiring above.
  const handleFlagForQc = async () => {
    if (!user?.id) return;
    await updateSpecimen({ qcFlag: { reason: 'targeted_high_risk', flaggedBy: user.id, flaggedByName: user.name, flaggedAt: new Date().toISOString() } });
    await load();
  };

  const handleUnflagQc = async () => {
    await updateSpecimen({ qcFlag: undefined });
    await load();
  };

  const handleLmpSave = async () => {
    if (!caseData) return;
    await caseRouter.updateCase(caseData.id, { patient: { ...caseData.patient, lastMenstrualPeriod: lmpDraft || undefined } } as any);
    await load();
  };

  const handleHpvChange = async (patch: { hpvCoTestOrdered?: boolean; hpvResult?: string; hpvGenotypeDetail?: { hpv16: boolean; hpv18Or45: boolean; otherHighRisk: boolean }; hpvOrderReason?: 'co_test' | 'ascus_reflex' | 'post_treatment_surveillance' }) => {
    await updateSpecimen(patch);
    await load();
  };

  if (loading) return <div className="ps-page ps-page--loaded"><div className="ps-page-content" style={{ padding: 32, textAlign: 'center', color: '#4b5563' }}>Loading…</div></div>;

  if (!caseData || !specimenId) {
    return (
      <div className="ps-page ps-page--loaded">
        <div className="ps-page-content" style={{ padding: 32, textAlign: 'center', color: '#4b5563' }}>
          No qualifying cytology specimen found on this case.
          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate('/cytology-worklist')} style={{ padding: '8px 16px', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb', cursor: 'pointer' }}>Back to Worklist</button>
          </div>
        </div>
      </div>
    );
  }

  if (!resolveCytologyStructuredWorkflowAccess(caseData.reportingMode)) {
    return (
      <div className="ps-page ps-page--loaded">
        <div className="ps-page-content" style={{ padding: 32, textAlign: 'center', color: '#4b5563', maxWidth: 480, margin: '0 auto' }}>
          This case is managed by an external LIS (assist mode). PathScribe's structured cytology
          review and sign-out workflow is only available for cases in Orchestration mode.
          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate('/cytology-worklist')} style={{ padding: '8px 16px', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb', cursor: 'pointer' }}>Back to Worklist</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-page ps-page--loaded">
      <div className="ps-page-bg" /><div className="ps-page-gradient" />
      <div className="ps-page-content">
        <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 40px' }}>
          <button onClick={() => navigate('/cytology-worklist')} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>← Back to Worklist</button>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 21, fontWeight: 700, color: '#fff', margin: 0 }}>Case {caseData.id}</h1>
              <p style={{ fontSize: 12.5, color: '#6b7280', margin: '2px 0 0' }}>
                {caseData.patient ? `${caseData.patient.firstName ?? ''} ${caseData.patient.lastName ?? ''}`.trim() : 'Unknown Patient'} · MRN {caseData.patient?.mrn ?? '—'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' }}>
              <span>LMP</span>
              <input type="date" value={lmpDraft} onChange={e => setLmpDraft(e.target.value)} onBlur={handleLmpSave}
                style={{ padding: '5px 8px', fontSize: 12, color: '#e5e7eb', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 6 }} />
            </div>
          </div>

          {/* Real Sign Out action */}
          {signOutRecords.length > 0 ? (
            <div style={{ padding: '10px 16px', background: '#22c55e12', border: '1px solid #22c55e33', borderRadius: 10, marginBottom: 18, fontSize: 12.5, color: '#22c55e' }}>
              Signed out by {signOutRecords[0].signedBy.userName} on {new Date(signOutRecords[0].signedAt).toLocaleString()}.
            </div>
          ) : (() => {
            if (!currentFinalDiagnosis) {
              return <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 18, fontSize: 12.5, color: '#6b7280' }}>Select a Final Diagnosis below before this case can be signed out.</div>;
            }
            const finalReview = reviews.find(r => r.id === currentFinalDiagnosis.reviewRecordId);
            const gate = finalReview
              ? resolveCytologySignOutGate({ adequacyCategoryIds: finalReview.adequacySelections?.map(s => s.categoryId), requiresPathologistReview: finalReview.requiresPathologistReview }, isGynCytology, currentQcFlag ? true : false, categories)
              : { allowed: false, blockedReasons: [] };
            const canSign = resolveCanSignOutCytology(isPathologist, gate);
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 12.5, color: canSign ? '#e5e7eb' : '#f59e0b', flex: 1 }}>
                  {canSign ? 'Ready to sign out.' : `Pathologist sign-out required: ${gate.blockedReasons.join(', ')}`}
                </span>
                <button onClick={handleSignOut} disabled={!canSign || signingOut}
                  style={{ padding: '8px 18px', fontSize: 12.5, fontWeight: 700, color: '#0a0a0a', background: canSign ? '#009E73' : '#374151', border: 'none', borderRadius: 8, cursor: canSign ? 'pointer' : 'not-allowed' }}>
                  {signingOut ? 'Signing…' : 'Sign Out'}
                </button>
              </div>
            );
          })()}

          {/* Real, two-column layout — uses the available horizontal space */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 20 }}>

            {/* LEFT: context — role, QC, HPV, review history */}
            <div>
              <div style={{ padding: '12px 14px', background: '#111827', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 14 }}>
                {fieldLabel('Your Role for This Review')}
                <div style={{ fontSize: 14, fontWeight: 700, color: '#009E73' }}>{ROLE_LABELS[resolvedRole]}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Determined automatically from review history and your account role.</div>
              </div>

              <div style={{ padding: '12px 14px', background: '#111827', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 14 }}>
                {fieldLabel('Mandatory QC')}
                {currentQcFlag ? (
                  <>
                    <div style={{ fontSize: 12.5, color: '#ef4444', marginBottom: 8 }}>
                      Flagged for {currentQcFlag.reason === 'targeted_high_risk' ? 'high-risk targeted' : 'random selection'} QC by {currentQcFlag.flaggedByName} on {new Date(currentQcFlag.flaggedAt).toLocaleDateString()}.
                    </div>
                    <button onClick={handleUnflagQc} style={{ padding: '5px 12px', fontSize: 11.5, fontWeight: 600, color: '#9ca3af', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 6, cursor: 'pointer' }}>
                      Remove Flag
                    </button>
                  </>
                ) : (
                  <div>
                    <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 6 }}>Random QC selection runs automatically when the Initial Review is saved.</div>
                    <button onClick={() => handleFlagForQc()} style={{ padding: '5px 12px', fontSize: 11.5, fontWeight: 600, color: '#ef4444', background: '#1c1c1c', border: '1px solid #ef444433', borderRadius: 6, cursor: 'pointer' }}>Flag High-Risk QC</button>
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 14px', background: '#111827', border: `1px solid ${currentHpv.hpvResult === 'Positive' ? '#ef444433' : '#1f2937'}`, borderRadius: 10, marginBottom: 14 }}>
                {fieldLabel('HPV Co-Testing', '(real, dual-result molecular status)')}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#d1d5db', marginBottom: 8 }}>
                  <input type="checkbox" checked={currentHpv.hpvCoTestOrdered === true} onChange={e => handleHpvChange({ hpvCoTestOrdered: e.target.checked })} />
                  Co-test ordered
                </label>
                <select value={currentHpv.hpvOrderReason ?? 'co_test'} onChange={e => handleHpvChange({ hpvOrderReason: e.target.value as any })}
                  className="ps-conf-select" style={{ width: '100%', marginBottom: 8 }}>
                  <option value="co_test">Reason: Routine Co-Test</option>
                  <option value="ascus_reflex">Reason: ASC-US Reflex Triage</option>
                  <option value="post_treatment_surveillance">Reason: Post-Treatment Surveillance</option>
                </select>
                <select value={currentHpv.hpvResult ?? ''} onChange={e => handleHpvChange({ hpvResult: e.target.value || undefined, hpvGenotypeDetail: e.target.value === 'Positive' ? currentHpv.hpvGenotypeDetail : undefined })}
                  className="ps-conf-select" style={{ width: '100%' }}>
                  <option value="">Result — not set</option>
                  <option value="Positive">Positive</option>
                  <option value="Negative">Negative</option>
                  <option value="Pending">Pending</option>
                  <option value="Not Performed">Not Performed</option>
                </select>
                {currentHpv.hpvResult === 'Positive' && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1f2937' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>Genotype (select all detected)</div>
                    {([
                      ['hpv16', 'HPV 16'],
                      ['hpv18Or45', 'HPV 18/45'],
                      ['otherHighRisk', 'Other high-risk type'],
                    ] as const).map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#d1d5db', marginBottom: 4 }}>
                        <input type="checkbox" checked={currentHpv.hpvGenotypeDetail?.[key] === true}
                          onChange={e => handleHpvChange({ hpvGenotypeDetail: { hpv16: false, hpv18Or45: false, otherHighRisk: false, ...currentHpv.hpvGenotypeDetail, [key]: e.target.checked } })} />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Review History</h2>
              {reviews.length === 0 && <p style={{ fontSize: 12.5, color: '#4b5563' }}>No reviews recorded yet.</p>}
              {reviews.map(r => {
                const isInitial = r.role === 'primary_screen';
                const isFinal = currentFinalDiagnosis?.reviewRecordId === r.id;
                const gate = resolveCytologySignOutGate(
                  { adequacyCategoryIds: r.adequacySelections?.map(s => s.categoryId), requiresPathologistReview: r.requiresPathologistReview },
                  isGynCytology, currentQcFlag ? true : false, categories,
                );
                return (
                  <div key={r.id} style={{ padding: '10px 12px', background: '#0f0f0f', border: `1px solid ${isInitial ? '#009E7333' : '#1f2937'}`, borderRadius: 9, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: isInitial ? '#009E7318' : '#37415118', color: isInitial ? '#009E73' : '#9ca3af' }}>
                        {isInitial ? 'INITIAL REVIEW' : ROLE_LABELS[r.role].toUpperCase()}
                      </span>
                      {isFinal && <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>FINAL DIAGNOSIS</span>}
                      <span title={gate.blockedReasons.join(', ')} style={{ fontSize: 10, fontWeight: 700, color: gate.allowed ? '#22c55e' : '#f59e0b' }}>
                        {gate.allowed ? 'CT-ELIGIBLE' : 'PATH REQUIRED'}
                      </span>
                      <span style={{ fontSize: 10.5, color: '#6b7280', marginLeft: 'auto' }}>{r.recordedBy.userName} · {new Date(r.recordedAt).toLocaleDateString()}</span>
                    </div>

                    {r.adequacySelections && r.adequacySelections.length > 0 && (
                      <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}>
                        <b>Adequacy:</b> {r.adequacySelections.map(s => categoryLabel(s.categoryId) + (s.comment ? ` (${s.comment})` : '')).join('; ')}
                      </div>
                    )}
                    {r.generalCategorizationId && (
                      <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}><b>General Categorization:</b> {categoryLabel(r.generalCategorizationId)}</div>
                    )}
                    <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}>
                      <b>Primary:</b> {categoryLabel(r.primaryInterpretationId)}{r.primaryInterpretationComment ? ` (${r.primaryInterpretationComment})` : ''}
                    </div>
                    {r.additionalInterpretations && r.additionalInterpretations.length > 0 && (
                      <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}>
                        <b>Additional:</b> {r.additionalInterpretations.map(s => categoryLabel(s.categoryId) + (s.comment ? ` (${s.comment})` : '')).join('; ')}
                      </div>
                    )}
                    {r.recommendations && r.recommendations.length > 0 && (
                      <div style={{ fontSize: 11.5, color: '#d1d5db', marginBottom: 3 }}>
                        <b>Recommendations:</b> {r.recommendations.map(s => categoryLabel(s.categoryId) + (s.comment ? ` (${s.comment})` : '')).join('; ')}
                      </div>
                    )}
                    {r.notes && <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 6, fontStyle: 'italic' }}>"{r.notes}"</div>}

                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={() => handleClone(r.id)} style={{ fontSize: 10.5, padding: '3px 9px', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 6, color: '#9ca3af', cursor: 'pointer' }}>Clone</button>
                      <button onClick={() => handleSelectFinalDiagnosis(r.id)} style={{ fontSize: 10.5, padding: '3px 9px', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 6, color: '#9ca3af', cursor: 'pointer' }}>Set as Final</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT: new review form */}
            <div style={{ padding: '16px 18px', background: '#111827', border: '1px solid #1f2937', borderRadius: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Record a New Review</h2>

              {fieldLabel('General Categorization', '(dictionary-driven — Bethesda\'s own general category, optional)')}
              <select value={draft.generalCategorizationId} onChange={e => setDraft({ ...draft, generalCategorizationId: e.target.value })}
                className="ps-conf-select" style={{ width: '100%', marginBottom: 14 }}>
                <option value="">— None —</option>
                {generalCatOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>

              {fieldLabel('Specimen Adequacy', '(select one or more; each may carry its own comment)')}
              <MultiSearchSelect options={adequacyOptions} selections={draft.adequacySelections}
                onChange={sel => setDraft({ ...draft, adequacySelections: sel })} placeholder="Search adequacy…" categoryLabel={categoryLabel} />

              {fieldLabel('Primary Interpretation', '(exactly one; may carry a comment)')}
              <SingleSearchSelect options={primaryOptions} value={draft.primaryInterpretationId} comment={draft.primaryInterpretationComment}
                onChange={id => setDraft({ ...draft, primaryInterpretationId: id, additionalInterpretations: draft.additionalInterpretations.filter(s => s.categoryId !== id) })}
                onCommentChange={c => setDraft({ ...draft, primaryInterpretationComment: c })} placeholder="Search primary interpretation…" />

              {fieldLabel('Additional Interpretations', '(select any number; each may carry its own comment)')}
              <MultiSearchSelect options={additionalOptions} selections={draft.additionalInterpretations}
                onChange={sel => setDraft({ ...draft, additionalInterpretations: sel })} placeholder="Search additional interpretations…" categoryLabel={categoryLabel} />

              {fieldLabel('Recommendations', '(select any number; each may carry its own comment)')}
              <MultiSearchSelect options={recommendationOptions} selections={draft.recommendations}
                onChange={sel => setDraft({ ...draft, recommendations: sel })} placeholder="Search recommendations…" categoryLabel={categoryLabel} />

              {fieldLabel('Notes')}
              <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} rows={2}
                style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, color: '#d1d5db', background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 16, resize: 'vertical', fontFamily: 'inherit' }} />

              <button onClick={handleSave} disabled={saving || !draft.primaryInterpretationId}
                style={{ padding: '9px 20px', fontSize: 12.5, fontWeight: 700, color: '#0a0a0a', background: !draft.primaryInterpretationId ? '#374151' : '#009E73', border: 'none', borderRadius: 8, cursor: !draft.primaryInterpretationId ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : `Save as ${ROLE_LABELS[resolvedRole]}`}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
