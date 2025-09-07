'use client';

import { useEffect, useState } from 'react';

type MsgUser = { id: number; username: string; avatar_url?: string | null };
export type GroupMsg = {
  id: number;
  sender: MsgUser;
  body: string;
  created_at: string;
};

export default function GroupMessageList({
  groupId,
  initialMsgs,
  meUsername,
  meAvatar,
}: {
  groupId: string | number;
  initialMsgs: GroupMsg[];
  meUsername: string;
  meAvatar: string;
}) {
  const [msgs, setMsgs] = useState<GroupMsg[]>(initialMsgs);
  const [deleting, setDeleting] = useState<number | null>(null);

  // keep state in sync with server updates
  useEffect(() => { setMsgs(initialMsgs); }, [initialMsgs]);

  // instant append for this room
  useEffect(() => {
    function onNew(ev: Event) {
      const detail = (ev as CustomEvent<any>).detail || {};
      const message: GroupMsg = detail.message ?? detail;
      const gid = String(detail.groupId ?? '');
      if (!message) return;
      if (String(groupId) !== gid) return;
      setMsgs(prev => (prev.some(x => x.id === message.id) ? prev : [...prev, message]));
    }
    window.addEventListener('group:new', onNew as any);
    return () => window.removeEventListener('group:new', onNew as any);
  }, [groupId]);

  async function onDelete(id: number) {
    setDeleting(id);
    const r = await fetch(`/api/messages/groups/messages/${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (r.ok) setMsgs(prev => prev.filter(m => m.id !== id));
    else alert('Failed to delete message');
  }

  if (msgs.length === 0) {
    return <div style={{ color: '#6b7280' }}>No messages yet.</div>;
  }

  const meKey = (meUsername || '').toLowerCase();

  return (
    <>
      {msgs.map((m) => {
        const senderName = (m.sender?.username ?? '').toLowerCase();
        const mine = meKey === senderName;
        const avatarSrc = mine ? meAvatar : (m.sender?.avatar_url || '/api/empty-avatar.png');

        return (
          <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10, gap: 8 }}>
            {!mine && (
              <div style={{ width: 28, height: 28, borderRadius: 999, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f3f4f6', alignSelf: 'flex-end' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarSrc} alt="" width={28} height={28} />
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
                <img src={avatarSrc} alt="" width={28} height={28} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
