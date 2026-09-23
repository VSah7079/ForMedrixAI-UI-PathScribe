/**
 * ClientTable.tsx
 * Located at: src/components/ClientDictionary/ClientTable.tsx
 *
 * Displays the list of facilities in the Facility Configuration config page.
 * Includes inline search + status filter so ClientDictionaryPage stays lean.
 *
 * Props:
 *   clients   — Client[]
 *   onEdit    — (clientId: string) => void
  *   onToggleActive — (id: string, active: boolean) => void
 */

import { useState, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { Facility as Client, FacilityRole } from "../../services/facilities/IFacilityService";
import { FACILITY_ROLE_LABELS } from "../../services/facilities/IFacilityService";
import { JURISDICTION_LABELS } from "../../types/systemConfig";

interface ClientTableProps {
  clients: Client[];
  onEdit: (clientId: string) => void;
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
  all: 'clientTable.filters.all',
  active: 'clientTable.filters.active',
  inactive: 'clientTable.filters.inactive',
  unverified: 'clientTable.filters.unverified',
};

export const ClientTable: React.FC<ClientTableProps> = ({
  clients,
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
    return clients.filter((c) => {
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
  }, [clients, search, statusFilter, roleFilter]);

  const roleFilterOptions: [RoleFilter, string][] = [
    ["all", t('clientTable.filters.allTypes')],
    ["performing_lab", t('clientTable.filters.performingLab')],
    ["ordering_client", t('clientTable.filters.orderingClient')],
  ];

  // ── Empty state ────────────────────────────────────────────────────────────
  if (clients.length === 0) {
    return (
      <div className="fct-empty-state">
        <div className="fct-empty-icon">🏥</div>
        <div className="fct-empty-title">{t('clientTable.noFacilitiesYet')}</div>
        <div>{t('clientTable.addFirstFacilityPrefix')} <strong>{t('clientTable.addFacilityButton')}</strong> {t('clientTable.addFirstFacilitySuffix')}</div>
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
            placeholder={t('clientTable.searchPlaceholder')}
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
          {t('clientTable.resultCount', { filtered: filtered.length, total: clients.length })}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="fct-table-wrap">
        {filtered.length === 0 ? (
          <div className="fct-no-match">
            {t('clientTable.noMatch')}
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
                {[t('clientTable.col.facility'), t('clientTable.col.roles'), t('clientTable.col.contact'), t('clientTable.col.tat'), t('clientTable.col.status'), ''].map((h, i) => (
                  <th key={i} className="fct-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((client, i) => (
                <tr
                  key={client.id}
                  className={`fct-row ${i % 2 === 0 ? '' : 'fct-row--alt'}`}
                >
                  {/* CLIENT — name + code + address */}
                  <td className="fct-td">
                    <div className="fct-name-row">
                      <span className="fct-name">{client.name}</span>
                      <span className="fct-code">{client.assigningAuthority}</span>
                    </div>
                    <div className="fct-address">
                      {client.address}
                    </div>
                    {client.parentId && <div className="fct-affiliate">↳ {t('clientTable.affiliate')}</div>}
                  </td>

                  {/* ROLES */}
                  <td className="fct-td">
                    <div className="fct-role-badges">
                      {client.roles.map((role: FacilityRole) => (
                        <span
                          key={role}
                          className={`fct-role-badge ${role === 'performing_lab' ? 'fct-role-badge--lab' : 'fct-role-badge--client'}`}
                        >
                          {FACILITY_ROLE_LABELS[role]}
                        </span>
                      ))}
                    </div>
                    <div className="fct-jurisdiction">
                      {JURISDICTION_LABELS[client.jurisdiction] ?? client.jurisdiction}
                    </div>
                  </td>

                  {/* CONTACT */}
                  <td className="fct-td">
                    <div className="fct-contact-name">{client.contactName || '—'}</div>
                    <div className="fct-contact-email">{client.email}</div>
                  </td>

                  {/* TAT */}
                  <td className="fct-td">
                    {client.tatFirstTouchHours != null || client.tatTotalHours != null ? (
                      <div className="fct-tat-col">
                        {client.tatFirstTouchHours != null && (
                          <span className="fct-tat-first">
                            {t('clientTable.tatFirstTouch', { hours: client.tatFirstTouchHours })}
                          </span>
                        )}
                        {client.tatTotalHours != null && (
                          <span className="fct-tat-total">
                            {t('clientTable.tatTotal', { hours: client.tatTotalHours })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="fct-tat-default">{t('clientTable.tatDefault')}</span>
                    )}
                  </td>

                  {/* STATUS */}
                  <td className="fct-td">
                    {client.status === 'Active' && (
                      <span className="fct-status-badge fct-status-badge--active">{t('clientTable.status.active')}</span>
                    )}
                    {client.status === 'Inactive' && (
                      <span className="fct-status-badge fct-status-badge--inactive">{t('clientTable.status.inactive')}</span>
                    )}
                    {client.status === 'Unverified' && (
                      <span className="fct-status-badge fct-status-badge--unverified">{t('clientTable.status.unverified')}</span>
                    )}
                    {client.autoCreated && (
                      <div className="fct-auto-created" title={client.autoCreatedNote}>
                        {t('clientTable.autoCreated')}{client.autoCreatedAt ? ` ${client.autoCreatedAt}` : ''}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="fct-td fct-td--actions">
                    <div className="fct-actions">
                      {client.status === 'Unverified' && (
                        <button
                          className="ps-conf-btn-secondary fct-action-btn fct-action-btn--verify"
                          onClick={() => onVerify(client.id)}
                        >{t('clientTable.verify')}</button>
                      )}
                      <button
                        className="ps-conf-btn-secondary fct-action-btn fct-action-btn--edit"
                        onClick={() => onEdit(client.id)}
                      >{t('clientTable.edit')}</button>
                      {client.status !== 'Unverified' && (
                        <button
                          className={`ps-conf-btn-secondary fct-action-btn ${client.status === 'Active' ? 'fct-action-btn--deactivate' : 'fct-action-btn--activate'}`}
                          onClick={() => onToggleActive(client.id, client.status !== 'Active')}
                          title={client.status === 'Active' ? t('clientTable.deactivateTitle') : t('clientTable.reactivateTitle')}
                        >{client.status === 'Active' ? t('clientTable.deactivate') : t('clientTable.activate')}</button>
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
