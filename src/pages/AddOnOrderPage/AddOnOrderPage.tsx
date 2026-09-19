// src/pages/AddOnOrderPage/AddOnOrderPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-287 (Pathologist-Initiated Add-On Orders — Recuts,
// Special Stains, IHC, and Molecular). Fourth of the confirmed
// PS-284→285→286→287→288 workstation-build sequence — genuinely
// different shape from its three siblings: this is CASE-scoped (search
// or scan an accession to open the whole case), not block/slide-scoped,
// since a pathologist places an add-on order in the context of one
// case's own full block list, not one pre-selected block. See
// useAddOnOrderStation.ts's own header for the full reasoning and this
// folder's own README.md for the complete investigation this was built
// against, including the two real, direct Jira follow-up comments this
// implementation is scoped to honor (performing-lab-scoped routing
// through the real ScanStation.workflowStage backbone).
//
// Real, per direct visual-consistency guidance carried through the
// whole series: same header/back-button pattern, same dark palette —
// see pathscribe.css's own ps-addon-* block.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { formatFullDisplayName } from '@/utils/personName';
import { useAddOnOrderStation } from './hooks/useAddOnOrderStation';
import BlockContextPanel from './components/BlockContextPanel';
import OrderBuilderPanel from './components/OrderBuilderPanel';
import OrderSummaryRoutingPanel, { type CartLine } from './components/OrderSummaryRoutingPanel';
import OrderTrackingDashboard from './components/OrderTrackingDashboard';
import type { AddOnOrderLineInput } from '@/utils/addOnOrderOperations';
import { type AddOnOrderPriority, type SlideMediaType } from '@/types/case/AddOnOrder';
import '../../pathscribe.css';

let cartIdCounter = 0;
function nextCartId(): string { cartIdCounter += 1; return `cart-${cartIdCounter}`; }

const AddOnOrderPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('addOnOrder.pageTitle'), '/add-on-orders'); }, [pushCrumb, t]);

  const w = useAddOnOrderStation();
  const [searchInput, setSearchInput] = useState('');
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [priority, setPriority] = useState<AddOnOrderPriority>('Routine Sign-Out');
  const [slideMediaType, setSlideMediaType] = useState<SlideMediaType>('Standard Charged');
  const [cuttingInstructions, setCuttingInstructions] = useState('');
  const [sendOutFacilityId, setSendOutFacilityId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  useEffect(() => { w.loadDirectories(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpen = async () => {
    setSubmitError(null);
    setSubmitNotice(null);
    await w.openCase(searchInput);
  };

  const handleToggleBlock = (blockId: string) => {
    setSelectedBlockIds(prev => prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId]);
  };

  const handleAddLines = (lines: AddOnOrderLineInput[]) => {
    setCart(prev => [...prev, ...lines.map(l => ({ ...l, cartId: nextCartId() }))]);
  };

  const handleRemoveLine = (cartId: string) => {
    setCart(prev => prev.filter(l => l.cartId !== cartId));
  };

  const handleSubmit: React.ComponentProps<typeof OrderSummaryRoutingPanel>['onSubmit'] = async (submission) => {
    setSubmitError(null);
    setSubmitNotice(null);
    const lines: AddOnOrderLineInput[] = cart.map(({ cartId, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
    const result = await w.submitOrder(selectedBlockIds, lines, submission);
    if (result.ok) {
      setCart([]);
      setSelectedBlockIds([]);
      setCuttingInstructions('');
      setSubmitNotice(t('addOnOrder.summary.submitted') as string);
    } else {
      // Real, established project gotcha (strictNullChecks: false — see
      // services/reports/README.md): explicit cast, same fix used
      // throughout this session's own prior workstations.
      setSubmitError((result as { ok: false; error: string }).error);
    }
  };

  if (!w.caseData) {
    return (
      <div className="ps-addon-page">
        <div className="ps-addon-header">
          <button type="button" className="ps-btn-secondary" onClick={() => navigate('/')}>{t('common.back')}</button>
          <h1 className="ps-addon-title">{t('addOnOrder.pageTitle')}</h1>
        </div>
        <div className="ps-addon-search-row">
          <input
            className="ps-addon-scan-input"
            placeholder={t('addOnOrder.search.placeholder') as string}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleOpen(); }}
            autoFocus
          />
          <button type="button" className="ps-btn-primary" onClick={handleOpen}>{t('addOnOrder.search.open')}</button>
        </div>
        {w.searchError && <div className="ps-addon-scan-error">{w.searchError}</div>}
      </div>
    );
  }

  const caseData = w.caseData;
  const patientName = formatFullDisplayName({
    namePrefix: caseData.patient.namePrefix,
    givenNames: caseData.patient.givenNames ?? caseData.patient.firstName,
    familyNames: caseData.patient.familyNames ?? caseData.patient.lastName,
    nameSuffix: caseData.patient.nameSuffix,
  });
  const fullAccession = caseData.accession.fullAccession ?? caseData.accession.accessionNumber;

  return (
    <div className="ps-addon-page">
      <div className="ps-addon-header">
        <button type="button" className="ps-btn-secondary" onClick={w.closeCase}>{t('common.back')}</button>
        <h1 className="ps-addon-title">{t('addOnOrder.pageTitle')}</h1>
      </div>

      <div className="ps-addon-context-bar">
        <span><strong>{fullAccession}</strong></span>
        <span data-phi="name">{patientName}</span>
        <span>{t('addOnOrder.context.caseStatus')}: <strong>{caseData.status}</strong></span>
        {caseData.order?.assignedTo && <span>{t('addOnOrder.context.primaryPathologist')}: <strong>{caseData.order.assignedTo}</strong></span>}
        {!w.performingLabFacilityId && <span className="ps-addon-warning-inline">{t('addOnOrder.context.noPerformingLab')}</span>}
      </div>

      {submitNotice && <div className="ps-addon-notice-banner">{submitNotice}</div>}
      {submitError && <div className="ps-addon-warning-banner">{submitError}</div>}

      <div className="ps-addon-layout">
        <BlockContextPanel specimens={caseData.specimens ?? []} selectedBlockIds={selectedBlockIds} onToggleBlock={handleToggleBlock} />
        <OrderBuilderPanel stainTypes={w.stainTypes} onAddLines={handleAddLines} />
        <OrderSummaryRoutingPanel
          cart={cart}
          onRemoveLine={handleRemoveLine}
          selectedBlockCount={selectedBlockIds.length}
          priority={priority}
          onPriorityChange={setPriority}
          slideMediaType={slideMediaType}
          onSlideMediaTypeChange={setSlideMediaType}
          cuttingInstructions={cuttingInstructions}
          onCuttingInstructionsChange={setCuttingInstructions}
          referenceLabs={w.referenceLabs}
          sendOutFacilityId={sendOutFacilityId}
          onSendOutFacilityChange={(id) => setSendOutFacilityId(id)}
          stationsForLine={(line) => w.stationsForRouting(line.orderKind, line.stainType.category)}
          performingLabResolved={Boolean(w.performingLabFacilityId)}
          onSubmit={handleSubmit}
          submitDisabled={cart.length === 0 || selectedBlockIds.length === 0}
        />
      </div>

      <OrderTrackingDashboard
        orders={w.trackedOrders()}
        onMarkBlockRetrieved={w.handleMarkBlockRetrieved}
        onFlagException={w.handleFlagException}
        onResolveException={w.handleResolveException}
      />
    </div>
  );
};

export default AddOnOrderPage;
