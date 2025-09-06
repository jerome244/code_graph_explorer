'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type UserLite = { id: number; username: string };

export default function UserSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserLite[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<number>(-1);

  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // fetch suggestions (debounced)
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setOpen(false);
      setActive(-1);
      abortRef.current?.abort();
      return;
    }

    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;

      try {
        const r = await fetch(`/api/auth/users/search/?q=${encodeURIComponent(term)}`, {
          signal: ctl.signal,
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(String(r.status));
        const list: UserLite[] = await r.json();
        setResults(list.slice(0, 8));
        setOpen(true);
      } catch {
        // ignore errors (401/403/etc. show nothing)
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
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

  const goToAllResults = () => {
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    router.push(`/search/users?q=${encodeURIComponent(term)}`);
  };

  const goToProfile = (u: UserLite) => {
    setOpen(false);
    router.push(`/users/${encodeURIComponent(u.username)}`);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', width: 280 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // If a suggestion is highlighted, Enter will open it via onKeyDown.
          // Otherwise, submit goes to the results page.
          if (active < 0) goToAllResults();
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim() && setOpen(true)}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              setOpen(true);
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (results.length ? (i + 1) % results.length : -1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (results.length ? (i <= 0 ? results.length - 1 : i - 1) : -1));
            } else if (e.key === 'Enter') {
              if (active >= 0 && results[active]) {
                e.preventDefault();
                goToProfile(results[active]);
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
              setActive(-1);
            }
          }}
          placeholder="Search users…"
          aria-label="Search users"
          style={{
            width: '100%',
            height: 34,
            padding: '0 10px',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
          }}
        />
      </form>

      {open && (results.length > 0 || loading) && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            right: 0,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
            padding: 6,
            zIndex: 100,
          }}
        >
          {loading && (
            <div style={{ padding: '6px 8px', fontSize: 13, color: '#6b7280' }}>
              Searching…
            </div>
          )}

          {results.map((u, i) => (
            <button
              key={u.id}
              role="option"
              aria-selected={active === i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(-1)}
              onClick={() => goToProfile(u)}
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
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: '#eef2ff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#4f46e5',
                }}
              >
                {u.username[0]?.toUpperCase()}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{u.username}</span>
            </button>
          ))}

          <div
            style={{
              borderTop: '1px solid #f3f4f6',
              marginTop: 6,
              paddingTop: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              color: '#6b7280',
            }}
          >
            <span>Press Enter to search all</span>
            <button
              onClick={goToAllResults}
              style={{
                border: '1px solid #e5e7eb',
                background: 'white',
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              See all results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
