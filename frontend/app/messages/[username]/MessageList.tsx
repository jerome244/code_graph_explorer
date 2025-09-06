'use client';

import { useState, useEffect } from 'react';

type MsgUser = { id: number; username: string; avatar_url?: string | null };
export type Msg = {
  id: number;
  sender: MsgUser;
  recipient: MsgUser;
  body: string;
  created_at: string;
  is_read: boolean;
};

export default function MessageList({
  initialMsgs,
  meUsername,
  meAvatar,
  otherAvatar,
  otherUsername,
}: {
  initialMsgs: Msg[];
  meUsername: string;
  meAvatar: string;
  otherAvatar: string;
  otherUsername: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initialMsgs);
  const [deleting, setDeleting] = useState<number | null>(null);

  // keep state in sync with server updates
  useEffect(() => { setMsgs(initialMsgs); }, [initialMsgs]);

  // instant append for this thread
  useEffect(() => {
    function onNew(ev: Event) {
      const detail = (ev as CustomEvent<any>).detail || {};
      const message: Msg = detail.message ?? detail;
      const threadWith: string = detail.threadWith ?? '';
      if (!message) return;
      if (threadWith.toLowerCase() !== otherUsername.toLowerCase()) return;
      setMsgs(prev => (prev.some(x => x.id === message.id) ? prev : [...prev, message]));
    }
    window.addEventListener('dm:new', onNew as any);
    return () => window.removeEventListener('dm:new', onNew as any);
  }, [otherUsername]);

  async function onDelete(id: number) {
    setDeleting(id);
    const r = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (r.ok) setMsgs(prev => prev.filter(m => m.id !== id));
    else alert('Failed to delete message');
  }

  if (msgs.length === 0) {
    return <div style={{ color: '#6b7280' }}>No messages yet.</div>;
  }

  const meKey = meUsername.toLowerCase();

  return (
    <>
      {msgs.map((m) => {
        const mine = meKey === (m.sender?.username ?? '').toLowerCase();
        const avatarSrc = mine ? meAvatar : otherAvatar;
        return (
          <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10, gap: 8 }}>
            {!mine && (
              <div style={{ width: 28, height: 28, borderRadius: 999, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f3f4f6', alignSelf: 'flex-end' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarSrc || '/api/empty-avatar.png'} alt="" width={28} height={28} />
              </div>
            )}

            <div style={{ maxWidth: '72%', background: mine ? '#4f46e5' : '#f3f4f6', color: mine ? '#fff' : '#111827', padding: '8px 10px', borderRadius: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
                {mine ? 'You' : '@' + (m.sender?.username ?? 'user')} · {new Date(m.created_at).toLocaleString()}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>

              {mine && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    onClick={() => onDelete(m.id)}
                    disabled={deleting === m.id}
                    style={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 6px', background: '#fff', cursor: 'pointer', color: '#111827' }}
                  >
                    {deleting === m.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>

            {mine && (
              <div style={{ width: 28, height: 28, borderRadius: 999, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f3f4f6', alignSelf: 'flex-end' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarSrc || '/api/empty-avatar.png'} alt="" width={28} height={28} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
