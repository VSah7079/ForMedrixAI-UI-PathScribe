/**
 * FacilityDictionaryPage.tsx
 * Located at: src/pages/system/FacilityDictionaryPage.tsx
 *
 * Admin config page for Facility Configuration.
 * Route: /system/clients (rendered as the 'clients' case in
 * Config/System/index.tsx)
 *
 * Reconciled June 2026: previously used contexts/useClientDictionary.ts,
 * a synchronous localStorage-backed hook with its own separate Client
 * type and ID scheme (client-INT-001 etc.), completely disconnected from
 * services/facilities/mockFacilityService.ts — the Facility store every
 * other screen (Accession page, TAT Configuration, Subspecialties, Routing
 * Rules, Validation Studies) and existing case seed data (order.facilityId)
 * actually use. Now wired to the same facilityService everything else uses,
 * so a facility added here shows up everywhere else, and vice versa.
 * useClientDictionary.ts has since been retired entirely.
 *
 * i18n note: the audit-log `detail` string and each reference-check
 * `s.label` (from referenceCheckService.ts, e.g. "Physicians",
 * "Grossing Route Overrides") stay literal English, matching the
 * precedent already set by DepartmentsSection.tsx/
 * SpecimenCategoriesSection.tsx for the same shared service.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import '../../pathscribe.css';
import { facilityService, auditService } from "../../services";
import { checkFacilityReferences } from "../../services/referenceCheck/referenceCheckService";
import ConfirmModal from "../../components/Common/ConfirmModal";
import { useAuth } from "@/contexts/AuthContext";
import type { Facility, FacilityInput } from "../../services/facilities/IFacilityService";
import { FacilityEditorModal } from "../../components/FacilityDictionary/FacilityEditorModal";
import { FacilityTable } from "../../components/FacilityDictionary/FacilityTable";
import { duplicateFacility } from "@/services/duplication/duplicateEntities";

export const FacilityDictionaryPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | undefined>(undefined);
  // Real fix (PS-73, Sep 2026): explicit save-mode state, added alongside
  // editingFacility rather than inferred from its presence — Duplicate
  // below needs to open the editor in 'add' mode with editingFacility
  // *populated* (a prefilled template), which `!!editingFacility` could
  // never tell apart from a real edit. See FacilityEditorModal.tsx's own
  // file-header comment for the matching fix on the modal's side.
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');

  useEffect(() => {
    facilityService.getAll().then(res => {
      if (res.ok) setFacilities(res.data);
      setLoading(false);
    });
  }, []);

  const handleAdd = () => {
    setEditingFacility(undefined);
    setEditorMode('add');
    setIsEditorOpen(true);
  };

  const handleEdit = (facilityId: string) => {
    const c = facilities.find(x => x.id === facilityId);
    setEditingFacility(c);
    setEditorMode('edit');
    setIsEditorOpen(true);
  };

  // Real fix (PS-73, Sep 2026): Facility was the one matrix entry from this
  // ticket's own original scope (as "Client Dictionary") never wired up —
  // the standalone components/ClientDictionary/ fork it named was since
  // confirmed genuinely dead and deleted (see components/FacilityDictionary/
  // README.md's "Facility rename" section); this, the real living
  // successor, is where the gap actually lives now.
  //
  // What a copy keeps (org-level configuration: roles, jurisdiction,
  // reporting, TAT/escalation, AI, LIS routing, identifier formats, print and
  // release settings) and what it clears (assigning authority, CLIA/ISO
  // number, address and contact details, director, legacy tenant ids,
  // pediatric authorizations, interface endpoint and credentials) is decided
  // in services/duplication/duplicateEntities.ts → duplicateFacility, with
  // the reason for each field. The copy's name is marked in the user's own
  // language.
  const handleDuplicateFacility = (source: Facility) => {
    setEditingFacility(duplicateFacility(source, name => t('common.copyOfName', { name })));
    setEditorMode('add');
    setIsEditorOpen(true);
  };

  const handleSave = async (input: FacilityInput) => {
    // Real fix (PS-73): was `if (editingFacility)` — broke the moment
    // Duplicate started populating editingFacility for an 'add'. editorMode
    // is the single source of truth for add-vs-update now.
    if (editorMode === 'edit' && editingFacility) {
      // Real, per direct guidance's own follow-up on the broader
      // provenance & auditability sweep: found via direct check to
      // have zero audit trail anywhere in this save path - scoped
      // specifically to the one real, billing-relevant field here
      // (random-sampling code review rate), not every other,
      // unrelated facility setting this same generic save handles -
      // that broader gap is real but genuinely out of scope for a
      // billing-focused sweep.
      if ((editingFacility.codeReviewSamplingRatePercent ?? null) !== (input.codeReviewSamplingRatePercent ?? null)) {
        auditService.logEvent({
          type: 'user',
          event: 'Code review random sampling rate changed',
          detail: `${editingFacility.name}: ${editingFacility.codeReviewSamplingRatePercent ?? 'none'} \u2192 ${input.codeReviewSamplingRatePercent ?? 'none'}`,
          user: user?.name ?? 'unknown',
          caseId: null,
          confidence: null,
        });
      }
      const res = await facilityService.update(editingFacility.id, input);
      if (res.ok) setFacilities(prev => prev.map(c => c.id === res.data.id ? res.data : c));
    } else {
      const res = await facilityService.add(input);
      if (res.ok) setFacilities(prev => [...prev, res.data]);
    }
  };

  const [pendingDeactivation, setPendingDeactivation] = useState<{ id: string; message: string } | null>(null);

  const handleToggleActive = async (id: string, activate: boolean) => {
    // Reactivating, or no references — proceed exactly as before, unchanged.
    if (activate) {
      const res = await facilityService.reactivate(id);
      if (res.ok) setFacilities(prev => prev.map(c => c.id === id ? res.data : c));
      return;
    }
    const refCheck = await checkFacilityReferences(id);
    if (refCheck.hasReferences) {
      const detail = refCheck.sources.map(s => `${s.count} ${s.label}`).join(', ');
      setPendingDeactivation({ id, message: t('facilityDictionaryPage.stillInUseMessage', { detail }) });
      return;
    }
    const res = await facilityService.deactivate(id);
    if (res.ok) setFacilities(prev => prev.map(c => c.id === id ? res.data : c));
  };

  const confirmDeactivation = async () => {
    if (!pendingDeactivation) return;
    const res = await facilityService.deactivate(pendingDeactivation.id);
    if (res.ok) setFacilities(prev => prev.map(c => c.id === pendingDeactivation.id ? res.data : c));
    setPendingDeactivation(null);
  };

  const handleVerify = async (id: string) => {
    const res = await facilityService.verify(id);
    if (res.ok) setFacilities(prev => prev.map(c => c.id === id ? res.data : c));
  };

  if (loading) {
    return (
      <div className="config-section-container">
        <div className="config-section-loading">
          {t('facilityDictionaryPage.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="config-section-container">
      <div className="config-section-header">
        <div className="config-section-header-row">
          <div>
            <h2 className="config-section-title">{t('facilityDictionaryPage.title')}</h2>
            <p className="config-section-description">
              {t('facilityDictionaryPage.description')}
            </p>
          </div>
          <button className="config-primary-button" onClick={handleAdd}>
            {t('facilityDictionaryPage.addButton')}
          </button>
        </div>
      </div>

      <div className="config-section-body">
        <FacilityTable
          facilities={facilities}
          onEdit={handleEdit}
          onDuplicate={handleDuplicateFacility}
          onToggleActive={handleToggleActive}
          onVerify={handleVerify}
        />
      </div>

      {isEditorOpen && (
        <FacilityEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          mode={editorMode}
          facility={editingFacility}
          onSave={handleSave}
          allFacilities={facilities}
        />
      )}

      <ConfirmModal
        show={!!pendingDeactivation}
        title={t('facilityDictionaryPage.stillInUseTitle')}
        message={pendingDeactivation?.message ?? ''}
        confirmLabel={t('departmentsSection.deactivation.confirmLabel')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDeactivation}
        onCancel={() => setPendingDeactivation(null)}
      />
    </div>
  );
};
