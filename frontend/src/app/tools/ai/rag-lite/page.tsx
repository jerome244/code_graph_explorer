'use client';

import React, { useMemo, useState } from 'react';

/** ---------- tiny UI ---------- */
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' };
const btn: React.CSSProperties = {
  borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb',
  backgroundColor: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer'
};
const inputCss: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', width: '100%', font: 'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height: 160, resize: 'vertical' as const };

/** ---------- types ---------- */
type Chunk = {
  id: string;                // unique id
  docName: string;           // source file or "(pasted)"
  idx: number;               // chunk index within doc
  text: string;              // chunk text
  terms: Record<string, number>; // tf (raw or normalized)
};
type IndexData = {
  chunks: Chunk[];
  df: Record<string, number>;   // document frequency across chunks
  idf: Record<string, number>;  // idf per term
  builtAt: string;
  settings: {
    chunkWords: number;
    overlapWords: number;
    stopwordsEnabled: boolean;
  };
};

/** ---------- helpers ---------- */
const STOP = new Set([
  'the','a','an','and','or','but','if','then','else','when','at','by','for','in','of','on','to','with','as','is','it','its','be','are','was','were','from','that','this','those','these','your','you','we','our','us','they','their','them'
]);

function tok(s: string, useStop = true) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => (useStop ? !STOP.has(w) : true));
}

function splitSentences(s: string) {
  return s
    .replace(/\s+/g, ' ')
    .split(/(?<=[\.\!\?])\s+(?=[A-ZÀ-ÖØ-Ý0-9])/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function chunkWords(text: string, wordsPerChunk: number, overlap: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(/\s+/);
  const chunks: string[] = [];
  if (words.length === 0) return chunks;
  const stride = Math.max(1, wordsPerChunk - overlap);
  for (let i = 0; i < words.length; i += stride) {
    const part = words.slice(i, i + wordsPerChunk).join(' ');
    if (part.trim().length) chunks.push(part);
    if (i + wordsPerChunk >= words.length) break;
  }
  return chunks;
}

function tf(terms: string[]) {
  const m: Record<string, number> = {};
  for (const t of terms) m[t] = (m[t] || 0) + 1;
  // length norm
  const n = Math.sqrt(Object.values(m).reduce((a, b) => a + b * b, 0)) || 1;
  for (const k of Object.keys(m)) m[k] = m[k] / n;
  return m;
}

function buildIndex(entries: { name: string; text: string }[], cfg: { chunkWords: number; overlapWords: number; stopwordsEnabled: boolean }): IndexData {
  const chunks: Chunk[] = [];
  let idCounter = 0;

  for (const e of entries) {
    const parts = chunkWords(e.text, cfg.chunkWords, cfg.overlapWords);
    parts.forEach((p, i) => {
      const terms = tok(p, cfg.stopwordsEnabled);
      chunks.push({
        id: `c${idCounter++}`,
        docName: e.name,
        idx: i,
        text: p,
        terms: tf(terms)
      });
    });
  }

  // df & idf across chunks
  const df: Record<string, number> = {};
  for (const c of chunks) {
    for (const t of Object.keys(c.terms)) df[t] = (df[t] || 0) + 1;
  }
  const N = Math.max(1, chunks.length);
  const idf: Record<string, number> = {};
  for (const [t, d] of Object.entries(df)) {
    idf[t] = Math.log(1 + N / (d + 0.5)); // smoothed idf
  }

  return {
    chunks,
    df,
    idf,
    builtAt: new Date().toISOString(),
    settings: cfg
  };
}

function cosine(a: Record<string, number>, b: Record<string, number>) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of Object.entries(a)) {
    na += v * v;
    if (b[k] != null) dot += v * b[k];
  }
  for (const v of Object.values(b)) nb += v * v;
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

function weightWithIdf(tfv: Record<string, number>, idf: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(tfv)) {
    out[k] = v * (idf[k] || 0.5);
  }
  return out;
}

function highlight(text: string, terms: string[]) {
  if (terms.length === 0) return text;
  const uniq = Array.from(new Set(terms.filter(Boolean))).sort((a,b)=>b.length-a.length).map(escapeRegExp);
  if (uniq.length === 0) return text;
  const re = new RegExp(`\\b(${uniq.join('|')})\\b`, 'gi');
  return text.replace(re, (m) => `\u{FFF9}${m}\u{FFFB}`) // mark
             .split('\u{FFF9}')
             .map((part, i) => i === 0 ? part : (<mark key={i} style={{ background: '#fde68a' }}>{part.replace('\u{FFFB}','')}</mark>) as any);
}
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** extractive answer: pick best sentences from top chunks */
function extractiveAnswer(chunks: Array<{ text: string; score: number }>, queryTerms: string[], maxSentences = 3) {
  const qset = new Set(queryTerms);
  type Scored = { s: string; sc: number };
  const sentences: Scored[] = [];
  for (const c of chunks) {
    for (const s of splitSentences(c.text)) {
      const stoks = tok(s, true);
      let overlap = 0;
      for (const t of stoks) if (qset.has(t)) overlap++;
      const lenPenalty = Math.max(0.7, Math.min(1.0, 10 / (stoks.length + 2))); // prefer concise
      const sc = (overlap / Math.max(1, stoks.length)) * 0.7 + c.score * 0.3;
      sentences.push({ s, sc: sc * lenPenalty });
    }
  }
  sentences.sort((a,b)=>b.sc-a.sc);
  const best = sentences.slice(0, maxSentences).map(x=>x.s);
  // de-duplicate by similarity
  const out: string[] = [];
  for (const s of best) {
    if (!out.some(prev => jaccard(tok(prev,true), tok(s,true)) > 0.8)) out.push(s);
  }
  return out.join(' ');
}
function jaccard(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(1, A.size + B.size - inter);
}

/** ---------- page ---------- */
export default function RAGLitePage() {
  const [pasted, setPasted] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [building, setBuilding] = useState(false);

  // settings
  const [chunkWords, setChunkWords] = useState(160);
  const [overlapWords, setOverlapWords] = useState(30);
  const [stopwordsEnabled, setStopwordsEnabled] = useState(true);

  const [indexData, setIndexData] = useState<IndexData | null>(null);

  // search
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState<Array<{ id: string; text: string; docName: string; idx: number; score: number }>>([]);
  const [answer, setAnswer] = useState<string>('');
  const [busySearch, setBusySearch] = useState(false);

  async function handleBuild() {
    setBuilding(true);
    const entries: { name: string; text: string }[] = [];

    if (pasted.trim()) entries.push({ name: '(pasted)', text: pasted });

    if (files.length) {
      for (const f of files.slice(0, 24)) {
        // read as text; PDFs/Word won’t parse (by design)
        const t = await f.text().catch(()=>'');
        if (t.trim()) entries.push({ name: f.name, text: t });
      }
    }

    if (entries.length === 0) {
      setIndexData(null);
      setBuilding(false);
      return;
    }

    const idx = buildIndex(entries, { chunkWords, overlapWords, stopwordsEnabled });
    setIndexData(idx);
    setBuilding(false);
    setResults([]);
    setAnswer('');
  }

  function toJSONDownload() {
    if (!indexData) return;
    const blob = new Blob([JSON.stringify(indexData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rag_index.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  }

  function clearAll() {
    setPasted('');
    setFiles([]);
    setIndexData(null);
    setResults([]);
    setAnswer('');
  }

  async function runSearch() {
    if (!indexData || !query.trim()) { setResults([]); setAnswer(''); return; }
    setBusySearch(true);
    const qToks = tok(query, stopwordsEnabled);
    const qtf = tf(qToks);
    const qv = weightWithIdf(qtf, indexData.idf);

    const scored = indexData.chunks.map(c => {
      // weight chunk tf by idf
      const cv = weightWithIdf(c.terms, indexData.idf);
      const score = cosine(qv, cv);
      return { id: c.id, text: c.text, docName: c.docName, idx: c.idx, score };
    }).sort((a,b)=>b.score-a.score);

    const top = scored.slice(0, Math.max(1, topK));
    setResults(top);
    setAnswer(extractiveAnswer(top, qToks, 3));
    setBusySearch(false);
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin: 0 }}>RAG-Lite (Vector Search & Extractive Answer)</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Paste or drop text files, build an index, then ask questions. Everything runs locally in your browser — no external AI calls.
      </p>

      {/* Ingest */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Add documents</div>
        <textarea
          value={pasted}
          onChange={(e)=>setPasted(e.target.value)}
          placeholder="Paste any text, docs, README, logs…"
          style={taCss}
        />
        <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8, flexWrap:'wrap' }}>
          <input
            type="file"
            multiple
            accept=".txt,.md,.json,.csv"
            onChange={(e)=>setFiles(Array.from(e.target.files || []))}
          />
          <span style={{ fontSize:12, color:'#6b7280' }}>
            Tip: PDFs/Word aren’t parsed here. Convert to .txt or .md for best results.
          </span>
        </div>
      </div>

      {/* Settings + Build */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Index settings</div>
        <div style={{ display:'grid', gap:10, gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label>Chunk size (words) <input type="number" value={chunkWords} onChange={e=>setChunkWords(Math.max(40, Number(e.target.value)||160))} style={{...inputCss, width:100}} /></label>
          <label>Overlap (words) <input type="number" value={overlapWords} onChange={e=>setOverlapWords(Math.max(0, Number(e.target.value)||30))} style={{...inputCss, width:100}} /></label>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={stopwordsEnabled} onChange={e=>setStopwordsEnabled(e.target.checked)} />
            Remove stopwords (English)
          </label>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          <button onClick={handleBuild} style={btn}>{building ? 'Building…' : 'Build index'}</button>
          <button onClick={clearAll} style={btn}>Clear</button>
          <button onClick={toJSONDownload} style={btn} disabled={!indexData}>Export index JSON</button>
        </div>
        {indexData && (
          <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>
            Chunks: {indexData.chunks.length} · Built: {new Date(indexData.builtAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Search */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Ask a question</div>
        <div style={{ display:'grid', gap:8, gridTemplateColumns:'1fr auto auto' }}>
          <input
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
            placeholder="e.g., What are the prerequisites? or Summarize section 2"
            style={inputCss}
          />
          <input
            type="number"
            value={topK}
            onChange={e=>setTopK(Math.max(1, Number(e.target.value)||5))}
            title="topK"
            style={{...inputCss, width:90}}
          />
          <button onClick={runSearch} style={btn}>{busySearch ? 'Searching…' : 'Search'}</button>
        </div>

        {/* Answer */}
        {answer && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontWeight:700, marginBottom:6 }}>Extractive answer</div>
            <div style={{ background:'#f8fafc', border:'1px solid #eef2f7', padding:12, borderRadius:8 }}>
              {answer}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Top matches</div>
          <div style={{ display:'grid', gap:12 }}>
            {results.map((r, i) => {
              const qToks = tok(query, stopwordsEnabled);
              return (
                <div key={r.id} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                    <div style={{ fontWeight:600 }}>{r.docName} <span style={{ color:'#6b7280' }}>· chunk {r.idx+1}</span></div>
                    <div style={{ color:'#6b7280' }}>score {(r.score).toFixed(3)}</div>
                  </div>
                  <div style={{ color:'#111827' }}>
                    {highlight(r.text, qToks)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize:12, color:'#6b7280' }}>
        How it works: we tokenize your text, create TF-IDF vectors per chunk, and use cosine similarity to retrieve top chunks. The answer is built by picking the best-matching sentences (extractive).
      </div>
    </div>
  );
}
