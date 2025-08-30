// /frontend/app/graph/page.tsx
"use client";

import JSZip from "jszip";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as cytoscapeImport from "cytoscape";
const cytoscape = (cytoscapeImport as any).default ?? (cytoscapeImport as any);

// Parsing + path helpers moved to a separate module
import {
  ALLOWED_EXTS,
  CANDIDATE_RESOLVE_EXTS,
  TreeNode,
  extname,
  basename,
  resolveRelative,
  inferEdges,
  buildFunctionIndex,
  buildTree,
} from "./parsing";

// ------------------------------ Types & utils ------------------------------

// Persist x/y *and* hidden flag per node
type NodeState = { x?: number; y?: number; hidden?: boolean };
type PositionsMap = Record<string, NodeState>;

type CyElement = cytoscape.ElementDefinition;

// >>> Realtime peers for presence + cursors
type Peer = { id: number; username: string; color: string; x?: number; y?: number };

function TreeView({ node, onSelect }: { node: TreeNode; onSelect: (path: string) => void }) {
  if (!node.children) return null;
  return (
    <ul style={{ listStyle: "none", paddingLeft: 12 }}>
      {node.children.map((child) => (
        <li key={child.path}>
          {child.isDir ? (
            <details open>
              <summary style={{ cursor: "pointer" }}>{child.name}</summary>
              <TreeView node={child} onSelect={onSelect} />
            </details>
          ) : (
            <button
              onClick={() => onSelect(child.path)}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
              }}
              title={child.path}
            >
              {child.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------ SHARE ADDITIONS ------------------------------
type Role = "owner" | "editor" | "viewer" | "none";
type UserLite = { id: number; username: string };
type ProjectDetail = {
  id: number;
  name: string;
  owner: UserLite;
  editors: UserLite[];
  shared_with: UserLite[]; // viewers (may also include editors)
  my_role?: Role;
};

// ------------------------------ Inline code highlighter ------------------------------

function htmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function regexEscape(lit: string) {
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function highlightWithFunctions(
  path: string,
  code: string,
  funcIndex: { byFile?: Record<string, { declared: string[]; called: string[] }>; index?: any }
): string {
  const facts = funcIndex.byFile?.[path];
  const index = funcIndex.index || {};
  if (!facts) return htmlEscape(code);

  const declaredSet = new Set(facts.declared);
  const calledSet = new Set(facts.called);
  const names = Array.from(new Set([...facts.declared, ...facts.called].filter((n) => index[n])));
  if (names.length === 0) return htmlEscape(code);

  // Build a single regex of all names, word-boundary matched
  const re = new RegExp(`\\b(${names.map(regexEscape).join("|")})\\b`, "g");
  const escaped = htmlEscape(code);

  return escaped.replace(re, (m) => {
    const color = index[m]?.color || "#111827";
    const isDecl = declaredSet.has(m);
    const isCall = calledSet.has(m) && !isDecl;
    const role = isDecl ? "decl" : isCall ? "call" : "ref";
    const deco = isDecl ? " text-decoration: underline dotted;" : "";
    // Tag spans so we can anchor lines to the *actual* name positions
    return `<span data-func="${m}" data-role="${role}" data-path="${path}" style="color:${color};${deco}">${m}</span>`;
  });
}

function InlineEditor({
  path,
  value,
  onChange,
  onBlur,
  funcIndex,
  colorize,
}: {
  path: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  funcIndex: any;
  colorize: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const html = useMemo(
    () => (colorize ? highlightWithFunctions(path, value, funcIndex) : htmlEscape(value)),
    [colorize, path, value, funcIndex]
  );

  const onScroll = () => {
    const ta = taRef.current,
      pre = preRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  };

  useEffect(() => {
    const ta = taRef.current,
      pre = preRef.current;
    if (!ta || !pre) return;
    const sync = () => {
      pre.style.height = `${ta.clientHeight}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(ta);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <pre
        ref={preRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          margin: 0,
          padding: 8,
          overflow: "auto",
          whiteSpace: "pre",
          pointerEvents: "none",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          lineHeight: 1.35,
          visibility: colorize ? "visible" : "hidden",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        ref={taRef}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onScroll={onScroll}
        style={{
          position: "absolute",
          inset: 0,
          padding: 8,
          border: 0,
          outline: "none",
          resize: "none",
          background: "transparent",
          color: colorize ? "transparent" : "#111827",
          caretColor: "#111827",
          whiteSpace: "pre",
          overflow: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          lineHeight: 1.35,
        }}
      />
    </div>
  );
}

// ------------------------------ Page ------------------------------

export default function GraphPage() {
  // Graph state
  const [elements, setElements] = useState<CyElement[]>([]);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [info, setInfo] = useState<string>("Upload a .zip to begin");
  const [selected, setSelected] = useState<string | null>(null);

  // File contents (editable) + ref (handlers see latest)
  const [fileMap, setFileMap] = useState<Record<string, string>>({});
  const [funcIndex, setFuncIndex] = useState<any>({ byFile: {}, index: {} });
  const fileMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    fileMapRef.current = fileMap;
  }, [fileMap]);

  // Positions (+ hidden) persisted on save
  const positionsRef = useRef<PositionsMap>({});

  // Snapshot x/y + hidden per node
  function snapshotPositions(): PositionsMap {
    const cy = cyRef.current;
    const out: PositionsMap = {};
    if (!cy) return out;
    cy.nodes().forEach((n) => {
      const p = n.position();
      out[n.id()] = { x: p.x, y: p.y, hidden: n.hidden() };
    });
    return out;
  }

  // Auth/persistence
  const [authed, setAuthed] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [myProjects, setMyProjects] = useState<Array<{ id: number; name: string }>>([]);

  // ------------------------------ SHARE ADDITIONS ------------------------------
  const [shareOpen, setShareOpen] = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [projDetail, setProjDetail] = useState<ProjectDetail | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);
  const isOwner = projDetail?.my_role === "owner";

  const collab = useMemo(() => {
    if (!projDetail) return { editors: [] as UserLite[], viewers: [] as UserLite[] };
    const editorIds = new Set(projDetail.editors.map((u) => u.id));
    const viewersOnly = projDetail.shared_with.filter((u) => !editorIds.has(u.id));
    return { editors: projDetail.editors, viewers: viewersOnly };
  }, [projDetail]);

  async function fetchProjectDetail() {
    if (!projectId) return;
    try {
      setShareErr(null);
      const r = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      setProjDetail(await r.json());
    } catch (e: any) {
      setShareErr(e?.message || "Failed to load collaborators");
    }
  }

  useEffect(() => {
    if (shareOpen) fetchProjectDetail();
  }, [shareOpen, projectId]);

  // debounce user search
  useEffect(() => {
    const h = setTimeout(async () => {
      if (!shareOpen) return;
      const qq = q.trim();
      if (!qq) return setResults([]);
      try {
        setShareErr(null);
        const r = await fetch(`/api/auth/users/search/?q=${encodeURIComponent(qq)}`);
        if (!r.ok) throw new Error(await r.text());
        const list: UserLite[] = await r.json();
        const skip = new Set<number>([
          projDetail?.owner.id ?? -1,
          ...(projDetail?.shared_with ?? []).map((u) => u.id),
        ]);
        setResults(list.filter((u) => !skip.has(u.id)));
      } catch (e: any) {
        setShareErr(e?.message || "Search failed");
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q, shareOpen, projDetail]);

  async function mutateShare(usernames: string[], mode: "add" | "remove" | "replace", role: "viewer" | "editor") {
    if (!projectId) return;
    setShareBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/share/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames, mode, role }),
      });
      if (!r.ok) throw new Error(await r.text());
      await fetchProjectDetail();
      setQ(""); setResults([]);
    } catch (e: any) {
      try {
        const obj = JSON.parse(e.message);
        if (typeof obj?.detail === "string") setShareErr(obj.detail);
        else if (Array.isArray(obj?.missing)) setShareErr(`Missing: ${obj.missing.join(", ")}`);
        else setShareErr(e.message);
      } catch { setShareErr(e.message); }
    } finally {
      setShareBusy(false);
    }
  }

  // multi-popups that follow nodes; editable
  type Popup = { path: string; x: number; y: number; draft: string; dirty: boolean; w?: number; h?: number };
  const [popups, setPopups] = useState<Popup[]>([]);
  const popupsRef = useRef<Popup[]>([]);
  useEffect(() => {
    popupsRef.current = popups;
  }, [popups]);

  // Per-popup line toggles + global toggle
  const [showLinesGlobal, setShowLinesGlobal] = useState(false);
  const [popupLinesEnabled, setPopupLinesEnabled] = useState<Record<string, boolean>>({});
  const anyPopupLineOn = Object.values(popupLinesEnabled).some(Boolean);
  const overlayEnabled = showLinesGlobal || anyPopupLineOn;

  // NEW: global code coloration toggle (OFF by default)
  const [colorizeFunctions, setColorizeFunctions] = useState(false);

  // keep popupLinesEnabled keys pruned to open popups
  useEffect(() => {
    setPopupLinesEnabled((prev) => {
      const open = new Set(popups.map((p) => p.path));
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) if (open.has(k)) next[k] = prev[k];
      return next;
    });
  }, [popups]);

  // If global is ON and new popups open, ensure they are ON too
  useEffect(() => {
    if (!showLinesGlobal) return;
    setPopupLinesEnabled((prev) => {
      const next = { ...prev };
      for (const p of popups) next[p.path] = true;
      return next;
    });
  }, [showLinesGlobal, popups]);

  // Cytoscape refs
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Styles: tiny nodes
  const cyStylesheet = useMemo<cytoscape.Stylesheet[]>(
    () => [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "font-size": 8,
          "text-valign": "center",
          "text-halign": "center",
          width: 14,
          height: 14,
        },
      },
      { selector: "edge", style: { width: 1, "curve-style": "bezier", "target-arrow-shape": "triangle" } },
      { selector: "node:selected", style: { "border-width": 2, "border-color": "#2563eb" } },
      { selector: "node[?hidden]", style: { opacity: 0.2 } },
    ],
    []
  );

  // Load my projects list (guest-friendly, silent refresh)
  useEffect(() => {
    (async () => {
      try {
        let r = await fetch("/api/projects", { cache: "no-store" });
        if (r.status === 401) {
          const rr = await fetch("/api/auth/refresh", { method: "POST" });
          if (rr.ok) r = await fetch("/api/projects", { cache: "no-store" });
        }
        if (r.ok) {
          const items = await r.json();
          setMyProjects(items.map((p: any) => ({ id: p.id, name: p.name })));
          setAuthed(true);
        } else {
          setAuthed(false);
        }
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  // ------------------------------ Realtime: state & connection ------------------------------
  const [me, setMe] = useState<{ id: number; username: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const applyingRemotePopupRef = useRef(false);
  const peersRef = useRef<Map<number, Peer>>(new Map());
  const [peers, setPeers] = useState<Peer[]>([]);
  // NEW: debounce timers per open path for text edits
  const textTimersRef = useRef<Map<string, number>>(new Map());
  // NEW: latest remote drafts per path so late-opened popups get current text
  const remoteDraftsRef = useRef<Record<string, string>>({});

  // who am I (for ignoring echoes)
  useEffect(() => {
    (async () => {
      if (!authed) { setMe(null); return; }
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        if (r.ok) {
          const u = await r.json();
          setMe({ id: u.id, username: u.username });
        } else {
          setMe(null);
        }
      } catch { setMe(null); }
    })();
  }, [authed]);

  // Open WebSocket for this project
  useEffect(() => {
    if (!authed || !projectId) {
      if (wsRef.current) try { wsRef.current.close(); } catch {};
      wsRef.current = null; wsReadyRef.current = false;
      peersRef.current.clear(); setPeers([]);
      return;
    }

    const proto = (typeof location !== "undefined" && location.protocol === "https:") ? "wss" : "ws";
    const base = (process.env.NEXT_PUBLIC_DJANGO_WS_BASE as string | undefined) || `${proto}://${location.host}`;
    const url = `${base}/ws/projects/${projectId}/`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => { wsReadyRef.current = true; };
    ws.onclose = () => { wsReadyRef.current = false; peersRef.current.clear(); setPeers([]); };
    ws.onerror = () => { /* noop */ };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === "presence_state") {
          const map = new Map<number, Peer>();
          for (const p of msg.peers as Peer[]) map.set(p.id, p);
          peersRef.current = map;
          setPeers(Array.from(map.values()));
        } else if (msg.type === "presence_join") {
          const p: Peer = msg.peer;
          peersRef.current.set(p.id, p);
          setPeers(Array.from(peersRef.current.values()));
        } else if (msg.type === "presence_leave") {
          const id: number = msg.peer?.id;
          peersRef.current.delete(id);
          setPeers(Array.from(peersRef.current.values()));
        } else if (msg.type === "cursor") {
          const id: number | null = msg.peer_id ?? null;
          const data = msg.data || {};
          if (id != null) {
            const prev = peersRef.current.get(id);
            if (prev) {
              peersRef.current.set(id, { ...prev, x: data.x, y: data.y });
              setPeers(Array.from(peersRef.current.values()));
            }
          }
        } else if (msg.type === "node_move") {
          const { path, x, y, by } = msg.data || {};
          if (!path || by === me?.id) return; // ignore own echoes
          const cy = cyRef.current;
          if (!cy) return;
          const node = cy.getElementById(path);
          if (node && (node as any).length) {
            applyingRemoteRef.current = true;
            node.position({ x, y });
            applyingRemoteRef.current = false;
          }
        } else if (msg.type === "node_visibility") {
          const { path, hidden, by } = msg.data || {};
          if (!path || by === me?.id) return;
          const cy = cyRef.current;
          if (!cy) return;
          const node = cy.$id(path);
          if (!node.length) return;

          if (hidden) {
            node.hide();
            node.connectedEdges().hide();
            setPopups((cur) => cur.filter((pp) => pp.path !== path));
            setSelected((sel) => (sel === path ? null : sel));
            // clear per-popup toggle
            setPopupLinesEnabled((prev) => {
              if (!(path in prev)) return prev;
              const n = { ...prev }; delete n[path]; return n;
            });
            // clear pending text broadcasts
            const t = textTimersRef.current.get(path);
            if (t) { window.clearTimeout(t); textTimersRef.current.delete(path); }
          } else {
            node.show();
            node.connectedEdges().forEach((e) => {
              if (!e.source().hidden() && !e.target().hidden()) e.show();
            });
          }
          positionsRef.current[path] = { ...(positionsRef.current[path] || {}), hidden: !!hidden };
        } else if (msg.type === "popup_open") {
          const { path, by } = msg.data || {};
          if (!path || by === me?.id) return;
          const cy = cyRef.current;
          if (!cy) return;
          const node = cy.$id(path);
          if (!node.length) return;
          const rp = node.renderedPosition();
          const code = (remoteDraftsRef.current[path] != null) ? remoteDraftsRef.current[path] : (fileMapRef.current[path] ?? "");
          setPopups((cur) => (cur.some((p) => p.path === path) ? cur : [...cur, { path, x: rp.x, y: rp.y, draft: code, dirty: false }]));
        } else if (msg.type === "popup_close") {
          const { path, by } = msg.data || {};
          if (!path || by === me?.id) return;
          setPopups((cur) => cur.filter((p) => p.path !== path));
          setSelected((sel) => (sel === path ? null : sel));
          setPopupLinesEnabled((prev) => { if (!(path in prev)) return prev; const n = { ...prev }; delete n[path]; return n; });
          const t = textTimersRef.current.get(path);
          if (t) { window.clearTimeout(t); textTimersRef.current.delete(path); }
        } else if (msg.type === "popup_resize") {
          const { path, w, h, by } = msg.data || {};
          if (!path || by === me?.id) return;
          applyingRemotePopupRef.current = true;
          setPopups((cur) =>
            cur.map((p) => (p.path === path ? { ...p, w: Number(w) || undefined, h: Number(h) || undefined } : p))
          );
          // keep guard for two RAFs to avoid echo
          requestAnimationFrame(() => {
            requestAnimationFrame(() => { applyingRemotePopupRef.current = false; });
          });
        }
        // --- NEW: per-popup lines toggle from peers
        else if (msg.type === "popup_lines") {
          const { path, enabled, by } = msg.data || {};
          if (!path || by === me?.id) return;
          setPopupLinesEnabled(prev => ({ ...prev, [path]: !!enabled }));
        }
        // --- NEW: global lines toggle from peers
        else if (msg.type === "popup_lines_global") {
          const { enabled, by } = msg.data || {};
          if (by === me?.id) return;
          const on = !!enabled;
          setShowLinesGlobal(on);
          setPopupLinesEnabled(() => {
            if (!on) return {};
            const m: Record<string, boolean> = {};
            for (const p of popupsRef.current) m[p.path] = true;
            return m;
          });
        }
        // --- NEW: text edit broadcast from peers
        else if (msg.type === "text_edit" || msg.type === "text_change" || msg.type === "text_update") {
          const { path, content, by } = msg.data || {};
          if (!path || by === me?.id) return;
          remoteDraftsRef.current[path] = String(content ?? "");
          setPopups((cur) => cur.map((p) => (p.path === path ? { ...p, draft: remoteDraftsRef.current[path], dirty: true } : p)));
        }
      } catch {}
    };

    return () => { try { ws.close(); } catch {}; wsRef.current = null; wsReadyRef.current = false; };
  }, [authed, projectId, me?.id]);

  // Create cy once (strict-mode safe)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (cyRef.current) {
      try {
        cyRef.current.stop();
        cyRef.current.destroy();
      } catch {}
      cyRef.current = null;
    }

    const cy = cytoscape({
      container,
      elements: [],
      style: cyStylesheet as any,
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    // Node click → toggle popup (+ broadcast)
    const onTapNode = (evt: any) => {
      const id: string = evt.target.id();
      const node = cy.$id(id);
      if (!node.length) return;

      const ws = wsRef.current;
      const existing = popupsRef.current.find((p) => p.path === id);

      if (existing) {
        if (existing.dirty) savePopup(id);
        setPopups((cur) => cur.filter((p) => p.path !== id));
        setPopupLinesEnabled((prev) => { if (!(id in prev)) return prev; const n = { ...prev }; delete n[id]; return n; });
        const t = textTimersRef.current.get(id);
        if (t) { window.clearTimeout(t); textTimersRef.current.delete(id); }
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "popup_close", path: id }));
        return;
      }

      const rp = node.renderedPosition();
      const code = (remoteDraftsRef.current[id] != null) ? remoteDraftsRef.current[id] : (fileMapRef.current[id] ?? "");
      setPopups((cur) => [...cur, { path: id, x: rp.x, y: rp.y, draft: code, dirty: false }]);
      setSelected(id);
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "popup_open", path: id }));
    };
    cy.on("tap", "node", onTapNode);

    // Popups follow nodes on pan/zoom/move
    let raf = 0;
    const scheduleFollow = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next: Popup[] = [];
        const byPath = new Map(popupsRef.current.map((p) => [p.path, p]));
        for (const p of popupsRef.current) {
          const n = cy.$id(p.path);
          if (!n.length) continue;
          const rp = n.renderedPosition();
          const prev = byPath.get(p.path)!;
          next.push({ ...prev, x: rp.x, y: rp.y });
        }
        setPopups((prev) => {
          if (prev.length !== next.length) return next;
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i], b = next[i];
            if (a.path !== b.path || a.x !== b.x || a.y !== b.y || a.draft !== b.draft || a.dirty !== b.dirty || a.w !== b.w || a.h !== b.h) return next;
          }
          return prev;
        });
      });
    };

    const ro = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 20);
      scheduleFollow();
    });
    ro.observe(container);

    cy.on("pan zoom", scheduleFollow);
    cy.on("position", "node", scheduleFollow);

    return () => {
      try {
        ro.disconnect();
        cy.off("tap", "node", onTapNode);
        cy.off("pan zoom", scheduleFollow);
        cy.off("position", "node", scheduleFollow);
        cy.stop();
        cy.destroy();
      } catch {}
      cancelAnimationFrame(raf);
      cyRef.current = null;
    };
  }, [cyStylesheet]);

  // Apply elements (only relayout here)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.startBatch();
    try {
      cy.elements().remove();
      if (elements.length) cy.add(elements);
    } finally {
      cy.endBatch();
    }

    if (elements.length) {
      const hasAnyPositions = elements.some((el: any) => (el as any).position);
      if (hasAnyPositions) {
        cy.fit(undefined, 20);
      } else {
        cy.layout({ name: "cose" }).run();
        cy.fit(undefined, 20);
      }
    }

    // Apply hidden/show from persisted positions
    Object.entries(positionsRef.current).forEach(([id, st]) => {
      if (!st) return;
      const n = cy.$id(id);
      if (!n.length) return;
      if (st.hidden) n.hide();
      else n.show();
    });

    // prune popups for removed nodes
    setPopups((cur) => cur.filter((p) => cy.$id(p.path).length > 0));
  }, [elements]);

  // Outside clicks: save any dirty popup that didn't receive the click
  useEffect(() => {
    const onDownCapture = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-popup-path]"));
      const dirties = popupsRef.current.filter((p) => p.dirty);
      if (!dirties.length) return;

      for (const p of dirties) {
        const root = roots.find((el) => el.dataset.popupPath === p.path);
        if (root && target && root.contains(target)) continue; // clicked inside
        savePopup(p.path);
      }
    };
    document.addEventListener("mousedown", onDownCapture, true);
    return () => document.removeEventListener("mousedown", onDownCapture, true);
  }, []);

  // ------------------------------ Persistence helpers ------------------------------

  async function saveAsNewProject() {
    const files = Object.entries(fileMapRef.current).map(([path, content]) => ({ path, content }));
    if (!projectName.trim()) {
      alert("Give your project a name first");
      return;
    }
    const positions = snapshotPositions(); // includes hidden
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName.trim(), files, positions }),
    });
    if (!r.ok) {
      alert("Failed to create project");
      return;
    }
    const data = await r.json();
    setProjectId(data.id);
    setMyProjects((cur) => [{ id: data.id, name: data.name }, ...cur.filter((p) => p.id !== data.id)]);
    setInfo(`Saved as project #${data.id} (layout included)`);
  }

  async function saveAllToExisting() {
    if (!projectId) return saveAsNewProject();
    const files = Object.entries(fileMapRef.current).map(([path, content]) => ({ path, content }));

    // Save files
    const r = await fetch(`/api/projects/${projectId}/files/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });

    // Save current node positions (+ hidden) on the project
    const rp = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions: snapshotPositions() }),
    });

    setInfo(r.ok && rp.ok ? "All changes & layout saved" : "Save failed (files or layout)");
  }

  async function loadProject(id: number) {
    const r = await fetch(`/api/projects/${id}`);
    if (!r.ok) {
      alert("Failed to load project");
      return;
    }
    const proj = await r.json();
    setProjectId(proj.id);
    setProjectName(proj.name);

    // restore positions (+ hidden)
    positionsRef.current = (proj.positions ?? {}) as PositionsMap;

    const newMap: Record<string, string> = {};
    for (const f of proj.files || []) newMap[f.path] = f.content ?? "";
    fileMapRef.current = newMap;
    setFileMap(newMap);

    const files = Object.entries(newMap).map(([path, content]) => ({ path, content }));

    // compute function facts/index for loaded project
    const built = buildFunctionIndex(files);

    // nodes: attach saved x/y if present (hidden applied after render) + declared/called
    const nodes: CyElement[] = files.map(({ path }) => {
      const pos = positionsRef.current[path];
      const facts = built.byFile[path] || { declared: [], called: [] };
      const el: any = {
        data: { id: path, label: basename(path), ext: extname(path), declared: facts.declared, called: facts.called },
        group: "nodes" as const,
      };
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") el.position = { x: pos.x, y: pos.y };
      return el;
    });

    const pathSet = new Set(files.map((f) => f.path));
    const edges: CyElement[] = [];
    for (const f of files) {
      const refs = inferEdges(f.path, f.content || "");
      for (const rr of refs) {
        const resolved = resolveRelative(f.path, rr);
        if (!resolved) continue;
        if (pathSet.has(resolved)) edges.push({ data: { id: `${f.path}=>${resolved}`, source: f.path, target: resolved }, group: "edges" });
        else {
          for (const ext of CANDIDATE_RESOLVE_EXTS) {
            const cand = `${resolved}${ext}`;
            if (pathSet.has(cand)) {
              edges.push({ data: { id: `${f.path}=>${cand}`, source: f.path, target: cand }, group: "edges" });
              break;
            }
          }
        }
      }
    }

    setElements([...nodes, ...edges]);
    setTree(buildTree(files.map((f) => f.path)));
    setFuncIndex(built); // keep both byFile + index
    setInfo(`Loaded project "${proj.name}" (${files.length} files${Object.keys(positionsRef.current).length ? ", layout restored" : ""})`);
    setPopups([]);
    setSelected(null);
    setPopupLinesEnabled({}); // clear per-popup toggles when switching projects
    setShowLinesGlobal(false);
    setColorizeFunctions(false); // reset coloration to default OFF on load
  }

  // Save popup contents: update fileMap + surgically update edges and function facts in cy (no relayout)
  const savePopup = useCallback(
    (path: string) => {
      const cy = cyRef.current;
      const popup = popupsRef.current.find((pp) => pp.path === path);
      if (!popup) return;

      const draft = popup.draft;
      if (draft !== fileMapRef.current[path]) {
        // update file map
        const newMap = { ...fileMapRef.current, [path]: draft };
        fileMapRef.current = newMap;
        setFileMap(newMap);

        // --- recompute function index across all files (so colors stay correct)
        const filesAll = Object.entries(newMap).map(([p, content]) => ({ path: p, content }));
        const built = buildFunctionIndex(filesAll);
        setFuncIndex(built);

        // update node data for declared/called
        if (cy) {
          cy.nodes().forEach((n) => {
            const pth = n.id();
            const facts = built.byFile[pth] || { declared: [], called: [] };
            n.data("declared", facts.declared);
            n.data("called", facts.called);
          });
        }

        // recompute edges from this file
        const refs = inferEdges(path, draft);
        const newEdges: CyElement[] = [];

        if (cy) {
          const nodeIds = new Set<string>(cy.nodes().map((n) => n.id()));
          for (const r of refs) {
            const resolved = resolveRelative(path, r);
            if (!resolved) continue;

            let target: string | null = null;
            if (nodeIds.has(resolved)) {
              target = resolved;
            } else {
              for (const ext of CANDIDATE_RESOLVE_EXTS) {
                const cand = `${resolved}${ext}`;
                if (nodeIds.has(cand)) {
                  target = cand;
                  break;
                }
              }
            }

            if (target) {
              newEdges.push({ data: { id: `${path}=>${target}`, source: path, target } });
            }
          }

          // update edges for this source only
          cy.startBatch();
          try {
            cy.edges().filter((e) => e.data("source") === path).remove();
            if (newEdges.length) cy.add(newEdges);
          } finally {
            cy.endBatch();
          }
        }

        // Persist to backend if project loaded AND authed
        if (projectId && authed) {
          fetch(`/api/projects/${projectId}/file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, content: draft }),
          }).catch(() => {});
        }
      }

      // mark popup as saved
      setPopups((cur) => cur.map((pp) => (pp.path === path ? { ...pp, dirty: false } : pp)));
    },
    [projectId, authed]
  );

  // Toggle node visibility from the tree (no zoom jump) + broadcast
  const toggleVisibilityFromTree = (id: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const node = cy.$id(id);
    if (!node.length) return;

    const isHidden = (node as any).hidden ? (node as any).hidden() : node.style("display") === "none";
    const ws = wsRef.current;

    if (isHidden) {
      // SHOW
      node.show();
      node.connectedEdges().forEach((e) => {
        if (!e.source().hidden() && !e.target().hidden()) e.show();
      });
      positionsRef.current[id] = { ...(positionsRef.current[id] || {}), hidden: false };
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "node_visibility", path: id, hidden: false }));
      cy.animate({ center: { eles: node }, duration: 250, easing: "ease-in-out" });
      setSelected(id);
    } else {
      // HIDE
      node.hide();
      node.connectedEdges().hide();
      positionsRef.current[id] = { ...(positionsRef.current[id] || {}), hidden: true };

      const popped = popupsRef.current.find((pp) => pp.path === id);
      if (popped && popped.dirty) savePopup(id);
      setPopups((cur) => cur.filter((pp) => pp.path !== id));
      setPopupLinesEnabled((prev) => { if (!(id in prev)) return prev; const n = { ...prev }; delete n[id]; return n; });
      const t = textTimersRef.current.get(id); if (t) { window.clearTimeout(t); textTimersRef.current.delete(id); }
      if (selected === id) setSelected(null);

      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "node_visibility", path: id, hidden: true }));
    }
  };

  // Parse a zip, build files → nodes/edges
  const onFile = useCallback(async (file: File) => {
    setInfo("Parsing zip…");
    const zip = await JSZip.loadAsync(file);

    const files: { path: string; content: string }[] = [];
    await Promise.all(
      Object.values(zip.files).map(async (entry: any) => {
        if (entry.dir) return;
        const path = entry.name.replace(/\\/g, "/");
        const ext = extname(path);
        if (!ALLOWED_EXTS.has(ext)) return;
        const text = await entry.async("string");
        files.push({ path, content: text });
      })
    );

    // content map
    const map: Record<string, string> = {};
    for (const f of files) map[f.path] = f.content;
    fileMapRef.current = map;
    setFileMap(map);

    // reset positions for a fresh upload (not a saved project)
    positionsRef.current = {};

    // build function index
    const built = buildFunctionIndex(files);
    setFuncIndex(built);

    // nodes with declared/called
    const nodes: CyElement[] = files.map(({ path }) => {
      const facts = built.byFile[path] || { declared: [], called: [] };
      return {
        data: { id: path, label: basename(path), ext: extname(path), declared: facts.declared, called: facts.called },
        group: "nodes",
      };
    });

    // edges
    const pathSet = new Set(files.map((f) => f.path));
    const edges: CyElement[] = [];
    for (const f of files) {
      const refs = inferEdges(f.path, f.content || "");
      for (const r of refs) {
        const resolved = resolveRelative(f.path, r);
        if (!resolved) continue;
        if (pathSet.has(resolved)) {
          edges.push({ data: { id: `${f.path}=>${resolved}`, source: f.path, target: resolved }, group: "edges" });
        } else {
          for (const ext of CANDIDATE_RESOLVE_EXTS) {
            const cand = `${resolved}${ext}`;
            if (pathSet.has(cand)) {
              edges.push({ data: { id: `${f.path}=>${cand}`, source: f.path, target: cand }, group: "edges" });
              break;
            }
          }
        }
      }
    }

    setElements([...nodes, ...edges]);
    setTree(buildTree(files.map((f) => f.path)));
    setInfo(`${files.length} files, ${edges.length} relations`);
    setSelected(null);
    setPopups([]); // clear old popups
    setProjectId(null);
    setProjectName(file.name.replace(/\.zip$/i, "") || "My Project");
    setPopupLinesEnabled({});
    setShowLinesGlobal(false);
    setColorizeFunctions(false); // reset coloration to default OFF on new upload
  }, []);

  // ------------------------------ Realtime: broadcast drags + cursors ------------------------------
  // Hook node drag events to broadcast positions (attach regardless of WS timing)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    let raf = 0;
    const send = (id: string, pos: {x:number; y:number}) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "node_move", path: id, x: pos.x, y: pos.y }));
    };

    const onDrag = (evt: any) => {
      if (applyingRemoteRef.current) return;
      const id = evt.target.id();
      const p = evt.target.position();
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; send(id, p); });
    };
    const onDragfree = (evt: any) => {
      if (applyingRemoteRef.current) return;
      const id = evt.target.id();
      const p = evt.target.position();
      send(id, p);
    };

    cy.on("drag", "node", onDrag);
    cy.on("dragfree", "node", onDragfree);

    return () => {
      try {
        cy.off("drag", "node", onDrag);
        cy.off("dragfree", "node", onDragfree);
      } catch {}
      cancelAnimationFrame(raf);
    };
  }, [projectId]);

  // Send cursor positions over WS (attach regardless of WS timing)
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let raf = 0;
    let last = { x: 0, y: 0 };
    const onMove = (e: MouseEvent) => {
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      last = { x, y };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          const ws = wsRef.current;
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "cursor", x: last.x, y: last.y }));
          }
        });
      }
    };

    root.addEventListener("mousemove", onMove);
    return () => { root.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, [projectId]);

  // ------------------------------ Popup Resize Sync ------------------------------
  const resizeObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  const resizeRAFRef = useRef<Map<string, number>>(new Map());

  // small helper for attribute selectors (paths)
  function cssAttrEscape(v: string) {
    return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  useEffect(() => {
    // Detach observers for closed popups
    for (const [path, obs] of resizeObserversRef.current) {
      if (!popupsRef.current.some((p) => p.path === path)) {
        obs.disconnect();
        resizeObserversRef.current.delete(path);
      }
    }

    // Attach observers for open popups
    for (const p of popupsRef.current) {
      if (resizeObserversRef.current.has(p.path)) continue;
      const el = document.querySelector<HTMLElement>(`[data-popup-path="${cssAttrEscape(p.path)}"]`);
      if (!el) continue;

      const obs = new ResizeObserver(() => {
        if (applyingRemotePopupRef.current) return; // don't echo remote changes

        const rect = el.getBoundingClientRect(); // border-box size
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);

        const cur = popupsRef.current.find((x) => x.path === p.path);
        if (!cur) return;

        const dw = Math.abs((cur.w ?? 0) - w);
        const dh = Math.abs((cur.h ?? 0) - h);
        if ((cur.w != null && dw < 1) && (cur.h != null && dh < 1)) return; // ignore jitter

        const prevId = resizeRAFRef.current.get(p.path);
        if (prevId) cancelAnimationFrame(prevId);
        const rafId = requestAnimationFrame(() => {
          setPopups((list) => list.map((x) => (x.path === p.path ? { ...x, w, h } : x)));
          const ws = wsRef.current;
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "popup_resize", path: p.path, w, h }));
          }
        });
        resizeRAFRef.current.set(p.path, rafId);
      });

      obs.observe(el);
      resizeObserversRef.current.set(p.path, obs);
    }

    return () => {
      for (const [, obs] of resizeObserversRef.current) obs.disconnect();
      resizeObserversRef.current.clear();
      for (const [, id] of resizeRAFRef.current) cancelAnimationFrame(id);
      resizeRAFRef.current.clear();
    };
  }, [popups]);

  // ------------------------------ CALLER⇢DECLARER POPUP LINK OVERLAY ------------------------------

  // portal mount guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Robust CSS.escape fallback for [data-func="<name>"]
  const cssEscape = (val: string) => {
    // @ts-ignore
    return (window as any).CSS?.escape ? (window as any).CSS.escape(val) : val.replace(/"/g, '\\"');
  };

  type PopupLink = { x1: number; y1: number; x2: number; y2: number; label: string; color: string };
  const [popupLinks, setPopupLinks] = useState<PopupLink[]>([]);

  useEffect(() => {
    if (!overlayEnabled) { setPopupLinks([]); return; }

    let raf = 0;

    // Build the single-line string of the span's row and check for imports
    const lineTextAroundSpan = (span: HTMLElement, pre: HTMLElement) => {
      try {
        const before = document.createRange();
        before.setStart(pre, 0);
        before.setEnd(span, 0);
        const beforeText = before.toString();

        const after = document.createRange();
        after.setStartAfter(span);
        after.setEnd(pre, pre.childNodes.length);
        const afterText = after.toString();

        const start = beforeText.lastIndexOf("\n") + 1;
        const endRel = afterText.indexOf("\n");
        const line =
          beforeText.slice(start) +
          (span.textContent ?? "") +
          (endRel >= 0 ? afterText.slice(0, endRel) : afterText);
        return line;
      } catch {
        return "";
      }
    };

    // find the "best" span for a function inside a popup, preferring role-specific, then any,
    // and skipping import/from lines (Python).
    const findFuncPoint = (popupPath: string, funcName: string, role: "call" | "decl"): { x: number; y: number } | null => {
      const root = document.querySelector<HTMLElement>(`[data-popup-path="${cssAttrEscape(popupPath)}"]`);
      if (!root) return null;
      const pre = root.querySelector<HTMLElement>("pre");
      if (!pre) return null;

      const nameEsc = cssEscape(funcName);
      const selectors = [
        `[data-func="${nameEsc}"][data-role="${role}"]`,
        `[data-func="${nameEsc}"]`,
      ];

      for (const sel of selectors) {
        const spans = Array.from(root.querySelectorAll<HTMLElement>(sel));
        for (const span of spans) {
          const line = lineTextAroundSpan(span, pre).trim();
          if (/^(import|from)\b/.test(line)) continue; // skip python import lines
          const r = span.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      return null;
    };

    const tick = () => {
      try {
        const links: PopupLink[] = [];
        if (!popupsRef.current.length) { setPopupLinks(links); return; }

        const byFile: Record<string, { declared: string[]; called: string[] }> = funcIndex?.byFile || {};
        const paletteByName: Record<string, { color?: string }> = funcIndex?.index || {};

        // fallback anchors on popup edges
        const rects = new Map<string, DOMRect>();
        for (const p of popupsRef.current) {
          const el = document.querySelector<HTMLElement>(`[data-popup-path="${cssAttrEscape(p.path)}"]`);
          if (!el) continue;
          rects.set(p.path, el.getBoundingClientRect());
        }
        const anchorRight = (r: DOMRect) => ({ x: r.left + r.width - 8, y: r.top + r.height / 2 });
        const anchorLeft  = (r: DOMRect) => ({ x: r.left + 8,           y: r.top + r.height / 2 });

        const isOn = (path: string) => !!popupLinesEnabled[path];

        // for each ordered pair (A calls → B declares)
        for (let i = 0; i < popupsRef.current.length; i++) {
          const A = popupsRef.current[i];
          const factsA = byFile[A.path] || { declared: [], called: [] };
          const rectA = rects.get(A.path);
          if (!rectA) continue;

          for (let j = 0; j < popupsRef.current.length; j++) {
            if (i === j) continue;
            const B = popupsRef.current[j];
            const rectB = rects.get(B.path);
            if (!rectB) continue;
            const factsB = byFile[B.path] || { declared: [], called: [] };

            // respect toggles: include pair only if global OR either popup is toggled on
            if (!showLinesGlobal && !isOn(A.path) && !isOn(B.path)) continue;

            const match = new Set(factsA.called.filter((n) => factsB.declared.includes(n)));
            if (match.size === 0) continue;

            const names = Array.from(match).sort((a, b) => a.localeCompare(b));

            names.forEach((name, k) => {
              const color = paletteByName[name]?.color || "#111827";

              const src = findFuncPoint(A.path, name, "call") || anchorRight(rectA);
              const dst = findFuncPoint(B.path, name, "decl") || anchorLeft(rectB);

              // small vertical deflection if there are multiple lines for readability
              const yOffset = (k - (names.length - 1) / 2) * 8;

              links.push({
                x1: src.x, y1: src.y + yOffset,
                x2: dst.x, y2: dst.y + yOffset,
                label: name,
                color,
              });
            });
          }
        }

        setPopupLinks(links);
      } finally {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [funcIndex, popups, showLinesGlobal, popupLinesEnabled, overlayEnabled]);

  // ------------------------------ Text edit broadcasting (debounced) ------------------------------
  const scheduleTextSend = useCallback((path: string, content: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const timers = textTimersRef.current;
    const existing = timers.get(path);
    if (existing) window.clearTimeout(existing);
    const id = window.setTimeout(() => {
      try {
        ws.send(JSON.stringify({ type: "text_edit", path, content }));
      } finally {
        timers.delete(path);
      }
    }, 150);
    timers.set(path, id);
  }, []);

  // ------------------------------ Render ------------------------------

  // helper to broadcast per-popup toggle
  const sendPopupLines = (path: string, enabled: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "popup_lines", path, enabled }));
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 28vw) minmax(0,1fr)",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 12, overflow: "auto" }}>
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
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={{ fontSize: 12, padding: "4px 6px", width: 180 }}
            title="Project name"
            disabled={!authed}
          />
          <button
            onClick={saveAsNewProject}
            style={{ fontSize: 12 }}
            title={authed ? "Save as new project" : "Sign in to save"}
            disabled={!authed}
          >
            Save as new
          </button>
          <button
            onClick={saveAllToExisting}
            style={{ fontSize: 12 }}
            title={authed ? "Save all changes" : "Sign in to save"}
            disabled={!authed}
          >
            Save all
          </button>

          {/* Share button */}
          <button
            onClick={() => setShareOpen((o) => !o)}
            disabled={!authed || !projectId}
            style={{ fontSize: 12, border: "1px solid #ddd", padding: "4px 8px", borderRadius: 8, background: "white" }}
            title={projectId ? "Share this project" : "Save or load a project to share"}
          >
            {shareOpen ? "Close sharing" : "Share…"}
          </button>
        </div>

        {!authed && (
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            <a href="/login">Sign in</a> to enable saving/loading projects.
          </p>
        )}

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
                  disabled={!isOwner || shareBusy}
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
                          disabled={!isOwner || shareBusy}
                          style={{ border: "1px solid #ddd", background: "white", padding: "6px 10px", borderRadius: 6 }}
                        >
                          Add as viewer
                        </button>
                        <button
                          onClick={() => mutateShare([u.username], "add", "editor")}
                          disabled={!isOwner || shareBusy}
                          style={{ border: "1px solid #ddd", background: "white", padding: "6px 10px", borderRadius: 6 }}
                        >
                          Add as editor
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Editors */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600 }}>Editors</div>
              <div style={{ border: "1px solid #eee", borderRadius: 8, marginTop: 6 }}>
                {(!collab.editors.length) && <div style={{ padding: 8, color: "#6b7280", fontSize: 14 }}>No editors yet.</div>}
                {collab.editors.map((u) => (
                  <Row
                    key={u.id}
                    u={u}
                    role="editor"
                    canEdit={!!isOwner && !shareBusy}
                    onRemove={() => mutateShare([u.username], "remove", "editor")}
                    onRoleChange={(newRole) => {
                      if (newRole === "viewer") mutateShare([u.username], "remove", "editor"); // demote
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Viewers */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600 }}>Viewers</div>
              <div style={{ border: "1px solid #eee", borderRadius: 8, marginTop: 6 }}>
                {(!collab.viewers.length) && <div style={{ padding: 8, color: "#6b7280", fontSize: 14 }}>No viewers yet.</div>}
                {collab.viewers.map((u) => (
                  <Row
                    key={u.id}
                    u={u}
                    role="viewer"
                    canEdit={!!isOwner && !shareBusy}
                    onRemove={() => mutateShare([u.username], "remove", "viewer")}
                    onRoleChange={(newRole) => {
                      if (newRole === "editor") mutateShare([u.username], "add", "editor"); // promote
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tree */}
        {tree ? (
          <div style={{ marginTop: 8 }}>
            <TreeView node={tree} onSelect={toggleVisibilityFromTree} />
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#6b7280" }}>No files yet.</p>
        )}
      </aside>

      {/* Graph area */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        {/* Selection + global toggles */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 10,
            background: "white",
            padding: "4px 8px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {selected ? <strong>{selected}</strong> : <span>Select a file from the tree or graph</span>}

          {/* NEW: code coloration toggle */}
          <button
            onClick={() => setColorizeFunctions(v => !v)}
            title={colorizeFunctions ? "Turn code coloration off" : "Colorize function calls & declarations"}
            style={{
              fontSize: 11,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: colorizeFunctions ? "#ecfeff" : "white",
              cursor: "pointer",
            }}
          >
            {colorizeFunctions ? "Code coloration: on" : "Code coloration: off"}
          </button>

          {/* Global lines toggle */}
          <button
            onClick={() => {
              if (popups.length < 2) return;
              const next = !showLinesGlobal;                 // compute next first
              setShowLinesGlobal(next);
              // flip all per-popup toggles to match global
              setPopupLinesEnabled(() => {
                if (!next) return {}; // all off
                const m: Record<string, boolean> = {};
                for (const p of popupsRef.current) m[p.path] = true;
                return m; // all on
              });
              // broadcast global toggle
              const ws = wsRef.current;
              if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "popup_lines_global", enabled: next }));
              }
            }}
            disabled={popups.length < 2}
            title={popups.length < 2 ? "Open two popups to link calls to declarations" : (showLinesGlobal ? "Turn ALL lines off" : "Turn ALL lines on")}
            style={{
              fontSize: 11,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: showLinesGlobal ? "#eef2ff" : "white",
              cursor: popups.length < 2 ? "not-allowed" : "pointer",
            }}
          >
            {showLinesGlobal ? "All lines: on" : "All lines: off"}
          </button>
        </div>

        {/* Cytoscape canvas */}
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }} />

        {/* Presence avatars */}
        {peers.length > 0 && (
          <div style={{ position: "absolute", right: 12, top: 12, display: "flex", gap: 6, zIndex: 30 }}>
            {peers.map(p => (
              <div
                key={p.id}
                title={p.username}
                style={{
                  width: 24, height: 24, borderRadius: 9999, background: p.color, color: "white",
                  display: "grid", placeItems: "center", fontSize: 12, boxShadow: "0 0 0 2px white"
                }}
              >
                {p.username[0]?.toUpperCase()}
              </div>
            ))}
          </div>
        )}

        {/* Remote cursors */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 25 }}>
          {peers.filter(p => p.x != null && p.y != null).map(p => (
            <div key={"cursor-"+p.id} style={{ position:"absolute", left: (p.x||0) + "px", top: (p.y||0)+"px", transform:"translate(-50%, -50%)" }}>
              <div style={{ width: 8, height: 8, borderRadius: 9999, background: p.color }} />
              <div style={{ position: "absolute", top: 10, left: 8, background: "rgba(255,255,255,0.9)", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 6px", fontSize: 10 }}>
                {p.username}
              </div>
            </div>
          ))}
        </div>

        {/* Editable popups (resizable + synced) with per-popup line toggle */}
        {popups.map((pp) => {
          const linesOn = !!popupLinesEnabled[pp.path];
          return (
            <div
              key={pp.path}
              data-popup-path={pp.path}
              style={{
                position: "absolute",
                left: Math.max(8, pp.x) + "px",
                top: Math.max(8, pp.y) + "px",
                transform: "translate(-50%, -110%)",
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                width: pp.w ? pp.w : "clamp(240px, 26vw, 520px)",
                height: pp.h ? pp.h : undefined,
                minHeight: 140,
                maxHeight: pp.h ? undefined : "40vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                zIndex: 20,
                resize: "both",
                boxSizing: "border-box",
              }}
              onWheel={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderBottom: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  fontSize: 12,
                  flex: "0 0 auto",
                  gap: 8,
                }}
              >
                <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "30vw" }}>
                  {basename(pp.path)}
                </strong>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => {
                      if (popups.length < 2) return;
                      const next = !popupLinesEnabled[pp.path];
                      setPopupLinesEnabled(prev => ({ ...prev, [pp.path]: next }));
                      sendPopupLines(pp.path, next);
                    }}
                    disabled={popups.length < 2}
                    title={popups.length < 2 ? "Open another popup to link" : (linesOn ? "Hide lines for this popup" : "Show lines for this popup")}
                    style={{
                      border: "1px solid #ddd",
                      background: linesOn ? "#eef2ff" : "white",
                      padding: "4px 6px",
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: popups.length < 2 ? "not-allowed" : "pointer",
                    }}
                  >
                    {linesOn ? "Lines: on" : "Lines: off"}
                  </button>
                  {pp.dirty && <span style={{ fontSize: 11, color: "#9a3412" }}>● unsaved</span>}
                  <button
                    onClick={() => {
                      if (pp.dirty) savePopup(pp.path);
                      setPopups((cur) => cur.filter((p) => p.path !== pp.path));
                      setPopupLinesEnabled((prev) => { if (!(pp.path in prev)) return prev; const n = { ...prev }; delete n[pp.path]; return n; });
                      const ws = wsRef.current;
                      const t = textTimersRef.current.get(pp.path);
                      if (t) { window.clearTimeout(t); textTimersRef.current.delete(pp.path); }
                      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "popup_close", path: pp.path }));
                    }}
                    style={{ background: "none", border: 0, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                    aria-label="Close"
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Inline colorized code editor */}
              <div style={{ display: "block", width: "100%", flex: "1 1 auto", height: "auto" }}>
                <InlineEditor
                  path={pp.path}
                  value={pp.draft}
                  funcIndex={funcIndex}
                  colorize={colorizeFunctions}
                  onChange={(v) => {
                    setPopups((cur) => cur.map((p) => (p.path === pp.path ? { ...p, draft: v, dirty: true } : p)));
                    scheduleTextSend(pp.path, v);
                  }}
                  onBlur={() => savePopup(pp.path)}
                />
              </div>
            </div>
          );
        })}

        {/* Link overlay (caller → declarer) — TOP layer via portal; plain lines, no arrow heads */}
        {mounted && overlayEnabled && createPortal(
          <svg
            style={{
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            {popupLinks.map((l, i) => (
              <g key={i}>
                <path
                  d={`M ${l.x1} ${l.y1} C ${l.x1 + 60} ${l.y1}, ${l.x2 - 60} ${l.y2}, ${l.x2} ${l.y2}`}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={2}
                  strokeOpacity={0.95}
                  strokeLinecap="round"
                />
                <text
                  x={(l.x1 + l.x2) / 2}
                  y={(l.y1 + l.y2) / 2 - 6}
                  fontSize={10}
                  fontFamily="ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial"
                  textAnchor="middle"
                  opacity={0.9}
                  fill={l.color}
                >
                  {l.label}
                </text>
              </g>
            ))}
          </svg>,
          document.body
        )}
      </section>
    </div>
  );
}

function Row({
  u,
  role,
  canEdit,
  onRemove,
  onRoleChange,
}: {
  u: UserLite;
  role: "viewer" | "editor";
  canEdit: boolean;
  onRemove: () => void;
  onRoleChange: (r: "viewer" | "editor") => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderTop: "1px solid #eee" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 999, background: "#eee", display: "grid", placeItems: "center", fontSize: 12 }}>
          {u.username[0]?.toUpperCase()}
        </div>
        <div style={{ fontWeight: 600 }}>{u.username}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as "viewer" | "editor")}
          disabled={!canEdit}
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button
          onClick={onRemove}
          disabled={!canEdit}
          title="Remove"
          style={{ border: "1px solid #ddd", background: "white", padding: "4px 6px", borderRadius: 6 }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
