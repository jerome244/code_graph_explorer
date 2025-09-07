'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type PublicUser = { id: number; username: string; avatar_url?: string | null };

function normalizeUsername(s: string) { return s.trim().replace(/^@/, ''); }

export default function UserPicker({
  onChange,
  selected = [],
  placeholder = 'Search users…',
  max = 20,
}: {
  onChange: (users: PublicUser[]) => void;
  selected?: PublicUser[];
  placeholder?: string;
  max?: number;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<number>(-1);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedMap = useMemo(() => new Set(selected.map(s => (s.username || '').toLowerCase())), [selected]);
  const visibleOpts = results.filter(o => !selectedMap.has((o.username || '').toLowerCase()));

  // fetch suggestions (debounced)
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setOpen(false);
      setActive(-1);
      abortRef.current?.abort();
      if (debRef.current) clearTimeout(debRef.current);
      return;
    }
    setLoading(true);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        // Matches the API route we added above:
        const r = await fetch(`/api/auth/users/search/?q=${encodeURIComponent(term)}&limit=8`, {
          signal: ctl.signal,
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(String(r.status));
        const list: PublicUser[] = await r.json();
        setResults(Array.isArray(list) ? list.slice(0, 8) : []);
        setOpen(true);
        setActive(list.length ? 0 : -1);
      } catch {
        setResults([]);
        setOpen(false);
        setActive(-1);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [q]);

  // click outside to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function add(u: PublicUser) {
    if (selected.length >= max) return;
    if (selectedMap.has((u.username || '').toLowerCase())) return;
    onChange([...selected, u]);
    setQ('');
    setOpen(false);
    setActive(-1);
  }

  function remove(u: PublicUser) {
    onChange(selected.filter(s => s.id !== u.id && (s.username || '').toLowerCase() !== (u.username || '').toLowerCase()));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // If a suggestion is highlighted, Enter selection is handled in onKeyDown.
    // Otherwise, pressing Enter manually adds the typed username.
    if (active < 0) {
      const uname = normalizeUsername(q);
      if (uname && !selectedMap.has(uname.toLowerCase())) {
        add({ id: Date.now(), username: uname, avatar_url: null });
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => (visibleOpts.length ? (i + 1) % visibleOpts.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => (visibleOpts.length ? (i <= 0 ? visibleOpts.length - 1 : i - 1) : -1));
    } else if (e.key === 'Enter') {
      const u = active >= 0 ? visibleOpts[active] : null;
      if (u) {
        e.preventDefault();
        add(u);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: 6 }} onClick={() => setOpen(true)}>
          {selected.map(s => (
            <span key={(s.id ?? s.username) as any}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 999, padding: '4px 8px' }}>
              @{s.username}
              <button type="button" aria-label={`Remove @${s.username}`} onClick={() => remove(s)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => q.trim() && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Search users"
            style={{ flex: 1, minWidth: 120, border: 'none', outline: 'none', padding: 6 }}
          />
        </div>
      </form>

      {open && (results.length > 0 || loading || q.trim()) && (
        <div role="listbox" style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.08)', padding: 6, zIndex: 100 }}>
          {loading && (
            <div style={{ padding: '6px 8px', fontSize: 13, color: '#6b7280' }}>
              Searching…
            </div>
          )}

          {visibleOpts.map((u, i) => (
            <button
              key={u.id ?? u.username}
              role="option"
              aria-selected={active === i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(-1)}
              onClick={() => add(u)}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                border: 0,
                background: active === i ? '#f3f4f6' : 'white',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, background: '#eef2ff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>
                {u.username?.[0]?.toUpperCase()}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>@{u.username}</span>
            </button>
          ))}

          {!loading && visibleOpts.length === 0 && q.trim() && (
            <div style={{ padding: '6px 8px', fontSize: 13, color: '#6b7280' }}>
              No results. Press <b>Enter</b> to add <b>@{normalizeUsername(q)}</b>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
