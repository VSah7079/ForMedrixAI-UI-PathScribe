// src/services/screens/defaultScreenAccessService.ts
// Batch 374: the screen check wired to this build's authorization service.
import { authorizationService } from '../authorization/defaultAuthorizationService';
import { createScreenAccessService } from './screenAccess';

export const screenAccessService = createScreenAccessService({ authorization: authorizationService });
