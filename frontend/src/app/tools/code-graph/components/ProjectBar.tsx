'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ParsedFile } from '../lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type ProjectRecord = {
  id: number;
  name: string;
  data: {
    files: ParsedFile[];
    options: {
      includeDeps: boolean;
      layoutName: string;
      filter: string;
      fnMode: boolean;
    };
  };
  updated_at: string;
};

export function ProjectBar({
  current,
  onLoad,
}: {
  current: { files: ParsedFile[]; options: { includeDeps: boolean; layoutName: string; filter: string; fnMode: boolean } };
  onLoad: (payload: { files: ParsedFile[]; options: { includeDeps: boolean; layoutName: string; filter: string; fnMode: boolean } }) => void;
}) {
  const [access, setAccess] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    setAccess(t);
  }, []);

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    }),
    [access]
  );

  const refreshList = async () => {
    if (!access) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/`, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProjects(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  const onSave = async () => {
    if (!access) {
      alert('Please sign in to save projects.');
      return;
    }
    if (!name.trim()) {
      alert('Give your project a name first.');
      return;
    }
    setBusy(true);
    try {
      // try upsert by name: if it exists, PATCH; else POST
      const existing = projects.find(p => p.name === name.trim());
      const payload = {
        name: name.trim(),
        data: {
          files: current.files,
          options: current.options,
        },
      };
      if (existing) {
        const res = await fetch(`${API_BASE}/api/projects/${existing.id}/`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch(`${API_BASE}/api/projects/`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      await refreshList();
    } catch (e) {
      alert('Save failed. See console for details.');
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const onSelectLoad = async (idStr: string) => {
    if (!idStr) return;
    const id = Number(idStr);
    const rec = projects.find(p => p.id === id);
    if (!rec) return;
    onLoad(rec.data);
  };

  const onDelete = async (id: number) => {
    if (!access) return;
    if (!confirm('Delete this project?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}/`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error(await res.text());
      await refreshList();
    } catch (e) {
      alert('Delete failed.');
      console.error(e);
    }
  };

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
      }}
    >
      <div style={{ fontWeight: 600 }}>Project</div>

      <input
        placeholder="Project name…"
        value={name}
        onChange={e => setName(e.target.value)}
        style={{
          padding: '8px 10px',
          border: '1px solid #CBD5E1',
          borderRadius: 8,
          minWidth: 160,
        }}
      />

      <button
        onClick={onSave}
        disabled={busy || !access}
        title={access ? '' : 'Sign in to save'}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #6366F1',
          background: '#EEF2FF',
          cursor: busy || !access ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>

      <select
        onChange={e => onSelectLoad(e.target.value)}
        value=""
        disabled={!access || projects.length === 0}
        style={{ padding: 8, borderRadius: 8, border: '1px solid #CBD5E1', minWidth: 220 }}
      >
        <option value="">Load project…</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} — {new Date(p.updated_at).toLocaleString()}
          </option>
        ))}
      </select>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {projects.slice(0, 3).map(p => (
          <button
            key={p.id}
            onClick={() => onDelete(p.id)}
            title={`Delete ${p.name}`}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #FCA5A5',
              background: '#FEF2F2',
              cursor: 'pointer',
            }}
          >
            Delete “{p.name}”
          </button>
        ))}
      </div>

      {!access && <div style={{ color: '#6B7280' }}>Sign in to enable saving</div>}
    </div>
  );
}
