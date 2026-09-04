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

export const ClientTable: React.FC<ClientTableProps> = ({
  clients,
  onEdit,
  onToggleActive,
  onVerify,
}) => {
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

  // ── Delete confirmation ────────────────────────────────────────────────────

  // ── Styles ─────────────────────────────────────────────────────────────────
  const filterTabBase: React.CSSProperties = {
    padding: "5px 14px",
    fontSize: "12px",
    fontWeight: 600,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.15s",
  };

  const filterTab = (active: boolean): React.CSSProperties => ({
    ...filterTabBase,
    background: active ? "#0891b2" : "transparent",
    color: active ? "#0f172a" : "#64748b",
    borderColor: active ? "#0891b2" : "rgba(255,255,255,0.1)",
  });

  // ── Empty state ────────────────────────────────────────────────────────────
  if (clients.length === 0) {
    return (
      <div style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "#64748b",
        border: "1px dashed rgba(255,255,255,0.15)",
        borderRadius: "12px",
        fontSize: "14px",
      }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>🏥</div>
        <div style={{ fontWeight: 600, marginBottom: "6px", color: "#64748b" }}>No facilities yet</div>
        <div>Click <strong>+ Add Facility</strong> to define your first facility.</div>
      </div>
    );
  }

  return (
    <>
      {/* ── Toolbar ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        marginBottom: "14px",
        flexWrap: "wrap",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <span style={{
            position: "absolute", left: "10px", top: "50%",
            transform: "translateY(-50%)", color: "#64748b", fontSize: "14px",
            pointerEvents: "none",
          }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, contact, facility…"
            style={{
              width: "100%",
              padding: "7px 10px 7px 32px",
              fontSize: "13px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              outline: "none",
              color: "#e2e8f0",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#0891b2")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                position: "absolute", right: "8px", top: "50%",
                transform: "translateY(-50%)", background: "none",
                border: "none", cursor: "pointer", color: "#64748b",
                fontSize: "14px", lineHeight: 1, padding: "2px",
              }}
            >✕</button>
          )}
        </div>

        {/* Status filter tabs */}
        <div style={{ display: "flex", gap: "6px" }}>
          {(["all", "active", "inactive", "unverified"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              style={filterTab(statusFilter === f)}
              onClick={() => setStatusFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Role filter tabs */}
        <div style={{ display: "flex", gap: "6px" }}>
          {([
            ["all", "All Types"],
            ["performing_lab", "Performing Lab"],
            ["ordering_client", "Ordering Client"],
          ] as [RoleFilter, string][]).map(([f, label]) => (
            <button
              key={f}
              style={filterTab(roleFilter === f)}
              onClick={() => setRoleFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Result count */}
        <span style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap" }}>
          {filtered.length} of {clients.length}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: "auto", width: "100%", maxWidth: "100%", paddingRight: "2px" }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: "32px",
            textAlign: "center",
            color: "#64748b",
            fontSize: "13px",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
          }}>
            No facilities match your search.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                {["Facility", "Roles", "Contact", "TAT", "Status", ""].map((h) => (
                  <th key={h} style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontWeight: 700,
                    color: "#475569",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((client, i) => (
                <tr
                  key={client.id}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.025)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(8,145,178,0.06)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.025)")
                  }
                >
                  {/* CLIENT — name + code + address */}
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{client.name}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                        background: "rgba(255,255,255,0.06)", color: "#0891b2",
                        padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>{client.assigningAuthority}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0, minWidth: "100%" }}>
                      {client.address}
                    </div>
                    {client.parentId && <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>↳ affiliate</div>}
                  </td>

                  {/* ROLES */}
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {client.roles.map((role: FacilityRole) => (
                        <span
                          key={role}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, whiteSpace: 'nowrap',
                            ...(role === 'performing_lab'
                              ? { background: "rgba(139,92,246,0.15)", color: "#c084fc" }
                              : { background: "rgba(8,145,178,0.15)", color: "#38bdf8" }),
                          }}
                        >
                          {FACILITY_ROLE_LABELS[role]}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>
                      {JURISDICTION_LABELS[client.jurisdiction] ?? client.jurisdiction}
                    </div>
                  </td>

                  {/* CONTACT */}
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500 }}>{client.contactName || '—'}</div>
                    <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0, minWidth: "100%" }}>{client.email}</div>
                  </td>

                  {/* TAT */}
                  <td style={{ padding: "10px 14px" }}>
                    {client.tatFirstTouchHours != null || client.tatTotalHours != null ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {client.tatFirstTouchHours != null && (
                          <span style={{ fontSize: 11, color: "#38bdf8" }}>
                            {client.tatFirstTouchHours}h 1st touch
                          </span>
                        )}
                        {client.tatTotalHours != null && (
                          <span style={{ fontSize: 11, color: "#34d399" }}>
                            {client.tatTotalHours}h total
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>Default</span>
                    )}
                  </td>

                  {/* STATUS */}
                  <td style={{ padding: "10px 14px" }}>
                    {client.status === 'Active' && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10,
                        background: "rgba(16,185,129,0.15)", color: "#34d399" }}>Active</span>
                    )}
                    {client.status === 'Inactive' && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10,
                        background: "rgba(239,68,68,0.15)", color: "#f87171" }}>Inactive</span>
                    )}
                    {client.status === 'Unverified' && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10,
                        background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>Unverified</span>
                    )}
                    {client.autoCreated && (
                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }} title={client.autoCreatedNote}>
                        Auto-created{client.autoCreatedAt ? ` ${client.autoCreatedAt}` : ''}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "10px 16px 10px 8px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {client.status === 'Unverified' && (
                        <button
                          className="ps-conf-btn-secondary"
                          onClick={() => onVerify(client.id)}
                          style={{ padding: "4px 10px", fontSize: 11, color: "#34d399", borderColor: "rgba(34,197,94,0.35)" }}
                        >Verify</button>
                      )}
                      <button
                        className="ps-conf-btn-secondary"
                        onClick={() => onEdit(client.id)}
                        style={{ padding: "5px 12px", fontSize: 12 }}
                      >Edit</button>
                      {client.status !== 'Unverified' && (
                        <button
                          className="ps-conf-btn-secondary"
                          onClick={() => onToggleActive(client.id, client.status !== 'Active')}
                          title={client.status === 'Active' ? "Deactivate facility" : "Reactivate facility"}
                          style={{ padding: "4px 10px", fontSize: 11,
                            color: client.status === 'Active' ? "#f87171" : "#34d399",
                            borderColor: client.status === 'Active' ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)",
                          }}
                        >{client.status === 'Active' ? "Deactivate" : "Activate"}</button>
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
