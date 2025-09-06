'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ChatComposer({
  toUsername,
}: {
  toUsername: string;
}) {
  const [body, setBody] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [docUrl, setDocUrl] = useState('');
  const [projId, setProjId] = useState('');
  const [sent, setSent] = useState(false);
  const router = useRouter();

  const emojis = ['😀','😁','😂','🤣','😊','😍','🤝','👍','🔥','🎉','💡','✨','🚀','🙌','🙏','😎','🤖','🐛','✅','📝'];

  function insert(text: string) {
    setBody(prev => (prev ? prev + text : text));
  }

  function insertDoc() {
    const trimmedUrl = docUrl.trim();
    const trimmedPid = projId.trim();
    let msg = '';
    if (trimmedUrl) msg = `Please join this doc: ${trimmedUrl}`;
    else if (trimmedPid) msg = `Please join my project: /graph?projectId=${encodeURIComponent(trimmedPid)}`;
    if (msg) {
      insert((body ? '\n' : '') + msg);
      setShowDoc(false);
      setDocUrl('');
      setProjId('');
    }
  }

// inside ChatComposer.tsx
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  const text = body.trim();
  if (!text) return;

  const res = await fetch('/api/messages/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: toUsername, body: text }),
  });

  if (res.ok) {
    const created = await res.json();

    // clear UI
    setBody('');
    setShowEmoji(false);
    setShowDoc(false);
    setDocUrl('');
    setProjId('');
    setSent(true);
    setTimeout(() => setSent(false), 2000);

    // 🔔 tell the MessageList which thread this is for
    window.dispatchEvent(
      new CustomEvent('dm:new', { detail: { message: created, threadWith: toUsername } })
    );

    // also revalidate server data
    router.refresh();
  } else {
    alert((await res.text().catch(() => '')) || 'Failed to send');
  }
}


  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
      {sent && (
        <div role="status" aria-live="polite" style={{
          background: '#10b981', color: '#fff', padding: '6px 10px',
          borderRadius: 8, fontWeight: 600
        }}>
          Message sent ✓
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setShowEmoji(v => !v)} style={toolBtn as any} title="Insert emoji">😊 Emoji</button>
        <button type="button" onClick={() => setShowDoc(v => !v)} style={toolBtn as any} title="Insert a join-doc link">📎 Join doc</button>
      </div>

      {showEmoji && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#fff' }}>
          {emojis.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => insert(e)}
              style={{ fontSize: 20, lineHeight: '28px', width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
              aria-label={`Insert ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {showDoc && (
        <div style={{ display: 'grid', gap: 8, border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#fff' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Document URL (preferred)</span>
            <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://…" style={input} />
          </label>
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>— or —</div>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Project ID (will create /graph?projectId=… link)</span>
            <input value={projId} onChange={(e) => setProjId(e.target.value)} placeholder="123" style={input} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowDoc(false)} style={secondaryBtn as any}>Cancel</button>
            <button type="button" onClick={insertDoc} style={primaryBtn as any}>Insert</button>
          </div>
        </div>
      )}

      <textarea
        name="body"
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Message @${toUsername}…`}
        style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, outline: 'none', resize: 'vertical' }}
      />

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={!body.trim()}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: body.trim() ? 1 : 0.6 }}
        >
          Send
        </button>
      </div>
    </form>
  );
}

const input: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 14,
};
const toolBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#111827',
  fontWeight: 600,
  cursor: 'pointer',
};
const primaryBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#111827',
  fontWeight: 600,
  cursor: 'pointer',
};
