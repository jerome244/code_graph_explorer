# /backend/realtime/consumers.py
from uuid import uuid4
from datetime import datetime, timezone

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.db.models import Q

# Try to import your Project model for access control.
# If it's not available or its field names differ, the guard below falls back permissively.
try:
    from projects.models import Project  # adjust if your app label/model differs
except Exception:  # pragma: no cover
    Project = None  # type: ignore

# --- Very light in-memory presence just for dev/demo ---
# { group_name: { user_id: {"id": int, "username": str, "color": str} } }
PRESENCE = {}

# --- Very light in-memory chat history (ephemeral; per process) ---
# { group_name: [ {id, text, ts, user:{id,username,color}} ] }
CHAT_HISTORY = {}
CHAT_HISTORY_MAX = 100  # cap backlog per project group


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
    We re-broadcast to the group as: {"type": "<same>", "data": {..., "by": <sender_id>}}
    Presence events: presence_state / presence_join / presence_leave
    Chat events: chat_history (on connect), chat (live)
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
            await self.close()
            return

        # Must be a member (best-effort; see helper above)
        if not await self._user_can_access_project(user, int(self.project_id)):
            await self.close()
            return

        # Join group & accept
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Presence: add me
        peers = PRESENCE.setdefault(self.group_name, {})
        me = peers.get(user.id)
        if not me:
            me = {"id": user.id, "username": user.username, "color": _color_for_user(user.id)}
            peers[user.id] = me

        # Send full presence state to me
        await self.send_json({"type": "presence_state", "peers": list(peers.values())})

        # Send lightweight chat backlog to me
        await self.send_json({
            "type": "chat_history",
            "messages": CHAT_HISTORY.get(self.group_name, []),
        })

        # Announce my join to others
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "broadcast", "payload": {"type": "presence_join", "peer": me}},
        )

    async def disconnect(self, code):
        user = self.scope.get("user", AnonymousUser())

        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass

        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            return

        peers = PRESENCE.get(self.group_name, {})
        if user.id in peers:
            peer = peers.pop(user.id)
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "broadcast", "payload": {"type": "presence_leave", "peer": {"id": peer["id"]}}},
            )
        if not peers:
            PRESENCE.pop(self.group_name, None)

    # ---------- Frontend -> Server ----------
    async def receive_json(self, content, **kwargs):
        t = content.get("type")
        user = self.scope.get("user")

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

        # --- New: realtime chat ---
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

        # Unknown → ignore silently
        else:
            return

    # ---------- Server -> Clients ----------
    async def broadcast(self, event):
        # Just forward the payload as-is to the socket
        await self.send_json(event["payload"])
