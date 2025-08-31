from channels.generic.websocket import AsyncJsonWebsocketConsumer
from uuid import uuid4
import random

# In-memory rooms { room: { "world": { "x,y,z": BlockId }, "players": { id: {p:[x,y,z], ry:float, name:str} } } }
ROOMS: dict[str, dict] = {}

WORLD_SIZE = 20

def seed_world():
    # Flat grass at y=0 + a few random dirt bumps at y=1 (matches your BlockId names)
    world = {}
    for x in range(WORLD_SIZE):
        for z in range(WORLD_SIZE):
            world[f"{x},0,{z}"] = "GRASS"
            if random.random() < 0.1:
                world[f"{x},1,{z}"] = "DIRT"
    return world

class GameConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.room = self.scope["url_route"]["kwargs"]["room"]
        self.group = f"mc_{self.room}"
        self.uid = uuid4().hex

        room = ROOMS.get(self.room)
        if room is None:
            room = {"world": seed_world(), "players": {}}
            ROOMS[self.room] = room

        player = {
            "p": [10, 3, 10],
            "ry": 0.0,
            "name": getattr(self.scope.get("user"), "username", None) or "guest",
        }
        room["players"][self.uid] = player

        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        # Send full snapshot to the joiner
        await self.send_json({
            "type": "snapshot",
            "your_id": self.uid,
            "world": room["world"],
            "players": room["players"],
        })

        # Notify others (but we will skip echo to self in handler)
        await self.channel_layer.group_send(self.group, {
            "type": "player.join",
            "id": self.uid,
            "player": player,
        })

    async def disconnect(self, code):
        room = ROOMS.get(self.room)
        if room:
            room["players"].pop(self.uid, None)
            await self.channel_layer.group_send(self.group, {
                "type": "player.leave",
                "id": self.uid,
            })
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        t = content.get("type")
        room = ROOMS.get(self.room)
        if not room:
            return

        if t == "state":
            p = content.get("p") or [10, 3, 10]
            ry = float(content.get("ry") or 0.0)
            room["players"][self.uid] = {**room["players"].get(self.uid, {}), "p": p, "ry": ry}
            await self.channel_layer.group_send(self.group, {
                "type": "player.state",
                "id": self.uid,
                "p": p,
                "ry": ry,
            })

        elif t == "place":
            k = str(content.get("k"))
            block_id = content.get("id")
            if not k or not block_id:
                return
            room["world"][k] = block_id
            await self.channel_layer.group_send(self.group, {
                "type": "block.place",
                "k": k,
                "id": block_id,
            })

        elif t == "remove":
            k = str(content.get("k"))
            if not k:
                return
            room["world"].pop(k, None)
            await self.channel_layer.group_send(self.group, {
                "type": "block.remove",
                "k": k,
            })

    # --- group event handlers -> send to clients (skip echo to self for join/state) ---

    async def player_join(self, event):
        if event["id"] == getattr(self, "uid", None):
            return
        await self.send_json({"type": "join", "id": event["id"], "player": event["player"]})

    async def player_leave(self, event):
        await self.send_json({"type": "leave", "id": event["id"]})

    async def player_state(self, event):
        if event["id"] == getattr(self, "uid", None):
            return
        await self.send_json({"type": "state", "id": event["id"], "p": event["p"], "ry": event["ry"]})

    async def block_place(self, event):
        await self.send_json({"type": "place", "k": event["k"], "id": event["id"]})

    async def block_remove(self, event):
        await self.send_json({"type": "remove", "k": event["k"]})
