'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Block = {
  index: number;
  timestamp: number;
  data: string;        // one "transaction" per line
  prevHash: string;
  nonce: number;
  merkleRoot: string;  // derived from data lines
  hash: string;        // PoW target: starts with N zeros (difficulty)
};

// ---- SHA-256 helpers (hex) using Web Crypto ----
async function sha256Hex(msg: string): Promise<string> {
  const subtle: SubtleCrypto | undefined =
    typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : undefined;
  if (!subtle) throw new Error('Web Crypto API not available.');
  const data = new TextEncoder().encode(msg);
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Parse block.data into transactions (trim/skip blanks)
function parseTx(data: string): string[] {
  return data
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

// Build Merkle levels bottom->top (levels[0] = leaves, last = root level)
async function buildMerkleLevelsFromTx(tx: string[]): Promise<string[][]> {
  const leaves = tx.length ? await Promise.all(tx.map(t => sha256Hex(t))) : [await sha256Hex('')];
  const levels: string[][] = [leaves];
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate last if odd
      next.push(await sha256Hex(left + right));
    }
    levels.push(next);
    level = next;
  }
  return levels;
}

// Only the *header* fields are hashed (more realistic):
// index | timestamp | prevHash | nonce | merkleRoot
async function computeBlockHash(b: Omit<Block, 'hash'>): Promise<string> {
  const header = `${b.index}|${b.timestamp}|${b.prevHash}|${b.nonce}|${b.merkleRoot}`;
  return sha256Hex(header);
}

function zeros(n: number) { return '0'.repeat(Math.max(0, n)); }
function short(h: string, n = 12) { return h ? h.slice(0, n) + '…' : ''; }
function ms(ts: number) { try { return new Date(ts).toLocaleString(); } catch { return String(ts); } }

// ---------- Merkle Tree Visual (tiny) ----------
function MerkleViz({ data }: { data: string }) {
  const [levels, setLevels] = useState<string[][]>([]);
  const tx = useMemo(() => parseTx(data), [data]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const lv = await buildMerkleLevelsFromTx(tx);
      if (alive) setLevels(lv);
    })();
    return () => { alive = false; };
  }, [tx]);

  if (!levels.length) {
    return (
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        (building merkle tree…)
      </div>
    );
  }

  // Drawing params
  const boxW = 150, boxH = 26;
  const hGap = 24, vGap = 34;
  const pad = 16;
  const rows = levels.length;
  const cols = Math.max(...levels.map(r => r.length));
  const width = pad * 2 + cols * boxW + (cols - 1) * hGap;
  const height = pad * 2 + rows * boxH + (rows - 1) * vGap;

  // y for row r (0 = bottom/leaf)
  const yFor = (r: number) => height - pad - boxH - r * (boxH + vGap);
  // x for col c in a row that has len items (center the row)
  const xFor = (c: number, len: number) => {
    const rowW = len * boxW + (len - 1) * hGap;
    const x0 = (width - rowW) / 2;
    return x0 + c * (boxW + hGap);
    };

  // Build all rectangles + connectors
  const rects: JSX.Element[] = [];
  const lines: JSX.Element[] = [];

  for (let r = 0; r < rows; r++) {
    const row = levels[r];
    const y = yFor(r);
    for (let c = 0; c < row.length; c++) {
      const x = xFor(c, row.length);
      const hash = row[c];
      rects.push(
        <g key={`n-${r}-${c}`}>
          <rect x={x} y={y} width={boxW} height={boxH} rx={6} ry={6}
                fill="#ffffff" stroke="#e5e7eb" />
          <text x={x + 8} y={y + boxH / 2 + 4}
                fontFamily="ui-monospace, Menlo, monospace" fontSize="11" fill="#111827">
            {short(hash, 18)}
          </text>
        </g>
      );

      // connectors to parent (except top level)
      if (r < rows - 1) {
        const parentIndex = Math.floor(c / 2);
        const px = xFor(parentIndex, levels[r + 1].length) + boxW / 2;
        const py = yFor(r + 1) + boxH; // bottom of parent
        const cx = x + boxW / 2;
        const cy = y; // top of child box
        lines.push(
          <line key={`l-${r}-${c}`} x1={cx} y1={cy} x2={px} y2={py}
                stroke="#cbd5e1" strokeWidth={1.5} />
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={Math.min(700, width)}
      height={height}
      style={{ border: '1px solid #eef2f7', borderRadius: 12, background: '#fafafa' }}
    >
      <g>{lines}</g>
      <g>{rects}</g>
    </svg>
  );
}

export default function Blockchain101() {
  // SSR-safe: start empty; create initial blocks on client
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [difficulty, setDifficulty] = useState(3);
  const [showMerkleFor, setShowMerkleFor] = useState<Record<number, boolean>>({});
  const miningRef = useRef<{ abort: boolean }>({ abort: false });
  const stateRef = useRef<Block[]>([]);
  useEffect(() => { stateRef.current = blocks; }, [blocks]);

  // Client-only init: genesis + 1 block
  useEffect(() => {
    (async () => {
      const genesisBase = {
        index: 0,
        timestamp: Date.now(),
        data: 'Genesis',
        prevHash: '0'.repeat(64),
        nonce: 0,
        merkleRoot: await merkleRootFromData('Genesis'),
      };
      const gHash = await computeBlockHash(genesisBase);
      const genesis: Block = { ...genesisBase, hash: gHash };

      const b1Base = {
        index: 1,
        timestamp: Date.now(),
        data: '',
        prevHash: gHash,
        nonce: 0,
        merkleRoot: await merkleRootFromData(''),
      };
      const b1Hash = await computeBlockHash(b1Base);
      const b1: Block = { ...b1Base, hash: b1Hash };

      setBlocks([genesis, b1]);
    })();
  }, []);

  // ---- Chain validity (prefix + linkage) ----
  const chainValid = useMemo(() => {
    if (!blocks.length) return true;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!b.hash.startsWith(zeros(difficulty))) return false;
      if (i === 0) {
        if (b.prevHash !== '0'.repeat(64)) return false;
      } else {
        if (b.prevHash !== blocks[i - 1].hash) return false;
      }
    }
    return true;
  }, [blocks, difficulty]);

  // ---- Merkle helpers ----
  async function merkleRootFromData(data: string): Promise<string> {
    const tx = parseTx(data);
    const levels = await buildMerkleLevelsFromTx(tx);
    return levels[levels.length - 1][0];
  }

  // ---- Small helpers that update state safely ----
  const setBlockAt = useCallback((i: number, updater: (b: Block) => Block) => {
    setBlocks(prev => {
      const arr = [...prev];
      if (!arr[i]) return prev;
      arr[i] = updater(arr[i]);
      return arr;
    });
  }, []);

  // Recompute merkleRoot + hash for block i (no mining), keep other fields
  const recomputeDerivedAt = useCallback(async (i: number) => {
    const b = stateRef.current[i];
    if (!b) return;
    const merkleRoot = await merkleRootFromData(b.data);
    const h = await computeBlockHash({ ...b, merkleRoot });
    setBlockAt(i, old => ({ ...old, merkleRoot, hash: h }));
  }, [setBlockAt]);

  const updateData = useCallback((i: number, data: string) => {
    setBlockAt(i, b => ({ ...b, data }));
    void recomputeDerivedAt(i);
    // relink forward
    setBlocks(prev => {
      const arr = [...prev];
      for (let j = i + 1; j < arr.length; j++) {
        arr[j] = { ...arr[j], prevHash: arr[j - 1].hash };
      }
      return arr;
    });
  }, [recomputeDerivedAt, setBlockAt]);

  const updateNonce = useCallback((i: number, nonce: number) => {
    setBlockAt(i, b => ({ ...b, nonce }));
    void recomputeDerivedAt(i);
  }, [recomputeDerivedAt, setBlockAt]);

  const addBlock = useCallback(async () => {
    const last = stateRef.current[stateRef.current.length - 1];
    if (!last) return;
    const base = {
      index: stateRef.current.length,
      timestamp: Date.now(),
      data: '',
      prevHash: last.hash,
      nonce: 0,
      merkleRoot: await merkleRootFromData(''),
    };
    const h = await computeBlockHash(base);
    setBlocks(prev => [...prev, { ...base, hash: h }]);
  }, []);

  // ---- Mining (local, batched, yields to UI) ----
  const mineIndex = useCallback(async (i: number) => {
    let b = stateRef.current[i];
    if (!b) return;
    miningRef.current.abort = false;
    const target = zeros(difficulty);
    let nonce = b.nonce;

    const stepBatch = async (): Promise<boolean> => {
      // refresh snapshot (user could edit while mining)
      b = stateRef.current[i] ?? b;

      for (let step = 0; step < 2000; step++) {
        if (miningRef.current.abort) return false;
        const h = await computeBlockHash({ ...b, nonce });
        if (h.startsWith(target)) {
          setBlocks(prev => {
            const arr = [...prev];
            if (!arr[i]) return prev;
            arr[i] = { ...arr[i], nonce, hash: h };
            for (let j = i + 1; j < arr.length; j++) {
              arr[j] = { ...arr[j], prevHash: arr[j - 1].hash };
            }
            return arr;
          });
          return true;
        }
        nonce++;
      }
      await new Promise(r => setTimeout(r, 0)); // yield to UI
      return stepBatch();
    };

    await stepBatch();
  }, [difficulty]);

  const stopMining = useCallback(() => { miningRef.current.abort = true; }, []);

  // Mine every block that doesn't satisfy PoW or linkage (left-to-right)
  const autoMineAllBroken = useCallback(async () => {
    miningRef.current.abort = false;

    for (let i = 0; i < stateRef.current.length; i++) {
      // link prev
      setBlocks(prev => {
        const arr = [...prev];
        if (i === 0) {
          arr[0] = { ...arr[0], prevHash: '0'.repeat(64) };
        } else {
          arr[i] = { ...arr[i], prevHash: arr[i - 1].hash };
        }
        return arr;
      });

      // ensure derived fields
      await recomputeDerivedAt(i);

      // mine if needed
      const b = stateRef.current[i];
      if (!b) continue;
      if (!b.hash.startsWith(zeros(difficulty))) {
        const ok = await mineIndex(i);
        if (!ok) break; // aborted
      }
    }
  }, [mineIndex, recomputeDerivedAt, difficulty]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Blockchain 101 — Blocks, Hashes, Merkle Root & Auto-Mine</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Each block has <b>data</b> (one item per line), a <b>Merkle root</b> of that data, a <b>nonce</b>, and links to the
        previous block. Mining finds a nonce so the block’s hash starts with <b>N zeros</b> (difficulty).
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Difficulty</span>
          <input type="range" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} />
          <b>{difficulty}</b>
        </label>
        <button onClick={addBlock} style={btn}>Add Block</button>
        <button onClick={autoMineAllBroken} style={btn}>Auto-mine all broken blocks</button>
        <button onClick={stopMining} style={btnLight}>Stop</button>
        <span style={{ marginLeft: 8, color: chainValid ? '#16a34a' : '#ef4444' }}>
          Chain status: <b>{chainValid ? 'Valid' : 'Invalid'}</b>
        </span>
      </div>

      <div style={grid}>
        {blocks.map((b, i) => {
          const isGenesis = i === 0;
          const okPrefix = b.hash?.startsWith(zeros(difficulty));
          const okPrev = isGenesis ? b.prevHash === '0'.repeat(64) : b.prevHash === blocks[i - 1]?.hash;
          const cardOk = okPrefix && okPrev;
          const tx = parseTx(b.data);
          const expanded = !!showMerkleFor[i];

          return (
            <div key={i} style={{ ...card, borderColor: cardOk ? '#16a34a55' : '#ef444455' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>
                  Block #{b.index}{isGenesis ? ' (Genesis)' : ''}
                </div>
                <div style={{ color: cardOk ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                  {cardOk ? '✓ valid' : '⚠ not valid'}
                </div>
              </div>

              <div style={row}>
                <label style={label}>Timestamp</label>
                <div style={mono}>{ms(b.timestamp)}</div>
              </div>

              <div style={row}>
                <label style={label}>Prev Hash</label>
                <div style={mono} title={b.prevHash}>{short(b.prevHash, 18)}</div>
              </div>

              <div style={row}>
                <label style={label}>Nonce</label>
                <input
                  type="number"
                  value={b.nonce}
                  onChange={(e) => updateNonce(i, Number(e.target.value) || 0)}
                  style={input}
                />
                <button onClick={() => mineIndex(i)} style={btn}>Mine</button>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label style={label}>Data (1 item per line)</label>
                <textarea
                  value={b.data}
                  onChange={(e) => updateData(i, e.target.value)}
                  style={{ ...input, height: 90, resize: 'vertical' }}
                  placeholder={isGenesis ? 'Genesis block' : 'tx1\ntx2\n...'}
                />
              </div>

              <div style={row}>
                <label style={label}>Merkle Root</label>
                <div style={mono} title={b.merkleRoot}>{short(b.merkleRoot, 22)}</div>
                <button
                  onClick={() => setShowMerkleFor(prev => ({ ...prev, [i]: !prev[i] }))}
                  style={btnLight}
                >
                  {expanded ? 'Hide Merkle tree' : 'Show Merkle tree'}
                </button>
              </div>

              <div style={row}>
                <label style={label}>Hash</label>
                <div style={{ ...mono, color: okPrefix ? '#111827' : '#ef4444' }} title={b.hash}>
                  {short(b.hash, 22)}
                </div>
              </div>

              {expanded && (
                <div style={{ marginTop: 8 }}>
                  <MerkleViz data={b.data} />
                </div>
              )}

              {tx.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Transactions</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {tx.map((t, k) => (
                      <li key={k} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Hash = SHA-256 of <code>index|timestamp|prevHash|nonce|merkleRoot</code>.
                The Merkle root summarizes all data lines.
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- styles ----
const grid: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  alignItems: 'stretch',
};

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
  background: '#fff',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  display: 'grid',
  gap: 10,
};

const row: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
};

const label: React.CSSProperties = {
  width: 110,
  fontSize: 12,
  color: '#6b7280',
};

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  background: '#f9fafb',
  border: '1px solid #eef2f7',
  padding: '4px 6px',
  borderRadius: 6,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const input: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '6px 8px',
  flex: 1,
};

const btn: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#fff',
  padding: '8px 12px',
  borderRadius: 8,
  cursor: 'pointer',
};

const btnLight: React.CSSProperties = {
  border: '1px solid #f3f4f6',
  background: '#f9fafb',
  padding: '8px 12px',
  borderRadius: 8,
  cursor: 'pointer',
};
