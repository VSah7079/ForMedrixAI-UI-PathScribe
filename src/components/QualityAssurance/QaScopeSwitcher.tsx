// src/components/QualityAssurance/QaScopeSwitcher.tsx
import React, { useEffect, useState } from 'react';
import { mockFacilityService, type Facility } from '@/services/facilities/mockFacilityService';
import { listOrganisations } from '@/services/organisation/organisationService';
import type { Organisation } from '@/services/organisation/organisationService';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import type { QaScope } from './qaReportUtils';

interface Props {
  scope: QaScope;
  onChange: (scope: QaScope) => void;
  /**
   * Real fix for the info-disclosure UX gap: a standard user shouldn't
   * be offered organisations/clients they have no data in, even though
   * selecting one is safe (the underlying fetch is already properly
   * scoped — this is about not presenting confusing options, not a
   * second security boundary).
   *
   * Organisations filter cleanly against the session's own
   * organisationId. Clients can't — Client carries no organisation
   * field at all in the current data model (see qaReportUtils.ts's
   * QaScope doc comment on why client and organisation are genuinely
   * separate dimensions) — so instead of guessing at a field that
   * doesn't exist, the caller passes the client IDs that actually
   * appear in the viewer's OWN already-scoped case fetch. That's the
   * real, derivable answer to "which clients are relevant to me,"
   * rather than a fabricated Client.organisationId this app doesn't
   * have. Omit this prop (or leave it undefined) to show every client —
   * the safe default for a cross-tenant-permitted viewer, and the
   * original behavior for any caller that hasn't been updated yet.
   */
  visibleClientIds?: string[];
}

// Prefixed values disambiguate organisation vs. client selections within
// a single dropdown — Organisation.id and Client.id are separate ID
// namespaces (see qaReportUtils.ts's QaScope doc comment on why these
// are genuinely different, both-real dimensions), so the raw ID alone
// isn't enough to tell them apart on decode.
const ORG_PREFIX = 'org:';
const CLIENT_PREFIX = 'client:';

export const QaScopeSwitcher: React.FC<Props> = ({ scope, onChange, visibleClientIds }) => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  useEffect(() => {
    mockFacilityService.getAll().then(res => { if (res.ok) setFacilities(res.data.filter(c => c.status === 'Active')); });
    listOrganisations().then(orgs => setOrganisations(orgs.filter(o => o.active)));
  }, []);

  const session = getSessionUser();
  const crossTenant = canViewCrossTenantQaData(session);

  const visibleOrganisations = crossTenant
    ? organisations
    : organisations.filter(o => o.id === session?.organisationId);

  const visibleFacilities = crossTenant || !visibleClientIds
    ? facilities
    : facilities.filter(c => visibleClientIds.includes(c.id));

  const currentValue =
    scope.level === 'enterprise' ? 'enterprise' :
    scope.level === 'organisation' ? `${ORG_PREFIX}${scope.organisationId}` :
    `${CLIENT_PREFIX}${scope.clientId}`;

  return (
    <div className="ps-qa-scope-switcher">
      <label className="ps-conf-label" htmlFor="qa-scope">Scope</label>
      <select
        id="qa-scope"
        className="ps-conf-select"
        value={currentValue}
        onChange={e => {
          const v = e.target.value;
          if (v === 'enterprise') { onChange({ level: 'enterprise' }); return; }
          if (v.startsWith(ORG_PREFIX)) { onChange({ level: 'organisation', organisationId: v.slice(ORG_PREFIX.length) }); return; }
          onChange({ level: 'client', clientId: v.slice(CLIENT_PREFIX.length) });
        }}
      >
        <option value="enterprise">Enterprise-wide</option>
        {visibleOrganisations.length > 0 && (
          <optgroup label="By Organisation">
            {visibleOrganisations.map(o => (
              <option key={o.id} value={`${ORG_PREFIX}${o.id}`}>{o.name}</option>
            ))}
          </optgroup>
        )}
        {visibleFacilities.length > 0 && (
          <optgroup label="By Referring Facility">
            {visibleFacilities.map(c => (
              <option key={c.id} value={`${CLIENT_PREFIX}${c.id}`}>{c.name} ({c.assigningAuthority})</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
};
