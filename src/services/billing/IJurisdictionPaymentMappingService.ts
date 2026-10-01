// src/services/billing/IJurisdictionPaymentMappingService.ts
import type { ServiceResult } from '../types';
import type { JurisdictionPaymentMapping } from '../../types/billing/JurisdictionPaymentMapping';

export interface IJurisdictionPaymentMappingService {
  getAll(): Promise<ServiceResult<JurisdictionPaymentMapping[]>>;
  getById(id: string): Promise<ServiceResult<JurisdictionPaymentMapping>>;
  /** Real, per direct guidance: every real local scheme available for
   *  one real country — the actual lookup the Accessioning Screen's
   *  own Primary Jurisdiction selector (Step 2, not yet built) will
   *  need. */
  getByCountry(countryCode: string): Promise<ServiceResult<JurisdictionPaymentMapping[]>>;
  add(input: {
    countryCode: string;
    localSchemeCode: string;
    localDisplayTerminology: string;
    masterPaymentTypeId: string;
    primaryOutboundFormat: string;
    notes?: string;
  }): Promise<ServiceResult<JurisdictionPaymentMapping>>;
  update(id: string, changes: Partial<Omit<JurisdictionPaymentMapping, 'id' | 'createdAt'>>): Promise<ServiceResult<JurisdictionPaymentMapping>>;
  deactivate(id: string): Promise<ServiceResult<JurisdictionPaymentMapping>>;
  reactivate(id: string): Promise<ServiceResult<JurisdictionPaymentMapping>>;
}
