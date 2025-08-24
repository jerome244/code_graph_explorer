'use client';

import React, { useMemo, useState } from 'react';

type Tx = {
  id: string;
  size: number;      // vbytes
  fee: number;       // sats
  arrival: number;   // ms since epoch (when created)
};

type Block = {
  height: number;
  maxSize: number;
  txs: Tx[];
  totalSize: number;
  totalFee: number;
  avgFeerate: number; // sat/vB
};

function satVb(tx: Tx) {
  return tx.fee / Math.max(1, tx.size);
}

function formatSats(n: number) {
  return `${Math.round(n).toLocaleString()} sats`;
}

function secondsAgo(ms: number) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function MempoolFeesPlayground() {
  // ------- state -------
  const [mempool, setMempool] = useState<Tx[]>([]); // starts empty (hydration-safe)
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [blockSize, setBlockSize] = useState(1_000_000); // vB (1MB)
  const [policy, setPolicy] = useState<'feerate' | 'firstSeen' | 'totalFee'>('feerate');

  // "compose tx" inputs
  const [sizeInput, setSizeInput] = useState(220);   // vB
  const [frInput, setFrInput] = useState(10);        // sat/vB

  const computedFee = useMemo(() => Math.round(Math.max(1, sizeInput) * Math.max(0, frInput)), [sizeInput, frInput]);

  // ------- helpers -------
  const nextId = () => {
    // generate compact unique id using time + counter
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
  };

  function addTx(tx: Omit<Tx, 'id' | 'arrival'>) {
    const t: Tx = { id: nextId(), arrival: Date.now(), ...tx };
    setMempool(prev => [t, ...prev]);
  }

  function addRandomBatch(n = 15) {
    const batch: Tx[] = [];
    for (let i = 0; i < n; i++) {
      const size = Math.floor(100 + Math.random() * 1400);                 // 100–1500 vB
      const tier = Math.random();
      const fr =
        tier < 0.2 ? 1 + Math.random() * 3 :         // low fee crowd (1–4)
        tier < 0.7 ? 4 + Math.random() * 15 :        // mid (4–19)
                     20 + Math.random() * 80;        // high (20–100)
      const fee = Math.round(size * fr);
      batch.push({ id: nextId(), size, fee, arrival: Date.now() + i });
    }
    setMempool(prev => [...batch, ...prev]);
  }

  function clearMempool() {
    setMempool([]);
  }

  function mineOneBlock() {
    if (!mempool.length) return;

    // sort according to policy (we copy to avoid mutating state)
    const pool = [...mempool];
    if (policy === 'feerate') {
      pool.sort((a, b) => satVb(b) - satVb(a) || b.fee - a.fee);
    } else if (policy === 'totalFee') {
      pool.sort((a, b) => b.fee - a.fee || satVb(b) - satVb(a));
    } else {
      // firstSeen: oldest first (smaller arrival)
      pool.sort((a, b) => a.arrival - b.arrival);
    }

    // greedy pack
    const packed: Tx[] = [];
    let used = 0, fees = 0;
    for (const tx of pool) {
      if (used + tx.size <= blockSize) {
        packed.push(tx);
        used += tx.size;
        fees += tx.fee;
      }
    }

    if (!packed.length) return; // nothing fits

    // remove from mempool
    const packedIds = new Set(packed.map(t => t.id));
    setMempool(prev => prev.filter(t => !packedIds.has(t.id)));

    // push block
    const height = (blocks[0]?.height ?? 0) + 1;
    const blk: Block = {
      height,
      maxSize: blockSize,
      txs: packed,
      totalSize: used,
      totalFee: fees,
      avgFeerate: fees / Math.max(1, used),
    };
    setBlocks(prev => [blk, ...prev].slice(0, 8)); // keep last 8 blocks
  }

  // preview next block selection without mining
  const preview = useMemo(() => {
    const pool = [...mempool];
    if (policy === 'feerate') {
      pool.sort((a, b) => satVb(b) - satVb(a) || b.fee - a.fee);
    } else if (policy === 'totalFee') {
      pool.sort((a, b) => b.fee - a.fee || satVb(b) - satVb(a));
    } else {
      pool.sort((a, b) => a.arrival - b.arrival);
    }
    const chosen: string[] = [];
    let used = 0;
    for (const tx of pool) {
      if (used + tx.size <= blockSize) {
        chosen.push(tx.id);
        used += tx.size;
      }
    }
    const threshold = pool.find(tx => !chosen.includes(tx.id));
    return { chosen: new Set(chosen), thresholdFr: threshold ? satVb(threshold) : undefined };
  }, [mempool, policy, blockSize]);

  // ------- derived stats -------
  const memSize = mempool.reduce((s, t) => s + t.size, 0);
  const memFees = mempool.reduce((s, t) => s + t.fee, 0);
  const avgFr = memFees / Math.max(1, memSize);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Mempool & Fees Playground</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Learn why miners pick by <b>fee rate</b> (sat/vB). Add transactions, then “Mine block” to see who gets in.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={labelRow}>
          <span>Block size</span>
          <input
            type="range"
            min={50_000}
            max={1_000_000}
            step={1_000}
            value={blockSize}
            onChange={e => setBlockSize(Number(e.target.value))}
          />
          <b>{(blockSize / 1000).toFixed(0)} kB</b>
        </label>

        <label style={labelRow}>
          <span>Miner policy</span>
          <select value={policy} onChange={e => setPolicy(e.target.value as any)} style={select}>
            <option value="feerate">Highest fee rate (sat/vB)</option>
            <option value="firstSeen">First seen (oldest first)</option>
            <option value="totalFee">Highest total fee</option>
          </select>
        </label>

        <button onClick={mineOneBlock} style={btnPrimary}>Mine block</button>
        <button onClick={() => addRandomBatch(15)} style={btn}>Add 15 random txs</button>
        <button onClick={clearMempool} style={btnLight}>Clear mempool</button>
      </div>

      {/* Compose TX */}
      <div style={{ display: 'grid', gap: 8, border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
        <div style={{ fontWeight: 600 }}>Create a transaction</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={labelRow}>
            <span>Size (vB)</span>
            <input type="number" value={sizeInput} onChange={e => setSizeInput(Math.max(1, Number(e.target.value)||1))} style={input} />
          </label>
          <label style={labelRow}>
            <span>Fee rate (sat/vB)</span>
            <input type="number" value={frInput} onChange={e => setFrInput(Math.max(0, Number(e.target.value)||0))} style={input} />
          </label>
          <div style={{ color: '#374151' }}>Fee = <b>{formatSats(computedFee)}</b></div>
          <button
            onClick={() => addTx({ size: sizeInput, fee: computedFee })}
            style={btn}
          >
            Add to mempool
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Tip: try a small size with high fee rate and a huge size with low fee rate — see which one wins.
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Stat label="Mempool txs" value={mempool.length.toString()} />
        <Stat label="Mempool size" value={`${(memSize/1000).toFixed(1)} kB`} />
        <Stat label="Avg fee rate" value={`${avgFr.toFixed(2)} sat/vB`} />
        <Stat label="Blocks mined" value={blocks.length.toString()} />
        {preview.thresholdFr != null && (
          <Stat label="Estimated cut-off" value={`${preview.thresholdFr.toFixed(2)} sat/vB`} />
        )}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)' }}>
        {/* Mempool table */}
        <div style={panel}>
          <div style={panelHeader}>
            <div style={{ fontWeight: 700 }}>Mempool</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>({mempool.length} tx)</div>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table style={table}>
              <thead>
                <tr>
                  <th>ID</th><th>Size (vB)</th><th>Fee</th><th>sat/vB</th><th>Age</th>
                </tr>
              </thead>
              <tbody>
                {mempool
                  .slice()
                  .sort((a, b) => satVb(b) - satVb(a))
                  .map((tx) => {
                    const chosen = preview.chosen.has(tx.id);
                    return (
                      <tr key={tx.id} style={{ background: chosen ? '#ecfeff' : undefined }}>
                        <td style={mono}>{tx.id.slice(0, 8)}</td>
                        <td>{tx.size.toLocaleString()}</td>
                        <td>{formatSats(tx.fee)}</td>
                        <td>{satVb(tx).toFixed(2)}</td>
                        <td>{secondsAgo(tx.arrival)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
            Highlight = would be included if you mined a block <b>now</b> (with current policy & size).
          </div>
        </div>

        {/* Recent blocks */}
        <div style={panel}>
          <div style={panelHeader}>
            <div style={{ fontWeight: 700 }}>Recent blocks</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>({blocks.length})</div>
          </div>
          {blocks.length === 0 ? (
            <div style={{ color: '#6b7280' }}>No blocks yet. Click <b>Mine block</b>.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {blocks.map((b) => (
                <div key={b.height} style={blockCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600 }}>Block #{b.height}</div>
                    <div style={{ color: '#374151' }}>
                      {((b.totalSize / b.maxSize) * 100).toFixed(1)}% full · Avg {b.avgFeerate.toFixed(2)} sat/vB
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                    {formatSats(b.totalFee)} from {b.txs.length} tx · {(b.totalSize/1000).toFixed(1)} kB / {(b.maxSize/1000).toFixed(0)} kB
                  </div>
                  <div style={{ overflow: 'auto', maxHeight: 180, border: '1px solid #f1f5f9', borderRadius: 8 }}>
                    <table style={tableSmall}>
                      <thead>
                        <tr><th>ID</th><th>Size</th><th>Fee</th><th>sat/vB</th></tr>
                      </thead>
                      <tbody>
                        {b.txs.map(tx => (
                          <tr key={tx.id}>
                            <td style={mono}>{tx.id.slice(0,8)}</td>
                            <td>{tx.size}</td>
                            <td>{formatSats(tx.fee)}</td>
                            <td>{satVb(tx).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#6b7280' }}>
        Notes: This is a simplified simulator. Real mempools include RBF, ancestor/descendant limits, package relay, and
        more. But the core idea — <b>fee rate wins</b> when blocks are full — still holds.
      </div>
    </div>
  );
}

// ----- tiny UI bits -----
const labelRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const input: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', width: 120 };
const select: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', background: '#fff' };
const btn: React.CSSProperties = { border: '1px solid #e5e7eb', background: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' };
const btnLight: React.CSSProperties = { border: '1px solid #f3f4f6', background: '#f9fafb', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, borderColor: '#2563eb', color: '#1e40af', background: '#eff6ff' };

const panel: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', minHeight: 220 };
const panelHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 };

const table: React.CSSProperties = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 };
const tableSmall: React.CSSProperties = { ...table, fontSize: 12 };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 10, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', minWidth: 160 }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
