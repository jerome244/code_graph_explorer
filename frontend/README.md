touch frontend/.env.local

# frontend/.env.local
API_BASE=http://127.0.0.1:8000
# (optional, only if you also fetch from the browser anywhere)
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000




cd frontend
npm ci



python /backend/manage.py runserver





Run
1) Start Redis
docker run --name graph-redis -p 6379:6379 -d redis:7
# if it already exists:
# docker start graph-redis

2) Start Django (ASGI)
cd backend
daphne -p 8000 config.asgi:application
# or during dev: python manage.py runserver 0.0.0.0:8000  (Channels makes it ASGI)

3) Start Next.js
cd frontend
npm run dev


Open two tabs:

http://localhost:3000/graph?project=demo


Make an edit / hide a node / drag a node in one tab — the other updates in realtime.

Test Realtime (Python only)

No Node tools required.

Async client:

pip install websockets


ws_test_async.py:

import asyncio, json, os
import websockets

WS_URL = os.getenv("WS_URL", "ws://localhost:8000/ws/projects/demo/")

async def main():
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({"type":"PING"}))
        print("->", await ws.recv())

        await ws.send(json.dumps({"type":"HIDE_NODE","payload":{"path":"foo.py","hidden":True}}))
        print("sent HIDE_NODE; listening...")
        while True:
            print("<-", await ws.recv())

asyncio.run(main())


Run that in two terminals to see broadcast between clients.

WebSocket Protocol (Events)

All events are JSON objects with shape:

type RealtimeMessage =
  | { type: "PING" }
  | { type: "PONG" }
  | { type: "SNAPSHOT"; payload: { graph: any } }
  | { type: "UPDATE_FILE"; payload: { path: string; content: string } }
  | { type: "HIDE_NODE"; payload: { path: string; hidden: boolean } }
  | { type: "MOVE_NODE"; payload: { id: string; position: { x: number; y: number } } }
  & { clientId?: string; ts?: number };


PING/PONG — liveness check

SNAPSHOT — full graph state (tree, elements, files, hiddenIds)

UPDATE_FILE — update file contents + rebuild edges on clients

HIDE_NODE — toggle hidden state by id/path

MOVE_NODE — update node position {x,y}

The frontend ignores echoes from itself using clientId.