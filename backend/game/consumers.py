# /backend/game/consumers.py
"""
Lightweight realtime "session" server for your Minecraft-like page.

- Users connect to:  ws://<host>/ws/game/<session_id>/?token=<JWT>
- All sockets in the same <session_id> are grouped together and receive each other's events.
- Authentication is optional. If a JWT is present, the user ID/username is used; otherwise a guest is generated.
- State is kept in-process for development. For production, back this with Redis or your database.

Adds:
- Per-session cap (GAME_MAX_PLAYERS_PER_SESSION)
- Per-user concurrent-connection cap (GAME_MAX_CONN_PER_USER)
- Close codes:
    4001 => room_full
    4002 => too_many_tabs
"""
import asyncio
from uuid import uuid4
from datetime import datetime, timezone
from typing import Dict, Any

from django.conf import settings
from channels.generic.websocket import AsyncJsonWebsocketConsumer

# -------- Tunables (override in Django settings) --------
GAME_MAX_PLAYERS_PER_SESSION = getattr(settings, "GAME_MAX_PLAYERS_PER_SESSION", 8)
GAME_MAX_CONN_PER_USER = getattr(settings, "GAME_MAX_CONN_PER_USER", 3)

# -------- In-memory session store (dev only) --------
# { session_id: { "players": {player_id: {"username": str, "last_seen": iso}}, "locks": asyncio.Lock() } }
SESSIONS: Dict[str, Dict[str, Any]] = {}
STORE_LOCK = asyncio.Lock()

# Per-user concurrent connection counts (dev only).
# In production across multiple workers, back this with Redis (e.g., INCR/DECR on user:{id}:conncount).
USER_CONN_COUNTS: Dict[str, int] = {}
USER_CONN_LOCK = asyncio.Lock()


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

    # Internal flags to avoid double-cleanup on early rejects
    _presence_added: bool = False
    _joined_group: bool = False
    _conn_counted: bool = False
    _user_key: str = ""

    async def connect(self):
        # URL kwarg from routing: re_path(... (?P<session_id>...))
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.group_name = f"game_{self.session_id}"

        # Build a player ID (prefer authenticated user id)
        user = self.scope.get("user")
        if getattr(user, "is_authenticated", False):
            self.player_id = f"user-{user.id}"
            self.username = getattr(user, "username", "player")
            uid = getattr(user, "id", None)
        else:
            self.player_id = f"guest-{uuid4().hex[:8]}"
            self.username = "guest"
            uid = None

        # Key used for per-user concurrent connection limits
        self._user_key = str(uid) if uid is not None else f"guestkey:{self.player_id}"

        # --- Enforce per-session cap (reserve a spot under lock to avoid races) ---
        sess = await _get_session(self.session_id)
        async with sess["locks"]:
            players = sess["players"]
            if len(players) >= GAME_MAX_PLAYERS_PER_SESSION and self.player_id not in players:
                # Accept solely to deliver the error payload, then close.
                await self.accept()
                await self.send_json({
                    "type": "error",
                    "code": "room_full",
                    "message": "This game session is full.",
                    "limit": GAME_MAX_PLAYERS_PER_SESSION,
                })
                await self.close(code=4001)
                return
            # Reserve presence immediately so concurrent connects don't overbook
            players[self.player_id] = {"username": self.username, "last_seen": _utcnow()}
            self._presence_added = True

        # --- Enforce per-user concurrent-connection cap (across all sessions) ---
        async with USER_CONN_LOCK:
            current = USER_CONN_COUNTS.get(self._user_key, 0)
            if current >= GAME_MAX_CONN_PER_USER:
                # Roll back the presence reservation
                try:
                    async with sess["locks"]:
                        sess["players"].pop(self.player_id, None)
                        self._presence_added = False
                except Exception:
                    pass
                await self.accept()
                await self.send_json({
                    "type": "error",
                    "code": "too_many_tabs",
                    "message": "Too many concurrent connections.",
                    "limit": GAME_MAX_CONN_PER_USER,
                })
                await self.close(code=4002)
                return
            # Count this connection
            USER_CONN_COUNTS[self._user_key] = current + 1
            self._conn_counted = True

        # Join the channel layer group and accept the connection
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        self._joined_group = True
        await self.accept()

        # Send a welcome with current players (we've already added ourselves)
        await self.send_json({
            "type": "welcome",
            "session": self.session_id,
            "you": {"id": self.player_id, "username": self.username},
            "players": (await _get_session(self.session_id))["players"],
            "time": _utcnow(),
        })

        # Notify others
        await self.channel_layer.group_send(self.group_name, {
            "type": "player.join",
            "player": {"id": self.player_id, "username": self.username},
            "time": _utcnow(),
        })

    async def disconnect(self, close_code):
        # Presence cleanup
        try:
            if self._presence_added:
                sess = await _get_session(self.session_id)
                async with sess["locks"]:
                    sess["players"].pop(self.player_id, None)
        except Exception:
            pass

        # Group cleanup + notify others only if we actually joined
        if self._joined_group:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            await self.channel_layer.group_send(self.group_name, {
                "type": "player.leave",
                "player": {"id": self.player_id},
                "time": _utcnow(),
            })

        # Decrement per-user connection count
        try:
            if self._conn_counted:
                async with USER_CONN_LOCK:
                    if self._user_key in USER_CONN_COUNTS:
                        USER_CONN_COUNTS[self._user_key] = max(
                            0, USER_CONN_COUNTS[self._user_key] - 1
                        )
                        if USER_CONN_COUNTS[self._user_key] == 0:
                            USER_CONN_COUNTS.pop(self._user_key, None)
        except Exception:
            pass

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
                "pos": {
                    "x": content.get("x"),
                    "y": content.get("y"),
                    "z": content.get("z")
                },
                "time": _utcnow(),
            }
            await self.channel_layer.group_send(self.group_name, msg)

        elif kind == "place_block":
            msg = {
                "type": "block.place",
                "player": {"id": self.player_id},
                "block": {
                    "x": content.get("x"),
                    "y": content.get("y"),
                    "z": content.get("z"),
                    "kind": content.get("block")
                },
                "time": _utcnow(),
            }
            await self.channel_layer.group_send(self.group_name, msg)

        elif kind == "remove_block":
            msg = {
                "type": "block.remove",
                "player": {"id": self.player_id},
                "x": content.get("x"),
                "y": content.get("y"),
                "z": content.get("z"),
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
