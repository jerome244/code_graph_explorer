import asyncio, json, os
import websockets

WS_URL = os.getenv("WS_URL", "ws://localhost:8000/ws/projects/demo/")

async def main():
    async with websockets.connect(WS_URL) as ws:
        print("Connected to", WS_URL)

        # 1) Ping / Pong
        await ws.send(json.dumps({"type": "PING"}))
        print("<- sent PING")
        msg = await ws.recv()
        print("->", msg)

        # 2) Send a broadcast op
        await ws.send(json.dumps({"type":"HIDE_NODE","payload":{"path":"foo.py","hidden":True}}))
        print("<- sent HIDE_NODE")

        # 3) Listen for any messages (from yourself or others)
        print("Listening for messages (Ctrl+C to quit)…")
        while True:
            try:
                msg = await ws.recv()
                print("->", msg)
            except websockets.ConnectionClosed:
                print("Connection closed")
                break

asyncio.run(main())
