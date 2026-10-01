// src/services/reportParts/IReportPartService.ts

import type { ServiceResult, ID } from '../types';
import type { ReportPart, PartLibraryFilter } from '../../types/reportPart';

export interface IReportPartService {
  getAll(filter?: PartLibraryFilter): Promise<ServiceResult<ReportPart[]>>;
  getById(id: ID): Promise<ServiceResult<ReportPart>>;
  getByIds(ids: ID[]): Promise<ServiceResult<ReportPart[]>>;
  create(partial?: Partial<Omit<ReportPart, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ServiceResult<ReportPart>>;
  save(part: ReportPart): Promise<ServiceResult<ReportPart>>;
  publish(id: ID): Promise<ServiceResult<ReportPart>>;
  archive(id: ID): Promise<ServiceResult<ReportPart>>;
  /** `newName` is supplied by the caller in the user's language (t('common.copyOfName')). */
  clone(id: ID, newName: string): Promise<ServiceResult<ReportPart>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}
