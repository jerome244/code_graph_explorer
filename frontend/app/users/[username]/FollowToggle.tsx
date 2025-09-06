'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FollowToggle({
  username,
  isFollowing,
  disabled,
}: {
  username: string;
  isFollowing: boolean;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(isFollowing);
  const router = useRouter();

  async function toggle() {
    if (busy || disabled) return;
    setBusy(true);
    const method = following ? 'DELETE' : 'POST';
    const r = await fetch(`/api/users/${encodeURIComponent(username)}/follow`, { method });
    if (r.ok) {
      setFollowing(!following);
      router.refresh();
    } else {
      alert('Failed to update follow');
    }
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy || disabled}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid #2563eb',
        background: following ? '#fff' : '#2563eb',
        color: following ? '#2563eb' : '#fff',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
      title={disabled ? 'Unavailable due to block' : (following ? 'Unfollow' : 'Follow')}
    >
      {busy ? 'Working…' : following ? 'Unfollow' : 'Follow'}
    </button>
  );
}
