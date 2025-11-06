'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UserPicker, { type PublicUser } from '../../_components/UserPicker';

export default function AddParticipants({ currentUsername }: { currentUsername: string }) {
  const [open, setOpen] = useState(false);
  const [usernames, setUsernames] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const extra = usernames.split(',').map(s => s.trim().replace(/^@/, '')).filter(Boolean);
    const payload = { usernames: [currentUsername, ...extra], title: title.trim() || undefined };

    if (payload.usernames.length < 2) {
      alert('Add at least one username to start a group chat.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/messages/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const j = await res.json();
        const id = j?.id || j?.group?.id || j?.data?.id;
        if (id) {
          setOpen(false);
          router.push(`/messages/group/${encodeURIComponent(id)}`);
          return;
        }
      }
      const msg = await res.text().catch(() => '');
      if (res.status === 404 || res.status === 501) {
        alert('Your server does not support group chats yet. Ask the backend to expose /api/auth/messages/groups/.');
      } else {
        alert(msg || 'Failed to create group chat.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to create group chat.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontWeight: 700, cursor: 'pointer' }}
      >
        + Add people
      </button>

      {open && (
        <div role="dialog" aria-modal="true"
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div style={{ width: 520, maxWidth: '92%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Start a group chat</div>
              <div style={{ marginLeft: 'auto' }}>
                <button type="button" onClick={() => setOpen(false)} style={{ padding: 6, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>✕</button>
              </div>
            </div>

            <form onSubmit={onCreate} style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Add participants</span>
                <UserPicker
                  selected={usernames.split(',').map(s => s.trim()).filter(Boolean).map((u, i) => ({ id: i+1, username: u.replace(/^@/, '') }))}
                  onChange={(users: PublicUser[]) => setUsernames(users.map(u => u.username).join(', '))}
                  placeholder="Search by username…"
                />
              </div>

              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Group title (optional)</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Product brainstorm"
                  style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setOpen(false)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Creating…' : 'Create group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
