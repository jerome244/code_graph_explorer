'use client';

import React, { useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Login failed');
      if (data?.access) {
        localStorage.setItem('accessToken', data.access);
        localStorage.setItem('refreshToken', data.refresh);
      }
      setMsg('Signed in!');
    } catch (e:any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Sign in</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Username</span>
          <input value={username} onChange={(e)=>setUsername(e.target.value)} required
            style={{ padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Password</span>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required
            style={{ padding: 10, borderRadius: 8, border: '1px solid #CBD5E1' }} />
        </label>

        <button disabled={busy} type="submit"
          style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #6366F1', background: '#EEF2FF', cursor: 'pointer' }}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      {err && <p style={{ color: '#b91c1c', marginTop: 12 }}>{err}</p>}
      {msg && <p style={{ color: '#047857', marginTop: 12 }}>{msg}</p>}

      <p style={{ marginTop: 16 }}>
        New here? <Link href="/auth/register">Create an account</Link>
      </p>
    </div>
  );
}
