// src/pages/api/socket.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Server as IOServer } from 'socket.io';

export const config = { api: { bodyParser: false } };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Reuse the server on dev hot-reload
  // @ts-ignore
  if (res.socket.server.io) {
    res.end();
    return;
  }

  // @ts-ignore
  const io = new IOServer(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: { origin: '*' },
  });
  // @ts-ignore
  res.socket.server.io = io;

  io.on('connection', (socket) => {
    let currentRoom: string | null = null;

    socket.on('join', (roomId: string) => {
      currentRoom = roomId;
      socket.join(roomId);

      // Tell the new peer who is already here
      const room = io.sockets.adapter.rooms.get(roomId) || new Set<string>();
      const peers = [...room].filter((id) => id !== socket.id);
      socket.emit('peers', peers);

      // Tell others someone joined
      socket.to(roomId).emit('peer-joined', socket.id);

      // WebRTC signaling relay (targeted by socket id)
      socket.on('signal', (payload: { to: string; data: any }) => {
        io.to(payload.to).emit('signal', { from: socket.id, data: payload.data });
      });

      // Optional room broadcast (presence / chat fallback)
      socket.on('broadcast', (payload: any) => {
        socket.to(roomId).emit('broadcast', { from: socket.id, ...payload });
      });
    });

    socket.on('disconnect', () => {
      if (currentRoom) {
        socket.to(currentRoom).emit('peer-left', socket.id);
      }
    });
  });

  res.end();
}
