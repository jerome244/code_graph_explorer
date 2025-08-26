'use client';

import React, { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setErr(null);
      try {
        const access = localStorage.getItem('accessToken');
        if (!access) throw new Error('Not signed in');
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${access}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || 'Failed to load profile');
        setUser(data);
      } catch (e:any) {
        setErr(e.message);
      }
    };
    load();
  }, []);

  if (err) return <div style={{ maxWidth: 500, margin: '40px auto' }}><p style={{ color: '#b91c1c' }}>{err}</p></div>;
  if (!user) return <div style={{ maxWidth: 500, margin: '40px auto' }}><p>Loading...</p></div>;

  return (
    <div style={{ maxWidth: 500, margin: '40px auto' }}>
      <h1>Profile</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}
