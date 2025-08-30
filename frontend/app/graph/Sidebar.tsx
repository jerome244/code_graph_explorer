// /frontend/app/graph/Sidebar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { ProjectDetail, UserLite } from './types'; // Ensure correct import of types

interface SidebarProps {
  info: string;
  projectId: number | null;
  setProjectId: React.Dispatch<React.SetStateAction<number | null>>;
  onFile: (file: File) => void;
  loadProject: (id: number) => void;
  saveAsNewProject: () => void;
  saveAllToExisting: () => void;
  shareOpen: boolean;
  setShareOpen: React.Dispatch<React.SetStateAction<boolean>>;
  projDetail: ProjectDetail | null;
  q: string;
  setQ: React.Dispatch<React.SetStateAction<string>>;
  results: UserLite[];
  isOwner: boolean;
  mutateShare: (usernames: string[], mode: 'add' | 'remove' | 'replace', role: 'viewer' | 'editor') => void;
  shareErr: string | null;
  authed: boolean;
  myProjects: Array<{ id: number; name: string }>;
}

const Sidebar: React.FC<SidebarProps> = ({
  info,
  projectId,
  setProjectId,
  onFile,
  loadProject,
  saveAsNewProject,
  saveAllToExisting,
  shareOpen,
  setShareOpen,
  projDetail,
  q,
  setQ,
  results,
  isOwner,
  mutateShare,
  shareErr,
  authed,
  myProjects,
}) => {
  // State to handle sidebar resizing
  const [sidebarWidth, setSidebarWidth] = useState(220);  // Initial width
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef<boolean>(false);

  // Handle mouse down event on the resize handle
  const onMouseDown = (e: React.MouseEvent) => {
    isResizingRef.current = true;
    const startX = e.clientX;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;

      const diff = moveEvent.clientX - startX;
      setSidebarWidth(prevWidth => Math.max(60, prevWidth + diff)); // Min width is 60px
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <aside
      ref={sidebarRef}
      style={{
        borderRight: "1px solid #e5e7eb",
        padding: 12,
        overflow: "auto",
        width: sidebarWidth, // Dynamic width based on the state
        transition: 'width 0.3s ease',
        position: 'relative', // Ensure that resize handle is positioned correctly
      }}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: "absolute",
          top: 0,
          right: -5,
          bottom: 0,
          width: "10px",
          cursor: "ew-resize",
          backgroundColor: "#ddd", // Slight color for visibility
        }}
      />

      {/* Sidebar Content */}
      <h2 style={{ marginTop: 0 }}>Project</h2>
      <input
        type="file"
        accept=".zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <p style={{ fontSize: 12, color: "#4b5563" }}>{info}</p>

      {/* Load existing */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
        <select
          value={projectId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              setProjectId(null);
              return;
            }
            loadProject(Number(v));
          }}
          style={{ fontSize: 12 }}
          title={authed ? "Load project" : "Sign in to load projects"}
          disabled={!authed}
        >
          <option value="">{authed ? "Load project…" : "Sign in to load…"}</option>
          {myProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Name + Save buttons + Share */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Project name"
          value={projDetail?.name || ""}
          onChange={(e) => setProjectId(Number(e.target.value))}
          style={{ fontSize: 12, padding: "4px 6px", width: 180 }}
          disabled={!authed}
        />
        <button onClick={saveAsNewProject} disabled={!authed}>
          Save as new
        </button>
        <button onClick={saveAllToExisting} disabled={!authed}>
          Save all
        </button>

        {/* Share button */}
        <button onClick={() => setShareOpen((o) => !o)} disabled={!authed || !projectId}>
          {shareOpen ? "Close sharing" : "Share…"}
        </button>
      </div>

      {/* Share panel */}
      {shareOpen && projectId && (
        <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Sharing for</div>
              <div style={{ fontWeight: 600 }}>{projDetail?.name ?? `Project #${projectId}`}</div>
            </div>
            <div style={{ fontSize: 12, textTransform: "capitalize", background: "#f3f4f6", borderRadius: 999, padding: "2px 8px" }}>
              {projDetail?.my_role ?? "—"}
            </div>
          </div>

          {shareErr && <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 12 }}>{shareErr}</div>}

          {/* Search */}
          <div style={{ marginTop: 12 }}>
            <label htmlFor="userSearch" style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
              Add people by username
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="userSearch"
                placeholder="Search usernames…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                disabled={!isOwner}
                style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px" }}
              />
            </div>
            {!!results.length && (
              <div style={{ border: "1px solid #eee", borderRadius: 8, marginTop: 8, maxHeight: 180, overflow: "auto" }}>
                {results.map((u) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderTop: "1px solid #eee" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 999, background: "#eee", display: "grid", placeItems: "center", fontSize: 12 }}>
                        {u.username[0]?.toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 600 }}>{u.username}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => mutateShare([u.username], "add", "viewer")}
                        disabled={!isOwner}
                      >
                        Add as viewer
                      </button>
                      <button
                        onClick={() => mutateShare([u.username], "add", "editor")}
                        disabled={!isOwner}
                      >
                        Add as editor
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
