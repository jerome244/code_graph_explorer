'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BlockToggle({
  username,
  isBlockedByMe,
  hasBlockedMe,
}: {
  username: string;
  isBlockedByMe: boolean;
  hasBlockedMe: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (busy || hasBlockedMe) return;
    setBusy(true);
    const method = isBlockedByMe ? 'DELETE' : 'POST';
    const r = await fetch(`/api/blocks/${encodeURIComponent(username)}`, { method });
    setBusy(false);
    if (r.ok) router.refresh();
    else alert('Failed to update block status');
  }

  if (hasBlockedMe) {
    return <span style={{ color: '#ef4444', fontWeight: 600 }} title="This user has blocked you">You’re blocked</span>;
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid #ef4444',
        background: isBlockedByMe ? '#fff' : '#ef4444',
        color: isBlockedByMe ? '#ef4444' : '#fff',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {busy ? 'Working…' : isBlockedByMe ? 'Unblock' : 'Block'}
    </button>
  );
}
