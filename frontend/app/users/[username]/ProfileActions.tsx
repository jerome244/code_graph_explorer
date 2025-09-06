'use client';

import { useState } from 'react';

export default function ProfileActions({
  username,
  isFollowing: initialFollowing,
  followers,
  following,
}: { username: string; isFollowing: boolean; followers: number; following: number }) {
  const [isFollowing, setIsFollowing] = useState<boolean>(initialFollowing);
  const [counts, setCounts] = useState<{followers: number; following: number}>({ followers, following });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');

  async function toggleFollow() {
    const url = `/api/users/${encodeURIComponent(username)}/follow`;
    const r = await fetch(url, { method: isFollowing ? 'DELETE' : 'POST' });
    if (r.ok) {
      const now = !isFollowing;
      setIsFollowing(now);
      setCounts(c => ({ ...c, followers: c.followers + (now ? 1 : -1) }));
    } else {
      alert('Failed to update follow. Are you logged in?');
    }
  }

  async function sendMessage() {
    const body = msg.trim();
    if (!body) return;
    const r = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: username, body }),
    });
    if (r.ok) {
      setMsg('');
      setOpen(false);
      alert('Message sent!');
    } else {
      const t = await r.text();
      alert('Failed to send: ' + t);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
      <button onClick={toggleFollow} style={btnStyle as any}>
        {isFollowing ? 'Unfollow' : 'Follow'}
      </button>
      <button onClick={() => setOpen(true)} style={secondaryBtn as any}>
        Message
      </button>
      <div style={{ color: '#6b7280', fontSize: 13 }}>
        <strong>{counts.followers}</strong> followers · <strong>{counts.following}</strong> following
      </div>

      {open && (
        <div style={modalBackdrop as any} onClick={() => setOpen(false)}>
          <div style={modalCard as any} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Message @{username}</h3>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder="Say hi…"
              rows={4}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={secondaryBtn as any} onClick={() => setOpen(false)}>Cancel</button>
              <button style={btnStyle as any} onClick={sendMessage} disabled={!msg.trim()}>Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #4f46e5',
  background: '#4f46e5',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  fontWeight: 600,
  cursor: 'pointer',
};

const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'grid',
  placeItems: 'center',
};

const modalCard: React.CSSProperties = {
  width: 420,
  maxWidth: '92vw',
  background: '#fff',
  borderRadius: 12,
  padding: 16,
  boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
};
