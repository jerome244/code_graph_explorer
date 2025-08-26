'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type User = { id: number; username: string; email: string | null };

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const access = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!access) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${access}` },
        });
        if (!res.ok) throw new Error('Not authenticated');
        const data = (await res.json()) as User;
        setUser(data);
      } catch {
        try {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        } catch {}
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    } catch {}
    setUser(null);
    if (typeof window !== 'undefined') window.location.href = '/';
  };

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Welcome to code_graph_explorer</h1>
      <p style={{ maxWidth: 600, color: '#555', marginTop: 0 }}>
        Explore procedural voxel worlds and more prototypes.
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
        {loading ? (
          <span>Loading…</span>
        ) : user ? (
          <>
            <span style={{ color: '#374151' }}>Hello, <b>{user.username}</b></span>
            <Link
              href="/auth/profile"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                textDecoration: 'none',
              }}
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #EF4444',
                background: '#FEF2F2',
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link
              href="/auth/login"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                textDecoration: 'none',
              }}
            >
              Login
            </Link>
            <Link
              href="/auth/register"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #6366F1',
                background: '#EEF2FF',
                textDecoration: 'none',
              }}
            >
              Register
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
