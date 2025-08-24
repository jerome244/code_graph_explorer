'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* ---------- tiny UI ---------- */
const mono: React.CSSProperties = { fontFamily:'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const btn: React.CSSProperties = {
  borderWidth:1, borderStyle:'solid', borderColor:'#e5e7eb',
  backgroundColor:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer'
};
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', width:'100%', font:'inherit' };
const taCss: React.CSSProperties = { ...inputCss, height:120, resize:'vertical' as const };

/* ---------- types ---------- */
type Participant = { id: string; name: string; role?: string; present: boolean };
type AgendaItem = { id: string; title: string; owner?: string; minutes: number; notes?: string };
type ActionItem = { id: string; text: string; owner?: string; due?: string; done: boolean };

type Meeting = {
  title: string;
  dateLocal: string;        // 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">
  timezone: string;         // IANA tz, e.g., 'Europe/Paris'
  durationMin: number;
  platform: 'Zoom'|'Google Meet'|'Teams'|'Jitsi'|'Other';
  link?: string;
  participants: Participant[];
  agenda: AgendaItem[];
  actions: ActionItem[];
  notes: string;
};

const DEFAULT_TZS = ['Europe/Paris', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Kolkata', 'Asia/Tokyo'];

/* ---------- helpers ---------- */
function uid() { return Math.random().toString(36).slice(2, 9); }

function nowPlus(minutes: number) {
  const d = new Date(Date.now() + minutes*60000);
  return d;
}

function toInputLocal(d: Date) {
  const pad = (n:number)=>String(n).padStart(2,'0');
  const y=d.getFullYear(), m=pad(d.getMonth()+1), day=pad(d.getDate()), h=pad(d.getHours()), mm=pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${mm}`;
}

function parseInputLocal(s: string) {
  // treat as local time
  return new Date(s);
}

function fmtInTZ(d: Date, tz: string) {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year:'numeric', month:'short', day:'2-digit',
      hour:'2-digit', minute:'2-digit'
    });
    return fmt.format(d);
  } catch {
    return d.toString();
  }
}

function toICS(meeting: Meeting) {
  const start = parseInputLocal(meeting.dateLocal);
  const end = new Date(start.getTime() + meeting.durationMin*60000);
  const toUtcBasic = (d: Date) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    const y=z.getUTCFullYear(), m=String(z.getUTCMonth()+1).padStart(2,'0'), da=String(z.getUTCDate()).padStart(2,'0');
    const h=String(z.getUTCHours()).padStart(2,'0'), mi=String(z.getUTCMinutes()).padStart(2,'0'), s=String(z.getUTCSeconds()).padStart(2,'0');
    return `${y}${m}${da}T${h}${mi}${s}Z`;
  };
  const esc = (s:string)=>s.replace(/([,;])/g,'\\$1').replace(/\n/g,'\\n');

  const agendaText = meeting.agenda.map((a,i)=>`${i+1}. ${a.title}${a.owner?` (${a.owner})`:''} — ${a.minutes}m`).join('\\n');
  const desc = `Join: ${meeting.link||''}\\nPlatform: ${meeting.platform}\\nAgenda:\\n${agendaText}`;

  const uidv = `${uid()}@meetinghub.local`;
  const now = toUtcBasic(new Date());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Team Meeting Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uidv}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toUtcBasic(start)}`,
    `DTEND:${toUtcBasic(end)}`,
    `SUMMARY:${esc(meeting.title || 'Team Meeting')}`,
    `DESCRIPTION:${esc(desc)}`,
    'LOCATION:Online',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function download(filename: string, text: string, mime='text/plain') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}

function toMarkdown(meeting: Meeting) {
  const start = parseInputLocal(meeting.dateLocal);
  const lines = [
`# ${meeting.title || 'Team Meeting'}`,
`- When: ${fmtInTZ(start, meeting.timezone)} (${meeting.timezone}), ${meeting.durationMin} min`,
meeting.link ? `- Link: ${meeting.link}` : '',
`- Platform: ${meeting.platform}`,
'',
'## Participants',
meeting.participants.map(p=>`- ${p.present?'[x]':'[ ]'} ${p.name}${p.role?` — ${p.role}`:''}`).join('\n') || '_none_',
'',
'## Agenda',
meeting.agenda.map((a,i)=>`${i+1}. **${a.title}** ${a.owner?`(${a.owner})`:''} — ${a.minutes} min`).join('\n') || '_none_',
'',
'## Notes',
meeting.notes || '_none_',
'',
'## Per-agenda notes',
meeting.agenda.map((a,i)=>`### ${i+1}. ${a.title}\n${a.notes?.trim()||'_—_'}\n`).join('\n'),
'',
'## Action Items',
meeting.actions.length ? meeting.actions.map(a=>`- [${a.done?'x':' '}] ${a.text}${a.owner?` — @${a.owner}`:''}${a.due?` (due ${a.due})`:''}`).join('\n') : '_none_'
  ];
  return lines.filter(Boolean).join('\n');
}

/* ---------- beeper ---------- */
function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.6);
  } catch {}
}

/* ---------- page ---------- */
export default function MeetingHub() {
  const defaultTZ = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
    catch { return 'Europe/Paris'; }
  }, []);

  const [meeting, setMeeting] = useState<Meeting>({
    title: 'Weekly Sync',
    dateLocal: toInputLocal(nowPlus(60)), // one hour from now
    timezone: defaultTZ,
    durationMin: 45,
    platform: 'Google Meet',
    link: '',
    participants: [
      { id: uid(), name: 'Alice', role: 'PM', present: true },
      { id: uid(), name: 'Bob', role: 'Eng', present: true },
    ],
    agenda: [
      { id: uid(), title: 'Status updates', owner: 'All', minutes: 10, notes: '' },
      { id: uid(), title: 'Blockers', owner: 'Team', minutes: 10, notes: '' },
      { id: uid(), title: 'Next sprint scope', owner: 'Alice', minutes: 20, notes: '' },
    ],
    actions: [],
    notes: '',
  });

  /* ------ localStorage save/load ------ */
  useEffect(() => {
    const saved = localStorage.getItem('meeting-hub-state');
    if (saved) {
      try { setMeeting(JSON.parse(saved)); } catch {}
    }
  }, []);
  function saveLocal() {
    localStorage.setItem('meeting-hub-state', JSON.stringify(meeting));
  }
  function clearLocal() {
    localStorage.removeItem('meeting-hub-state');
  }

  /* ------ agenda timer ------ */
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null); // seconds
  const tickRef = useRef<number | null>(null);

  const totalPlanned = meeting.agenda.reduce((s,a)=>s + (a.minutes||0), 0);
  const current = meeting.agenda[currentIdx];

  useEffect(() => {
    if (!running || !current) return;
    if (remaining == null) setRemaining((current.minutes||1)*60);
    tickRef.current = window.setInterval(() => {
      setRemaining(prev => {
        if (prev == null) return null;
        if (prev <= 1) {
          window.clearInterval(tickRef.current!);
          beep();
          return 0;
        }
        return prev - 1;
      });
    }, 1000) as any;
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, currentIdx, current?.id]);

  function start() {
    if (!current) return;
    if (remaining == null || remaining === 0) setRemaining((current.minutes||1)*60);
    setRunning(true);
  }
  function pause() { setRunning(false); if (tickRef.current) window.clearInterval(tickRef.current); }
  function resetItem() { pause(); setRemaining((current?.minutes||1)*60); }
  function nextItem() {
    pause();
    setRemaining(null);
    setCurrentIdx(i => Math.min(meeting.agenda.length-1, i+1));
  }
  function prevItem() {
    pause();
    setRemaining(null);
    setCurrentIdx(i => Math.max(0, i-1));
  }

  /* ------ computed helpers ------ */
  const startDate = useMemo(()=>parseInputLocal(meeting.dateLocal), [meeting.dateLocal]);
  const endDate = useMemo(()=>new Date(startDate.getTime() + meeting.durationMin*60000), [startDate, meeting.durationMin]);

  const otherTzs = useMemo(()=>{
    const base = [meeting.timezone, ...DEFAULT_TZS.filter(t=>t!==meeting.timezone)];
    return base.slice(0, 4);
  }, [meeting.timezone]);

  /* ------ mutators ------ */
  function update<K extends keyof Meeting>(k: K, v: Meeting[K]) {
    setMeeting(m => ({ ...m, [k]: v }));
  }
  function updateAgenda(id: string, patch: Partial<AgendaItem>) {
    setMeeting(m => ({ ...m, agenda: m.agenda.map(a => a.id===id ? {...a, ...patch} : a) }));
  }
  function addAgenda() {
    setMeeting(m => ({ ...m, agenda: [...m.agenda, { id: uid(), title:'New item', minutes:5, notes:'' }] }));
  }
  function removeAgenda(id: string) {
    setMeeting(m => ({ ...m, agenda: m.agenda.filter(a=>a.id!==id) }));
  }
  function moveAgenda(id: string, dir: -1|1) {
    setMeeting(m => {
      const i = m.agenda.findIndex(a=>a.id===id);
      if (i<0) return m;
      const j = Math.max(0, Math.min(m.agenda.length-1, i+dir));
      const arr = m.agenda.slice();
      const [x] = arr.splice(i,1);
      arr.splice(j,0,x);
      return { ...m, agenda: arr };
    });
  }

  function addParticipant() {
    setMeeting(m => ({ ...m, participants: [...m.participants, { id: uid(), name:'New member', role:'', present:false }] }));
  }
  function updateParticipant(id: string, patch: Partial<Participant>) {
    setMeeting(m => ({ ...m, participants: m.participants.map(p=>p.id===id ? { ...p, ...patch } : p) }));
  }
  function removeParticipant(id: string) {
    setMeeting(m => ({ ...m, participants: m.participants.filter(p=>p.id!==id) }));
  }

  function addAction() {
    setMeeting(m => ({ ...m, actions: [...m.actions, { id: uid(), text:'New action', owner:'', due:'', done:false }] }));
  }
  function updateAction(id: string, patch: Partial<ActionItem>) {
    setMeeting(m => ({ ...m, actions: m.actions.map(a=>a.id===id ? { ...a, ...patch } : a) }));
  }
  function removeAction(id: string) {
    setMeeting(m => ({ ...m, actions: m.actions.filter(a=>a.id!==id) }));
  }

  /* ------ UI ------ */
  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Team Video Meeting Hub</h1>
      <p style={{ margin:0, color:'#555' }}>
        Plan your call, run the agenda with a timer, take notes, and export minutes + an ICS invite. All in your browser.
      </p>

      {/* MEETING INFO */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Meeting details</div>
        <div style={{ display:'grid', gap:10, gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label>Title <input value={meeting.title} onChange={e=>update('title', e.target.value)} style={inputCss} /></label>
          <label>Start (local)
            <input type="datetime-local" value={meeting.dateLocal} onChange={e=>update('dateLocal', e.target.value)} style={inputCss} />
          </label>
          <label>Timezone
            <select value={meeting.timezone} onChange={e=>update('timezone', e.target.value)} style={inputCss}>
              {[meeting.timezone, ...DEFAULT_TZS.filter(t=>t!==meeting.timezone)].map(tz=>(
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
          <label>Duration (min)
            <input type="number" value={meeting.durationMin} onChange={e=>update('durationMin', Math.max(5, Number(e.target.value)||30))} style={{...inputCss, width:120}} />
          </label>
          <label>Platform
            <select value={meeting.platform} onChange={e=>update('platform', e.target.value as any)} style={inputCss}>
              <option>Google Meet</option>
              <option>Zoom</option>
              <option>Teams</option>
              <option>Jitsi</option>
              <option>Other</option>
            </select>
          </label>
          <label>Meeting link
            <input placeholder="https://meet..." value={meeting.link||''} onChange={e=>update('link', e.target.value)} style={inputCss} />
          </label>
        </div>

        <div style={{ marginTop:10, fontSize:12, color:'#6b7280' }}>
          Times in other zones:&nbsp;
          {otherTzs.map((tz,i)=>(
            <span key={tz}>{i>0?' · ':''}{fmtInTZ(startDate, tz)} ({tz})</span>
          ))}
          <div>Ends: {fmtInTZ(endDate, meeting.timezone)} ({meeting.timezone})</div>
        </div>

        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          <button
            onClick={()=>{
              const lines = [
                `Subject: ${meeting.title}`,
                `When: ${fmtInTZ(startDate, meeting.timezone)} (${meeting.timezone}) · ${meeting.durationMin} min`,
                meeting.link ? `Join: ${meeting.link}` : '',
                `Platform: ${meeting.platform}`,
                '',
                'Agenda:',
                ...meeting.agenda.map((a,i)=>`  ${i+1}. ${a.title}${a.owner?` (${a.owner})`:''} — ${a.minutes}m`)
              ].filter(Boolean).join('\n');
              navigator.clipboard.writeText(lines).catch(()=>{});
            }}
            style={btn}
          >Copy invite text</button>

          <button onClick={()=>download('meeting.ics', toICS(meeting), 'text/calendar')} style={btn}>Download .ics</button>

          <button onClick={saveLocal} style={btn}>Save to browser</button>
          <button onClick={clearLocal} style={btn}>Clear saved</button>
        </div>
      </div>

      {/* PARTICIPANTS */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Participants</div>
        <div style={{ display:'grid', gap:8 }}>
          {meeting.participants.map(p=>(
            <div key={p.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr 1fr auto auto', gap:8, alignItems:'center' }}>
              <input type="checkbox" checked={p.present} onChange={e=>updateParticipant(p.id, { present: e.target.checked })} title="Present" />
              <input value={p.name} onChange={e=>updateParticipant(p.id, { name: e.target.value })} placeholder="Name" style={inputCss} />
              <input value={p.role||''} onChange={e=>updateParticipant(p.id, { role: e.target.value })} placeholder="Role" style={inputCss} />
              <button onClick={()=>updateParticipant(p.id, { present: !p.present })} style={btn}>{p.present?'✓ Present':'Mark present'}</button>
              <button onClick={()=>removeParticipant(p.id)} style={btn}>Remove</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop:8 }}><button onClick={addParticipant} style={btn}>+ Add participant</button></div>
      </div>

      {/* AGENDA & TIMER */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontWeight:700 }}>Agenda</div>
          <div style={{ color:'#6b7280' }}>Planned total: {totalPlanned} min</div>
        </div>

        <div style={{ display:'grid', gap:10, marginTop:8 }}>
          {meeting.agenda.map((a, idx)=>(
            <div key={a.id} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 160px auto auto auto', gap:8, alignItems:'center' }}>
                <input value={a.title} onChange={e=>updateAgenda(a.id, { title: e.target.value })} placeholder={`Item ${idx+1}`} style={inputCss} />
                <input type="number" value={a.minutes} onChange={e=>updateAgenda(a.id, { minutes: Math.max(1, Number(e.target.value)||5) })} style={{...inputCss, width:120}} title="minutes" />
                <input value={a.owner||''} onChange={e=>updateAgenda(a.id, { owner: e.target.value })} placeholder="Owner" style={inputCss} />
                <button onClick={()=>moveAgenda(a.id, -1)} style={btn}>↑</button>
                <button onClick={()=>moveAgenda(a.id, +1)} style={btn}>↓</button>
                <button onClick={()=>removeAgenda(a.id)} style={btn}>Remove</button>
              </div>
              <div style={{ marginTop:8 }}>
                <textarea value={a.notes||''} onChange={e=>updateAgenda(a.id, { notes: e.target.value })} placeholder="Notes for this item…" style={taCss} />
              </div>

              {idx === currentIdx && (
                <div style={{ marginTop:8, background:'#f8fafc', border:'1px solid #eef2f7', borderRadius:8, padding:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div><b>Timer for this item</b></div>
                    <div style={{ color:'#6b7280' }}>{a.minutes} min planned</div>
                  </div>
                  {/* progress */}
                  <div style={{ height:8, background:'#e5e7eb', borderRadius:999, marginTop:8, overflow:'hidden' }}>
                    <div
                      style={{
                        height:'100%',
                        width: (()=> {
                          const total = (a.minutes||1)*60;
                          const remain = remaining==null ? total : Math.max(0, remaining);
                          const done = 1 - (remain/total);
                          return `${Math.min(100, Math.max(0, done*100))}%`;
                        })(),
                        background:'#2563eb'
                      }}
                    />
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
                    <button onClick={start} style={btn}>Start</button>
                    <button onClick={pause} style={btn}>Pause</button>
                    <button onClick={resetItem} style={btn}>Reset</button>
                    <button onClick={prevItem} style={btn}>Prev item</button>
                    <button onClick={nextItem} style={btn}>Next item</button>
                    <div style={mono}>
                      {(() => {
                        const total = (a.minutes||1)*60;
                        const r = remaining==null ? total : Math.max(0, remaining);
                        const mm = String(Math.floor(r/60)).padStart(2,'0');
                        const ss = String(Math.floor(r%60)).padStart(2,'0');
                        return `${mm}:${ss}`;
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop:8, display:'flex', gap:8 }}>
          <button onClick={addAgenda} style={btn}>+ Add agenda item</button>
          <button
            onClick={()=>{
              setCurrentIdx(0);
              setRemaining(null);
              setRunning(false);
            }}
            style={btn}
          >Focus first item</button>
        </div>
      </div>

      {/* GENERAL NOTES */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>General notes</div>
        <textarea value={meeting.notes} onChange={e=>update('notes', e.target.value)} placeholder="Shared notes, decisions…" style={{ ...taCss, height:160 }} />
      </div>

      {/* ACTION ITEMS */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Action items</div>
        <div style={{ display:'grid', gap:8 }}>
          {meeting.actions.map(a=>(
            <div key={a.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr 160px 160px auto', gap:8, alignItems:'center' }}>
              <input type="checkbox" checked={a.done} onChange={e=>updateAction(a.id, { done: e.target.checked })} />
              <input value={a.text} onChange={e=>updateAction(a.id, { text: e.target.value })} placeholder="Action to do…" style={inputCss} />
              <input value={a.owner||''} onChange={e=>updateAction(a.id, { owner: e.target.value })} placeholder="Owner" style={inputCss} />
              <input type="date" value={a.due||''} onChange={e=>updateAction(a.id, { due: e.target.value })} style={inputCss} />
              <button onClick={()=>removeAction(a.id)} style={btn}>Remove</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop:8 }}><button onClick={addAction} style={btn}>+ Add action</button></div>

        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button onClick={()=>download('meeting-minutes.md', toMarkdown(meeting), 'text/markdown')} style={btn}>Export minutes (.md)</button>
        </div>
      </div>

      <div style={{ fontSize:12, color:'#6b7280' }}>
        Tip: Use “Save to browser” before the meeting starts; you can reload the page safely without losing progress.
      </div>
    </div>
  );
}
