# backend/projects/consumers.py
import json
import time
from collections import defaultdict
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from django.contrib.auth.models import User

from .models import Project, ProjectShare

SIGN_SALT = "ws.ticket"
TICKET_MAX_AGE = 60  # seconds

# Dev-only presence (in-memory, single process)
PRESENCE = defaultdict(set)  # { project_id: {user_id, ...} }


class ProjectCollabConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket for real-time collaboration on a project.

    Events sent to clients:
      - presence_state: { event, users: [{id, username}] }
      - presence: { event:'presence', action:'join'|'leave', userId, username }
      - node_move: { event:'node_move', nodeId, x, y, clientId, userId, ts }
    """

    async def connect(self):
        self.project_id = int(self.scope["url_route"]["kwargs"]["project_id"])
        self.group_name = f"project_{self.project_id}"

        # ticket from query string
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        ticket = (qs.get("ticket") or [None])[0]
        user_id = await self._verify_ticket(ticket)
        if not user_id:
            await self.close(code=4403)  # Forbidden
            return

        # access checks via async-wrapped ORM
        try:
            project_exists = await self._project_exists(self.project_id)
        except Exception:
            project_exists = False
        if not project_exists:
            await self.close(code=4404)
            return

        has_access = await self._user_has_access(user_id, self.project_id)
        if not has_access:
            await self.close(code=4403)
            return

        self.user_id = user_id
        self.client_id = None
        self.username = await self._get_username(self.user_id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # presence: add self and send full state to this client
        PRESENCE[self.project_id].add(self.user_id)
        users_list = await self._presence_users(self.project_id)
        await self.send_json({"event": "presence_state", "users": users_list})

        # announce join to others
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "broadcast.message",
                "event": "presence",
                "action": "join",
                "userId": self.user_id,
                "username": self.username,
            },
        )

    async def disconnect(self, code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass

        if getattr(self, "user_id", None) is not None:
            PRESENCE[self.project_id].discard(self.user_id)
            # announce leave
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast.message",
                    "event": "presence",
                    "action": "leave",
                    "userId": self.user_id,
                    "username": getattr(self, "username", None),
                },
            )

    async def receive_json(self, content, **kwargs):
        """
        Expected messages from client:
          { "type": "hello", "clientId": "uuid" }
          { "type": "node_move", "clientId": "uuid", "nodeId": "n1", "x": 10, "y": 20 }
        """
        msg_type = content.get("type")

        if msg_type == "hello":
            self.client_id = content.get("clientId")
            return

        if msg_type == "node_move":
            node_id = content.get("nodeId")
            x = content.get("x")
            y = content.get("y")
            client_id = content.get("clientId")
            if node_id is None or x is None or y is None:
                return
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast.message",
                    "event": "node_move",
                    "nodeId": node_id,
                    "x": x,
                    "y": y,
                    "clientId": client_id,
                    "userId": self.user_id,
                    "ts": int(time.time() * 1000),
                },
            )

    async def broadcast_message(self, event):
        await self.send_json(event)

    # ---------------- helpers (wrap DB with database_sync_to_async) ----------------

    async def _verify_ticket(self, ticket: str | None) -> int | None:
        if not ticket:
            return None
        signer = TimestampSigner(salt=SIGN_SALT)
        try:
            raw = signer.unsign(ticket, max_age=TICKET_MAX_AGE)
            data = json.loads(raw)
        except (BadSignature, SignatureExpired, json.JSONDecodeError):
            return None
        if int(data.get("pid") or 0) != self.project_id:
            return None
        uid = int(data.get("uid") or 0)
        return uid or None

    @database_sync_to_async
    def _project_exists(self, pid: int) -> bool:
        return Project.objects.filter(pk=pid).exists()

    @database_sync_to_async
    def _user_has_access(self, uid: int, pid: int) -> bool:
        if Project.objects.filter(id=pid, owner_id=uid).exists():
            return True
        return ProjectShare.objects.filter(project_id=pid, user_id=uid).exists()

    @database_sync_to_async
    def _get_username(self, uid: int) -> str | None:
        try:
            return User.objects.only("username").get(pk=uid).username
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def _presence_users(self, pid: int):
        ids = list(PRESENCE.get(pid, set()))
        if not ids:
            return []
        return list(User.objects.filter(id__in=ids).values("id", "username"))
