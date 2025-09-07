'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import UserPicker, { type PublicUser } from '../../../_components/UserPicker';

type Participant = { id: number; username: string; avatar_url?: string | null };

export default function ManageGroup({
  groupId,
  participants,
  meUsername,
  isCreator,
}: {
  groupId: number | string;
  participants: Participant[];
  meUsername: string;
  isCreator: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // add flow
  const [addList, setAddList] = useState<PublicUser[]>([]);
  async function onAdd() {
    if (!addList.length) return;
    setBusy(true);
    try {
      const usernames = addList.map(u => u.username);
      const r = await fetch(`/api/messages/groups/${encodeURIComponent(String(groupId))}/add`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usernames }),
      });
      if (!r.ok) throw new Error(await r.text());
      setAddList([]);
      router.refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to add members');
    } finally {
      setBusy(false);
    }
  }

  // remove flow (creator only)
  const [removing, setRemoving] = useState<string | null>(null);
  async function onRemove(username: string) {
    if (!isCreator) return;
    if (!confirm(`Remove @${username} from this group?`)) return;
    setRemoving(username);
    try {
      const r = await fetch(`/api/messages/groups/${encodeURIComponent(String(groupId))}/remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usernames: [username] }),
      });
      if (!r.ok) throw new Error(await r.text());
      router.refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to remove member');
    } finally {
      setRemoving(null);
    }
  }

  // block toggle per user (creator convenience shortcut; uses your existing /api/blocks/<username>)
  const [blockBusy, setBlockBusy] = useState<string | null>(null);
  const [blockState, setBlockState] = useState<Record<string, { is_blocked_by_me: boolean; has_blocked_me: boolean }>>({});

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    (async () => {
      const entries = await Promise.all(
        participants
          .filter(p => p.username.toLowerCase() !== meUsername.toLowerCase())
          .map(async p => {
            try {
              const r = await fetch(`/api/blocks/${encodeURIComponent(p.username)}`, { method: 'GET', cache: 'no-store' });
              if (!r.ok) return [p.username, { is_blocked_by_me: false, has_blocked_me: false }] as const;
              const j = await r.json();
              return [p.username, { is_blocked_by_me: !!j?.is_blocked_by_me, has_blocked_me: !!j?.has_blocked_me }] as const;
            } catch {
              return [p.username, { is_blocked_by_me: false, has_blocked_me: false }] as const;
            }
          })
      );
      if (!ignore) {
        const map: Record<string, any> = {};
        for (const [u, v] of entries) map[u] = v;
        setBlockState(map);
      }
    })();
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function toggleBlock(username: string) {
    setBlockBusy(username);
    try {
      const curr = blockState[username]?.is_blocked_by_me;
      const method = curr ? 'DELETE' : 'POST';
      const r = await fetch(`/api/blocks/${encodeURIComponent(username)}`, { method });
      if (!r.ok) throw new Error(await r.text());
      setBlockState(s => ({ ...s, [username]: { ...(s[username] || {}), is_blocked_by_me: !curr } }));
    } catch (e: any) {
      alert(e?.message || 'Failed to update block status');
    } finally {
      setBlockBusy(null);
    }
  }

  // leave group
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  async function onLeave() {
    if (!confirm('Leave this group? You will stop receiving messages from it.')) return;
    setLeaving(true);
    try {
      const r = await fetch(`/api/messages/groups/${encodeURIComponent(String(groupId))}/leave`, { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      // Go back to conversations
      router.push('/messages');
    } catch (e: any) {
      alert(e?.message || 'Failed to leave group');
    } finally {
      setLeaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontWeight: 700, cursor: 'pointer' }}
      >
        {isCreator ? 'Manage' : 'Group options'}
      </button>

      {open && (
        <div role="dialog" aria-modal="true"
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div style={{ width: 600, maxWidth: '92%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{isCreator ? 'Manage group' : 'Group options'}</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button type="button" onClick={onLeave} disabled={leaving} style={secondaryBtn as any}>
                  {leaving ? 'Leaving…' : 'Leave group'}
                </button>
                <button type="button" onClick={() => setOpen(false)} style={secondaryBtn as any}>✕ Close</button>
              </div>
            </div>

            {/* Participants list */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Members</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {participants.map(p => {
                  const me = p.username.toLowerCase() === meUsername.toLowerCase();
                  const bs = blockState[p.username] || { is_blocked_by_me: false, has_blocked_me: false };
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>@{p.username}</span>
                      {isCreator && !me && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleBlock(p.username)}
                            disabled={blockBusy === p.username}
                            title={bs.has_blocked_me ? 'This user has blocked you' : ''}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: `1px solid ${bs.is_blocked_by_me ? '#10b981' : '#ef4444'}`,
                              background: bs.is_blocked_by_me ? '#10b981' : '#ef4444',
                              color: '#fff',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {blockBusy === p.username ? 'Working…' : (bs.is_blocked_by_me ? 'Unblock' : 'Block')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemove(p.username)}
                            disabled={removing === p.username}
                            style={dangerBtn as any}
                          >
                            {removing === p.username ? 'Removing…' : 'Remove'}
                          </button>
                        </>
                      )}
                      {me && <span style={{ fontSize: 12, color: '#6b7280' }}>· you</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add members (creator only) */}
            {isCreator && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Add people</div>
                <UserPicker
                  selected={addList}
                  onChange={(users: PublicUser[]) => setAddList(users)}
                  placeholder="Search by username…"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" onClick={onAdd} disabled={busy || addList.length === 0} style={primaryBtn as any}>
                    {busy ? 'Adding…' : 'Add to group'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const primaryBtn: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontWeight: 600, cursor: 'pointer' };
const dangerBtn: React.CSSProperties = { padding: '4px 8px', borderRadius: 6, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', fontWeight: 700, cursor: 'pointer' };
