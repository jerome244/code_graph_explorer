'use client';

import { useEffect, useState } from 'react';
import VoxelApp from './VoxelApp';

export default function MinecraftPage() {
  const [joined, setJoined] = useState(false);
  const [party, setParty] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('party') || '1' : '1'));
  const [name, setName]   = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('name')  || ''  : ''));

  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('party', party); }, [party]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('name',  name);  }, [name]);

  if (!joined) {
    return (
      <div style={{ maxWidth: 520 }}>
        <h1>Minecraft-like Demo</h1>
        <div style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <div>Party ID:</div>
            <input
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="e.g. 1"
              style={{ width: '100%', padding: 8, fontSize: 14 }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div>Your name (optional):</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
              style={{ width: '100%', padding: 8, fontSize: 14 }}
            />
          </label>
          <button
            onClick={() => setJoined(true)}
            style={{ padding: '8px 12px', fontSize: 14, borderRadius: 6 }}
          >
            Join party
          </button>
        </div>
        <p style={{ marginTop: 12, color: '#666' }}>
          Tip: open another tab and enter the same Party ID to play together.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1>Voxel World</h1>
      <VoxelApp world={Number(party) || 1} playerName={name || undefined} />
    </>
  );
}
