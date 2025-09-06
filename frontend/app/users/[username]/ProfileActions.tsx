// app/users/[username]/ProfileActions.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ProfileActions({
  username,
  isFollowing,
  followers,
  following,
  isSelf,

  // NEW
  isBlockedByMe = false,
  hasBlockedMe = false,
}: {
  username: string;
  isFollowing: boolean;
  followers: number;
  following: number;
  isSelf: boolean;

  isBlockedByMe?: boolean;
  hasBlockedMe?: boolean;
}) {
  const [busyFollow, setBusyFollow] = useState(false);
  const [busyBlock, setBusyBlock] = useState(false);
  const [followingNow, setFollowingNow] = useState(isFollowing);
  const [followersCount, setFollowersCount] = useState(followers);
  const [blockedByMe, setBlockedByMe] = useState(isBlockedByMe);

  const router = useRouter();

  if (isSelf) {
    return (
      <section style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>
        This is your profile.
      </section>
    );
  }

  async function toggleFollow() {
    if (busyFollow || blockedByMe || hasBlockedMe) return;
    setBusyFollow(true);
    const method = followingNow ? 'DELETE' : 'POST';
    const r = await fetch(`/api/users/${encodeURIComponent(username)}/follow`, { method });
    setBusyFollow(false);
    if (r.ok) {
      setFollowingNow(!followingNow);
      setFollowersCount(c => c + (followingNow ? -1 : 1));
      router.refresh();
    } else {
      alert('Failed to update follow');
    }
  }

  async function toggleBlock() {
    if (busyBlock) return;
    setBusyBlock(true);
    const method = blockedByMe ? 'DELETE' : 'POST';
    const r = await fetch(`/api/blocks/${encodeURIComponent(username)}`, { method });
    setBusyBlock(false);
    if (r.ok) {
      setBlockedByMe(!blockedByMe);
      if (!blockedByMe && followingNow) {
        // backend also cleans follow, but reflect immediately
        setFollowingNow(false);
        setFollowersCount(c => Math.max(0, c - 1));
      }
      router.refresh();
    } else {
      alert('Failed to update block');
    }
  }

  const actionsDisabled = blockedByMe || hasBlockedMe;

  return (
    <section
      style={{
        marginTop: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      {/* Follower stats */}
      <div style={{ color: '#6b7280', fontSize: 13, marginRight: 'auto' }}>
        <strong style={{ color: '#111827' }}>{followersCount}</strong> followers ·{' '}
        <strong style={{ color: '#111827' }}>{following}</strong> following
      </div>

      {/* Message */}
      {hasBlockedMe ? (
        <span style={{ color: '#ef4444', fontWeight: 600 }}>You’re blocked</span>
      ) : blockedByMe ? (
        <span style={{ color: '#6b7280' }}>Unblock to message</span>
      ) : (
        <Link
          href={`/messages/${encodeURIComponent(username)}`}
          style={{
            textDecoration: 'none',
            border: '1px solid #4f46e5',
            background: '#4f46e5',
            color: 'white',
            padding: '6px 10px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Message @{username}
        </Link>
      )}

      {/* Follow */}
      <button
        onClick={toggleFollow}
        disabled={busyFollow || actionsDisabled}
        style={{
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid #2563eb',
          background: followingNow ? '#fff' : '#2563eb',
          color: followingNow ? '#2563eb' : '#fff',
          fontWeight: 700,
          cursor: actionsDisabled ? 'not-allowed' : 'pointer',
          opacity: actionsDisabled ? 0.6 : 1,
        }}
        title={actionsDisabled ? 'Unavailable due to block' : (followingNow ? 'Unfollow' : 'Follow')}
      >
        {busyFollow ? 'Working…' : followingNow ? 'Unfollow' : 'Follow'}
      </button>

      {/* Block / Unblock */}
      <button
        onClick={toggleBlock}
        disabled={busyBlock}
        style={{
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid #ef4444',
          background: blockedByMe ? '#fff' : '#ef4444',
          color: blockedByMe ? '#ef4444' : '#fff',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {busyBlock ? 'Working…' : blockedByMe ? 'Unblock' : 'Block'}
      </button>
    </section>
  );
}
