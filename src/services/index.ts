// ─────────────────────────────────────────────────────────────────────────────
// services/index.ts
// ─────────────────────────────────────────────────────────────────────────────
export const IS_MOCK_BACKEND = true;
export { mockUserService          as userService          } from './users/mockUserService';
export { mockRoleService          as roleService          } from './roles/mockRoleService';
export { mockPhysicianService     as physicianService     } from './physicians/mockPhysicianService';
export { mockFlagService          as flagService          } from './flags/mockFlagService';
export { mockContainerTypeService as containerTypeService } from './containerTypes/mockContainerTypeService';
export { mockIntraoperativeService as intraoperativeService } from './intraop/mockIntraoperativeService';
export { mockReconciliationService as reconciliationService } from './quality/mockReconciliationService';
export { mockAmendmentService as amendmentService } from './reports/mockAmendmentService';
export { mockReportVersionService as reportVersionService } from './reports/mockReportVersionService';
export { mockLisAmendmentNoticeService as lisAmendmentNoticeService } from './reports/mockLisAmendmentNoticeService';
export { mockInformalReviewService as informalReviewService } from './reports/mockInformalReviewService';
export { mockAccessRequestService as accessRequestService } from './access/mockAccessRequestService';
export { mockSubspecialtyService  as subspecialtyService  } from './subspecialties/mockSubspecialtyService';
export { mockFacilityService       as facilityService     } from './facilities/mockFacilityService';
export { mockLocationService       as locationService     } from './locations/mockLocationService';
export { mockInterfaceExceptionService as interfaceExceptionService } from './interfaceExceptions/mockInterfaceExceptionService';
export { mockReportReleaseService as reportReleaseService } from './reportRelease/mockReportReleaseService';
export { mockSpecimenCategoryService as specimenCategoryService } from './specimenCategories/mockSpecimenCategoryService';
export { mockGrossingRoutingOverrideService as grossingRoutingOverrideService } from './grossingRoutingOverrides/mockGrossingRoutingOverrideService';
export { mockTemplateSuggestionSignalService as templateSuggestionSignalService } from './templateSuggestions/mockTemplateSuggestionSignalService';
export { mockLisSyncService as lisSyncService } from './lisSync/mockLisSyncService';
export { mockSpecimenDictionaryService as specimenDictionaryService } from './specimenDictionary/mockSpecimenDictionaryService';
export { mockPriorityService as priorityService } from './priority/mockPriorityService';
export { mockStainTypeService as stainTypeService } from './stains/mockStainTypeService';
export { mockSectioningProtocolService as sectioningProtocolService } from './stains/mockSectioningProtocolService';
export { mockStainOrderMacroService as stainOrderMacroService } from './stains/mockStainOrderMacroService';
export { mockManagementReviewService as managementReviewService } from './deficiencies/mockManagementReviewService';
export { mockBatchService as batchService } from './batches/mockBatchService';
export { mockHardwareContainerRegistryService as hardwareContainerRegistryService } from './hardwareContainers/mockHardwareContainerRegistryService';
export { mockProtocolService as protocolService } from './protocols/mockProtocolService';
export { mockPrinterProfileService as printerProfileService } from './printerProfiles/mockPrinterProfileService';
export { mockDiagnosisCodesService as diagnosisCodesService } from './diagnosisCodes/mockDiagnosisCodesService';
export { mockOrderIntakeService as orderIntakeService } from './orderIntake/mockOrderIntakeService';
export { mockDeficiencyTypeService as deficiencyTypeService } from './deficiencies/mockDeficiencyTypeService';
export { mockResolutionTypeService as resolutionTypeService } from './deficiencies/mockResolutionTypeService';
export { mockSpecimenDeficiencyService as specimenDeficiencyService } from './deficiencies/mockSpecimenDeficiencyService';
export { mockSystemConfigService  as systemConfigService  } from './systemConfig/mockSystemConfigService';
export { mockMacroService         as macroService         } from './macros/mockMacroService';
export { mockFontService          as fontService          } from './fonts/mockFontService';
export { mockAIBehaviorService    as aiBehaviorService    } from './aiBehavior/mockAIBehaviorService';
export { mockPrintSettingsService as printSettingsService } from './printSettings/mockPrintSettingsService';
export { mockModelService         as modelService         } from './models/mockModelService';
export { mockSavedSearchService   as savedSearchService   } from './savedSearches/mockSavedSearchService';
export { mockAuditService         as auditService         } from './auditlog/mockAuditService';
export { mockCaseService          as caseService          } from './cases/mockCaseService';
export { mockCountersignService   as countersignService   } from './cases/mockCountersignService';
export { mockFppeAssignmentService as fppeAssignmentService } from './cases/mockFppeAssignmentService';
export { mockCodeService          as codeService          } from './codes/mockCodeService';
export { mockMessageService       as messageService       } from './messages/mockMessageService';
export { mockInternalNoteService  as internalNoteService  } from './internalNotes/mockInternalNoteService';
export { INTERNAL_NOTE_TYPE_LABELS                        } from './internalNotes/IInternalNoteService';
// resultService removed — the whole discrete-result concept (order,
// poll, status) was shelved as unvalidated. See Flag Maintenance /
// ComputationalPanel for what remains: Flags as a real catalog/triage
// concept, without the ordering/result apparatus that was built on an
// integration model (outbound polling) that never matched how either
// Orchestration or CoPilot actually works.
export { mockReportTemplateService as reportTemplateService } from './reportTemplates/mockReportTemplateService';
export { onReportTemplatesChanged, STANDARD_TEMPLATE_ID,
         BREAST_TEMPLATE_ID, GI_TEMPLATE_ID,
         THORACIC_TEMPLATE_ID, URO_TEMPLATE_ID           } from './reportTemplates/mockReportTemplateService';
export { resolveReportTemplate                            } from './reportTemplates/TemplateRoutingService';

// ─── Type re-exports ──────────────────────────────────────────────────────────
export type { StaffUser }         from './users/IUserService';
export type { GrossingRoutingOverrideEntry } from './grossingRoutingOverrides/IGrossingRoutingOverrideService';
export type { Role }              from './roles/IRoleService';
export type { Physician }         from './physicians/IPhysicianService';
export type { Flag }              from './flags/IFlagService';
export type { Subspecialty }      from './subspecialties/ISubspecialtyService';
export type { Facility }          from './facilities/IFacilityService';
export type { SpecimenCategory }  from './specimenCategories/ISpecimenCategoryService';
export type { PriorityLevel }     from './priority/IPriorityService';
export type { StainType, StainCategory, SectioningProtocol, StainOrderMacro } from './stains/IStainService';
export type { IncomingOrder, IncomingOrderSpecimen, SpecimenCodeCrosswalkEntry, OrderResolutionResult } from './orderIntake/IOrderIntakeService';
export type { DeficiencyType, ResolutionType, SpecimenDeficiency, ManagementReview } from './deficiencies/IDeficiencyService';
export type { Protocol, ProtocolPathway, PathwayTask, ProtocolHistoryEntry } from './protocols/IProtocolService';
export type { PrinterProfile, PrinterVendor, PrinterBridgeType } from './printerProfiles/IPrinterProfileService';
export type { Icd10Code } from './diagnosisCodes/IDiagnosisCodesService';
export type { SystemConfig }      from './systemConfig/mockSystemConfigService';
export type { Macro }             from './macros/IMacroService';
export type { EditorFont, EditorFontConfig } from './fonts/IFontService';
export type { AIBehaviorConfig }  from './aiBehavior/IAIBehaviorService';
export type { AIModel }           from './models/IModelService';
export type { SavedSearch, SearchContext, WorklistFilters, CaseSearchFilters, RefinedSearchFilters } from './savedSearches/ISavedSearchService';
export type { AuditLog, ErrorLog, AuditLogType, ErrorSeverity } from './auditlog/IAuditService';
export type { PathologyCase, CaseStatus, CasePriority, AIStatus, CaseGender, FlagColor, CaseFilterParams } from './cases/ICaseService';
export type { ClinicalCode, CodeSystem, CodeSearchParams, IcdOSubtype } from './codes/ICodeService';
export type { Message }           from './messages/IMessageService';
export type { InternalNote, InternalNoteType, InternalNoteVisibility } from './internalNotes/IInternalNoteService';
export type { ServiceResult }     from './types';
// ComputationalResult re-export removed — the type itself was removed
// from smarttag.types.ts along with the ordering/result apparatus.
export type { ReportTemplate }    from './reportTemplates/IReportTemplateService';
export type { TemplateRoutingInput, TemplateRoutingResult } from './reportTemplates/TemplateRoutingService';
