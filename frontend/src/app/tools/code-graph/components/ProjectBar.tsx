'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ParsedFile } from '../lib/types';
import { apiFetch, getTokens } from '../lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Options = { includeDeps: boolean; layoutName: string; filter: string; fnMode: boolean };

type ProjectRecord = {
  id: number;
  name: string;
  data: { files: ParsedFile[]; options: Options };
  updated_at: string;
  is_owner: boolean;
  can_edit: boolean;
};

type Collaborator = { user_id: number; email: string; can_edit: boolean; created_at: string };
type UserSuggestion = { id: number; username: string; email: string };

const LAST_PROJECT_KEY = 'lastProjectId';

export function ProjectBar({
  current,
  onLoad,
}: {
  current: { files: ParsedFile[]; options: Options };
  onLoad: (payload: { files: ParsedFile[]; options: Options }) => void;
}) {
  const [access, setAccess] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);

  // share state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [collabList, setCollabList] = useState<Collaborator[]>([]);

  // invite by username/email (with search)
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteCanEdit, setInviteCanEdit] = useState(false);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSuggestion | null>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = getTokens().access;
    setAccess(t);
  }, []);

  const signedIn = useMemo(() => !!access, [access]);

  const setActiveProject = (p: ProjectRecord | null) => {
    if (!p) return;
    setActiveId(p.id);
    setName(p.name);
    try { localStorage.setItem(LAST_PROJECT_KEY, String(p.id)); } catch {}
  };

  const rehydrateSelection = (list: ProjectRecord[]) => {
    try {
      const lastId = Number(localStorage.getItem(LAST_PROJECT_KEY) || '');
      if (lastId && Number.isFinite(lastId)) {
        const found = list.find(p => p.id === lastId);
        if (found) { setActiveProject(found); return; }
      }
    } catch {}
    const trimmed = name.trim();
    if (trimmed) {
      const match = list.find(p => p.name === trimmed);
      if (match) setActiveProject(match);
    }
  };

  const refreshList = async () => {
    if (!signedIn) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/projects/`);
      if (res.status === 401) { setAccess(null); return; }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ProjectRecord[];
      setProjects(data);
      if (activeId) {
        const stillThere = data.find(p => p.id === activeId);
        if (!stillThere) setActiveId(null);
      } else {
        rehydrateSelection(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const onSave = async () => {
    if (!signedIn) { alert('Please sign in to save projects.'); return; }
    if (!name.trim()) { alert('Give your project a name first.'); return; }
    setBusy(true);
    try {
      const existing = projects.find((p) => p.name === name.trim());
      const payload = { name: name.trim(), data: { files: current.files, options: current.options } };
      let res: Response;
      if (existing) {
        res = await apiFetch(`${API_BASE}/api/projects/${existing.id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        res = await apiFetch(`${API_BASE}/api/projects/`, { method: 'POST', body: JSON.stringify(payload) });
      }
      if (res.status === 401) { setAccess(null); return; }
      if (!res.ok) throw new Error(await res.text());
      const saved = (await res.json()) as ProjectRecord;
      setActiveProject(saved);
      await refreshList();
    } catch (e) {
      console.error(e);
      alert('Save failed. See console for details.');
    } finally {
      setBusy(false);
    }
  };

  const onSelectLoad = async (idStr: string) => {
    if (!idStr) return;
    const id = Number(idStr);
    const rec = projects.find((p) => p.id === id);
    if (!rec) return;
    setActiveProject(rec);
    onLoad(rec.data);
  };

  const onDelete = async (id: number) => {
    if (!signedIn) return;
    const rec = projects.find(p => p.id === id);
    if (!rec) return;
    if (!rec.is_owner) { alert('Only the owner can delete this project.'); return; }
    if (!confirm(`Delete “${rec.name}”?`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/projects/${id}/`, { method: 'DELETE' });
      if (res.status === 401) { setAccess(null); return; }
      if (!res.ok) throw new Error(await res.text());
      if (activeId === id) {
        setActiveId(null);
        try { localStorage.removeItem(LAST_PROJECT_KEY); } catch {}
      }
      await refreshList();
    } catch (e) {
      console.error(e);
      alert('Delete failed.');
    }
  };

  // ----- Share helpers -----
  const fetchShareInfo = async (id: number) => {
    setShareToken(null);
    setCollabList([]);
    try {
      const res = await apiFetch(`${API_BASE}/api/projects/${id}/collaborators/`);
      if (res.ok) setCollabList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const openShare = async () => {
    if (!activeId) {
      const trimmed = name.trim();
      if (trimmed) {
        const byName = projects.find(p => p.name === trimmed);
        if (byName) {
          setActiveProject(byName);
          await fetchShareInfo(byName.id);
          setShareOpen(true);
          return;
        }
      }
      alert('Pick a project from “Load” (or type the exact project name) before sharing.');
      return;
    }
    await fetchShareInfo(activeId);
    setShareOpen(true);
  };

  const createLink = async () => {
    if (!activeId) return;
    const res = await apiFetch(`${API_BASE}/api/projects/${activeId}/share-link/`, { method: 'POST' });
    if (res.status === 401) { setAccess(null); return; }
    if (!res.ok) { alert('Only owners can create a share link.'); return; }
    const { token } = await res.json();
    setShareToken(token);
  };

  const revokeLink = async () => {
    if (!activeId) return;
    const res = await apiFetch(`${API_BASE}/api/projects/${activeId}/share-link/`, { method: 'DELETE' });
    if (res.ok) setShareToken(null);
  };

  // --- Username/email search logic
  const onInviteQueryChange = (v: string) => {
    setInviteQuery(v);
    setSelectedUser(null);
    setSuggestions([]);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const trimmed = v.trim();
    if (!trimmed || trimmed.length < 2) return; // avoid spam
    suggestTimer.current = setTimeout(async () => {
      setSuggesting(true);
      try {
        const res = await apiFetch(`${API_BASE}/api/users/search?query=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          setSuggestions(await res.json());
        }
      } finally {
        setSuggesting(false);
      }
    }, 250);
  };

  const addCollaborator = async () => {
    if (!activeId) return;

    // Prefer user_id if a suggestion is selected
    let body: any = { can_edit: inviteCanEdit };
    if (selectedUser) {
      body.user_id = selectedUser.id;
    } else {
      const q = inviteQuery.trim();
      if (!q) { alert('Type a username to search or an email to invite.'); return; }
      if (/\S+@\S+\.\S+/.test(q)) {
        body.email = q;
      } else {
        body.username = q;
      }
    }

    const res = await apiFetch(`${API_BASE}/api/projects/${activeId}/collaborators/`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setInviteQuery('');
      setInviteCanEdit(false);
      setSelectedUser(null);
      setSuggestions([]);
      await fetchShareInfo(activeId);
    } else {
      alert(await res.text());
    }
  };

  const toggleCollabEdit = async (c: Collaborator, can_edit: boolean) => {
    if (!activeId) return;
    const res = await apiFetch(`${API_BASE}/api/projects/${activeId}/collaborators/`, {
      method: 'PATCH',
      body: JSON.stringify({ user_id: c.user_id, can_edit }),
    });
    if (res.ok) await fetchShareInfo(activeId);
  };

  const removeCollaborator = async (c: Collaborator) => {
    if (!activeId) return;
    const res = await apiFetch(`${API_BASE}/api/projects/${activeId}/collaborators/`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: c.user_id }),
    });
    if (res.ok) await fetchShareInfo(activeId);
  };

  const shareUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/tools/code-graph?share=${encodeURIComponent(shareToken)}`
    : '';

  const activeProject = activeId ? projects.find(p => p.id === activeId) : null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: 12,
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        background: '#F8FAFC',
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ fontWeight: 600 }}>Project</div>

      <input
        placeholder="Project name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 8, minWidth: 160 }}
      />

      <button
        onClick={onSave}
        disabled={busy || !signedIn}
        title={signedIn ? '' : 'Sign in to save'}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #6366F1', background: '#EEF2FF', cursor: busy || !signedIn ? 'not-allowed' : 'pointer' }}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>

      <select
        onChange={(e) => onSelectLoad(e.target.value)}
        value=""
        disabled={!signedIn || projects.length === 0}
        style={{ padding: 8, borderRadius: 8, border: '1px solid #CBD5E1', minWidth: 260 }}
      >
        <option value="">Load project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.is_owner ? '' : ' (shared)'} — {new Date(p.updated_at).toLocaleString()}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        <button
          onClick={openShare}
          disabled={!activeId && !(name.trim() && projects.some(p => p.name === name.trim()))}
          title={!activeId ? 'Select from Load, or type exact name' : ''}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #10B981', background: '#ECFDF5', cursor: 'pointer' }}
        >
          Share…
        </button>

        {activeProject?.is_owner && (
          <button
            onClick={() => onDelete(activeProject.id)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2' }}
          >
            Delete “{activeProject.name}”
          </button>
        )}
      </div>

      {!signedIn && <div style={{ color: '#6B7280' }}>Session expired — please sign in.</div>}

      {/* Share modal */}
      {shareOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, minWidth: 560, maxWidth: '80vw', border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Share project {activeProject ? `“${activeProject.name}”` : ''}</div>
              <button onClick={() => setShareOpen(false)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC' }}>Close</button>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>Share link (read-only)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={createLink} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #6366F1', background: '#EEF2FF' }}>Create/Show link</button>
                  <button
                    onClick={() => { if (shareUrl) navigator.clipboard.writeText(shareUrl); }}
                    disabled={!shareToken}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC' }}
                  >
                    Copy link
                  </button>
                  <button onClick={revokeLink} disabled={!shareToken} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #EF4444', background: '#FEF2F2' }}>
                    Disable link
                  </button>
                </div>
                {shareToken && <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{shareUrl}</div>}
              </div>

              <div style={{ height: 1, background: '#E5E7EB', margin: '4px 0' }} />

              <div>
                <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>Invite collaborators</div>

                {/* Finder: search username or type an email */}
                <div style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    placeholder="Search username or enter email"
                    value={inviteQuery}
                    onChange={e => onInviteQueryChange(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 8, minWidth: 260 }}
                  />
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#334155', fontSize: 13 }}>
                    <input type="checkbox" checked={inviteCanEdit} onChange={e => setInviteCanEdit(e.target.checked)} />
                    can edit
                  </label>
                  <button onClick={addCollaborator} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #10B981', background: '#ECFDF5' }}>
                    Invite
                  </button>

                  {/* Suggestions dropdown */}
                  {(suggesting || suggestions.length > 0) && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 44,
                        left: 0,
                        background: '#fff',
                        border: '1px solid #E5E7EB',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                        minWidth: 360,
                        zIndex: 20,
                        maxHeight: 280,
                        overflowY: 'auto',
                      }}
                    >
                      {suggesting && (
                        <div style={{ padding: 10, color: '#64748B', fontSize: 13 }}>Searching…</div>
                      )}
                      {!suggesting && suggestions.length === 0 && inviteQuery.trim().length >= 2 && (
                        <div style={{ padding: 10, color: '#64748B', fontSize: 13 }}>No users found.</div>
                      )}
                      {suggestions.map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setSelectedUser(u);
                            setInviteQuery(u.username);
                            setSuggestions([]);
                          }}
                          style={{
                            display: 'flex',
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 12px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>@{u.username}</div>
                            <div style={{ color: '#64748B', fontSize: 12 }}>{u.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Current collaborators */}
                <div style={{ marginTop: 10 }}>
                  {collabList.length === 0 && <div style={{ color: '#64748B', fontSize: 13 }}>No collaborators yet.</div>}
                  {collabList.map(c => (
                    <div key={c.user_id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0' }}>
                      <div style={{ minWidth: 260 }}>{c.email}</div>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={c.can_edit} onChange={e => toggleCollabEdit(c, e.target.checked)} />
                        can edit
                      </label>
                      <button onClick={() => removeCollaborator(c)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid #EF4444', background: '#FEF2F2' }}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
