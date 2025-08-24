'use client';

import React, { useMemo, useState } from 'react';

/* ---------------- UI bits ---------------- */
type Level = 'low' | 'medium' | 'high';
const COLORS: Record<Level,string> = { low:'#2563eb', medium:'#f59e0b', high:'#ef4444' };
const mono: React.CSSProperties = { fontFamily:'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const btn: React.CSSProperties  = { border:'1px solid #e5e7eb', background:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', width:'100%', font:'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height:220, resize:'vertical' as const };
const badge = (lvl: Level) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12,
  background: COLORS[lvl]+'22', color: COLORS[lvl], border:'1px solid '+COLORS[lvl]+'55'
});

/* ---------------- Types ---------------- */
type Finding = {
  level: Level;
  rule: string;
  message: string;
  suggestion?: string;
  line?: number;
  sample?: string;
};

type FileResult = {
  name: string;
  findings: Finding[];
  meta: {
    stages: number;
    hasHealthcheck: boolean;
    exposes: string[];
    hasUser: boolean;
  }
};

/* ---------------- Analyzer ---------------- */
function normalizeLines(text: string) {
  // join lines with trailing "\" continuations
  const raw = text.replace(/\r/g,'').split('\n');
  const lines: string[] = [];
  let buffer = '';
  let startLine = 1;
  const mapLine: number[] = []; // index -> source line
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i];
    if (buffer) buffer += '\n';
    buffer += l;
    if (/(^|[^\\])\\\s*$/.test(l)) {
      // continues
      continue;
    } else {
      lines.push(buffer);
      for (let k = 0; k < buffer.split('\n').length; k++) mapLine.push(i+1); // rough map
      buffer = '';
      startLine = i+2;
    }
  }
  if (buffer) { lines.push(buffer); for (let k = 0; k < buffer.split('\n').length; k++) mapLine.push(raw.length); }
  return { lines, mapLine };
}

function analyzeDockerfile(name: string, text: string): FileResult {
  const { lines } = normalizeLines(text);
  const trimmed = lines.map(s => s.trim());
  const noComments = trimmed.map(s => s.replace(/^\s*#.*$/, '').trim());
  const active = noComments.map((s, i) => ({ s, i: i+1 })).filter(x => x.s.length);

  const findings: Finding[] = [];

  // FROM checks
  const froms = active.filter(x => /^FROM\s+/i.test(x.s));
  const stages = froms.length;
  let hasPinned = false;
  for (const f of froms) {
    const m = f.s.match(/^FROM\s+([^\s]+)(?:\s+AS\s+\S+)?/i);
    if (!m) continue;
    const ref = m[1]; // e.g., node:18-alpine@sha256:..., or node
    const hasTag = ref.includes(':');
    const hasDigest = ref.includes('@sha256:');
    if (!hasTag) {
      findings.push({
        level:'high', rule:'from-tag-missing',
        message:`Base image "${ref}" has no tag (defaults to latest).`,
        suggestion:'Pin a specific tag (e.g., node:20-alpine) or a digest for reproducible builds.',
        line:f.i, sample:f.s
      });
    } else if (/:latest(@|$)/.test(ref) || /:latest$/i.test(ref)) {
      findings.push({
        level:'high', rule:'from-latest',
        message:`Base image uses ":latest": ${ref}.`,
        suggestion:'Use a specific version tag (e.g., 20-alpine) or digest.',
        line:f.i, sample:f.s
      });
    }
    if (hasDigest) hasPinned = true;
  }

  // USER presence
  const userLines = active.filter(x => /^USER\s+/i.test(x.s));
  const hasUser = userLines.length > 0;
  if (!hasUser) {
    findings.push({
      level:'medium', rule:'user-missing',
      message:'No USER specified (container runs as root by default).',
      suggestion:'Create an app user and switch: RUN adduser -D app && USER app',
    });
  } else {
    for (const u of userLines) {
      if (/^\s*USER\s+root\s*$/i.test(u.s)) {
        findings.push({
          level:'medium', rule:'user-root',
          message:'Container explicitly sets USER root.',
          suggestion:'Prefer non-root user. Only elevate when strictly needed.',
          line:u.i, sample:u.s
        });
      }
    }
  }

  // HEALTHCHECK
  const hasHealthcheck = active.some(x => /^HEALTHCHECK\b/i.test(x.s));
  if (!hasHealthcheck) {
    findings.push({
      level:'low', rule:'healthcheck-missing',
      message:'No HEALTHCHECK declared.',
      suggestion:'Add a HEALTHCHECK to detect stuck/crashed containers early.'
    });
  }

  // ADD vs COPY
  const adds = active.filter(x => /^ADD\s+/i.test(x.s));
  for (const a of adds) {
    const msg = /https?:\/\//i.test(a.s)
      ? 'ADD downloads from URLs — prefer COPY and fetch in a controlled RUN step (with checksum).'
      : 'Prefer COPY over ADD unless you need tar auto-extraction.';
    findings.push({
      level: /https?:\/\//i.test(a.s) ? 'high' : 'low',
      rule:'prefer-copy-over-add',
      message: msg,
      suggestion:'Use COPY, or verify remote artifacts via checksum in RUN.',
      line:a.i, sample:a.s
    });
  }

  // Package manager patterns per distro
  const runs = active.filter(x => /^RUN\s+/i.test(x.s));

  for (const r of runs) {
    const s = r.s;

    // apt-get update without install same layer
    if (/apt-get\s+update/i.test(s) && !/apt-get\s+install/i.test(s)) {
      findings.push({
        level:'medium', rule:'apt-update-alone',
        message:'`apt-get update` without `apt-get install` in the same RUN (cache lost).',
        suggestion:'Combine: RUN apt-get update && apt-get install -y ... && rm -rf /var/lib/apt/lists/*',
        line:r.i, sample:s
      });
    }
    // apt-get install hygiene
    if (/apt-get\s+install/i.test(s)) {
      if (!/(-y|\s--yes|\s--assume-yes)/i.test(s)) {
        findings.push({
          level:'low', rule:'apt-no-yes',
          message:'apt-get install missing -y.',
          suggestion:'Use: apt-get install -y ...',
          line:r.i, sample:s
        });
      }
      if (!/--no-install-recommends/i.test(s)) {
        findings.push({
          level:'low', rule:'apt-no-norecommends',
          message:'apt-get install without --no-install-recommends (image bloat).',
          suggestion:'Add --no-install-recommends to reduce dependencies.',
          line:r.i, sample:s
        });
      }
      if (!/rm\s+-rf\s+\/var\/lib\/apt\/lists\/\*/i.test(s) && !/apt-get\s+clean/i.test(s)) {
        findings.push({
          level:'medium', rule:'apt-cache-not-cleaned',
          message:'Apt cache not cleaned in the same RUN (extra layers/size).',
          suggestion:'Append: && rm -rf /var/lib/apt/lists/*',
          line:r.i, sample:s
        });
      }
    }

    // apk add (Alpine)
    if (/\bapk\s+add\b/i.test(s)) {
      if (!/--no-cache/i.test(s)) {
        findings.push({
          level:'medium', rule:'apk-no-cache',
          message:'apk add without --no-cache (image bloat).',
          suggestion:'Use: apk add --no-cache ...',
          line:r.i, sample:s
        });
      }
    }

    // yum/dnf
    if (/\b(yum|dnf)\s+install\b/i.test(s)) {
      if (!/(-y|\s--assumeyes|\s--setopt=tsflags=nodocs)/i.test(s)) {
        findings.push({
          level:'low', rule:'yum-no-yes',
          message:'yum/dnf install missing -y (or equivalent).',
          suggestion:'Use: yum install -y ...',
          line:r.i, sample:s
        });
      }
      if (!/(clean\s+all|rm\s+-rf\s+\/var\/cache\/(yum|dnf))/i.test(s)) {
        findings.push({
          level:'medium', rule:'yum-cache-not-cleaned',
          message:'yum/dnf cache not cleaned in the same RUN.',
          suggestion:'Append: && yum clean all && rm -rf /var/cache/yum',
          line:r.i, sample:s
        });
      }
    }

    // curl | bash or wget | sh
    if (/\b(curl|wget).*\|\s*(sh|bash)/i.test(s)) {
      findings.push({
        level:'high', rule:'pipe-to-shell',
        message:'Piping curl/wget to shell is risky (unverified remote code).',
        suggestion:'Download, verify checksum/signature, then execute.',
        line:r.i, sample:s
      });
    }

    // pip install cache
    if (/\bpip(3)?\s+install\b/i.test(s) && !/--no-cache-dir/i.test(s)) {
      findings.push({
        level:'low', rule:'pip-cache',
        message:'pip install without --no-cache-dir.',
        suggestion:'Use: pip install --no-cache-dir ...',
        line:r.i, sample:s
      });
    }

    // npm install vs ci
    if (/\bnpm\s+install\b/i.test(s) && !/\bnpm\s+ci\b/i.test(s)) {
      findings.push({
        level:'low', rule:'npm-ci',
        message:'Consider npm ci for reproducible installs in CI.',
        suggestion:'Use: npm ci (requires package-lock.json).',
        line:r.i, sample:s
      });
    }

    // sudo in containers
    if (/\bsudo\b/.test(s)) {
      findings.push({
        level:'low', rule:'sudo-in-container',
        message:'Using sudo in containers is typically unnecessary.',
        suggestion:'Switch to a non-root USER and run commands directly.',
        line:r.i, sample:s
      });
    }
  }

  // COPY . . big context hint
  const copyDot = active.find(x => /^COPY\s+(\.|\.\s+)\s+/i.test(x.s) || /^COPY\s+\.\s+\./i.test(x.s));
  if (copyDot) {
    findings.push({
      level:'low', rule:'copy-dot',
      message:'COPY . . copies entire build context.',
      suggestion:'Use .dockerignore and copy only needed files (COPY package*.json …, then RUN npm ci, etc.).',
      line:copyDot.i, sample:copyDot.s
    });
  }

  // WORKDIR recommended
  const hasWorkdir = active.some(x => /^WORKDIR\s+/i.test(x.s));
  if (!hasWorkdir) {
    findings.push({
      level:'low', rule:'workdir-missing',
      message:'No WORKDIR set.',
      suggestion:'Add WORKDIR /app (and COPY into it) for clarity and safety.'
    });
  }

  // Multi-stage suggestion (if heavy build tools present but only 1 stage)
  const installsBuildTools = runs.some(r => /(build-essential|gcc|g\+\+|make|cmake|go\s+install|rustup|cargo|jdk|openjdk)/i.test(r.s));
  if (stages < 2 && installsBuildTools) {
    findings.push({
      level:'medium', rule:'multistage-suggest',
      message:'Build tools installed in final image.',
      suggestion:'Use multi-stage builds: compile in a builder stage, then COPY only artifacts into a slim runtime.'
    });
  }

  // EXPOSE
  const exposes = active
    .filter(x => /^EXPOSE\s+/i.test(x.s))
    .map(x => x.s.replace(/^EXPOSE\s+/i,'').trim());

  return {
    name,
    findings,
    meta: {
      stages,
      hasHealthcheck,
      exposes,
      hasUser
    }
  };
}

/* ---------------- Page ---------------- */
export default function DockerfileLint() {
  const [text, setText] = useState('');
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [maskSamples, setMaskSamples] = useState(false);

  async function scanPasted() {
    setBusy(true);
    const out = analyzeDockerfile('(pasted Dockerfile)', text);
    setResults([out]);
    setBusy(false);
  }

  async function onPick(fl: FileList | null) {
    if (!fl) return;
    setBusy(true);
    const arr = Array.from(fl).filter(f => /dockerfile/i.test(f.name) || f.name.toLowerCase() === 'dockerfile');
    if (arr.length === 0) {
      // still try first file
      arr.push(fl[0]!);
    }
    const outs: FileResult[] = [];
    for (const f of arr.slice(0, 16)) {
      const ab = await f.arrayBuffer();
      const t = new TextDecoder().decode(new Uint8Array(ab));
      outs.push(analyzeDockerfile(f.name, t));
    }
    setResults(outs);
    setBusy(false);
  }

  function redact(s?: string) {
    if (!s || !maskSamples) return s;
    // hide URLs/tokens in samples (coarse)
    return s.replace(/https?:\/\/\S+/g, 'https://…').replace(/[A-Za-z0-9_\-]{16,}/g, '•••••');
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Dockerfile Linter (best practices)</h1>
      <p style={{ margin:0, color:'#555' }}>
        Paste a Dockerfile or drop files. We’ll flag risky patterns and bloat, and suggest fixes — all in your browser.
      </p>

      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Paste Dockerfile</div>
        <textarea
          value={text}
          onChange={(e)=>setText(e.target.value)}
          placeholder={`FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev \\
  && npm cache clean --force
COPY . .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node healthcheck.js
CMD ["node","server.js"]`}
          style={taCss}
        />
        <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
          <button onClick={scanPasted} style={btn}>Scan text</button>
          <button onClick={()=>{ setText(''); setResults([]);} } style={btn}>Clear</button>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={maskSamples} onChange={e=>setMaskSamples(e.target.checked)} />
            Mask samples in findings
          </label>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Or pick Dockerfile(s)</div>
        <input type="file" multiple onChange={e=>onPick(e.target.files)} />
        <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>Tip: You can choose multiple Dockerfiles from different services.</div>
      </div>

      {busy && <div>Scanning…</div>}

      {results.length > 0 ? (
        <div style={{ display:'grid', gap:12 }}>
          {results.map((res, idx) => (
            <div key={idx} style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <div style={{ fontWeight:700 }}>{res.name}</div>
                <div style={{ fontSize:12, color:'#6b7280' }}>
                  {res.meta.stages} stage{res.meta.stages!==1?'s':''} ·
                  {' '}{res.meta.hasHealthcheck ? 'has' : 'no'} healthcheck ·
                  {' '}{res.meta.hasUser ? 'has' : 'no'} USER
                  {res.meta.exposes.length ? <> · EXPOSE {res.meta.exposes.join(', ')}</> : null}
                </div>
              </div>

              {res.findings.length === 0 ? (
                <div style={{ color:'#16a34a', marginTop:8 }}>No issues found 🎉</div>
              ) : (
                <div style={{ overflowX:'auto', marginTop:8 }}>
                  <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign:'left' }}>Level</th>
                        <th style={{ textAlign:'left' }}>Rule</th>
                        <th style={{ textAlign:'left' }}>Message</th>
                        <th style={{ textAlign:'left' }}>Suggestion</th>
                        <th style={{ textAlign:'left' }}>Line</th>
                        <th style={{ textAlign:'left' }}>Sample</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.findings.map((f, i) => (
                        <tr key={i}>
                          <td style={{ padding:'4px 6px' }}><span style={badge(f.level)}>{f.level.toUpperCase()}</span></td>
                          <td style={{ padding:'4px 6px', color:'#111827' }}>{f.rule}</td>
                          <td style={{ padding:'4px 6px' }}>{f.message}</td>
                          <td style={{ padding:'4px 6px', color:'#374151' }}>{f.suggestion || '—'}</td>
                          <td style={{ padding:'4px 6px' }}>{f.line ?? '—'}</td>
                          <td style={{ padding:'4px 6px' }}><code style={{ ...mono, wordBreak:'break-all' }}>{redact(f.sample) || '—'}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ fontSize:12, color:'#6b7280', marginTop:8 }}>
                Tips: prefer slim base images, multi-stage builds, and pin dependencies/tags. Keep contexts small with a <code style={mono}>.dockerignore</code>.
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color:'#6b7280' }}>No results yet. Paste a Dockerfile or drop files to analyze.</div>
      )}
    </div>
  );
}
