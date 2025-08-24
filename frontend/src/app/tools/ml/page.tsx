'use client';

import { useMemo, useState, useCallback, useEffect, type CSSProperties, type MouseEvent } from 'react';

type Point = { x: number; y: number };
type LabeledPoint = Point & { c?: number };
type Centroid = Point;

function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }
function randBetween(a: number, b: number) { return a + Math.random() * (b - a); }

function dist2(a: Point, b: Point) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function generateBlobs(numClusters = 3, pointsPerCluster = 60): LabeledPoint[] {
  const pts: LabeledPoint[] = [];
  const centers: Point[] = Array.from({ length: numClusters }, () => ({
    x: randBetween(0.15, 0.85),
    y: randBetween(0.15, 0.85),
  }));

  for (let k = 0; k < numClusters; k++) {
    const cx = centers[k].x, cy = centers[k].y;
    for (let i = 0; i < pointsPerCluster; i++) {
      const r = Math.random() * 0.07;
      const theta = Math.random() * Math.PI * 2;
      pts.push({
        x: clamp01(cx + r * Math.cos(theta)),
        y: clamp01(cy + r * Math.sin(theta)),
      });
    }
  }
  return pts;
}

function initCentroids(pts: Point[], k: number): Centroid[] {
  if (pts.length === 0) return [];
  // k-means++ lite
  const centroids: Centroid[] = [];
  centroids.push(pts[Math.floor(Math.random() * pts.length)]);
  while (centroids.length < k) {
    const dists = pts.map(p => Math.min(...centroids.map(c => dist2(p, c))));
    const total = dists.reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < dists.length; i++) { r -= dists[i]; if (r <= 0) { idx = i; break; } }
    centroids.push(pts[idx]);
  }
  return centroids.map(c => ({ ...c }));
}

function assign(pts: LabeledPoint[], cents: Centroid[]) {
  let changes = 0;
  for (let i = 0; i < pts.length; i++) {
    let bi = 0, bd = Infinity;
    for (let j = 0; j < cents.length; j++) {
      const d = dist2(pts[i], cents[j]);
      if (d < bd) { bd = d; bi = j; }
    }
    if (pts[i].c !== bi) { pts[i].c = bi; changes++; }
  }
  return changes;
}

function updateCentroids(pts: LabeledPoint[], cents: Centroid[]) {
  const k = cents.length;
  const sumx = new Array(k).fill(0);
  const sumy = new Array(k).fill(0);
  const cnt = new Array(k).fill(0);
  for (const p of pts) {
    if (p.c == null) continue;
    sumx[p.c] += p.x; sumy[p.c] += p.y; cnt[p.c] += 1;
  }
  for (let j = 0; j < k; j++) {
    if (cnt[j] > 0) {
      cents[j].x = sumx[j] / cnt[j];
      cents[j].y = sumy[j] / cnt[j];
    }
  }
}

function wcss(pts: LabeledPoint[], cents: Centroid[]) {
  let s = 0;
  for (const p of pts) {
    if (p.c == null) continue;
    s += dist2(p, cents[p.c]);
  }
  return s / Math.max(1, pts.length);
}

const COLORS = ['#2563eb', '#16a34a', '#ef4444', '#f59e0b', '#a855f7', '#06b6d4', '#84cc16', '#ec4899'];

export default function MLPlayground() {
  const [k, setK] = useState(3);

  // SSR-safe: start empty so server and first client render match
  const [points, setPoints] = useState<LabeledPoint[]>([]);
  const [centroids, setCentroids] = useState<Centroid[]>([]);
  const [iter, setIter] = useState(0);

  // Client-only initialization (avoids SSR hydration mismatches)
  useEffect(() => {
    const pts = generateBlobs(3, 60);
    setPoints(pts);
    setCentroids(initCentroids(pts, 3));
  }, []);

  const step = useCallback(() => {
    if (!points.length || !centroids.length) return 0;
    const pts = points.map(p => ({ ...p }));
    const cents = centroids.map(c => ({ ...c }));
    const changed = assign(pts, cents);
    updateCentroids(pts, cents);
    setPoints(pts);
    setCentroids(cents);
    setIter(i => i + 1);
    return changed;
  }, [points, centroids]);

  const run = useCallback(() => {
    let changed = 1, guard = 0;
    while (changed > 0 && guard < 50) { changed = step(); guard++; }
  }, [step]);

  const reset = useCallback((newK?: number) => {
    const kk = newK ?? k;
    const pts = generateBlobs(Math.min(kk, 5), 60);
    setPoints(pts);
    setCentroids(initCentroids(pts, kk));
    setIter(0);
    setK(kk);
  }, [k]);

  const addPoint = useCallback((p: Point) => {
    setPoints(prev => [...prev, { ...p }]);
  }, []);

  const metric = useMemo(() => wcss(points, centroids), [points, centroids]);

  const width = 640, height = 420, pad = 20;
  const toPx = (p: Point) => ({
    x: pad + p.x * (width - pad * 2),
    y: pad + (1 - p.y) * (height - pad * 2),
  });

  const onPlotClick = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - pad) / (width - pad * 2);
    const y = 1 - (e.clientY - rect.top - pad) / (height - pad * 2);
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) addPoint({ x, y });
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>ML Playground — k-means clustering</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Explore k-means by stepping through iterations, adding points, and changing the number of clusters.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>k</span>
          <input
            type="number"
            min={1}
            max={COLORS.length}
            value={k}
            onChange={(e) => setK(Math.max(1, Math.min(COLORS.length, Number(e.target.value) || 1)))}
            style={{ width: 64 }}
          />
        </label>
        <button onClick={() => reset()} style={btnStyle}>Reset data</button>
        <button onClick={() => reset(k)} style={btnStyle}>Re-init centroids</button>
        <button onClick={() => setCentroids(initCentroids(points, k))} style={btnStyle}>k-means++ init</button>
        <button onClick={step} style={btnStyle}>Step</button>
        <button onClick={run} style={btnStyle}>Run to convergence</button>
        <span style={{ marginLeft: 8, color: '#374151' }}>iterations: <b>{iter}</b></span>
        <span style={{ marginLeft: 8, color: '#374151' }}>WCSS: <b>{metric.toFixed(4)}</b></span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}
        onClick={onPlotClick}
      >
        {/* grid */}
        <g opacity={0.15}>
          {Array.from({ length: 10 }).map((_, i) => (
            <g key={`grid-${i}`}>
              <line x1={pad + i * (width - 2 * pad) / 10} y1={pad} x2={pad + i * (width - 2 * pad) / 10} y2={height - pad} stroke="#94a3b8" />
              <line x1={pad} y1={pad + i * (height - 2 * pad) / 10} x2={width - pad} y2={pad + i * (height - 2 * pad) / 10} stroke="#94a3b8" />
            </g>
          ))}
        </g>

        {/* points */}
        {points.map((p, idx) => {
          const { x, y } = toPx(p);
          const color = p.c != null ? COLORS[p.c % COLORS.length] : '#111827';
          // Stable-ish key based on coordinates to avoid churn
          const key = `${p.x.toFixed(4)}-${p.y.toFixed(4)}-${idx}`;
          return <circle key={key} cx={x} cy={y} r={4} fill={color} opacity={0.85} />;
        })}

        {/* centroids */}
        {centroids.slice(0, k).map((c, idx) => {
          const { x, y } = toPx(c);
          return (
            <g key={`c-${idx}`} transform={`translate(${x},${y})`}>
              <circle r={8} fill="white" stroke={COLORS[idx % COLORS.length]} strokeWidth={3} />
              <line x1={-6} y1={0} x2={6} y2={0} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} />
              <line x1={0} y1={-6} x2={0} y2={6} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} />
            </g>
          );
        })}
      </svg>

      <div style={{ color: '#374151' }}>
        <h3 style={{ marginBottom: 8 }}>How it works</h3>
        <ol style={{ marginTop: 0, paddingLeft: 22 }}>
          <li><b>Initialize</b> k centroids (try “k-means++ init”).</li>
          <li><b>Assign</b> each point to the closest centroid.</li>
          <li><b>Update</b> each centroid to the mean of its assigned points.</li>
          <li>Repeat until assignments stop changing.</li>
        </ol>
        <p style={{ marginTop: 8 }}>
          Click the canvas to add custom points. The WCSS metric (within-cluster sum of squares) tracks compactness.
        </p>
      </div>
    </div>
  );
}

const btnStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#fff',
  padding: '8px 12px',
  borderRadius: 8,
  cursor: 'pointer',
};
