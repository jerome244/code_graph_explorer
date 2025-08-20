"use client";
import { useState } from "react";

type Project = {
  id: string; name: string; description?: string;
  graph: unknown; source_language?: string;
  created_at: string; updated_at: string;
};

export default function SaveButton(props: {
  project?: Project | null;
  name?: string;
  graph: unknown;
  description?: string;
  sourceLanguage?: string;
  onSaved?: (p: Project) => void;
}) {
  const { project, name = "My Code Graph", graph, description = "", sourceLanguage = "", onSaved } = props;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      const body = { name, description, graph, source_language: sourceLanguage };
      // ⬇️ add overwrite=1 for create; keep plain URL for update
      const url = project?.id ? `/api/projects/${project.id}` : `/api/projects?overwrite=1`;
      const method = project?.id ? ("PUT" as const) : ("POST" as const);

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include", // make sure JWT/session cookies reach the proxy
      });

      // robust error parsing (DRF often returns field errors, not "detail")
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { /* keep text fallback */ }

      if (res.status === 401) { setError("Please log in to save."); return; }
      if (!res.ok) {
        const fieldErr =
          (data && typeof data === "object" && Object.values(data)[0] && Array.isArray(Object.values(data)[0])
            ? (Object.values(data)[0] as any[])[0]
            : null);
        const msg = data?.detail || fieldErr || text || `Save failed (${res.status})`;
        throw new Error(msg);
      }

      onSaved?.((data || {}) as Project);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={save}
      disabled={saving}
      title={project?.id ? "Save" : "Save Project"}
      style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 8, background: "white" }}
    >
      {saving ? "Saving…" : project?.id ? "Save" : "Save Project"}
      {error && <span style={{ marginLeft: 8, color: "#dc2626" }}>{error}</span>}
    </button>
  );
}
