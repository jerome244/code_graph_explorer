'use client';

import React, { useMemo, useState } from 'react';

/* ----------------- tiny UI bits ----------------- */
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' };
const row: React.CSSProperties  = { display: 'flex', gap: 8, alignItems: 'baseline' };
const label: React.CSSProperties= { width: 160, fontSize: 12, color: '#6b7280' };
const inputCss: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', width: '100%', font: 'inherit' };
const btn: React.CSSProperties = { border:'1px solid #e5e7eb', background:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, borderColor:'#2563eb', background:'#eff6ff', color:'#1e40af' };
const meterWrap: React.CSSProperties = { height: 10, borderRadius: 8, background: '#f1f5f9', overflow: 'hidden', border: '1px solid #e5e7eb' };

/* ----------------- helpers: RNG & copy ----------------- */
function randBytes(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); } catch {}
}

/* ----------------- detection helpers ----------------- */
const COMMON = new Set([
  'password','123456','123456789','qwerty','letmein','iloveyou','admin','welcome','monkey','dragon','football',
  'baseball','starwars','hello','trustno1','abc123','111111','123123','qwerty123','1q2w3e4r','zaq12wsx',
  'passw0rd','p@ssw0rd','pokemon','sunshine','princess','shadow','login','master','freedom','whatever',
  'password1','qazwsx','asdfgh','blink182','zaq1zaq1','qwertyuiop','hunter2'
]);

const KEY_ROWS = ['qwertyuiop','asdfghjkl','zxcvbnm'];

const LEET_MAP: Record<string,string> = {
  '0':'o','1':'i','2':'z','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','9':'g',
  '@':'a','$':'s','!':'i','+':'t','(':'c',')':'c'
};

function deLeet(s: string) {
  return s.toLowerCase().split('').map(ch => LEET_MAP[ch] ?? ch).join('');
}

function containsSequence(s: string) {
  if (s.length < 3) return false;
  const a = s.toLowerCase();
  // alphabetic & numeric ascending/descending
  for (let i=0;i<a.length-2;i++){
    const c1=a.charCodeAt(i), c2=a.charCodeAt(i+1), c3=a.charCodeAt(i+2);
    const inc = c2===c1+1 && c3===c2+1;
    const dec = c2===c1-1 && c3===c2-1;
    if ((inc || dec) && ((a[i].match(/[a-z0-9]/) && a[i+1].match(/[a-z0-9]/) && a[i+2].match(/[a-z0-9]/)))) return true;
  }
  // keyboard rows
  for (const row of KEY_ROWS) {
    for (let i=0;i<row.length-3;i++){
      const sub = row.slice(i,i+4);
      if (a.includes(sub) || a.includes([...sub].reverse().join(''))) return true;
    }
  }
  return false;
}

function repeatedPatterns(pw: string) {
  // e.g., 'aaaa', 'ababab', 'xyzxyz'
  if (/(.)\1{3,}/.test(pw)) return true;
  for (let size=1; size<=4 && size*2<=pw.length; size++){
    const unit = pw.slice(0,size);
    const reps = unit.repeat(Math.floor(pw.length/size));
    if (reps.includes(pw) && pw.length >= size*3) return true;
  }
  return false;
}

function looksLikeDateOrEmail(pw: string) {
  const s = pw.toLowerCase().trim();
  if (/\b(19|20)\d{2}[- /.]?(0?[1-9]|1[0-2])[- /.]?(0?[1-9]|[12]\d|3[01])\b/.test(s)) return true; // YYYY-MM-DD
  if (/\b\d{1,2}[- /.](0?[1-9]|1[0-2])[- /.](19|20)\d{2}\b/.test(s)) return true; // DD-MM-YYYY
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return true; // email
  return false;
}

/* ----------------- entropy & scoring ----------------- */
function charsetSize(pw: string) {
  let size = 0, hasL=false, hasU=false, hasD=false, hasS=false, hasSpace=false;
  for (const ch of pw){
    if (/[a-z]/.test(ch)) hasL = true;
    else if (/[A-Z]/.test(ch)) hasU = true;
    else if (/[0-9]/.test(ch)) hasD = true;
    else if (ch===' ') hasSpace = true;
    else hasS = true;
  }
  if (hasL) size += 26;
  if (hasU) size += 26;
  if (hasD) size += 10;
  if (hasS) size += 33;   // rough printable symbol set
  if (hasSpace) size += 1;
  return {size, sets: {hasL,hasU,hasD,hasS,hasSpace}};
}

function log2(x: number){ return Math.log(x)/Math.log(2); }
function log10(x: number){ return Math.log(x)/Math.LN10; }

type Analysis = {
  entropyBits: number;
  penalties: string[];
  score: 0|1|2|3|4;
  label: string;
  suggestions: string[];
  sets: {hasL:boolean;hasU:boolean;hasD:boolean;hasS:boolean;hasSpace:boolean};
  length: number;
};

function analyze(pw: string): Analysis {
  const {size, sets} = charsetSize(pw);
  const base = pw.length * (size>0 ? log2(size) : 0);

  const penalties: string[] = [];
  let penalty = 0;

  const low = pw.toLowerCase();
  const deleet = deLeet(pw);
  if (COMMON.has(low) || COMMON.has(deleet)) { penalty += 40; penalties.push('Common password or common-word with leetspeak.'); }
  if (containsSequence(pw)) { penalty += 15; penalties.push('Contains sequential or keyboard patterns.'); }
  if (repeatedPatterns(pw)) { penalty += 15; penalties.push('Contains repeated blocks or runs.'); }
  if (looksLikeDateOrEmail(pw)) { penalty += 20; penalties.push('Looks like a date or email pattern.'); }
  if (pw.length < 8) { penalty += 20; penalties.push('Very short (< 8 chars).'); }
  else if (pw.length < 12) { penalty += 10; penalties.push('Short (< 12 chars).'); }

  // simple set diversity nudge
  const kinds = [sets.hasL,sets.hasU,sets.hasD,sets.hasS,sets.hasSpace].filter(Boolean).length;
  if (kinds <= 1) { penalty += 10; penalties.push('Only one character type.'); }
  else if (kinds === 2) { penalty += 5; penalties.push('Low character diversity.'); }

  const entropyBits = Math.max(0, base - penalty);

  // Map entropy to score 0..4 (rough thresholds)
  let score: 0|1|2|3|4 = 0;
  if (entropyBits >= 100) score = 4;
  else if (entropyBits >= 74) score = 3;
  else if (entropyBits >= 45) score = 2;
  else if (entropyBits >= 28) score = 1;
  else score = 0;

  const label = ['Very weak','Weak','Okay','Strong','Very strong'][score];

  const suggestions: string[] = [];
  if (pw.length < 16) suggestions.push('Use 16+ characters (length is the #1 defense).');
  if (!sets.hasD) suggestions.push('Add a digit (0–9).');
  if (!sets.hasU) suggestions.push('Add an uppercase letter.');
  if (!sets.hasS) suggestions.push('Add a symbol (e.g., !?@#).');
  if (penalties.some(p => /sequence|repeated|date|email/i.test(p))) suggestions.push('Avoid sequences, repeats, and personal info.');
  if (COMMON.has(low) || COMMON.has(deleet)) suggestions.push('Don’t base passwords on common words; consider a passphrase.');

  return { entropyBits, penalties, score, label, suggestions, sets, length: pw.length };
}

/* ----------------- crack time (log math) ----------------- */
const SEC_PER_MIN = 60;
const SEC_PER_HR = 3600;
const SEC_PER_DAY = 86400;
const SEC_PER_YEAR = 31557600; // 365.25 days

function fmtLogSeconds(logSec: number){
  if (!isFinite(logSec)) return '∞';
  if (logSec < 0) return '< 1 sec';
  // choose unit by log
  const units = [
    { name:'sec', log: 0 },
    { name:'min', log: log10(SEC_PER_MIN) },  // ~1.778
    { name:'hour',log: log10(SEC_PER_HR) },   // ~3.556
    { name:'day', log: log10(SEC_PER_DAY) },  // ~4.936
    { name:'year',log: log10(SEC_PER_YEAR) }, // ~7.499
    { name:'century', log: log10(SEC_PER_YEAR*100) }, // ~9.499
  ];
  let best = units[0];
  for (const u of units) if (logSec >= u.log) best = u;
  const valLog = logSec - best.log;
  // If small enough, print numeric; otherwise scientific
  if (valLog < 6) {
    const val = Math.pow(10, valLog);
    const n = val >= 100 ? Math.round(val) : val >= 10 ? val.toFixed(1) : val.toFixed(2);
    return `${n} ${best.name}${val>=2? 's':''}`;
  } else {
    return `~10^${(valLog).toFixed(1)} ${best.name}s`;
  }
}

function crackTimeLabel(entropyBits: number, guessesPerSec: number) {
  // expected guesses ~ 2^(entropy-1); seconds = guesses / rate
  const logSec = (entropyBits - 1) * Math.LOG10E * Math.log(2) - Math.log10(guessesPerSec);
  return fmtLogSeconds(logSec);
}

/* ----------------- generators ----------------- */
function genPassword(len = 20, opts?: { upper?: boolean; lower?: boolean; digits?: boolean; symbols?: boolean }) {
  const U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const L = 'abcdefghijklmnopqrstuvwxyz';
  const D = '0123456789';
  const S = '!@#$%^&*()-_=+[]{};:,.<>/?~';
  const pool = (opts?.upper!==false ? U : '') + (opts?.lower!==false ? L : '') + (opts?.digits!==false ? D : '') + (opts?.symbols!==false ? S : '');
  if (!pool) return '';
  const bytes = randBytes(len);
  let out = '';
  for (let i=0;i<len;i++) out += pool[bytes[i] % pool.length];
  return out;
}

const WORDS_A = ['brisk','quiet','lunar','mango','silver','cobalt','ember','delta','pluto','atlas','neon','pixel','fuzzy','garden','meteor','pepper','quantum','rocket','salsa','tempo','ultra','velvet','willow','yonder','zenith','breeze','canyon','dawn','ember','fjord','groove','harbor','ion','jungle','karma','lotus','meadow','nova','onyx','prairie','quartz','ripple','sage','tango','umbra','vortex','wander','xenon','yoga','zephyr'];
const WORDS_B = ['fox','lake','stone','cloud','river','pine','storm','tiger','owl','wolf','eagle','falcon','panda','whale','otter','koala','hawk','lion','sparrow','orca','monkey','camel','rhino','zebra','yak','hedgehog','dolphin','badger','beaver','phoenix','rabbit','gecko','lemur','moose','heron','weasel','pelican','skylark','ferret','dragon','iguana','squid','shrimp','lobster','coral','kelp','corvid','finch','boar'];
const SEP = ['-','_','.'];

function genPassphrase(words = 4) {
  const parts: string[] = [];
  const r = randBytes(words*2);
  for (let i=0;i<words;i++){
    const a = WORDS_A[r[i] % WORDS_A.length];
    const b = WORDS_B[r[i+1] % WORDS_B.length];
    parts.push(a + SEP[r[(i+2)%r.length] % SEP.length] + b);
  }
  return parts.join(SEP[r[0] % SEP.length]);
}

/* ----------------- Page ----------------- */
export default function PasswordLab() {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [genLen, setGenLen] = useState(20);

  const res = useMemo(() => analyze(pw), [pw]);

  const meterColor = ['#ef4444','#f59e0b','#84cc16','#22c55e','#16a34a'][res.score];
  const meterPct = Math.min(100, Math.round((res.entropyBits / 120) * 100)); // cap at 120 bits for bar

  const offlineGPU = crackTimeLabel(res.entropyBits, 1e10);     // 10 billion guesses/sec (fast hash)
  const bigRig    = crackTimeLabel(res.entropyBits, 1e12);     // 1 trillion/sec
  const onlineRL  = crackTimeLabel(res.entropyBits, 100/3600); // 100 guesses/hour

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Password Strength & Entropy Lab</h1>
      <p style={{ margin:0, color:'#555' }}>
        Type a password to see entropy, common pitfalls, and estimated crack times. <b>Don’t paste real production passwords.</b>
      </p>

      {/* Input */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Test a password (local only)</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input
            value={pw}
            onChange={e=>setPw(e.target.value)}
            type={show ? 'text' : 'password'}
            placeholder="Type here…"
            style={inputCss}
          />
          <button onClick={()=>setShow(s=>!s)} style={btn}>{show ? 'Hide' : 'Show'}</button>
          <button onClick={()=>{ setPw(''); }} style={btn}>Clear</button>
        </div>

        {/* meter */}
        <div style={{ marginTop:12, display:'grid', gap:6 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
            <div style={{ fontWeight:600 }}>{res.label}</div>
            <div style={{ fontSize:12, color:'#6b7280' }}>{res.entropyBits.toFixed(1)} bits</div>
          </div>
          <div style={meterWrap}>
            <div style={{ width:`${meterPct}%`, height:'100%', background: meterColor, transition:'width 120ms linear' }} />
          </div>
        </div>

        {/* details */}
        <div style={{ display:'grid', gap:8, marginTop:12 }}>
          <div style={row}><div style={label}>Length</div><div>{res.length}</div></div>
          <div style={row}>
            <div style={label}>Character sets</div>
            <div>
              {res.sets.hasL ? 'a-z ' : ''}{res.sets.hasU ? 'A-Z ' : ''}{res.sets.hasD ? '0-9 ' : ''}{res.sets.hasS ? 'symbols ' : ''}{res.sets.hasSpace ? '(space) ' : ''}
              {!res.sets.hasL && !res.sets.hasU && !res.sets.hasD && !res.sets.hasS && !res.sets.hasSpace && '—'}
            </div>
          </div>
          {res.penalties.length>0 && (
            <div style={{ display:'grid', gap:4 }}>
              <div style={{ fontWeight:600 }}>Issues spotted</div>
              <ul style={{ margin:0, paddingLeft:18 }}>
                {res.penalties.map((p,i)=><li key={i} style={{ color:'#ef4444' }}>{p}</li>)}
              </ul>
            </div>
          )}
          {res.suggestions.length>0 && (
            <div style={{ display:'grid', gap:4 }}>
              <div style={{ fontWeight:600 }}>Suggestions</div>
              <ul style={{ margin:0, paddingLeft:18 }}>
                {res.suggestions.map((s,i)=><li key={i} style={{ color:'#2563eb' }}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Crack time estimates */}
      {pw && (
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Estimated crack time (back-of-envelope)</div>
          <div style={{ display:'grid', gap:6 }}>
            <div style={row}><div style={label}>Online throttled (~100 guesses/hour)</div><div>{onlineRL}</div></div>
            <div style={row}><div style={label}>Single fast GPU (~10ⁱ⁰ g/s)</div><div>{offlineGPU}</div></div>
            <div style={row}><div style={label}>Big rig / cluster (~10¹² g/s)</div><div>{bigRig}</div></div>
          </div>
          <div style={{ fontSize:12, color:'#6b7280', marginTop:8 }}>
            These estimates assume brute force of the full search space. Real results depend heavily on the hash (bcrypt/argon2 ≫ MD5/SHA-1) and attacker heuristics.
          </div>
        </div>
      )}

      {/* Generators */}
      <div style={{ display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Generate password</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <label style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span>Length</span>
              <input type="number" value={genLen} onChange={e=>setGenLen(Math.max(8, Number(e.target.value)||20))} style={{ ...inputCss, width:100 }}/>
            </label>
            <button
              onClick={()=>{ const p = genPassword(genLen); setPw(p); }}
              style={btnPrimary}
            >Generate</button>
            <button onClick={()=>copy(pw)} style={btn}>Copy</button>
          </div>
          <div style={{ fontSize:12, color:'#6b7280', marginTop:8 }}>
            Uses <code style={mono}>crypto.getRandomValues()</code> in your browser.
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Generate passphrase</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <button onClick={()=>{ setPw(genPassphrase(4)); }} style={btnPrimary}>4 words</button>
            <button onClick={()=>{ setPw(genPassphrase(5)); }} style={btn}>5 words</button>
            <button onClick={()=>{ setPw(genPassphrase(6)); }} style={btn}>6 words</button>
            <button onClick={()=>copy(pw)} style={btn}>Copy</button>
          </div>
          <div style={{ fontSize:12, color:'#6b7280', marginTop:8 }}>
            Passphrases are easy to remember but very long — avoid famous quotes/lyrics.
          </div>
        </div>
      </div>

      <div style={{ fontSize:12, color:'#6b7280' }}>
        Tip: Prefer slow password hashing (bcrypt/scrypt/Argon2) on the server. Consider a password manager to keep unique passwords everywhere.
      </div>
    </div>
  );
}
