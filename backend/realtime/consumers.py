# /backend/realtime/consumers.py
from uuid import uuid4
from datetime import datetime, timezone
import asyncio
from typing import Dict, Any

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.db.models import Q
from django.conf import settings

# Try to import your Project model for access control.
# If it's not available or its field names differ, the guard below falls back permissively.
try:
    from projects.models import Project  # adjust if your app label/model differs
except Exception:  # pragma: no cover
    Project = None  # type: ignore

# ---------- Tunables (override via Django settings) ----------
REALTIME_MAX_PEERS_PER_PROJECT = getattr(settings, "REALTIME_MAX_PEERS_PER_PROJECT", 10)
REALTIME_MAX_CONN_PER_USER = getattr(settings, "REALTIME_MAX_CONN_PER_USER", 4)

# --- Very light in-memory presence just for dev/demo ---
# PRESENCE = { group_name: { user_id: {"id": int, "username": str, "color": str, "sockets": int, "last_seen": iso} } }
PRESENCE: Dict[str, Dict[int, Dict[str, Any]]] = {}
PRESENCE_LOCK = asyncio.Lock()

# --- Very light in-memory chat history (ephemeral; per process) ---
# { group_name: [ {id, text, ts, user:{id,username,color}} ] }
CHAT_HISTORY: Dict[str, list] = {}
CHAT_HISTORY_MAX = 100  # cap backlog per project group

# --- Viewport sync: last known viewport per project (ephemeral; per process) ---
# { group_name: {"zoom": float, "pan": {"x": float, "y": float}} }
VIEWPORT_STATE: Dict[str, Dict[str, Any]] = {}

# --- Per-user global concurrent connection counts (across rooms; dev only) ---
USER_CONN_COUNTS: Dict[int, int] = {}
USER_CONN_LOCK = asyncio.Lock()


def _color_for_user(uid: int) -> str:
    # stable pastel-ish color by uid
    rng = (uid * 2654435761) & 0xFFFFFFFF
    r = 140 + (rng & 0x3F)     # 140..203
    g = 120 + ((rng >> 6) & 0x3F)
    b = 120 + ((rng >> 12) & 0x3F)
    return f"rgb({r},{g},{b})"


class ProjectConsumer(AsyncJsonWebsocketConsumer):
    """
    Group: proj_<project_id>
    Frontend sends: {"type": "...", ...payload...}
    We re-broadcast to the group as: {"type": "<same>", ...}
    Presence events: presence_state / presence_join / presence_leave
    Chat events: chat_history (on connect), chat (live)
    Shapes events: shapes_full (on connect), shape_op / shape_ops relay, optional shape_commit

    Limits:
      - Per-room unique peers: REALTIME_MAX_PEERS_PER_PROJECT
      - Per-user concurrent sockets: REALTIME_MAX_CONN_PER_USER
    """

    # ---------- Access control helper ----------
    @database_sync_to_async
    def _user_can_access_project(self, user, project_id: int) -> bool:
        """
        Allow connection if the authenticated user appears to be related to the project.
        Tries common field names: user/owner (FK) and editors/shared_with/members/collaborators/viewers (M2M).
        If the Project model isn't importable (Project is None), allow (dev-friendly default).
        """
        if Project is None:
            return True  # can't verify; be permissive for dev

        try:
            fields = {f.name for f in Project._meta.get_fields()}
            qs = Project.objects.filter(id=project_id)

            filt = Q()
            # Common owner fields
            if "user" in fields:
                filt |= Q(user=user)
            if "owner" in fields:
                filt |= Q(owner=user)
            # Common membership relations
            for m2m in ["editors", "shared_with", "members", "collaborators", "viewers"]:
                if m2m in fields:
                    filt |= Q(**{m2m: user})

            if filt.children:
                return qs.filter(filt).exists()

            # If we can't detect any known relation fields, fall back to allowing if the project exists.
            return qs.exists()
        except Exception:
            # On any ORM error, do not hard-fail the socket in dev.
            return True

    # ---------- Lifecycle ----------
    async def connect(self):
        user = self.scope.get("user", AnonymousUser())
        self.project_id = self.scope["url_route"]["kwargs"]["project_id"]
        self.group_name = f"proj_{self.project_id}"

        # Must be authenticated
        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.accept()
            await self.send_json({"type": "error", "code": "unauthorized", "message": "Authentication required."})
            await self.close(code=4401)
            return

        # Must be a member (best-effort; see helper above)
        if not await self._user_can_access_project(user, int(self.project_id)):
            await self.accept()
            await self.send_json({"type": "error", "code": "forbidden", "message": "You do not have access."})
            await self.close(code=4403)
            return

        self.uid = int(user.id)
        self.username = getattr(user, "username", f"user-{self.uid}")

        # ---- Enforce room cap & tentatively add presence (under lock) ----
        async with PRESENCE_LOCK:
            room = PRESENCE.setdefault(self.group_name, {})
            unique_users = len(room)
            is_already_here = self.uid in room

            if unique_users >= REALTIME_MAX_PEERS_PER_PROJECT and not is_already_here:
                await self.accept()
                await self.send_json({
                    "type": "error",
                    "code": "room_full",
                    "message": "This project room is full.",
                    "limit": REALTIME_MAX_PEERS_PER_PROJECT,
                })
                await self.close(code=4001)
                return

            # Reserve / refresh presence
            if not is_already_here:
                room[self.uid] = {
                    "id": self.uid,
                    "username": self.username,
                    "color": _color_for_user(self.uid),
                    "sockets": 0,
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                }
            room[self.uid]["sockets"] += 1
            room[self.uid]["last_seen"] = datetime.now(timezone.utc).isoformat()
            self._presence_reserved = True  # flag for cleanup

        # ---- Enforce per-user global concurrent connection cap ----
        async with USER_CONN_LOCK:
            current = USER_CONN_COUNTS.get(self.uid, 0)
            if current >= REALTIME_MAX_CONN_PER_USER:
                # roll back the room reservation
                try:
                    async with PRESENCE_LOCK:
                        room = PRESENCE.get(self.group_name, {})
                        entry = room.get(self.uid)
                        if entry:
                            entry["sockets"] = max(0, entry["sockets"] - 1)
                            if entry["sockets"] == 0:
                                room.pop(self.uid, None)
                        if not room:
                            PRESENCE.pop(self.group_name, None)
                except Exception:
                    pass

                await self.accept()
                await self.send_json({
                    "type": "error",
                    "code": "too_many_tabs",
                    "message": "Too many concurrent connections.",
                    "limit": REALTIME_MAX_CONN_PER_USER,
                })
                await self.close(code=4002)
                return

            USER_CONN_COUNTS[self.uid] = current + 1
            self._conn_counted = True

        # Join group & accept
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        self._joined_group = True
        await self.accept()

        # ----- Initial payloads -----
        # Send full presence state to me
        async with PRESENCE_LOCK:
            peers_list = list(PRESENCE.get(self.group_name, {}).values())
        await self.send_json({"type": "presence_state", "peers": peers_list})

        # Send lightweight chat backlog to me
        await self.send_json({
            "type": "chat_history",
            "messages": CHAT_HISTORY.get(self.group_name, []),
        })

        # Send current shapes snapshot to me
        shapes = await self._fetch_shapes()
        await self.send_json({"type": "shapes_full", "shapes": shapes})

        # --- Viewport sync: send last known viewport (if any) so newcomers land where the team is
        vp = VIEWPORT_STATE.get(self.group_name)
        if vp:
            await self.send_json({"type": "viewport", "data": {"zoom": vp.get("zoom"), "pan": vp.get("pan")}})

        # Announce my join to others
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "broadcast", "payload": {"type": "presence_join", "peer": {
                "id": self.uid, "username": self.username, "color": _color_for_user(self.uid)
            }}},
        )

    async def disconnect(self, code):
        user = self.scope.get("user", AnonymousUser())

        # Group cleanup
        try:
            if getattr(self, "_joined_group", False):
                await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass

        # Presence cleanup
        try:
            if getattr(self, "_presence_reserved", False) and user and not isinstance(user, AnonymousUser) and user.is_authenticated:
                async with PRESENCE_LOCK:
                    room = PRESENCE.get(self.group_name, {})
                    entry = room.get(user.id)
                    if entry:
                        entry["sockets"] = max(0, entry["sockets"] - 1)
                        if entry["sockets"] == 0:
                            room.pop(user.id, None)
                    if not room:
                        PRESENCE.pop(self.group_name, None)
        except Exception:
            pass

        # Notify others if still in room list (only send if we actually had presence)
        if user and not isinstance(user, AnonymousUser) and user.is_authenticated:
            peers = PRESENCE.get(self.group_name, {})
            if user.id not in peers:
                # already removed; still broadcast a leave event
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "broadcast", "payload": {"type": "presence_leave", "peer": {"id": int(user.id)}}},
                )

        # Global per-user conn decrement
        try:
            if getattr(self, "_conn_counted", False) and user and not isinstance(user, AnonymousUser) and user.is_authenticated:
                async with USER_CONN_LOCK:
                    if user.id in USER_CONN_COUNTS:
                        USER_CONN_COUNTS[user.id] = max(0, USER_CONN_COUNTS[user.id] - 1)
                        if USER_CONN_COUNTS[user.id] == 0:
                            USER_CONN_COUNTS.pop(user.id, None)
        except Exception:
            pass

    # ---------- Frontend -> Server ----------
    async def receive_json(self, content, **kwargs):
        t = content.get("type")
        user = self.scope.get("user")

        # Touch presence timestamp on any activity
        try:
            async with PRESENCE_LOCK:
                room = PRESENCE.get(self.group_name, {})
                if user and getattr(user, "id", None) in room:
                    room[user.id]["last_seen"] = datetime.now(timezone.utc).isoformat()
        except Exception:
            pass

        # Cursor (lightweight, throttled by client)
        if t == "cursor":
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "cursor",
                        "peer_id": user.id,
                        "data": {"x": content.get("x"), "y": content.get("y")},
                    },
                },
            )

        # Node drag / position
        elif t == "node_move":
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "node_move",
                        "data": {
                            "path": content.get("path"),
                            "x": content.get("x"),
                            "y": content.get("y"),
                            "by": user.id,
                        },
                    },
                },
            )

        # Show/hide node from the tree
        elif t == "node_visibility":
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "node_visibility",
                        "data": {
                            "path": content.get("path"),
                            "hidden": bool(content.get("hidden")),
                            "by": user.id,
                        },
                    },
                },
            )

        # Popup open/close
        elif t == "popup_open":
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {"type": "popup_open", "data": {"path": content.get("path"), "by": user.id}},
                },
            )

        elif t == "popup_close":
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {"type": "popup_close", "data": {"path": content.get("path"), "by": user.id}},
                },
            )

        # Popup resize
        elif t == "popup_resize":
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "popup_resize",
                        "data": {
                            "path": content.get("path"),
                            "w": content.get("w"),
                            "h": content.get("h"),
                            "by": user.id,
                        },
                    },
                },
            )

        # --- Sync per-popup "lines on/off" toggle ---
        elif t == "popup_lines":
            path = content.get("path")
            enabled = bool(content.get("enabled"))
            if not path:
                return
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "popup_lines",
                        "data": {
                            "path": path,
                            "enabled": enabled,
                            "by": user.id,
                        },
                    },
                },
            )

        # --- Sync GLOBAL "all lines on/off" toggle ---
        elif t == "popup_lines_global":
            enabled = bool(content.get("enabled"))
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "popup_lines_global",
                        "data": {
                            "enabled": enabled,
                            "by": user.id,
                        },
                    },
                },
            )

        # Full-document text edits (frontend sends {type:"text_edit", path, content})
        elif t == "text_edit":
            path = content.get("path")
            if not path:
                return
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "text_edit",
                        "data": {
                            "path": path,
                            "content": content.get("content", ""),
                            "by": user.id,
                        },
                    },
                },
            )

        # --- Sync GLOBAL "code coloration" toggle ---
        elif t == "colorize_functions":
            enabled = bool(content.get("enabled"))
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "colorize_functions",
                        "data": {
                            "enabled": enabled,
                            "by": user.id,
                        },
                    },
                },
            )

        # --- Realtime chat ---
        elif t == "chat":
            text = (content.get("text") or "").strip()
            if not text:
                return  # ignore empty

            # Build message
            msg = {
                "id": uuid4().hex,
                "text": text[:2000],  # safety cap
                "ts": datetime.now(timezone.utc).isoformat(),
                "user": {
                    "id": user.id,
                    "username": getattr(user, "username", f"user:{user.id}"),
                    "color": _color_for_user(user.id),
                },
            }

            # Append to per-group backlog
            hist = CHAT_HISTORY.setdefault(self.group_name, [])
            hist.append(msg)
            if len(hist) > CHAT_HISTORY_MAX:
                del hist[:-CHAT_HISTORY_MAX]

            # Fan-out to everyone in the project
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "broadcast", "payload": {"type": "chat", "data": msg}},
            )

        # --- Realtime shapes sync ---
        elif t == "shape_op":
            # forward one op (add/remove/patch/replace_all) to everyone
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "broadcast", "payload": content},
            )

        elif t == "shape_ops":
            # forward a batch of ops to everyone
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "broadcast", "payload": content},
            )

        elif t == "shape_request_full":
            # send a fresh snapshot to just this client
            shapes = await self._fetch_shapes()
            await self.send_json({"type": "shapes_full", "shapes": shapes})

        elif t == "shape_commit":
            # optional: persist shapes to DB when client explicitly asks
            shapes = content.get("shapes")
            if isinstance(shapes, list):
                await self._save_shapes(shapes)
                await self.send_json({"type": "shape_commit_ok"})

        # --- WebRTC audio signaling (1:1) ---
        elif t in ("rtc_offer", "rtc_answer", "rtc_ice", "rtc_hangup"):
            to = content.get("to")
            payload = {"type": t, "from": user.id, "to": to}
            if "sdp" in content:
                payload["sdp"] = content.get("sdp")
            if "candidate" in content:
                payload["candidate"] = content.get("candidate")
            if "reason" in content:
                payload["reason"] = content.get("reason")  # e.g. "hangup" | "decline" | "busy"
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "broadcast", "payload": payload},
            )

        # --- Viewport sync: store + broadcast ---
        elif t == "viewport":
            # Expect: {type:"viewport", zoom: float, pan: {x: float, y: float}}
            # Persist last known viewport for newcomers (ephemeral)
            try:
                zoom = float(content.get("zoom"))
            except (TypeError, ValueError):
                zoom = None
            pan = content.get("pan") or {}
            panx = pan.get("x")
            pany = pan.get("y")

            if zoom is not None and panx is not None and pany is not None:
                VIEWPORT_STATE[self.group_name] = {"zoom": zoom, "pan": {"x": panx, "y": pany}}

            # Fan-out to everyone (clients ignore echoes from themselves)
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast",
                    "payload": {
                        "type": "viewport",
                        "data": {"zoom": zoom, "pan": {"x": panx, "y": pany}, "by": getattr(user, "id", None)},
                    },
                },
            )

        # Unknown → ignore silently
        else:
            return

    # ---------- Server -> Clients ----------
    async def broadcast(self, event):
        # Just forward the payload as-is to the socket
        await self.send_json(event["payload"])

    # ---------- Shapes helpers ----------
    @database_sync_to_async
    def _fetch_shapes(self):
        if Project is None:
            return []
        try:
            fields = {f.name for f in Project._meta.get_fields()}
            if "shapes" not in fields:
                return []
            obj = Project.objects.get(id=int(self.project_id))
            return getattr(obj, "shapes", []) or []
        except Project.DoesNotExist:
            return []
        except Exception:
            return []

    @database_sync_to_async
    def _save_shapes(self, shapes):
        if Project is None:
            return
        try:
            fields = {f.name for f in Project._meta.get_fields()}
            if "shapes" not in fields:
                return
            Project.objects.filter(id=int(self.project_id)).update(shapes=shapes)
        except Exception:
            pass
