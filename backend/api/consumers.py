import time
from collections import defaultdict
from typing import Dict, Any, Optional, List, Tuple
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from .models import Project

User = get_user_model()

# -------------------------------
# Demo "game" channel (unchanged)
# -------------------------------
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
        await self.send_json({"type": "snapshot", "players": list(players_by_world[self.world].values())})

    async def disconnect(self, code):
        pid = getattr(self, "player_id", None)
        if pid and pid in players_by_world[self.world]:
            players_by_world[self.world].pop(pid, None)
            await self.channel_layer.group_send(
                self.group, {"type": "game.broadcast", "data": {"type": "leave", "id": pid}}
            )
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        t = content.get("type")
        now = time.time()

        if t == "join":
            self.player_id = str(content.get("id"))
            name = str(content.get("name") or "Player")
            color = str(content.get("color") or "#44c")
            players_by_world[self.world][self.player_id] = {
                "id": self.player_id, "name": name, "color": color,
                "x": 8, "y": 6, "z": 8, "ry": 0, "ts": now
            }
            await self.channel_layer.group_send(
                self.group,
                {"type": "game.broadcast", "data": {"type": "join", "player": players_by_world[self.world][self.player_id]}},
            )
            return

        if not getattr(self, "player_id", None):
            return

        last = players_by_world[self.world].get(self.player_id, {}).get("ts", 0)
        if now - last < (1.0 / 30.0):
            return

        if t == "pos":
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
                    {"type": "game.broadcast", "data": {
                        "type": "pos", "id": self.player_id,
                        "x": rec["x"], "y": rec["y"], "z": rec["z"], "ry": rec["ry"]
                    }},
                )
            return

        if t == "chat":
            txt = str(content.get("text", ""))[:200]
            await self.channel_layer.group_send(
                self.group, {"type": "game.broadcast", "data": {"type": "chat", "id": self.player_id, "text": txt}}
            )
            return

        if t in ("block_place", "block_break"):
            payload = {k: content.get(k) for k in ("x", "y", "z", "material")}
            payload["id"] = self.player_id
            payload["type"] = t
            await self.channel_layer.group_send(self.group, {"type": "game.broadcast", "data": payload})
            return

    async def game_broadcast(self, event):
        await self.send_json(event["data"])


# -------------------------------
# Project live share (positions)
# -------------------------------

# positions_by_project: project_id -> { nodeId: (x, y) }
positions_by_project: Dict[int, Dict[str, Tuple[float, float]]] = defaultdict(dict)
# ephemeral presence
peers_by_project: Dict[int, Dict[str, Dict[str, Any]]] = defaultdict(dict)


@database_sync_to_async
def _project_from_share_token(token: str) -> Optional[Project]:
    try:
        return Project.objects.get(share_token=token)
    except Project.DoesNotExist:
        return None


@database_sync_to_async
def _project_perm_from_jwt(project_id: int, jwt: str) -> tuple[Optional[Project], Optional[User], bool]:
    try:
        at = AccessToken(jwt)
        uid = at.get("user_id")
        if not uid:
            return None, None, False
        user = User.objects.get(id=uid)
        proj = Project.objects.get(id=project_id)
        can_edit = (proj.owner_id == user.id) or proj.collab_links.filter(user=user, can_edit=True).exists()
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
        self.user = None
        self.can_edit = False
        self.project: Optional[Project] = None
        self.group = None

        kw = self.scope.get("url_route", {}).get("kwargs", {}) or {}
        qs = parse_qs((self.scope.get("query_string") or b"").decode())
        jwt = (qs.get("token") or [None])[0]

        if kw.get("project_id"):
            proj, user, can_edit = await _project_perm_from_jwt(int(kw["project_id"]), jwt or "")
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
            self.user = None
            self.can_edit = False  # guests are read-only
        else:
            await self.close()
            return

        self.group = f"project_{self.project.id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        # stable peer id for this socket
        self.peer_id = f"p-{int(time.time()*1000)%10_000}-{self.channel_name[-6:]}"

        # send welcome with current positions + presence
        pos = positions_by_project[self.project.id]
        await self.send_json({
            "type": "welcome",
            "id": self.peer_id,
            "can_edit": self.can_edit,
            "peers": list(peers_by_project[self.project.id].values()),
            "positions": {k: {"x": x, "y": y} for k, (x, y) in pos.items()},
        })

        # add to presence & broadcast join
        meta = {
            "id": self.peer_id,
            "username": (self.user.username if self.user else None),
            "color": None,
            "user_id": (self.user.id if self.user else None),
        }
        peers_by_project[self.project.id][self.peer_id] = meta
        await self.channel_layer.group_send(
            self.group, {"type": "project.broadcast", "data": {"type": "join", **meta}}
        )

    async def disconnect(self, code):
        try:
            if self.group:
                await self.channel_layer.group_send(
                    self.group, {"type": "project.broadcast", "data": {"type": "leave", "id": self.peer_id}}
                )
                peers_by_project[self.project.id].pop(self.peer_id, None)
                await self.channel_layer.group_discard(self.group, self.channel_name)
        except Exception:
            pass

    async def receive_json(self, content, **kwargs):
        t = content.get("type")

        # identify self (for color/name display)
        if t == "hello":
            color = content.get("color")
            name = content.get("name")
            meta = peers_by_project[self.project.id].get(self.peer_id, {})
            meta.update({"color": color, "name": name})
            await self.channel_layer.group_send(
                self.group, {"type": "project.broadcast", "data": {"type": "hello", "id": self.peer_id, "name": name, "color": color}}
            )
            return

        # explicit fresh snapshot request
        if t == "request_state":
            pos = positions_by_project[self.project.id]
            await self.send_json({
                "type": "state",
                "can_edit": self.can_edit,
                "positions": {k: {"x": x, "y": y} for k, (x, y) in pos.items()},
            })
            return

        # live selections
        if t == "select":
            ids = content.get("ids", [])
            await self.channel_layer.group_send(
                self.group, {"type": "project.broadcast", "data": {"type": "select", "id": self.peer_id, "ids": ids}}
            )
            return

        # options (only editors)
        if t == "options":
            if not self.can_edit:
                return
            opts = {k: content.get(k) for k in ("filter", "includeDeps", "layoutName", "fnMode")}
            await self.channel_layer.group_send(
                self.group, {"type": "project.broadcast", "data": {"type": "options", "id": self.peer_id, **opts}}
            )
            return

        # --- Node position sync ---

        # Full snapshot push (host/editor publishes the full layout)
        if t == "positions_snapshot":
            if not self.can_edit:
                return
            snapshot = content.get("positions") or {}
            if not isinstance(snapshot, dict):
                return
            store = positions_by_project[self.project.id]
            store.clear()
            for nid, p in snapshot.items():
                try:
                    x = float(p.get("x"))
                    y = float(p.get("y"))
                except Exception:
                    continue
                store[str(nid)] = (x, y)

            await self.channel_layer.group_send(
                self.group,
                {"type": "project.broadcast",
                 "data": {"type": "positions_snapshot", "id": self.peer_id,
                          "positions": {k: {"x": v[0], "y": v[1]} for k, v in store.items()}}}
            )
            return

        # Streaming batched updates while dragging (list of {id,x,y})
        if t == "positions_update":
            if not self.can_edit:
                return
            moves = content.get("moves") or []
            if not isinstance(moves, list) or not moves:
                return

            store = positions_by_project[self.project.id]
            out: List[Dict[str, Any]] = []
            for it in moves:
                try:
                    nid = str(it["id"])
                    x = float(it["x"])
                    y = float(it["y"])
                except Exception:
                    continue
                store[nid] = (x, y)
                out.append({"id": nid, "x": x, "y": y})

            if out:
                await self.channel_layer.group_send(
                    self.group,
                    {"type": "project.broadcast",
                     "data": {"type": "positions_update", "id": self.peer_id, "moves": out}}
                )
            return

        # 🔁 Back-compat: accept old 'nodes_pos' as an update batch
        if t == "nodes_pos":
            if not self.can_edit:
                return
            arr = content.get("positions") or []
            if not isinstance(arr, list):
                return
            store = positions_by_project[self.project.id]
            out: List[Dict[str, Any]] = []
            for it in arr:
                try:
                    nid = str(it["id"])
                    x = float(it["x"])
                    y = float(it["y"])
                except Exception:
                    continue
                store[nid] = (x, y)
                out.append({"id": nid, "x": x, "y": y})
            if out:
                await self.channel_layer.group_send(
                    self.group,
                    {"type": "project.broadcast",
                     "data": {"type": "positions_update", "id": self.peer_id, "moves": out}}
                )
            return

        # tiny chat
        if t == "chat":
            text = (content.get("text") or "").strip()[:500]
            if text:
                await self.channel_layer.group_send(
                    self.group, {"type": "project.broadcast", "data": {"type": "chat", "id": self.peer_id, "text": text}}
                )
            return

    # group handlers
    async def project_broadcast(self, event):
        await self.send_json(event["data"])

    async def project_event(self, event):
        # used by viewset/group_send("project.event") to announce saves/updates
        await self.send_json(event["data"])
