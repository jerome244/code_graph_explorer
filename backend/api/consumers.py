import json
import time
import uuid
from collections import defaultdict
from typing import Dict, Any, Optional, List
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from .models import Project

# =====================================================================
# GAME (example world presence)
# =====================================================================

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
                {"type": "game.broadcast", "data": {"type": "leave", "id": pid}},
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
                "id": self.player_id,
                "name": name,
                "color": color,
                "x": 8,
                "y": 6,
                "z": 8,
                "ry": 0,
                "ts": now,
            }
            await self.channel_layer.group_send(
                self.group,
                {
                    "type": "game.broadcast",
                    "data": {
                        "type": "join",
                        "player": players_by_world[self.world][self.player_id],
                    },
                },
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
                rec.update(
                    {
                        "x": float(content.get("x", rec["x"])),
                        "y": float(content.get("y", rec["y"])),
                        "z": float(content.get("z", rec["z"])),
                        "ry": float(content.get("ry", rec["ry"])),
                        "ts": now,
                    }
                )
                await self.channel_layer.group_send(
                    self.group,
                    {
                        "type": "game.broadcast",
                        "data": {
                            "type": "pos",
                            "id": self.player_id,
                            "x": rec["x"],
                            "y": rec["y"],
                            "z": rec["z"],
                            "ry": rec["ry"],
                        },
                    },
                )
            return

        if t == "chat":
            # {type:"chat", text}
            txt = str(content.get("text", ""))[:200]
            await self.channel_layer.group_send(
                self.group,
                {
                    "type": "game.broadcast",
                    "data": {"type": "chat", "id": self.player_id, "text": txt},
                },
            )
            return

        if t in ("block_place", "block_break"):
            # Relay to others; you can persist later
            payload = {k: content.get(k) for k in ("x", "y", "z", "material")}
            payload["id"] = self.player_id
            payload["type"] = t
            await self.channel_layer.group_send(
                self.group, {"type": "game.broadcast", "data": payload}
            )
            return

    async def game_broadcast(self, event):
        await self.send_json(event["data"])


# =====================================================================
# PROJECT LIVE SHARE (presence + selections + chat + options + positions)
# =====================================================================

User = get_user_model()

# in-memory presence per-process (fine for dev; swap to Redis for multi-proc)
peers_by_project: Dict[int, Dict[str, Dict[str, Any]]] = defaultdict(dict)

# in-memory node positions per project: { project_id: { nodeId: {x, y} } }
graph_pos_by_project: Dict[int, Dict[str, Dict[str, float]]] = defaultdict(dict)


@database_sync_to_async
def _project_from_share_token(token: str) -> Optional[Project]:
    try:
        return Project.objects.get(share_token=token)
    except Project.DoesNotExist:
        return None


@database_sync_to_async
def _project_perm_from_jwt(
    project_id: int, jwt: str
) -> tuple[Optional[Project], Optional[User], bool]:
    try:
        at = AccessToken(jwt)
        uid = at.get("user_id")
        if not uid:
            return None, None, False
        user = User.objects.get(id=uid)
        proj = Project.objects.get(id=project_id)
        can_edit = (proj.owner_id == user.id) or proj.collab_links.filter(
            user=user, can_edit=True
        ).exists()
        return proj, user, can_edit
    except Exception:
        return None, None, False


class ProjectConsumer(AsyncJsonWebsocketConsumer):
    """
    Join with either:
      ws://.../ws/projects/<project_id>/?token=<JWT>
    or:
      ws://.../ws/projects/shared/<share_token>/
    """

    async def connect(self):
        self.user: Optional[User] = None
        self.can_edit: bool = False
        self.project: Optional[Project] = None
        # Use a UUID so we never depend on channel_name being present here
        self.peer_id: str = f"p-{uuid.uuid4().hex[:10]}"
        self.group: Optional[str] = None

        # route kwargs: either {"project_id": "..."} or {"share_token": "..."}
        kw = self.scope.get("url_route", {}).get("kwargs", {}) or {}
        qs = parse_qs((self.scope.get("query_string") or b"").decode())
        jwt = (qs.get("token") or [None])[0]

        if kw.get("project_id"):
            proj, user, can_edit = await _project_perm_from_jwt(
                int(kw["project_id"]), jwt or ""
            )
            if not proj:
                await self.close()
                return
            self.project = proj
            self.user = user
            self.can_edit = bool(can_edit)
        elif kw.get("share_token"):
            proj = await _project_from_share_token(kw["share_token"])
            if not proj:
                await self.close()
                return
            self.project = proj
            self.user = None  # guest
            self.can_edit = False  # guests are read-only
        else:
            await self.close()
            return

        self.group = f"project_{self.project.id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        # send current presence + positions snapshot
        existing = list(peers_by_project[self.project.id].values())
        positions_snapshot = graph_pos_by_project[self.project.id]  # {nodeId: {x,y}}
        await self.send_json(
            {
                "type": "welcome",
                "id": self.peer_id,
                "peers": existing,
                "can_edit": self.can_edit,
                "positions": positions_snapshot,
            }
        )

        # announce join
        meta = {
            "id": self.peer_id,
            "username": (self.user.username if self.user else None),
            "color": None,  # client will send a "hello" to fill these in
            "user_id": (self.user.id if self.user else None),
        }
        peers_by_project[self.project.id][self.peer_id] = meta
        await self.channel_layer.group_send(
            self.group, {"type": "project.broadcast", "data": {"type": "join", **meta}}
        )

    async def disconnect(self, code):
        try:
            if self.group and self.project:
                # announce leave
                await self.channel_layer.group_send(
                    self.group,
                    {"type": "project.broadcast", "data": {"type": "leave", "id": self.peer_id}},
                )
                peers_by_project[self.project.id].pop(self.peer_id, None)
                await self.channel_layer.group_discard(self.group, self.channel_name)
        except Exception:
            pass

    async def receive_json(self, content, **kwargs):
        t = content.get("type")

        # identify self (name/color shown to others)
        if t == "hello":
            color = content.get("color")
            name = content.get("name")
            if self.project:
                meta = peers_by_project[self.project.id].get(self.peer_id, {})
                meta.update({"color": color, "name": name})
                await self.channel_layer.group_send(
                    self.group,
                    {
                        "type": "project.broadcast",
                        "data": {
                            "type": "hello",
                            "id": self.peer_id,
                            "name": name,
                            "color": color,
                        },
                    },
                )
            return

        # live selections (array of file node ids)
        if t == "select":
            ids = content.get("ids", [])
            await self.channel_layer.group_send(
                self.group,
                {
                    "type": "project.broadcast",
                    "data": {"type": "select", "id": self.peer_id, "ids": ids},
                },
            )
            return

        # sync options (only editors)
        if t == "options":
            if not self.can_edit:
                return
            opts = {
                k: content.get(k)
                for k in ("filter", "includeDeps", "layoutName", "fnMode")
            }
            await self.channel_layer.group_send(
                self.group,
                {
                    "type": "project.broadcast",
                    "data": {"type": "options", "id": self.peer_id, **opts},
                },
            )
            return

        # lightweight chat (optional)
        if t == "chat":
            text = (content.get("text") or "").strip()[:500]
            if text:
                await self.channel_layer.group_send(
                    self.group,
                    {
                        "type": "project.broadcast",
                        "data": {"type": "chat", "id": self.peer_id, "text": text},
                    },
                )
            return

        # batched node positions (editor-only)
        if t == "nodes_pos":
            if not self.can_edit or not self.project:
                return
            now = time.time()
            # throttle ~30 Hz per sender
            last = getattr(self, "_last_move_ts", 0.0)
            if (now - last) < (1.0 / 30.0):
                return
            self._last_move_ts = now

            raw_positions = content.get("positions", [])  # list[{id,x,y}]
            if not isinstance(raw_positions, list):
                return

            store = graph_pos_by_project[self.project.id]
            out: List[Dict[str, float]] = []
            for p in raw_positions:
                try:
                    nid = str(p["id"])
                    x = float(p["x"])
                    y = float(p["y"])
                except Exception:
                    continue
                store[nid] = {"x": x, "y": y}
                out.append({"id": nid, "x": x, "y": y})

            if out:
                await self.channel_layer.group_send(
                    self.group,
                    {
                        "type": "project.broadcast",
                        "data": {"type": "nodes_pos", "from": self.peer_id, "positions": out},
                    },
                )
            return

        # explicit snapshot request
        if t == "request_state":
            if self.project:
                await self.send_json(
                    {
                        "type": "state",
                        "positions": graph_pos_by_project[self.project.id],
                        "can_edit": self.can_edit,
                    }
                )
            return

    # group handlers -----------------------------------------------------

    async def project_broadcast(self, event):
        await self.send_json(event["data"])

    async def project_event(self, event):
        # server-side notifications (sent by REST when a project is saved)
        await self.send_json(event["data"])
