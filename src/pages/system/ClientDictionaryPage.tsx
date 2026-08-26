/**
 * ClientDictionaryPage.tsx
 * Located at: src/pages/system/ClientDictionaryPage.tsx
 *
 * Admin config page for Facility Configuration.
 * Route: /system/clients (rendered as the 'clients' case in
 * Config/System/index.tsx)
 *
 * Reconciled June 2026: previously used contexts/useClientDictionary.ts,
 * a synchronous localStorage-backed hook with its own separate Client
 * type and ID scheme (client-INT-001 etc.), completely disconnected from
 * services/facilities/mockFacilityService.ts — the Client store every other
 * screen (Accession page, TAT Configuration, Subspecialties, Routing
 * Rules, Validation Studies) and existing case seed data (order.clientId)
 * actually use. Now wired to the same facilityService everything else uses,
 * so a client added here shows up everywhere else, and vice versa.
 * useClientDictionary.ts has been retired.
 */

import { useState, useEffect } from "react";
import '../../pathscribe.css';
import { facilityService, auditService } from "../../services";
import { checkClientReferences } from "../../services/referenceCheck/referenceCheckService";
import ConfirmModal from "../../components/Common/ConfirmModal";
import { useAuth } from "@/contexts/AuthContext";
import type { Facility as Client, FacilityInput } from "../../services/facilities/IFacilityService";
import { ClientEditorModal } from "../../components/ClientDictionary/ClientEditorModal";
import { ClientTable } from "../../components/ClientDictionary/ClientTable";

export const ClientDictionaryPage = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);

  useEffect(() => {
    facilityService.getAll().then(res => {
      if (res.ok) setClients(res.data);
      setLoading(false);
    });
  }, []);

  const handleAdd = () => {
    setEditingClient(undefined);
    setIsEditorOpen(true);
  };

  const handleEdit = (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    setEditingClient(c);
    setIsEditorOpen(true);
  };

  const handleSave = async (input: FacilityInput) => {
    if (editingClient) {
      // Real, per direct guidance's own follow-up on the broader
      // provenance & auditability sweep: found via direct check to
      // have zero audit trail anywhere in this save path - scoped
      // specifically to the one real, billing-relevant field here
      // (random-sampling code review rate), not every other,
      // unrelated facility setting this same generic save handles -
      // that broader gap is real but genuinely out of scope for a
      // billing-focused sweep.
      if ((editingClient.codeReviewSamplingRatePercent ?? null) !== (input.codeReviewSamplingRatePercent ?? null)) {
        auditService.logEvent({
          type: 'user',
          event: 'Code review random sampling rate changed',
          detail: `${editingClient.name}: ${editingClient.codeReviewSamplingRatePercent ?? 'none'} \u2192 ${input.codeReviewSamplingRatePercent ?? 'none'}`,
          user: user?.name ?? 'unknown',
          caseId: null,
          confidence: null,
        });
      }
      const res = await facilityService.update(editingClient.id, input);
      if (res.ok) setClients(prev => prev.map(c => c.id === res.data.id ? res.data : c));
    } else {
      const res = await facilityService.add(input);
      if (res.ok) setClients(prev => [...prev, res.data]);
    }
  };

  const [pendingDeactivation, setPendingDeactivation] = useState<{ id: string; message: string } | null>(null);

  const handleToggleActive = async (id: string, activate: boolean) => {
    // Reactivating, or no references — proceed exactly as before, unchanged.
    if (activate) {
      const res = await facilityService.reactivate(id);
      if (res.ok) setClients(prev => prev.map(c => c.id === id ? res.data : c));
      return;
    }
    const refCheck = await checkClientReferences(id);
    if (refCheck.hasReferences) {
      const detail = refCheck.sources.map(s => `${s.count} ${s.label}`).join(', ');
      setPendingDeactivation({ id, message: `This facility is still referenced by: ${detail}. Deactivating it now won't remove those references — they'll keep pointing at a facility that's no longer active. Deactivate anyway?` });
      return;
    }
    const res = await facilityService.deactivate(id);
    if (res.ok) setClients(prev => prev.map(c => c.id === id ? res.data : c));
  };

  const confirmDeactivation = async () => {
    if (!pendingDeactivation) return;
    const res = await facilityService.deactivate(pendingDeactivation.id);
    if (res.ok) setClients(prev => prev.map(c => c.id === pendingDeactivation.id ? res.data : c));
    setPendingDeactivation(null);
  };

  const handleVerify = async (id: string) => {
    const res = await facilityService.verify(id);
    if (res.ok) setClients(prev => prev.map(c => c.id === id ? res.data : c));
  };

  if (loading) {
    return (
      <div className="config-section-container">
        <div className="config-section-loading">
          Loading clients...
        </div>
      </div>
    );
  }

  return (
    <div className="config-section-container">
      <div className="config-section-header">
        <div className="config-section-header-row">
          <div>
            <h2 className="config-section-title">Facility Configuration</h2>
            <p className="config-section-description">
              Manage facility definitions, roles, HL7 integration settings, and reporting preferences.
            </p>
          </div>
          <button className="config-primary-button" onClick={handleAdd}>
            + Add Facility
          </button>
        </div>
      </div>

      <div className="config-section-body">
        <ClientTable
          clients={clients}
          onEdit={handleEdit}
          onToggleActive={handleToggleActive}
          onVerify={handleVerify}
        />
      </div>

      {isEditorOpen && (
        <ClientEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          client={editingClient}
          onSave={handleSave}
          allClients={clients}
        />
      )}

      <ConfirmModal
        show={!!pendingDeactivation}
        title="Facility still in use"
        message={pendingDeactivation?.message ?? ''}
        confirmLabel="Deactivate Anyway"
        cancelLabel="Cancel"
        onConfirm={confirmDeactivation}
        onCancel={() => setPendingDeactivation(null)}
      />
    </div>
  );
};
