'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ProfileActions({
  username,
  isFollowing: initialFollowing,
  followers,
  following,
  isSelf = false, // 👈 new prop
}: {
  username: string;
  isFollowing: boolean;
  followers: number;
  following: number;
  isSelf?: boolean;
}) {
  const [isFollowing, setIsFollowing] = useState<boolean>(initialFollowing);
  const [counts, setCounts] = useState<{followers: number; following: number}>({ followers, following });

  async function toggleFollow() {
    if (isSelf) return; // guard
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

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:12, flexWrap:'wrap' }}>
      {isSelf ? (
        <span style={{ fontSize: 13, color: '#6b7280' }}>This is you</span>
      ) : (
        <>
          <button onClick={toggleFollow} style={btnStyle as any}>
            {isFollowing ? 'Unfollow' : 'Follow'}
          </button>
          <Link href={`/messages/${encodeURIComponent(username)}`} style={secondaryBtn as any}>
            Message
          </Link>
        </>
      )}
      <div style={{ color:'#6b7280', fontSize:13 }}>
        <strong>{counts.followers}</strong> followers · <strong>{counts.following}</strong> following
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding:'8px 12px', borderRadius:8, border:'1px solid #4f46e5',
  background:'#4f46e5', color:'#fff', fontWeight:700, cursor:'pointer'
};
const secondaryBtn: React.CSSProperties = {
  padding:'8px 12px', borderRadius:8, border:'1px solid #d1d5db',
  background:'#fff', color:'#111827', fontWeight:600, textDecoration:'none'
};
