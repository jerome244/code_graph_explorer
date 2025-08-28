"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";

type Role = "owner" | "viewer" | "editor" | null;

type P = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  file_count: number;

  // NEW meta from backend serializer
  is_owner?: boolean;
  role?: Role;
  owner?: { id: number; username: string };
};

export default function ProjectsPage() {
  const [items, setItems] = useState<P[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/projects/list", { cache: "no-store" });
      setLoading(false);
      if (!r.ok) {
        setError(r.status === 401 ? "Please sign in to see your projects." : "Failed to load projects.");
        return;
      }
      const data = await r.json();
      // keep whatever fields backend sends (incl. is_owner/role/owner)
      setItems(Array.isArray(data) ? (data as P[]) : []);
    })();
  }, []);

  return (
    <div className="graph-main" style={{ paddingTop: 0 }}>
      <h1 className="page-title">My Projects</h1>
      {loading && <p className="dz-sub">Loading…</p>}
      {error && <p className="dz-sub">{error}</p>}
      {!loading && !error && (
        <div style={{ display: "grid", gap: ".75rem" }}>
          {items.length === 0 ? (
            <p className="dz-sub">
              No projects yet. Go to <Link href="/graph" className="underline">Graph Explorer</Link> to create one.
            </p>
          ) : (
            items.map((p) => (
              <div
                key={p.id}
                className="card"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem" }}
              >
                <div style={{ display: "grid", gap: ".2rem" }}>
                  <strong>{p.name}</strong>
                  <span className="dz-sub">
                    Files: {p.file_count} · Saved {new Date(p.created_at).toLocaleString()}
                    {p.is_owner === false && p.owner?.username ? <> · Shared by {p.owner.username}</> : null}
                    {p.is_owner === false && p.role ? <> · Access: {p.role}</> : null}
                  </span>
                </div>
                <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                  {/* Owners get Share button right here */}
                  {p.is_owner ? <ShareButton projectId={p.id} isOwner={true} /> : null}
                  <Link className="btn" href={`/graph?id=${p.id}`}>Open in Graph</Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
