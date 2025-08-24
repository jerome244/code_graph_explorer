# backend/game/consumers.py
import asyncio, json, random, time
from channels.generic.websocket import AsyncWebsocketConsumer

ROOMS = {}  # room state map

TICK_HZ = 30
DT = 1.0 / TICK_HZ
WIDTH, HEIGHT = 800, 500
PADDLE_W, PADDLE_H = 10, 80
BALL_SIZE = 10
PADDLE_SPEED = 420  # px/s
BALL_SPEED = 360

def _new_state():
    vx = random.choice([-1, 1]) * BALL_SPEED
    vy = random.uniform(-0.6, 0.6) * BALL_SPEED
    return {
        "ball": {"x": WIDTH/2, "y": HEIGHT/2, "vx": vx, "vy": vy},
        "paddles": {"left": HEIGHT/2 - PADDLE_H/2, "right": HEIGHT/2 - PADDLE_H/2},
        "scores": {"left": 0, "right": 0},
    }

async def game_loop(room):
    last = time.perf_counter()
    try:
        while room in ROOMS:
            now = time.perf_counter()
            dt = min(0.05, now - last)
            last = now

            r = ROOMS[room]
            st = r["state"]
            inp = r["inputs"]

            # paddles
            for side in ("left", "right"):
                dy = 0
                if inp[side]["up"]: dy -= PADDLE_SPEED * dt
                if inp[side]["down"]: dy += PADDLE_SPEED * dt
                y = st["paddles"][side] + dy
                y = max(0, min(HEIGHT - PADDLE_H, y))
                st["paddles"][side] = y

            # ball
            b = st["ball"]
            b["x"] += b["vx"] * dt
            b["y"] += b["vy"] * dt

            # top/bottom
            if b["y"] <= 0 and b["vy"] < 0:
                b["y"] = 0
                b["vy"] *= -1
            if b["y"] >= HEIGHT - BALL_SIZE and b["vy"] > 0:
                b["y"] = HEIGHT - BALL_SIZE
                b["vy"] *= -1

            # paddle rects
            lp = {"x": 20, "y": st["paddles"]["left"], "w": PADDLE_W, "h": PADDLE_H}
            rp = {"x": WIDTH - 20 - PADDLE_W, "y": st["paddles"]["right"], "w": PADDLE_W, "h": PADDLE_H}

            # collide left
            if (b["x"] <= lp["x"] + lp["w"] and b["x"] + BALL_SIZE >= lp["x"] and
                b["y"] + BALL_SIZE >= lp["y"] and b["y"] <= lp["y"] + lp["h"] and b["vx"] < 0):
                b["x"] = lp["x"] + lp["w"]
                b["vx"] *= -1
                offset = (b["y"] + BALL_SIZE/2) - (lp["y"] + lp["h"]/2)
                b["vy"] += offset * 5

            # collide right
            if (b["x"] + BALL_SIZE >= rp["x"] and b["x"] <= rp["x"] + rp["w"] and
                b["y"] + BALL_SIZE >= rp["y"] and b["y"] <= rp["y"] + rp["h"] and b["vx"] > 0):
                b["x"] = rp["x"] - BALL_SIZE
                b["vx"] *= -1
                offset = (b["y"] + BALL_SIZE/2) - (rp["y"] + rp["h"]/2)
                b["vy"] += offset * 5

            # scoring
            if b["x"] < -BALL_SIZE:
                st["scores"]["right"] += 1
                r["state"] = _new_state()
            elif b["x"] > WIDTH + BALL_SIZE:
                st["scores"]["left"] += 1
                r["state"] = _new_state()

            # broadcast
            payload = {
                "type": "state",
                "width": WIDTH, "height": HEIGHT,
                "ball": r["state"]["ball"],
                "paddles": r["state"]["paddles"],
                "scores": r["state"]["scores"],
                "players": {"left": r["players"]["left"] is not None, "right": r["players"]["right"] is not None},
            }
            await asyncio.gather(*[ch.send(text_data=json.dumps(payload)) for ch in r["connections"]])

            await asyncio.sleep(DT)
    except asyncio.CancelledError:
        pass

class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        await self.accept()

        r = ROOMS.get(self.room_name)
        if not r:
            r = ROOMS[self.room_name] = {
                "players": {"left": None, "right": None, "spectators": set()},
                "inputs": {"left": {"up": False, "down": False}, "right": {"up": False, "down": False}},
                "state": _new_state(),
                "connections": set(),
                "task": None,
            }

        role = "spectator"
        if r["players"]["left"] is None:
            r["players"]["left"] = self
            role = "left"
        elif r["players"]["right"] is None:
            r["players"]["right"] = self
            role = "right"
        else:
            r["spectators"].add(self)
            role = "spectator"

        r["connections"].add(self)
        self.role = role

        if r["task"] is None or r["task"].done():
            r["task"] = asyncio.create_task(game_loop(self.room_name))

        await self.send(text_data=json.dumps({"type": "role", "role": role}))

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        if data.get("type") == "input" and self.role in ("left", "right"):
            r = ROOMS.get(self.room_name)
            if not r: return
            inp = r["inputs"][self.role]
            inp["up"] = bool(data.get("up", inp["up"]))
            inp["down"] = bool(data.get("down", inp["down"]))

    async def disconnect(self, code):
        r = ROOMS.get(self.room_name)
        if not r:
            return
        r["connections"].discard(self)
        if getattr(self, "role", None) == "left":
            r["players"]["left"] = None
            r["inputs"]["left"] = {"up": False, "down": False}
        elif getattr(self, "role", None) == "right":
            r["players"]["right"] = None
            r["inputs"]["right"] = {"up": False, "down": False}
        else:
            r["spectators"].discard(self)
        if not r["connections"]:
            if r["task"] and not r["task"].done():
                r["task"].cancel()
            ROOMS.pop(self.room_name, None)
