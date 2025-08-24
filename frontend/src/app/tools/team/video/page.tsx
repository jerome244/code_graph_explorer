'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const card: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' };
const btn: React.CSSProperties = { borderWidth:1, borderStyle:'solid', borderColor:'#e5e7eb', backgroundColor:'#fff', padding:'8px 12px', borderRadius:8, cursor:'pointer' };
const inputCss: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', font:'inherit' };
const mono: React.CSSProperties = { fontFamily:'ui-monospace, Menlo, monospace' };

type Remote = { id: string; stream: MediaStream | null; label?: string };
type Msg = { from: string; text: string; ts: number };

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function VideoChatPage() {
  const [roomId, setRoomId] = useState('demo');
  const [joined, setJoined] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatDraft, setChatDraft] = useState('');

  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [sharing, setSharing] = useState(false);

  // ----------------------------------------------------------------------------
  // Socket bootstrapping
  async function ensureSocket() {
    if (socketRef.current) return socketRef.current;
    // kick the API route so Socket.IO server exists
    await fetch('/api/socket').catch(()=>{});
    const s = io({ path: '/api/socket' });
    socketRef.current = s;

    s.on('connect', () => console.log('socket connected', s.id));
    s.on('peers', async (peers: string[]) => {
      // we are the newcomer: create offers to each existing peer
      for (const pid of peers) {
        await makePeer(pid, /*initiator*/ true);
      }
    });
    s.on('peer-joined', async (pid: string) => {
      // existing members may ignore; the newcomer will initiate offers
      console.log('peer joined', pid);
    });
    s.on('peer-left', (pid: string) => {
      console.log('peer left', pid);
      const pc = pcs.current.get(pid);
      if (pc) { pc.close(); pcs.current.delete(pid); }
      dataChannels.current.delete(pid);
      setRemotes((arr) => arr.filter((r) => r.id !== pid));
    });
    s.on('signal', async ({ from, data }) => {
      let pc = pcs.current.get(from);
      if (!pc) {
        pc = await makePeer(from, /*initiator*/ false); // responder path
      }
      if (data.sdp) {
        const desc = new RTCSessionDescription(data.sdp);
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          s.emit('signal', { to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch {}
      }
    });
    s.on('broadcast', ({ from, kind, text, ts }) => {
      if (kind === 'chat') {
        pushMsg({ from, text, ts: ts || Date.now() });
      }
    });

    return s;
  }

  // ----------------------------------------------------------------------------
  // Peer connection lifecycle
  async function makePeer(peerId: string, initiator: boolean) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcs.current.set(peerId, pc);

    // add our media tracks
    if (localStream) {
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    }

    // remote stream assembly
    const remoteStream = new MediaStream();
    setRemotes((arr) => arr.some((r) => r.id === peerId) ? arr : [...arr, { id: peerId, stream: remoteStream }]);

    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
      // refresh state
      setRemotes((arr) => arr.map((r) => (r.id === peerId ? { ...r, stream: remoteStream } : r)));
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socketRef.current?.emit('signal', { to: peerId, data: { candidate: ev.candidate } });
      }
    };

    // Data channel (chat)
    if (initiator) {
      const ch = pc.createDataChannel('chat');
      setupChannel(peerId, ch);
    } else {
      pc.ondatachannel = (ev) => setupChannel(peerId, ev.channel);
    }

    // offers/answers
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('signal', { to: peerId, data: { sdp: pc.localDescription } });
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        const dc = dataChannels.current.get(peerId);
        if (dc) dc.close();
        dataChannels.current.delete(peerId);
      }
    };

    return pc;
  }

  function setupChannel(peerId: string, ch: RTCDataChannel) {
    dataChannels.current.set(peerId, ch);
    ch.onopen = () => console.log('dc open', peerId);
    ch.onclose = () => console.log('dc close', peerId);
    ch.onmessage = (e) => {
      pushMsg({ from: peerId, text: String(e.data), ts: Date.now() });
    };
  }

  function pushMsg(m: Msg) {
    setMessages((arr) => [...arr, m].slice(-500));
  }

  // ----------------------------------------------------------------------------
  // Controls
  async function joinRoom() {
    const s = await ensureSocket();
    s.emit('join', roomId);
    setJoined(true);
  }

  async function enableCam() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
  }

  async function toggleMic() {
    if (!localStream) return;
    const enabled = !audioOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    setAudioOn(enabled);
  }

  async function toggleCam() {
    if (!localStream) return;
    const enabled = !videoOn;
    localStream.getVideoTracks().forEach((t) => (t.enabled = enabled));
    setVideoOn(enabled);
  }

  async function shareScreen() {
    if (sharing) return stopShare();
    const display = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false }).catch(()=>null);
    if (!display) return;
    const screenTrack: MediaStreamTrack = display.getVideoTracks()[0];
    // Replace the outbound video sender for each PC
    pcs.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack);
    });
    screenTrack.onended = () => stopShare();
    setSharing(true);
  }

  function stopShare() {
    if (!localStream) return;
    const camTrack = localStream.getVideoTracks()[0];
    if (!camTrack) return setSharing(false);
    pcs.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(camTrack);
    });
    setSharing(false);
  }

  function leave() {
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    dataChannels.current.forEach((dc) => dc.close());
    dataChannels.current.clear();
    setRemotes([]);
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
    setJoined(false);
  }

  function sendChat() {
    const text = chatDraft.trim();
    if (!text) return;
    const me = socketRef.current?.id || 'me';
    // try datachannels first
    let sent = false;
    dataChannels.current.forEach((dc) => {
      if (dc.readyState === 'open') {
        dc.send(text);
        sent = true;
      }
    });
    // fallback: broadcast via server
    if (!sent) socketRef.current?.emit('broadcast', { kind: 'chat', text, ts: Date.now() });
    pushMsg({ from: me, text, ts: Date.now() });
    setChatDraft('');
  }

  // ----------------------------------------------------------------------------
  // UI
const [inviteUrl, setInviteUrl] = useState('');
useEffect(() => {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.searchParams.set('room', roomId);
  setInviteUrl(u.toString());
}, [roomId]);

  // read room from URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const r = url.searchParams.get('room');
    if (r) setRoomId(r);
  }, []);

  return (
    <div style={{ display:'grid', gap:16 }}>
      <h1 style={{ margin:0 }}>Team Video Chat (P2P)</h1>
      <p style={{ margin:0, color:'#555' }}>WebRTC for camera/mic + data channels for chat. Socket.IO handles signaling.</p>

      <div style={card}>
        <div style={{ display:'grid', gap:10, gridTemplateColumns:'1fr auto auto auto auto', alignItems:'center' }}>
          <input value={roomId} onChange={(e)=>setRoomId(e.target.value)} style={inputCss} placeholder="Room ID" />
          {!joined ? (
            <>
              <button onClick={joinRoom} style={btn}>Join room</button>
              <button onClick={enableCam} style={btn}>Enable camera/mic</button>
            </>
          ) : (
            <>
              <button onClick={toggleMic} style={btn}>{audioOn ? 'Mute' : 'Unmute'}</button>
              <button onClick={toggleCam} style={btn}>{videoOn ? 'Stop cam' : 'Start cam'}</button>
              <button onClick={sharing ? stopShare : shareScreen} style={btn}>{sharing ? 'Stop share' : 'Share screen'}</button>
              <button onClick={leave} style={btn}>Leave</button>
            </>
          )}
        </div>
        <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <button
            onClick={()=>{ navigator.clipboard.writeText(inviteUrl).catch(()=>{}); }}
            style={btn}
          >Copy invite link</button>
          <span style={{ fontSize:12, color:'#6b7280' }}>
            Steps: 1) Join a room  2) Enable camera/mic  3) Share the link with others.
          </span>
        </div>
      </div>

      {/* Videos */}
      <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:8 }}>You</div>
          <video
            playsInline
            autoPlay
            muted
            ref={(el)=>{ if (el && localStream) el.srcObject = localStream; }}
            style={{ width:'100%', background:'#000', borderRadius:8 }}
          />
        </div>

        {remotes.map(r => (
          <div key={r.id} style={card}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Peer: {r.id.slice(0,6)}</div>
            <video
              playsInline
              autoPlay
              ref={(el)=>{ if (el && r.stream) el.srcObject = r.stream; }}
              style={{ width:'100%', background:'#000', borderRadius:8 }}
            />
          </div>
        ))}
      </div>

      {/* Chat */}
      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Chat</div>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:8, height:180, overflowY:'auto', background:'#f8fafc' }}>
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
      </div>

      <div style={{ fontSize:12, color:'#6b7280' }}>
        Note: Peer-to-peer mesh works well for small rooms (2–4). For larger rooms and better reliability behind strict NATs,
        use a TURN server and consider an SFU (e.g., LiveKit, mediasoup, Janus).
      </div>
    </div>
  );
}
