'use client';

import { useEffect, useState } from 'react';

type MsgUser = { id: number; username: string; avatar_url?: string | null };
type Msg = {
  id: number;
  sender: MsgUser;
  recipient: MsgUser;
  body: string;
  created_at: string;
  is_read: boolean;
};

export default function MessagesPanel({
  otherUsername,
  meUsername,
}: { otherUsername: string; meUsername: string | null }) {
  const [loading, setLoading] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/messages/thread/${encodeURIComponent(otherUsername)}?page_size=50`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      // API is paginated; messages live in j.results if paginated_response, else array
      setMsgs(Array.isArray(j) ? j : (j?.results ?? []));
    }
    setLoading(false);
  }

  async function send() {
    const body = draft.trim();
    if (!body) return;
    const r = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: otherUsername, body }),
    });
    if (r.ok) {
      setDraft('');
      await load();
    } else {
      alert('Failed to send');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [otherUsername]);

  if (!meUsername) {
    return <div style={{ color: '#6b7280', fontSize: 14, marginTop: 12 }}>Login to view and send messages.</div>;
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Conversation with @{otherUsername}</h2>
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 12,
        maxHeight: 360,
        overflowY: 'auto',
        background: '#fff'
      }}>
        {loading ? (
          <div style={{ color: '#6b7280' }}>Loading…</div>
        ) : msgs.length === 0 ? (
          <div style={{ color: '#6b7280' }}>No messages yet. Say hello!</div>
        ) : (
          msgs.map(m => {
            const mine = meUsername && m.sender?.username?.toLowerCase() === meUsername.toLowerCase();
            return (
              <div key={m.id} style={{
                display: 'flex',
                justifyContent: mine ? 'flex-end' : 'flex-start',
                marginBottom: 8
              }}>
                <div style={{
                  maxWidth: '70%',
                  background: mine ? '#4f46e5' : '#f3f4f6',
                  color: mine ? '#fff' : '#111827',
                  padding: '8px 10px',
                  borderRadius: 12
                }}>
                  <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
                    {mine ? 'You' : '@' + (m.sender?.username ?? 'user')}
                    {' · '}
                    {new Date(m.created_at).toLocaleString()}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Write a message…"
          rows={2}
          style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, outline: 'none' }}
        />
        <button onClick={send} disabled={!draft.trim()} style={{
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid #4f46e5',
          background: '#4f46e5',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer',
          height: 44
        }}>
          Send
        </button>
      </div>
    </section>
  );
}
