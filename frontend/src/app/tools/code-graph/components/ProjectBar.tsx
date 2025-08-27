'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ParsedFile } from '../lib/types';
import { apiFetch, getTokens } from '../lib/auth'; // ← NEW

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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCanEdit, setInviteCanEdit] = useState(false);

  useEffect(() => {
    const t = getTokens().access;
    setAccess(t);
  }, []);

  const signedIn = useMemo(() => !!access, [access]);

  const refreshList = async () => {
    if (!signedIn) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/projects/`);
      if (res.status === 401) {
        // session still invalid after auto-refresh
        setAccess(null);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ProjectRecord[];
      setProjects(data);
      const match = data.find((p) => p.name === name.trim());
      if (match) setActiveId(match.id);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const onSave = async () => {
    if (!signedIn) {
      alert('Please sign in to save projects.');
      return;
    }
    if (!name.trim()) {
      alert('Give your project a name first.');
      return;
    }
    setBusy(true);
    try {
      const existing = projects.find((p) => p.name === name.trim());
      const payload = { name: name.trim(), data: { files: current.files, options: current.options } };
      let res: Response;
      if (existing) {
        res = await apiFetch(`${API_BASE}/api/projects/${existing.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch(`${API_BASE}/api/projects/`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      if (res.status === 401) {
        setAccess(null);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
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
    setActiveId(rec.id);
    setName(rec.name);
    onLoad(rec.data);
  };

  const onDelete = async (id: number) => {
    if (!signedIn) return;
    if (!confirm('Delete this project?')) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/projects/${id}/`, { method: 'DELETE' });
      if (res.status === 401) { setAccess(null); return; }
      if (!res.ok) throw new Error(await res.text());
      if (activeId === id) setActiveId(null);
      await refreshList();
    } catch (e) {
      console.error(e);
      alert('Delete failed.');
    }
  };

  // ----- Share helpers (use apiFetch everywhere) -----
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
    if (!activeId) { alert('Save the project first, then open sharing.'); return; }
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

  const addCollaborator = async () => {
    if (!activeId) return;
    const res = await apiFetch(`${API_BASE}/api/projects/${activeId}/collaborators/`, {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail, can_edit: inviteCanEdit }),
    });
    if (res.ok) {
      setInviteEmail('');
      setInviteCanEdit(false);
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
          disabled={!activeId}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #10B981', background: '#ECFDF5', cursor: activeId ? 'pointer' : 'not-allowed' }}
        >
          Share…
        </button>
        {projects.slice(0, 2).map((p) => (
          <button key={p.id} onClick={() => onDelete(p.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2' }}>
            Delete “{p.name}”
          </button>
        ))}
      </div>

      {!signedIn && <div style={{ color: '#6B7280' }}>Session expired — please sign in.</div>}

      {/* (modal code unchanged)… */}
      {/* keep your existing Share modal JSX here */}
    </div>
  );
}
