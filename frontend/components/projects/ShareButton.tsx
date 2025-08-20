"use client";
import { useEffect, useState } from "react";

type Share = {
  id: string;
  role: "view" | "edit";
  shared_with_email: string;
  shared_with_username: string;
};

export default function ShareButton({ projectId }: { projectId?: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"view" | "edit">("view");

  async function refresh() {
    if (!projectId) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/shares`, { credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail || "Failed to fetch shares");
      setShares(data);
    } catch (e: any) {
      setErr(e.message || "Failed to fetch shares");
    } finally { setLoading(false); }
  }

  useEffect(() => { if (open) refresh(); }, [open, projectId]);

  async function addShare() {
    if (!projectId || !email) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, role }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.email || data?.detail || "Share failed");
      setEmail("");
      await refresh();
    } catch (e: any) {
      alert(e.message || "Share failed");
    }
  }

  async function changeRole(shareId: string, newRole: "view" | "edit") {
    if (!projectId) return;
    const r = await fetch(`/api/projects/${projectId}/shares/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: newRole }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return alert(data?.detail || "Update failed");
    refresh();
  }

  async function revoke(shareId: string) {
    if (!projectId) return;
    if (!confirm("Remove access?")) return;
    const r = await fetch(`/api/projects/${projectId}/shares/${shareId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) return alert("Failed to remove access");
    refresh();
  }

  const disabled = !projectId;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "6px 10px",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "white",
          color: "#111827", // visible text
          cursor: "pointer",
        }}
        title={disabled ? "Save first to enable sharing" : "Share project"}
      >
        Share
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            zIndex: 1000, // ensure on top
            width: 380,
            background: "white",
            color: "#111827",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,.08)",
            padding: 10,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Share Project</div>

          {disabled && (
            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
              Save this project first to generate an ID. Then you can add collaborators.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={disabled}
              style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px" }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "view" | "edit")}
              disabled={disabled}
              style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px" }}
            >
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button
              type="button"
              onClick={addShare}
              disabled={disabled || !email}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: "6px 10px",
                background: "white",
                color: "#111827",
                opacity: disabled || !email ? 0.6 : 1,
                cursor: disabled || !email ? "not-allowed" : "pointer",
              }}
            >
              Add
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            {disabled ? "—" : loading ? "Loading…" : err ? err : `${shares.length} collaborator(s)`}
          </div>

          {!disabled && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 240, overflow: "auto" }}>
              {shares.map((s) => (
                <li key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.shared_with_username || s.shared_with_email}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{s.shared_with_email}</div>
                  </div>
                  <select
                    value={s.role}
                    onChange={(e) => changeRole(s.id, e.target.value as "view" | "edit")}
                    style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 6px" }}
                  >
                    <option value="view">Can view</option>
                    <option value="edit">Can edit</option>
                  </select>
                  <button
                    onClick={() => revoke(s.id)}
                    style={{ color: "#dc2626", background: "transparent", border: 0, cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {shares.length === 0 && !loading && (
                <li style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>No collaborators yet.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
