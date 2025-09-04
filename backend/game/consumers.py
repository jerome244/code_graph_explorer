# /backend/game/consumers.py
"""
Lightweight realtime "session" server for your Minecraft-like page.

- Users connect to:  ws://<host>/ws/game/<session_id>/?token=<JWT>
- All sockets in the same <session_id> are grouped together and receive each other's events.
- Authentication is optional. If a JWT is present, the user ID/username is used; otherwise a guest is generated.
- State is kept in-process for development. For production, back this with Redis or your database.
"""
import asyncio
from uuid import uuid4
from datetime import datetime, timezone
from typing import Dict, Any

from channels.generic.websocket import AsyncJsonWebsocketConsumer

# -------- In-memory session store (dev only) --------
# { session_id: { "players": {player_id: {"username": str, "last_seen": iso}}, "locks": asyncio.Lock() } }
SESSIONS: Dict[str, Dict[str, Any]] = {}
STORE_LOCK = asyncio.Lock()

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()

async def _get_session(session_id: str) -> Dict[str, Any]:
    # Ensure session dict exists and has a lock
    async with STORE_LOCK:
        if session_id not in SESSIONS:
            SESSIONS[session_id] = {"players": {}, "locks": asyncio.Lock()}
        return SESSIONS[session_id]

class GameConsumer(AsyncJsonWebsocketConsumer):
    """
    Events we accept from clients (JSON with at least a 'type'):
      - {type: "join", name?: "Display Name"}           -> acknowledge and broadcast player_join
      - {type: "move", x: int, y: int, z: int}          -> broadcast player_move
      - {type: "place_block", x:int,y:int,z:int, block:str} -> broadcast block_place
      - {type: "remove_block", x:int,y:int,z:int}       -> broadcast block_remove
      - {type: "chat", message: str}                    -> broadcast chat
      - {type: "ping"}                                  -> reply with {type:"pong"}
    Server broadcasts (you should handle on the client):
      - welcome, player_join, player_move, block_place, block_remove, chat, player_leave
    """
    group_name: str
    session_id: str
    player_id: str
    username: str

    async def connect(self):
        # URL kwarg from routing: re_path(... (?P<session_id>...))
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.group_name = f"game_{self.session_id}"

        # Build a player ID (prefer authenticated user id)
        user = self.scope.get("user")
        if getattr(user, "is_authenticated", False):
            self.player_id = f"user-{user.id}"
            self.username = getattr(user, "username", "player")
        else:
            self.player_id = f"guest-{uuid4().hex[:8]}"
            self.username = "guest"

        # Join the channel layer group and accept the connection
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Track presence
        sess = await _get_session(self.session_id)
        async with sess["locks"]:
            sess["players"][self.player_id] = {"username": self.username, "last_seen": _utcnow()}

        # Send a welcome with current players
        await self.send_json({
            "type": "welcome",
            "session": self.session_id,
            "you": {"id": self.player_id, "username": self.username},
            "players": sess["players"],
            "time": _utcnow(),
        })

        # Notify others
        await self.channel_layer.group_send(self.group_name, {
            "type": "player.join",
            "player": {"id": self.player_id, "username": self.username},
            "time": _utcnow(),
        })

    async def disconnect(self, close_code):
        try:
            sess = await _get_session(self.session_id)
            async with sess["locks"]:
                sess["players"].pop(self.player_id, None)
        except Exception:
            pass
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        await self.channel_layer.group_send(self.group_name, {
            "type": "player.leave",
            "player": {"id": self.player_id},
            "time": _utcnow(),
        })

    # ----- Incoming messages from client -----
    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if not kind:
            return

        # Touch presence
        sess = await _get_session(self.session_id)
        async with sess["locks"]:
            if self.player_id in sess["players"]:
                sess["players"][self.player_id]["last_seen"] = _utcnow()

        if kind == "join":
            # No-op: we already added you, but allow client to set a display name.
            name = content.get("name")
            if name:
                async with sess["locks"]:
                    p = sess["players"].get(self.player_id)
                    if p:
                        p["username"] = str(name)[:32]
                        self.username = p["username"]
                await self.channel_layer.group_send(self.group_name, {
                    "type": "player.join",
                    "player": {"id": self.player_id, "username": self.username},
                    "time": _utcnow(),
                })
        elif kind == "move":
            msg = {
                "type": "player.move",
                "player": {"id": self.player_id},
                "pos": {"x": content.get("x"), "y": content.get("y"), "z": content.get("z")},
                "time": _utcnow(),
            }
            await self.channel_layer.group_send(self.group_name, msg)
        elif kind == "place_block":
            msg = {
                "type": "block.place",
                "player": {"id": self.player_id},
                "block": {
                    "x": content.get("x"), "y": content.get("y"), "z": content.get("z"),
                    "kind": content.get("block")
                },
                "time": _utcnow(),
            }
            await self.channel_layer.group_send(self.group_name, msg)
        elif kind == "remove_block":
            msg = {
                "type": "block.remove",
                "player": {"id": self.player_id},
                "x": content.get("x"), "y": content.get("y"), "z": content.get("z"),
                "time": _utcnow(),
            }
            await self.channel_layer.group_send(self.group_name, msg)
        elif kind == "chat":
            text = str(content.get("message", ""))[:300]
            if text:
                await self.channel_layer.group_send(self.group_name, {
                    "type": "chat.message",
                    "player": {"id": self.player_id, "username": self.username},
                    "message": text,
                    "time": _utcnow(),
                })
        elif kind == "ping":
            await self.send_json({"type": "pong", "time": _utcnow()})

    # ----- Handlers for messages we broadcast (group_send 'type' maps dots -> underscores) -----
    async def player_join(self, event):
        await self.send_json({"type": "player_join", **event})

    async def player_leave(self, event):
        await self.send_json({"type": "player_leave", **event})

    async def player_move(self, event):
        await self.send_json({"type": "player_move", **event})

    async def block_place(self, event):
        await self.send_json({"type": "block_place", **event})

    async def block_remove(self, event):
        await self.send_json({"type": "block_remove", **event})

    async def chat_message(self, event):
        await self.send_json({"type": "chat", **event})
