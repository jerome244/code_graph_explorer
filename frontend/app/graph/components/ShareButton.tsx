"use client";
import { useEffect, useState } from "react";

type Share = {
  user: { id: number; username: string; email?: string | null };
  role: "viewer" | "editor";
  added_at: string;
};

export default function ShareButton({
  projectId,
  isOwner,
}: {
  projectId: number;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [error, setError] = useState<string | null>(null);

  // invite form
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");

  useEffect(() => {
    if (!open || !isOwner) return;
    (async () => {
      setLoading(true);
      const r = await fetch(`/api/projects/${projectId}/share`, { cache: "no-store" });
      setLoading(false);
      if (!r.ok) {
        setError("Failed to load shares.");
        return;
      }
      const data = await r.json();
      setShares(data);
    })();
  }, [open, projectId, isOwner]);

  const invite = async () => {
    setError(null);
    if (!username.trim()) {
      setError("Enter a username.");
      return;
    }
    setLoading(true);
    const r = await fetch(`/api/projects/${projectId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role }),
    });
    setLoading(false);
    if (!r.ok) {
      const msg = (await r.json().catch(() => ({}))).detail || "Failed to invite.";
      setError(msg);
      return;
    }
    setUsername("");
    // refresh list
    const list = await fetch(`/api/projects/${projectId}/share`);
    if (list.ok) setShares(await list.json());
  };

  const changeRole = async (userId: number, newRole: "viewer" | "editor") => {
    setLoading(true);
    const r = await fetch(`/api/projects/${projectId}/share/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setLoading(false);
    if (!r.ok) return;
    setShares((prev) => prev.map((s) => (s.user.id === userId ? { ...s, role: newRole } : s)));
  };

  const remove = async (userId: number) => {
    setLoading(true);
    const r = await fetch(`/api/projects/${projectId}/share/${userId}`, { method: "DELETE" });
    setLoading(false);
    if (!r.ok) return;
    setShares((prev) => prev.filter((s) => s.user.id !== userId));
  };

  if (!projectId || !isOwner) return null;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)}>Share</button>
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            zIndex: 50,
            width: 360,
            padding: "1rem",
            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Share project</strong>
            <button className="btn" onClick={() => setOpen(false)}>Close</button>
          </div>

          <div style={{ marginTop: ".8rem", display: "grid", gap: ".6rem" }}>
            {/* Invite row */}
            <div style={{ display: "flex", gap: ".5rem" }}>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  flex: 1,
                  padding: ".5rem",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  background: "transparent",
                }}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
                style={{
                  padding: ".5rem",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  background: "transparent",
                }}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button className="btn" onClick={invite} disabled={loading}>Invite</button>
            </div>

            {error && <p className="dz-sub" style={{ color: "crimson" }}>{error}</p>}
            <hr />

            {/* Current access list */}
            <div>
              <p className="dz-sub" style={{ marginBottom: ".4rem" }}>People with access</p>
              {loading ? (
                <p>Loading…</p>
              ) : shares.length === 0 ? (
                <p className="dz-sub">Only you have access.</p>
              ) : (
                <ul style={{ display: "grid", gap: ".4rem" }}>
                  {shares.map((s) => (
                    <li
                      key={s.user.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <div>
                        <strong>{s.user.username}</strong>
                        <div className="dz-sub">Role: {s.role}</div>
                      </div>
                      <div style={{ display: "flex", gap: ".5rem" }}>
                        <select
                          value={s.role}
                          onChange={(e) => changeRole(s.user.id, e.target.value as "viewer" | "editor")}
                          style={{
                            padding: ".5rem",
                            border: "1px solid var(--border)",
                            borderRadius: "10px",
                            background: "transparent",
                          }}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button className="btn" onClick={() => remove(s.user.id)}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
