'use client';
import { useEffect, useState } from 'react';
import VoxelApp from './VoxelApp';

export default function Page() {
  const [joined, setJoined] = useState(false);
  const [party, setParty] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('party') || '1' : '1'));
  const [name, setName] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('name') || '' : ''));

  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('party', party); }, [party]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('name', name); }, [name]);

  if (!joined) {
    return (
      <main style={{ padding: 24, maxWidth: 520 }}>
        <h1>code_graph_explorer — 3D voxel demo</h1>
        <div style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <div>Party ID (share this code):</div>
            <input
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="e.g. 1"
              style={{ width: '100%', padding: 8, fontSize: 14 }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
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
          Tip: open another tab, enter the same Party ID to play together.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>code_graph_explorer — 3D voxel demo</h1>
      <VoxelApp world={Number(party) || 1} playerName={name || undefined} />
      <button
        onClick={() => setJoined(false)}
        style={{ marginTop: 12, padding: '6px 10px', fontSize: 12, borderRadius: 6 }}
      >
        Leave / change party
      </button>
    </main>
  );
}
