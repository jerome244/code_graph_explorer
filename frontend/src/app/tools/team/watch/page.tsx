'use client';

import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const btn: React.CSSProperties  = { borderWidth:1, borderStyle:'solid', borderColor:'#e5e7eb', backgroundColor:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', font:'inherit' };
const mono: React.CSSProperties = { fontFamily:'ui-monospace, Menlo, monospace' };

type SourceType = 'url' | 'youtube';
type WatchEvent =
  | { kind:'watch', action:'load', type:SourceType, url:string, at:number, time?:number }
  | { kind:'watch', action:'play', at:number, time:number }
  | { kind:'watch', action:'pause', at:number, time:number }
  | { kind:'watch', action:'seek', at:number, time:number }
  | { kind:'watch', action:'state', at:number, time:number }
  | { kind:'watch', action:'host', at:number, host:string };

type Msg = { from: string; text: string; ts: number };

const DRIFT_SEC = 0.5;
const SYNC_EVERY_MS = 2000;

export default function WatchPartyPage() {
  const [roomId, setRoomId] = useState('cinema');
  const [joined, setJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const hostIdRef = useRef<string | null>(null);

  // media state
  const [sourceType, setSourceType] = useState<SourceType>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // YouTube
  const ytDivRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytPlayerReadyRef = useRef(false);
  const [ytReady, setYtReady] = useState(false);

  // chat
  const [chatDraft, setChatDraft] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);

  // Invite URL (client only)
  const [inviteUrl, setInviteUrl] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    u.searchParams.set('room', roomId);
    setInviteUrl(u.toString());
  }, [roomId]);

  // read ?room
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const r = new URL(window.location.href).searchParams.get('room');
    if (r) setRoomId(r);
  }, []);

  // Ensure Socket.IO (no warm-up fetch)
  async function ensureSocket() {
    if (socketRef.current) return socketRef.current;
    const s = io({ path: '/api/socket' });
    socketRef.current = s;

    s.on('connect', () => { /* ok */ });

    s.on('peers', (peers: string[]) => {
      const firstHost = peers.length === 0;
      setIsHost(firstHost);
      hostIdRef.current = firstHost ? s.id : peers[0];
      setParticipants([s.id, ...peers]);
    });

    s.on('peer-joined', (pid: string) => {
      setParticipants(prev => Array.from(new Set([...prev, pid])));
      if (isHost) sendState(); // sync newcomer
    });

    s.on('peer-left', (pid: string) => {
      setParticipants(prev => prev.filter(x => x !== pid));
      if (hostIdRef.current === pid) hostIdRef.current = null;
    });

    s.on('broadcast', (payload: any) => {
      if (payload.kind === 'chat') {
        pushMsg({ from: payload.from || 'peer', text: payload.text, ts: payload.ts || Date.now() });
      }
      if (payload.kind === 'watch') {
        onWatchEvent(payload as WatchEvent);
      }
    });

    return s;
  }

  function pushMsg(m: Msg) {
    setMessages(arr => [...arr, m].slice(-500));
  }

  async function join() {
    const s = await ensureSocket();
    s.emit('join', roomId);
    setJoined(true);
  }

  function broadcast(ev: WatchEvent) {
    socketRef.current?.emit('broadcast', ev);
  }

  /* ---------------- YouTube setup ---------------- */
  useEffect(() => {
    if (sourceType !== 'youtube') return;
    if (typeof window === 'undefined') return;
    const YT = (window as any).YT;
    if (YT?.Player) { setYtReady(true); return; }
    const id = 'yt-iframe-api';
    if (document.getElementById(id)) return;
    const tag = document.createElement('script');
    tag.id = id;
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
    (window as any).onYouTubeIframeAPIReady = () => setYtReady(true);
  }, [sourceType]);

  function extractYouTubeId(url: string): string | null {
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }

  function loadYouTube(url: string, startTime = 0) {
    if (!ytDivRef.current) return;
    const vid = extractYouTubeId(url);
    if (!vid) return;

    const applyLoad = () => {
      const p = ytPlayerRef.current;
      if (!p) return;
      const args = { videoId: vid, startSeconds: startTime || 0 };
      if (typeof p.loadVideoById === 'function') p.loadVideoById(args);
      else if (typeof p.cueVideoById === 'function') p.cueVideoById(args);
    };

    // Reuse existing player
    if (ytPlayerRef.current) {
      if (ytPlayerReadyRef.current) applyLoad();
      else setTimeout(applyLoad, 300);
      return;
    }

    // Create player
    ytPlayerRef.current = new (window as any).YT.Player(ytDivRef.current, {
      videoId: vid,
      playerVars: { controls: 1, rel: 0 },
      events: {
        onReady: () => { ytPlayerReadyRef.current = true; applyLoad(); },
        onStateChange: (e: any) => {
          const p = ytPlayerRef.current;
          if (!p || !joined || !isHost) return;
          const t = p.getCurrentTime?.() || 0;
          if (e.data === (window as any).YT.PlayerState.PLAYING) {
            broadcast({ kind:'watch', action:'play', at: Date.now(), time: t });
          } else if (e.data === (window as any).YT.PlayerState.PAUSED) {
            broadcast({ kind:'watch', action:'pause', at: Date.now(), time: t });
          }
        }
      }
    });
  }

  /* ---------------- Player abstraction ---------------- */
  function getTime(): number {
    if (sourceType === 'youtube' && ytPlayerRef.current) {
      return ytPlayerRef.current.getCurrentTime?.() || 0;
    }
    const v = videoRef.current;
    return v ? v.currentTime : 0;
  }
  function setTime(t: number) {
    if (sourceType === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo?.(t, true);
      return;
    }
    const v = videoRef.current;
    if (v) v.currentTime = t;
  }
  function play() {
    if (sourceType === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.playVideo?.(); return;
    }
    videoRef.current?.play().catch(()=>{});
  }
  function pause() {
    if (sourceType === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.pauseVideo?.(); return;
    }
    videoRef.current?.pause();
  }
  function isPaused(): boolean {
    if (sourceType === 'youtube' && ytPlayerRef.current) {
      const s = ytPlayerRef.current.getPlayerState?.();
      return s !== (window as any).YT?.PlayerState?.PLAYING;
    }
    const v = videoRef.current;
    return v ? v.paused : true;
  }

  function loadSource(kind: SourceType, url: string, startTime = 0) {
    setSourceType(kind);
    setVideoUrl(url);
    if (kind === 'youtube') {
      if (ytReady) {
        loadYouTube(url, startTime);
      } else {
        const tryLater = setInterval(() => {
          if (ytReady) { clearInterval(tryLater); loadYouTube(url, startTime); }
        }, 200);
      }
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.src = url;
    v.currentTime = startTime || 0;
    v.pause();
    v.load();
  }

  // HTML5 <video> event hooks (host-only control broadcast)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { if (!isHost) { v.pause(); } else broadcast({ kind:'watch', action:'play', at: Date.now(), time: v.currentTime }); };
    const onPause = () => { if (isHost) broadcast({ kind:'watch', action:'pause', at: Date.now(), time: v.currentTime }); };
    const onSeeked = () => { if (isHost) broadcast({ kind:'watch', action:'seek', at: Date.now(), time: v.currentTime }); };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeeked);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('seeked', onSeeked);
    };
  }, [isHost, sourceType, joined]);

  /* ---------------- Handle incoming events ---------------- */
  function onWatchEvent(ev: WatchEvent) {
    if (ev.action === 'host') {
      hostIdRef.current = (ev as any).host || null;
      setIsHost(socketRef.current?.id === hostIdRef.current);
      return;
    }

    const now = Date.now();
    const latency = Math.max(0, (now - ev.at) / 1000);
    if (ev.action === 'load') {
      loadSource(ev.type, ev.url, ev.time || 0);
      pause();
      setTimeout(() => { setTime((ev.time || 0) + latency); }, 0);
      return;
    }
    if (ev.action === 'play') {
      setTime(ev.time + latency);
      play();
      return;
    }
    if (ev.action === 'pause') {
      setTime(ev.time + latency);
      pause();
      return;
    }
    if (ev.action === 'seek') {
      setTime(ev.time + latency);
      return;
    }
    if (ev.action === 'state') {
      if (isHost) return;
      const target = ev.time + latency;
      const cur = getTime();
      if (Math.abs(cur - target) > DRIFT_SEC) setTime(target);
    }
  }

  // Host periodic sync
  useEffect(() => {
    if (!isHost || !joined) return;
    const id = window.setInterval(() => {
      broadcast({ kind:'watch', action:'state', at: Date.now(), time: getTime() });
    }, SYNC_EVERY_MS);
    return () => window.clearInterval(id);
  }, [isHost, joined, sourceType]);

  function sendState() {
    broadcast({ kind:'watch', action:'state', at: Date.now(), time: getTime() });
  }

  /* ---------------- UI actions ---------------- */
  function sendChat() {
    const text = chatDraft.trim();
    if (!text) return;
    socketRef.current?.emit('broadcast', { kind:'chat', text, ts: Date.now() });
    pushMsg({ from: socketRef.current?.id || 'me', text, ts: Date.now() });
    setChatDraft('');
  }

  function takeHost() {
    const me = socketRef.current?.id || '';
    hostIdRef.current = me;
    setIsHost(true);
    broadcast({ kind:'watch', action:'host', host: me, at: Date.now() } as any);
  }

  function loadClicked() {
    if (!isHost) return;
    if (!videoUrl) return;
    broadcast({ kind:'watch', action:'load', type: sourceType, url: videoUrl, at: Date.now(), time: getTime() });
    loadSource(sourceType, videoUrl, getTime());
  }

  // auto-detect YouTube links in the input
  function handleUrlChange(v: string) {
    setVideoUrl(v);
    if (/youtu(\.be|be\.com)/i.test(v)) setSourceType('youtube');
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Watch Party (Synchronized Video)</h1>
      <p style={{ margin:0, color:'#555' }}>
        Paste a public MP4 URL or a YouTube link. Everyone in the same room will play in sync.
      </p>

      {/* Controls */}
      <div style={card}>
        <div style={{ display:'grid', gap:10, gridTemplateColumns:'1fr auto auto auto auto', alignItems:'center' }}>
          <input value={roomId} onChange={(e)=>setRoomId(e.target.value)} style={inputCss} placeholder="Room ID" />
          {!joined ? (
            <button onClick={join} style={btn}>Join room</button>
          ) : (
            <>
              <button onClick={()=>{ navigator.clipboard.writeText(inviteUrl).catch(()=>{}); }} style={btn}>Copy invite</button>
              <span style={{ fontSize:12, color:'#6b7280' }}>
                {isHost ? 'You are host' : 'Viewer'} · {participants.length} in room
              </span>
              {!isHost && <button onClick={takeHost} style={btn}>Take host</button>}
            </>
          )}
        </div>

        <div style={{ display:'grid', gap:8, gridTemplateColumns:'160px 1fr auto', marginTop:10 }}>
          <select value={sourceType} onChange={(e)=>setSourceType(e.target.value as SourceType)} style={inputCss}>
            <option value="url">Direct URL (MP4/WebM)</option>
            <option value="youtube">YouTube</option>
          </select>
          <input
            value={videoUrl}
            onChange={(e)=>handleUrlChange(e.target.value)}
            placeholder={sourceType==='url' ? 'https://example.com/video.mp4' : 'https://youtu.be/VIDEO_ID'}
            style={inputCss}
          />
          <button onClick={loadClicked} style={btn} disabled={!isHost || !joined}>Load</button>
        </div>

        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          <button
            onClick={()=>{
              if (!isHost) return;
              broadcast({ kind:'watch', action:'play', at: Date.now(), time: getTime() });
              play();
            }}
            style={btn}
            disabled={!isHost}
          >Play</button>
          <button
            onClick={()=>{
              if (!isHost) return;
              broadcast({ kind:'watch', action:'pause', at: Date.now(), time: getTime() });
              pause();
            }}
            style={btn}
            disabled={!isHost}
          >Pause</button>
          <button
            onClick={()=>{
              if (!isHost) return;
              const t = Math.max(0, getTime() - 10);
              broadcast({ kind:'watch', action:'seek', at: Date.now(), time: t });
              setTime(t);
            }}
            style={btn}
            disabled={!isHost}
          >-10s</button>
          <button
            onClick={()=>{
              if (!isHost) return;
              const t = getTime() + 10;
              broadcast({ kind:'watch', action:'seek', at: Date.now(), time: t });
              setTime(t);
            }}
            style={btn}
            disabled={!isHost}
          >+10s</button>
          <button onClick={()=>setTime(getTime())} style={btn}>Sync now</button>
        </div>
      </div>

      {/* Player */}
      <div style={{ display:'grid', gap:12, gridTemplateColumns:'1fr 360px' }}>
        <div style={card}>
          {sourceType === 'youtube' ? (
            <div>
              <div ref={ytDivRef} style={{ aspectRatio:'16/9', width:'100%', background:'#000', borderRadius:8 }} />
              {!ytReady && <div style={{ marginTop:8, color:'#6b7280' }}>Loading YouTube player…</div>}
            </div>
          ) : (
            <video
              ref={videoRef}
              style={{ width:'100%', background:'#000', borderRadius:8 }}
              controls
              playsInline
              crossOrigin="anonymous"
            />
          )}
        </div>

        {/* Chat */}
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Chat</div>
          <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:8, height:260, overflowY:'auto', background:'#f8fafc' }}>
            {messages.length === 0 ? (
              <div style={{ color:'#6b7280' }}>No messages yet.</div>
            ) : messages.map((m, i) => (
              <div key={i} style={{ marginBottom:4 }}>
                <span style={{ ...mono, color:'#6b7280' }}>{m.from.slice(0,6)}</span>: {m.text}
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginTop:8 }}>
            <input value={chatDraft} onChange={(e)=>setChatDraft(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter') sendChat(); }} style={inputCss} placeholder="Type a message…" />
            <button onClick={sendChat} style={btn}>Send</button>
          </div>
          <div style={{ fontSize:12, color:'#6b7280', marginTop:8 }}>
            Tip: Use MP4/WebM URLs that allow cross-origin playback, or a normal YouTube link.
          </div>
        </div>
      </div>

      <div style={{ fontSize:12, color:'#6b7280' }}>
        Notes: Host-controlled sync. For voice/video chat during watch party, use your WebRTC page in another tab,
        or we can overlay it. Only stream content you’re allowed to share.
      </div>
    </div>
  );
}
