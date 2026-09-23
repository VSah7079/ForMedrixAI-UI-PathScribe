/**
 * FacilityTable.tsx
 * Located at: src/components/FacilityDictionary/FacilityTable.tsx
 *
 * Displays the list of facilities in the Facility Configuration config page.
 * Includes inline search + status filter so FacilityDictionaryPage stays lean.
 *
 * Props:
 *   facilities — Facility[]
 *   onEdit    — (facilityId: string) => void
  *   onToggleActive — (id: string, active: boolean) => void
 */

import { useState, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { Facility, FacilityRole } from "../../services/facilities/IFacilityService";
import { FACILITY_ROLE_LABELS } from "../../services/facilities/IFacilityService";
import { JURISDICTION_LABELS } from "../../types/systemConfig";

interface FacilityTableProps {
  facilities: Facility[];
  onEdit: (facilityId: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onVerify: (id: string) => void;
}

type StatusFilter = "all" | "active" | "inactive" | "unverified";
// Real feature, per direct confirmation: "One record per facility.
// Multiple roles attached to that record." Replaces the old, single
// internal/external toggle — a facility can hold several roles at
// once, so filtering is "does this role apply," not "which type is
// this." 'performing_lab' and 'ordering_client' (either ordering
// role) cover the same practical distinction the old internal/
// external filter served.
type RoleFilter = "all" | "performing_lab" | "ordering_client";

const STATUS_FILTER_LABEL_KEY: Record<StatusFilter, string> = {
  all: 'facilityTable.filters.all',
  active: 'facilityTable.filters.active',
  inactive: 'facilityTable.filters.inactive',
  unverified: 'facilityTable.filters.unverified',
};

export const FacilityTable: React.FC<FacilityTableProps> = ({
  facilities,
  onEdit,
  onToggleActive,
  onVerify,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return facilities.filter((c) => {
      if (statusFilter === "active" && c.status !== "Active") return false;
      if (statusFilter === "inactive" && c.status !== "Inactive") return false;
      if (statusFilter === "unverified" && c.status !== "Unverified") return false;
      if (roleFilter === "performing_lab" && !c.roles.includes('performing_lab')) return false;
      if (roleFilter === "ordering_client" && !c.roles.includes('internal_ordering_client') && !c.roles.includes('external_ordering_client')) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.assigningAuthority.toLowerCase().includes(q) ||
        (c.contactName ?? '').toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [facilities, search, statusFilter, roleFilter]);

  const roleFilterOptions: [RoleFilter, string][] = [
    ["all", t('facilityTable.filters.allTypes')],
    ["performing_lab", t('facilityTable.filters.performingLab')],
    ["ordering_client", t('facilityTable.filters.orderingFacility')],
  ];

  // ── Empty state ────────────────────────────────────────────────────────────
  if (facilities.length === 0) {
    return (
      <div className="fct-empty-state">
        <div className="fct-empty-icon">🏥</div>
        <div className="fct-empty-title">{t('facilityTable.noFacilitiesYet')}</div>
        <div>{t('facilityTable.addFirstFacilityPrefix')} <strong>{t('facilityTable.addFacilityButton')}</strong> {t('facilityTable.addFirstFacilitySuffix')}</div>
      </div>
    );
  }

  return (
    <>
      {/* ── Toolbar ── */}
      <div className="fct-toolbar">
        {/* Search */}
        <div className="fct-search-wrap">
          <span className="fct-search-icon">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('facilityTable.searchPlaceholder')}
            className="fct-search-input"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="fct-search-clear"
            >✕</button>
          )}
        </div>

        {/* Status filter tabs */}
        <div className="fct-filter-group">
          {(["all", "active", "inactive", "unverified"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              className={`fct-filter-tab ${statusFilter === f ? 'fct-filter-tab--active' : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {t(STATUS_FILTER_LABEL_KEY[f])}
            </button>
          ))}
        </div>

        {/* Role filter tabs */}
        <div className="fct-filter-group">
          {roleFilterOptions.map(([f, label]) => (
            <button
              key={f}
              className={`fct-filter-tab ${roleFilter === f ? 'fct-filter-tab--active' : ''}`}
              onClick={() => setRoleFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Result count */}
        <span className="fct-result-count">
          {t('facilityTable.resultCount', { filtered: filtered.length, total: facilities.length })}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="fct-table-wrap">
        {filtered.length === 0 ? (
          <div className="fct-no-match">
            {t('facilityTable.noMatch')}
          </div>
        ) : (
          <table className="fct-table">
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr className="fct-thead-row">
                {[t('facilityTable.col.facility'), t('facilityTable.col.roles'), t('facilityTable.col.contact'), t('facilityTable.col.tat'), t('facilityTable.col.status'), ''].map((h, i) => (
                  <th key={i} className="fct-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((facility, i) => (
                <tr
                  key={facility.id}
                  className={`fct-row ${i % 2 === 0 ? '' : 'fct-row--alt'}`}
                >
                  {/* CLIENT — name + code + address */}
                  <td className="fct-td">
                    <div className="fct-name-row">
                      <span className="fct-name">{facility.name}</span>
                      <span className="fct-code">{facility.assigningAuthority}</span>
                    </div>
                    <div className="fct-address">
                      {facility.address}
                    </div>
                    {facility.parentId && <div className="fct-affiliate">↳ {t('facilityTable.affiliate')}</div>}
                  </td>

                  {/* ROLES */}
                  <td className="fct-td">
                    <div className="fct-role-badges">
                      {facility.roles.map((role: FacilityRole) => (
                        <span
                          key={role}
                          className={`fct-role-badge ${role === 'performing_lab' ? 'fct-role-badge--lab' : 'fct-role-badge--client'}`}
                        >
                          {FACILITY_ROLE_LABELS[role]}
                        </span>
                      ))}
                    </div>
                    <div className="fct-jurisdiction">
                      {JURISDICTION_LABELS[facility.jurisdiction] ?? facility.jurisdiction}
                    </div>
                  </td>

                  {/* CONTACT */}
                  <td className="fct-td">
                    <div className="fct-contact-name">{facility.contactName || '—'}</div>
                    <div className="fct-contact-email">{facility.email}</div>
                  </td>

                  {/* TAT */}
                  <td className="fct-td">
                    {facility.tatFirstTouchHours != null || facility.tatTotalHours != null ? (
                      <div className="fct-tat-col">
                        {facility.tatFirstTouchHours != null && (
                          <span className="fct-tat-first">
                            {t('facilityTable.tatFirstTouch', { hours: facility.tatFirstTouchHours })}
                          </span>
                        )}
                        {facility.tatTotalHours != null && (
                          <span className="fct-tat-total">
                            {t('facilityTable.tatTotal', { hours: facility.tatTotalHours })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="fct-tat-default">{t('facilityTable.tatDefault')}</span>
                    )}
                  </td>

                  {/* STATUS */}
                  <td className="fct-td">
                    {facility.status === 'Active' && (
                      <span className="fct-status-badge fct-status-badge--active">{t('facilityTable.status.active')}</span>
                    )}
                    {facility.status === 'Inactive' && (
                      <span className="fct-status-badge fct-status-badge--inactive">{t('facilityTable.status.inactive')}</span>
                    )}
                    {facility.status === 'Unverified' && (
                      <span className="fct-status-badge fct-status-badge--unverified">{t('facilityTable.status.unverified')}</span>
                    )}
                    {facility.autoCreated && (
                      <div className="fct-auto-created" title={facility.autoCreatedNote}>
                        {t('facilityTable.autoCreated')}{facility.autoCreatedAt ? ` ${facility.autoCreatedAt}` : ''}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="fct-td fct-td--actions">
                    <div className="fct-actions">
                      {facility.status === 'Unverified' && (
                        <button
                          className="ps-conf-btn-secondary fct-action-btn fct-action-btn--verify"
                          onClick={() => onVerify(facility.id)}
                        >{t('facilityTable.verify')}</button>
                      )}
                      <button
                        className="ps-conf-btn-secondary fct-action-btn fct-action-btn--edit"
                        onClick={() => onEdit(facility.id)}
                      >{t('facilityTable.edit')}</button>
                      {facility.status !== 'Unverified' && (
                        <button
                          className={`ps-conf-btn-secondary fct-action-btn ${facility.status === 'Active' ? 'fct-action-btn--deactivate' : 'fct-action-btn--activate'}`}
                          onClick={() => onToggleActive(facility.id, facility.status !== 'Active')}
                          title={facility.status === 'Active' ? t('facilityTable.deactivateTitle') : t('facilityTable.reactivateTitle')}
                        >{facility.status === 'Active' ? t('facilityTable.deactivate') : t('facilityTable.activate')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};
