import json, time
from collections import defaultdict
from typing import Dict, Any
from channels.generic.websocket import AsyncJsonWebsocketConsumer

# In-memory presence (per process; fine for dev). For multi-process, move to Redis.
players_by_world: Dict[int, Dict[str, Dict[str, Any]]] = defaultdict(dict)

class GameConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        try:
            self.world = int(self.scope["url_route"]["kwargs"]["world"])
        except Exception:
            await self.close()
            return
        self.group = f"world_{self.world}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        # Send snapshot of current players
        snapshot = list(players_by_world[self.world].values())
        await self.send_json({"type": "snapshot", "players": snapshot})

    async def disconnect(self, code):
        # If this client joined with an id, announce leave
        pid = getattr(self, "player_id", None)
        if pid and pid in players_by_world[self.world]:
            players_by_world[self.world].pop(pid, None)
            await self.channel_layer.group_send(
                self.group,
                {"type": "game.broadcast", "data": {"type": "leave", "id": pid}}
            )
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        t = content.get("type")
        now = time.time()

        if t == "join":
            # {type:"join", id, name, color}
            self.player_id = str(content.get("id"))
            name = str(content.get("name") or "Player")
            color = str(content.get("color") or "#44c")
            players_by_world[self.world][self.player_id] = {
                "id": self.player_id, "name": name, "color": color,
                "x": 8, "y": 6, "z": 8, "ry": 0, "ts": now
            }
            await self.channel_layer.group_send(
                self.group,
                {"type": "game.broadcast", "data": {"type": "join", "player": players_by_world[self.world][self.player_id]}}
            )
            return

        # Require join first
        if not getattr(self, "player_id", None):
            return

        # Simple rate limit: 30 msgs/sec accepted, drop rest
        last = players_by_world[self.world].get(self.player_id, {}).get("ts", 0)
        if now - last < (1.0 / 30.0):
            return

        if t == "pos":
            # {type:"pos", x,y,z, ry}
            rec = players_by_world[self.world].get(self.player_id)
            if rec:
                rec.update({
                    "x": float(content.get("x", rec["x"])),
                    "y": float(content.get("y", rec["y"])),
                    "z": float(content.get("z", rec["z"])),
                    "ry": float(content.get("ry", rec["ry"])),
                    "ts": now,
                })
                await self.channel_layer.group_send(
                    self.group,
                    {"type": "game.broadcast", "data": {"type": "pos", "id": self.player_id,
                                                       "x": rec["x"], "y": rec["y"], "z": rec["z"], "ry": rec["ry"]}}
                )
            return

        if t == "chat":
            # {type:"chat", text}
            txt = str(content.get("text", ""))[:200]
            await self.channel_layer.group_send(
                self.group,
                {"type": "game.broadcast", "data": {"type": "chat", "id": self.player_id, "text": txt}}
            )
            return

        if t in ("block_place", "block_break"):
            # Relay to others; you can persist later
            payload = {k: content.get(k) for k in ("x", "y", "z", "material")}
            payload["id"] = self.player_id
            payload["type"] = t
            await self.channel_layer.group_send(self.group, {"type": "game.broadcast", "data": payload})
            return

    async def game_broadcast(self, event):
        await self.send_json(event["data"])
