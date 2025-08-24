// src/app/tools/sec/endpoint-hardening/page.tsx
'use client';

import React, { useMemo, useState } from 'react';

/* ---------- tiny UI ---------- */
type Level = 'ok'|'warn'|'fail';
const COLORS: Record<Level,string> = { ok:'#16a34a', warn:'#f59e0b', fail:'#ef4444' };
const mono: React.CSSProperties = { fontFamily:'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };

// FIX: use only longhand border/background for buttons (no shorthand mixing)
const btn: React.CSSProperties  = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#e5e7eb',
  backgroundColor: '#fff',
  padding: '8px 12px',
  borderRadius: 8,
  cursor: 'pointer',
};

const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', width:'100%', font:'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height:140, resize:'vertical' as const };
const badge = (lvl: Level) => ({
  display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12,
  background: COLORS[lvl]+'22', color: COLORS[lvl], border:'1px solid '+COLORS[lvl]+'55'
});

/* ---------- helpers ---------- */
function copy(text: string) { return navigator.clipboard?.writeText(text).catch(()=>{}); }

type Check = { label: string; level: Level; details?: string; fix?: string };
type Result = {
  os: 'windows'|'mac'|'linux';
  checks: Check[];
  riskyPorts: number[];
  notes: string[];
  score: number; // 0-100
  grade: 'A'|'B'|'C'|'D'|'F';
};

const RISKY_PORTS = new Set([3389, 5985, 5986, 22, 23, 445, 139, 135, 5900, 21, 3306, 5432]);

/* ---------- parsers per OS ---------- */
// WINDOWS
function parseWindows(bl: string, boot: string, tpm: string, guard: string, ports: string): Result {
  const checks: Check[] = [];
  const notes: string[] = [];

  // BitLocker (manage-bde -status)
  let encGood = false, encSeen = false;
  if (bl.trim()) {
    encSeen = true;
    const vols = bl.split(/\n(?=Volume [A-Z]:|Volume\s)/i);
    let allOn = true, anyOff = false;
    for (const v of vols) {
      const prot = /Protection Status:\s*Protection\s+On/i.test(v);
      const pct100 = /Percentage Encrypted:\s*100%/i.test(v);
      if (!(prot && pct100)) { allOn = false; anyOff = true; }
    }
    encGood = allOn && !anyOff;
    checks.push({
      label:'Disk encryption (BitLocker)',
      level: encSeen ? (encGood ? 'ok' : 'fail') : 'warn',
      details: encSeen ? (encGood ? 'All volumes protected (100%).' : 'Some volumes not fully encrypted / protection off.') : 'No output parsed.',
      fix: 'Enable BitLocker on all fixed drives and store recovery keys safely.'
    });
  } else {
    checks.push({ label:'Disk encryption (BitLocker)', level:'warn', details:'No data pasted.', fix:'Run: manage-bde -status' });
  }

  // Secure Boot
  if (boot.trim()) {
    const sb = /True/i.test(boot) && !/False/i.test(boot);
    checks.push({ label:'Secure Boot', level: sb ? 'ok' : 'fail', details: sb ? 'Enabled' : 'Disabled', fix:'Enable Secure Boot in UEFI, re-install keys if needed.' });
  } else {
    checks.push({ label:'Secure Boot', level:'warn', details:'No data pasted.', fix:'Run in elevated PowerShell: Confirm-SecureBootUEFI' });
  }

  // TPM
  if (tpm.trim()) {
    const present = /TpmPresent\s*:\s*True/i.test(tpm);
    const ready = /TpmReady\s*:\s*True/i.test(tpm);
    checks.push({
      label:'TPM',
      level: (present && ready) ? 'ok' : 'fail',
      details: `Present=${present} Ready=${ready}`,
      fix:'Ensure firmware TPM (fTPM/Intel PTT) is enabled and initialized.'
    });
  } else {
    checks.push({ label:'TPM', level:'warn', details:'No data pasted.', fix:'Run: Get-Tpm' });
  }

  // Device Guard / VBS / HVCI
  if (guard.trim()) {
    const hvci = /(HVCI|Virtualization-based Security|Credential Guard)/i.test(guard) &&
                 /(Running|Enabled|1)/i.test(guard);
    checks.push({
      label:'VBS / HVCI / Credential Guard',
      level: hvci ? 'ok' : 'warn',
      details: hvci ? 'Enabled/running' : 'Not detected',
      fix:'Consider enabling Core Isolation (Memory Integrity) / Credential Guard.'
    });
  } else {
    checks.push({ label:'VBS / HVCI / Credential Guard', level:'warn', details:'No data pasted.', fix:'Run: Get-CimInstance Win32_DeviceGuard | fl *' });
  }

  // Ports (netstat -ano)
  let risky: number[] = [];
  if (ports.trim()) {
    const lines = ports.split('\n');
    const listen = lines.filter(l => /LISTENING/i.test(l));
    const portsFound: number[] = [];
    for (const l of listen) {
      const m = l.match(/[:\.](\d+)\s+.*LISTENING/i);
      if (m) { const p = Number(m[1]); if (Number.isFinite(p)) portsFound.push(p); }
    }
    risky = portsFound.filter(p => RISKY_PORTS.has(p));
    if (risky.length) {
      checks.push({ label:'Open ports (risk)', level:'warn', details:`Risky ports listening: ${Array.from(new Set(risky)).sort((a,b)=>a-b).join(', ')}`, fix:'Restrict services, bind to localhost, or close ports in the firewall.' });
    } else {
      checks.push({ label:'Open ports (risk)', level:'ok', details:'No risky ports detected listening.' });
    }
  } else {
    checks.push({ label:'Open ports (risk)', level:'warn', details:'No data pasted.', fix:'Run: netstat -ano | findstr LISTENING' });
  }

  const score = scoreChecks(checks);
  return { os:'windows', checks, riskyPorts: risky, notes, score, grade: toGrade(score) };
}

// macOS
function parseMac(fv: string, sip: string, gate: string, ports: string): Result {
  const checks: Check[] = [];
  const notes: string[] = [];

  // FileVault
  if (fv.trim()) {
    const on = /FileVault is On/i.test(fv);
    checks.push({ label:'Disk encryption (FileVault)', level: on ? 'ok' : 'fail', details: on ? 'On' : 'Off', fix:'Enable FileVault in System Settings → Privacy & Security.' });
  } else {
    checks.push({ label:'Disk encryption (FileVault)', level:'warn', details:'No data pasted.', fix:'Run: fdesetup status' });
  }

  // SIP
  if (sip.trim()) {
    const enabled = /status:\s*enabled/i.test(sip);
    checks.push({ label:'System Integrity Protection (SIP)', level: enabled ? 'ok' : 'fail', details: enabled ? 'Enabled' : 'Disabled', fix:'Boot to recovery and run `csrutil enable` (if compatible).' });
  } else {
    checks.push({ label:'SIP', level:'warn', details:'No data pasted.', fix:'Run: csrutil status' });
  }

  // Gatekeeper
  if (gate.trim()) {
    const en = /assessments enabled/i.test(gate);
    checks.push({ label:'Gatekeeper', level: en ? 'ok' : 'warn', details: en ? 'Enabled' : 'Disabled', fix:'Enable Gatekeeper: `spctl --master-enable`.' });
  } else {
    checks.push({ label:'Gatekeeper', level:'warn', details:'No data pasted.', fix:'Run: spctl --status' });
  }

  // Ports (lsof -nP -iTCP -sTCP:LISTEN)
  let risky: number[] = [];
  if (ports.trim()) {
    const lines = ports.split('\n');
    const portsFound: number[] = [];
    for (const l of lines) {
      const m = l.match(/:(\d+)\s+\(LISTEN\)/i);
      if (m) { const p = Number(m[1]); if (Number.isFinite(p)) portsFound.push(p); }
    }
    risky = portsFound.filter(p => RISKY_PORTS.has(p));
    if (risky.length) {
      checks.push({ label:'Open ports (risk)', level:'warn', details:`Risky ports listening: ${Array.from(new Set(risky)).sort((a,b)=>a-b).join(', ')}`, fix:'Stop services or limit to 127.0.0.1; use the firewall.' });
    } else {
      checks.push({ label:'Open ports (risk)', level:'ok', details:'No risky ports detected listening.' });
    }
  } else {
    checks.push({ label:'Open ports (risk)', level:'warn', details:'No data pasted.', fix:'Run: lsof -nP -iTCP -sTCP:LISTEN' });
  }

  const score = scoreChecks(checks);
  return { os:'mac', checks, riskyPorts: risky, notes, score, grade: toGrade(score) };
}

// Linux
function parseLinux(enc: string, sb: string, mls: string, ports: string): Result {
  const checks: Check[] = [];
  const notes: string[] = [];

  // Encryption (lsblk/cryptsetup status)
  if (enc.trim()) {
    const luks = /(crypto_LUKS|type=crypt|dm-crypt)/i.test(enc) || /is active and is in use/i.test(enc);
    checks.push({ label:'Disk encryption (LUKS/dm-crypt)', level: luks ? 'ok' : 'fail', details: luks ? 'Detected encrypted volumes' : 'No encryption detected', fix:'Use LUKS/dm-crypt for OS/data partitions.' });
  } else {
    checks.push({ label:'Disk encryption (LUKS/dm-crypt)', level:'warn', details:'No data pasted.', fix:'Run: lsblk -o NAME,FSTYPE,TYPE,MOUNTPOINT' });
  }

  // Secure Boot (mokutil --sb-state)
  if (sb.trim()) {
    const on = /enabled/i.test(sb) && !/disabled/i.test(sb);
    checks.push({ label:'Secure Boot', level: on ? 'ok' : 'warn', details: on ? 'Enabled' : 'Disabled', fix:'Enable UEFI Secure Boot if your distro supports it.' });
  } else {
    checks.push({ label:'Secure Boot', level:'warn', details:'No data pasted.', fix:'Run: mokutil --sb-state' });
  }

  // MAC/LSM (SELinux/AppArmor)
  if (mls.trim()) {
    const sel = /Enforcing/i.test(mls);
    const aa = /profiles are in enforce mode/i.test(mls) || /apparmor.*loaded/i.test(mls);
    const ok = sel || aa;
    checks.push({ label:'SELinux/AppArmor', level: ok ? 'ok' : 'warn', details: sel ? 'SELinux Enforcing' : aa ? 'AppArmor enforcing' : 'Not enforcing', fix:'Enable SELinux (Enforcing) or AppArmor.' });
  } else {
    checks.push({ label:'SELinux/AppArmor', level:'warn', details:'No data pasted.', fix:'Run: getenforce  &&  aa-status --enabled' });
  }

  // Ports (ss -tulpen)
  let risky: number[] = [];
  if (ports.trim()) {
    const lines = ports.split('\n');
    const portsFound: number[] = [];
    for (const l of lines) {
      if (!/LISTEN/i.test(l)) continue;
      const m = l.match(/[:](\d+)\s/);
      if (m) { const p = Number(m[1]); if (Number.isFinite(p)) portsFound.push(p); }
    }
    risky = portsFound.filter(p => RISKY_PORTS.has(p));
    if (risky.length) {
      checks.push({ label:'Open ports (risk)', level:'warn', details:`Risky ports listening: ${Array.from(new Set(risky)).sort((a,b)=>a-b).join(', ')}`, fix:'Stop/limit services; bind to localhost; harden firewall.' });
    } else {
      checks.push({ label:'Open ports (risk)', level:'ok', details:'No risky ports detected listening.' });
    }
  } else {
    checks.push({ label:'Open ports (risk)', level:'warn', details:'No data pasted.', fix:'Run: ss -tulpen' });
  }

  const score = scoreChecks(checks);
  return { os:'linux', checks, riskyPorts: risky, notes, score, grade: toGrade(score) };
}

/* ---------- scoring ---------- */
function scoreChecks(checks: Check[]) {
  // ok = +10, warn = +5, fail = 0 per check (cap 100)
  const pts = checks.map(c => c.level === 'ok' ? 10 : c.level === 'warn' ? 5 : 0)
                    .reduce((a,b)=>a+b, 0);
  return Math.min(100, pts);
}
function toGrade(score: number): Result['grade'] {
  return score>=90?'A':score>=80?'B':score>=65?'C':score>=50?'D':'F';
}

/* ---------- page ---------- */
export default function EndpointHardening() {
  const [os, setOs] = useState<'windows'|'mac'|'linux'>('windows');

  // Windows inputs
  const [winBL, setWinBL] = useState('');
  const [winBoot, setWinBoot] = useState('');
  const [winTPM, setWinTPM] = useState('');
  const [winGuard, setWinGuard] = useState('');
  const [winPorts, setWinPorts] = useState('');

  // macOS inputs
  const [macFV, setMacFV] = useState('');
  const [macSIP, setMacSIP] = useState('');
  const [macGate, setMacGate] = useState('');
  const [macPorts, setMacPorts] = useState('');

  // Linux inputs
  const [linEnc, setLinEnc] = useState('');
  const [linSB, setLinSB] = useState('');
  const [linMLS, setLinMLS] = useState('');
  const [linPorts, setLinPorts] = useState('');

  const result = useMemo<Result>(() => {
    if (os === 'windows') return parseWindows(winBL, winBoot, winTPM, winGuard, winPorts);
    if (os === 'mac') return parseMac(macFV, macSIP, macGate, macPorts);
    return parseLinux(linEnc, linSB, linMLS, linPorts);
  }, [os, winBL, winBoot, winTPM, winGuard, winPorts, macFV, macSIP, macGate, macPorts, linEnc, linSB, linMLS, linPorts]);

  const cmds = {
    windows: `# Run in elevated PowerShell
manage-bde -status
Confirm-SecureBootUEFI
Get-Tpm | Format-List *
Get-CimInstance Win32_DeviceGuard | Format-List *
netstat -ano | findstr LISTENING`,
    mac: `# Run in Terminal
fdesetup status
csrutil status
spctl --status
lsof -nP -iTCP -sTCP:LISTEN`,
    linux: `# Run as root where needed
lsblk -o NAME,FSTYPE,TYPE,MOUNTPOINT
mokutil --sb-state
getenforce || echo "SELinux not present"
aa-status --enabled || echo "AppArmor not present"
ss -tulpen`
  };

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Local Machine Hardening Checker</h1>
      <p style={{ margin:0, color:'#555' }}>
        Run the commands for your OS, paste the outputs below, and get a quick breach-readiness grade with concrete fixes.
        This runs entirely in your browser — no system access.
      </p>

      {/* OS selector */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Select OS</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button
            onClick={()=>setOs('windows')}
            style={{ ...btn, ...(os==='windows'?{ borderColor:'#2563eb', backgroundColor:'#eff6ff' }:{}) }}
          >
            Windows
          </button>
          <button
            onClick={()=>setOs('mac')}
            style={{ ...btn, ...(os==='mac'?{ borderColor:'#2563eb', backgroundColor:'#eff6ff' }:{}) }}
          >
            macOS
          </button>
          <button
            onClick={()=>setOs('linux')}
            style={{ ...btn, ...(os==='linux'?{ borderColor:'#2563eb', backgroundColor:'#eff6ff' }:{}) }}
          >
            Linux
          </button>
          <button onClick={()=>copy(cmds[os])} style={btn}>Copy commands</button>
        </div>
        <pre style={{ ...mono, background:'#f8fafc', border:'1px solid #eef2f7', padding:10, borderRadius:8, overflow:'auto', marginTop:8 }}>
{cmds[os]}
        </pre>
      </div>

      {/* Inputs per OS */}
      {os === 'windows' && (
        <div style={{ display:'grid', gap:12 }}>
          <div style={card}>
            <div style={{ fontWeight:700, marginBottom:6 }}>BitLocker — <code style={mono}>manage-bde -status</code></div>
            <textarea value={winBL} onChange={e=>setWinBL(e.target.value)} style={taCss} />
          </div>
          <div style={card}>
            <div style={{ fontWeight:700, marginBottom:6 }}>Secure Boot — <code style={mono}>Confirm-SecureBootUEFI</code></div>
            <textarea value={winBoot} onChange={e=>setWinBoot(e.target.value)} style={taCss} />
          </div>
          <div style={card}>
            <div style={{ fontWeight:700, marginBottom:6 }}>TPM — <code style={mono}>Get-Tpm</code></div>
            <textarea value={winTPM} onChange={e=>setWinTPM(e.target.value)} style={taCss} />
          </div>
          <div style={card}>
            <div style={{ fontWeight:700, marginBottom:6 }}>Device Guard / VBS — <code style={mono}>Get-CimInstance Win32_DeviceGuard</code></div>
            <textarea value={winGuard} onChange={e=>setWinGuard(e.target.value)} style={taCss} />
          </div>
          <div style={card}>
            <div style={{ fontWeight:700, marginBottom:6 }}>Open ports — <code style={mono}>netstat -ano | findstr LISTENING</code></div>
            <textarea value={winPorts} onChange={e=>setWinPorts(e.target.value)} style={taCss} />
          </div>
        </div>
      )}

      {os === 'mac' && (
        <div style={{ display:'grid', gap:12 }}>
          <div style={card}><div style={{ fontWeight:700, marginBottom:6 }}>FileVault — <code style={mono}>fdesetup status</code></div><textarea value={macFV} onChange={e=>setMacFV(e.target.value)} style={taCss} /></div>
          <div style={card}><div style={{ fontWeight:700, marginBottom:6 }}>SIP — <code style={mono}>csrutil status</code></div><textarea value={macSIP} onChange={e=>setMacSIP(e.target.value)} style={taCss} /></div>
          <div style={card}><div style={{ fontWeight:700, marginBottom:6 }}>Gatekeeper — <code style={mono}>spctl --status</code></div><textarea value={macGate} onChange={e=>setMacGate(e.target.value)} style={taCss} /></div>
          <div style={card}><div style={{ fontWeight:700, marginBottom:6 }}>Open ports — <code style={mono}>lsof -nP -iTCP -sTCP:LISTEN</code></div><textarea value={macPorts} onChange={e=>setMacPorts(e.target.value)} style={taCss} /></div>
        </div>
      )}

      {os === 'linux' && (
        <div style={{ display:'grid', gap:12 }}>
          <div style={card}><div style={{ fontWeight:700, marginBottom:6 }}>Disks — <code style={mono}>lsblk -o NAME,FSTYPE,TYPE,MOUNTPOINT</code> / <code style={mono}>cryptsetup status</code></div><textarea value={linEnc} onChange={e=>setLinEnc(e.target.value)} style={taCss} /></div>
          <div style={card}><div style={{ fontWeight:700, marginBottom:6 }}>Secure Boot — <code style={mono}>mokutil --sb-state</code></div><textarea value={linSB} onChange={e=>setLinSB(e.target.value)} style={taCss} /></div>
          <div style={card}><div style={{ fontWeight:700, marginBottom:6 }}>SELinux/AppArmor — <code style={mono}>getenforce</code> / <code style={mono}>aa-status --enabled</code></div><textarea value={linMLS} onChange={e=>setLinMLS(e.target.value)} style={taCss} /></div>
          <div style={card}><div style={{ fontWeight:700, marginBottom:6 }}>Open ports — <code style={mono}>ss -tulpen</code></div><textarea value={linPorts} onChange={e=>setLinPorts(e.target.value)} style={taCss} /></div>
        </div>
      )}

      {/* Results */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontWeight:700 }}>Result</div>
          <div style={{ fontSize:26, fontWeight:800 }}>{result.grade} <span style={{ fontSize:14, color:'#6b7280' }}>({result.score}/100)</span></div>
        </div>
        <div style={{ display:'grid', gap:8, marginTop:8 }}>
          {result.checks.map((c, i) => (
            <div key={i} style={{ display:'grid', gap:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={badge(c.level)}>{c.level.toUpperCase()}</span>
                <div style={{ fontWeight:600 }}>{c.label}</div>
              </div>
              <div style={{ color:'#374151' }}>{c.details}</div>
              {c.fix && <div style={{ color:'#2563eb' }}>Fix: {c.fix}</div>}
              <div style={{ height:1, background:'#f1f5f9', margin:'6px 0' }} />
            </div>
          ))}
        </div>
        {result.riskyPorts.length > 0 && (
          <div style={{ marginTop:6, fontSize:12, color:'#6b7280' }}>
            Tip: ports like {Array.from(new Set(result.riskyPorts)).sort((a,b)=>a-b).join(', ')} should not be exposed to the internet; bind to localhost or firewall them.
          </div>
        )}
      </div>

      <div style={{ fontSize:12, color:'#6b7280' }}>
        Note: This page parses common command outputs. Some environments produce different wording; when in doubt, follow the fixes shown.
      </div>
    </div>
  );
}
