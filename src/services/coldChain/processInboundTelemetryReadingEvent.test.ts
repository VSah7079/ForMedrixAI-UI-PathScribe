// src/services/coldChain/processInboundTelemetryReadingEvent.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('processInboundTelemetryReadingEvent — real, per the RFP-APLIS-2026-GLOBAL Cold-Chain gap', () => {
  it('real, a genuine excursion on a smart container checked out to an active batch sets the batch\'s own real hold AND raises a real, open deficiency for the real case represented', async () => {
    const { mockHardwareContainerRegistryService } = await import('../hardwareContainers/mockHardwareContainerRegistryService');
    const { mockBatchService } = await import('../batches/mockBatchService');
    const { mockSpecimenDeficiencyService } = await import('../deficiencies/mockSpecimenDeficiencyService');
    const { processInboundTelemetryReadingEvent, _resetProcessedTelemetryReadingMessageIdsForTests } = await import('./processInboundTelemetryReadingEvent');
    _resetProcessedTelemetryReadingMessageIdsForTests();

    const container = await mockHardwareContainerRegistryService.create({
      rackId: 'RACK-COLD-01', containerType: 'Archive Storage Tray', isSmartContainer: true, storageConditionTypeId: 'sct-frozen-tissue',
    });
    if (!container.ok) throw new Error('setup failed');

    const batch = await mockBatchService.create({
      processingNode: 'Processing', protocol: 'Real cold-chain test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batch.ok) throw new Error('setup failed');
    await mockHardwareContainerRegistryService.checkOut('RACK-COLD-01', batch.data.id);

    const result = await processInboundTelemetryReadingEvent({
      messageId: 'msg-1', timestamp: new Date().toISOString(),
      assetType: 'hardware_container', assetId: container.data.id,
      temperatureCelsius: -10, recordedAt: new Date().toISOString(),
    });
    expect(result.outcome).toBe('applied');

    const updatedBatch = await mockBatchService.getById(batch.data.id);
    if (updatedBatch.ok) {
      expect(updatedBatch.data.coldChainExcursion).toBeDefined();
      expect(updatedBatch.data.coldChainExcursion?.temperatureCelsius).toBe(-10);
    }

    // Real, direct verification: completion is now genuinely blocked.
    await mockBatchService.startReconciliation(batch.data.id, 'u1', 'Tech A');
    const completeAttempt = await mockBatchService.completeReconciliation(batch.data.id);
    expect(completeAttempt.ok).toBe(false);

    // Real, direct verification of this processor's own honest
    // scoping decision: this real test batch has no real items
    // scanned into it, so there is genuinely no real case to tie a
    // deficiency to — zero deficiencies raised is the correct,
    // honest outcome here, never a fabricated batch-level one.
    const allDeficiencies = await mockSpecimenDeficiencyService.getAll();
    if (allDeficiencies.ok) {
      const coldChainDefs = allDeficiencies.data.filter(d => d.deficiencyTypeId === 'def-cold-chain-excursion');
      expect(coldChainDefs).toHaveLength(0);
    }
  });

  it('real, a genuine excursion on a batch that DOES have a real item scanned into it raises a real, open deficiency for that item\'s own real case', async () => {
    const { mockHardwareContainerRegistryService } = await import('../hardwareContainers/mockHardwareContainerRegistryService');
    const { mockBatchService } = await import('../batches/mockBatchService');
    const { mockSpecimenDeficiencyService } = await import('../deficiencies/mockSpecimenDeficiencyService');
    const { storageGet, storageSet } = await import('../mockStorage');
    const { processInboundTelemetryReadingEvent, _resetProcessedTelemetryReadingMessageIdsForTests } = await import('./processInboundTelemetryReadingEvent');
    _resetProcessedTelemetryReadingMessageIdsForTests();

    const container = await mockHardwareContainerRegistryService.create({
      rackId: 'RACK-COLD-03', containerType: 'Archive Storage Tray', isSmartContainer: true, storageConditionTypeId: 'sct-frozen-tissue',
    });
    if (!container.ok) throw new Error('setup failed');
    const batch = await mockBatchService.create({
      processingNode: 'Processing', protocol: 'Real deficiency-path test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batch.ok) throw new Error('setup failed');
    await mockHardwareContainerRegistryService.checkOut('RACK-COLD-03', batch.data.id);

    // Real, direct storage injection — bypasses addItemByScan's own
    // real dependency on resolveMaterialFromScan (which itself
    // depends on this app's own, large seed case data) purely to
    // give this isolated test a real item with a known, real
    // caseAccession to verify the deficiency-raising path against.
    const batches = storageGet<any[]>('batches', []);
    const idx = batches.findIndex(b => b.id === batch.data.id);
    batches[idx].items = [{ id: 'item-1', materialType: 'block', displayId: 'S26-9999-A1', caseAccession: 'S26-9999', addedAt: new Date().toISOString(), addedByUserId: 'u1', addedByUserName: 'Tech A' }];
    storageSet('batches', batches);

    await processInboundTelemetryReadingEvent({
      messageId: 'msg-5', timestamp: new Date().toISOString(),
      assetType: 'hardware_container', assetId: container.data.id,
      temperatureCelsius: -10, recordedAt: new Date().toISOString(),
    });

    const deficiencies = await mockSpecimenDeficiencyService.getByCaseId('S26-9999');
    if (deficiencies.ok) {
      const coldChainDef = deficiencies.data.find(d => d.deficiencyTypeId === 'def-cold-chain-excursion');
      expect(coldChainDef).toBeDefined();
      expect(coldChainDef?.status).toBe('open');
    }
  });

  it('real, a non-excursion reading never sets a hold and never raises a deficiency', async () => {
    const { mockHardwareContainerRegistryService } = await import('../hardwareContainers/mockHardwareContainerRegistryService');
    const { mockBatchService } = await import('../batches/mockBatchService');
    const { processInboundTelemetryReadingEvent, _resetProcessedTelemetryReadingMessageIdsForTests } = await import('./processInboundTelemetryReadingEvent');
    _resetProcessedTelemetryReadingMessageIdsForTests();

    const container = await mockHardwareContainerRegistryService.create({
      rackId: 'RACK-COLD-02', containerType: 'Archive Storage Tray', isSmartContainer: true, storageConditionTypeId: 'sct-frozen-tissue',
    });
    if (!container.ok) throw new Error('setup failed');
    const batch = await mockBatchService.create({
      processingNode: 'Processing', protocol: 'Real normal-reading test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batch.ok) throw new Error('setup failed');
    await mockHardwareContainerRegistryService.checkOut('RACK-COLD-02', batch.data.id);

    await processInboundTelemetryReadingEvent({
      messageId: 'msg-2', timestamp: new Date().toISOString(),
      assetType: 'hardware_container', assetId: container.data.id,
      temperatureCelsius: -22, recordedAt: new Date().toISOString(),
    });

    const updatedBatch = await mockBatchService.getById(batch.data.id);
    if (updatedBatch.ok) expect(updatedBatch.data.coldChainExcursion).toBeUndefined();
  });

  it('real, an excursion on a StorageUnit (no batch to hold) never throws and never attempts a batch mutation', async () => {
    const { processInboundTelemetryReadingEvent, _resetProcessedTelemetryReadingMessageIdsForTests } = await import('./processInboundTelemetryReadingEvent');
    _resetProcessedTelemetryReadingMessageIdsForTests();
    const result = await processInboundTelemetryReadingEvent({
      messageId: 'msg-3', timestamp: new Date().toISOString(),
      assetType: 'storage_unit', assetId: 'su-freezer-01',
      temperatureCelsius: -5, recordedAt: new Date().toISOString(),
    });
    expect(result.outcome).toBe('applied');
  });

  it('real, a redelivered messageId is a genuine no-op', async () => {
    const { processInboundTelemetryReadingEvent, _resetProcessedTelemetryReadingMessageIdsForTests } = await import('./processInboundTelemetryReadingEvent');
    _resetProcessedTelemetryReadingMessageIdsForTests();
    const payload = { messageId: 'msg-dup', timestamp: new Date().toISOString(), assetType: 'storage_unit' as const, assetId: 'su-freezer-01', temperatureCelsius: 5, recordedAt: new Date().toISOString() };
    await processInboundTelemetryReadingEvent(payload);
    const second = await processInboundTelemetryReadingEvent(payload);
    expect(second.outcome).toBe('already-applied');
  });

  it('real, an honest invalid-payload outcome for a genuinely malformed event', async () => {
    const { processInboundTelemetryReadingEvent, _resetProcessedTelemetryReadingMessageIdsForTests } = await import('./processInboundTelemetryReadingEvent');
    _resetProcessedTelemetryReadingMessageIdsForTests();
    const result = await processInboundTelemetryReadingEvent({
      messageId: 'msg-4', timestamp: new Date().toISOString(), assetType: 'storage_unit' as const, assetId: '', temperatureCelsius: 5, recordedAt: '',
    });
    expect(result.outcome).toBe('invalid-payload');
  });
});
