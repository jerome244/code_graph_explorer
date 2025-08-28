import json
import time
from collections import defaultdict
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from django.contrib.auth.models import User
from .models import Project, ProjectShare

SIGN_SALT = "ws.ticket"
TICKET_MAX_AGE = 60  # seconds

# Simple in-memory presence per process (good for dev/single worker).
# For multi-process prod, use channels_redis and a Redis set instead.
PRESENCE = defaultdict(set)  # { project_id: {user_id, ...} }

class ProjectCollabConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket for real-time collaboration on a project.
    Auth via short-lived signed 'ticket' in query string (?ticket=...).
    Events:
      - presence_state -> { users: [{id,username}, ...] }
      - presence join/leave -> { event:'presence', action:'join'|'leave', userId, username }
      - node_move -> { event:'node_move', nodeId, x, y, clientId, userId, ts }
    """

    async def connect(self):
        self.project_id = int(self.scope["url_route"]["kwargs"]["project_id"])
        self.group_name = f"project_{self.project_id}"

        # Parse and verify ticket
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        ticket = (qs.get("ticket") or [None])[0]
        user_id = await self._verify_ticket(ticket)
        if not user_id:
            await self.close(code=4403)  # Forbidden
            return

        # Access check
        try:
            project = await self._get_project(self.project_id)
        except Project.DoesNotExist:
            await self.close(code=4404)
            return

        if not await self._user_has_access(user_id, project.id):
            await self.close(code=4403)
            return

        self.user_id = user_id
        self.client_id = None
        self.username = await self._get_username(self.user_id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Add to presence and send full state to THIS client
        PRESENCE[self.project_id].add(self.user_id)
        await self.send_json({
            "event": "presence_state",
            "users": await self._presence_users(self.project_id),
        })

        # Announce join to OTHERS
        await self.channel_layer.group_send(self.group_name, {
            "type": "broadcast.message",
            "event": "presence",
            "action": "join",
            "userId": self.user_id,
            "username": self.username,
        })

    async def disconnect(self, code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass

        # Remove from presence + announce leave
        if getattr(self, "user_id", None) is not None:
            PRESENCE[self.project_id].discard(self.user_id)
            await self.channel_layer.group_send(self.group_name, {
                "type": "broadcast.message",
                "event": "presence",
                "action": "leave",
                "userId": self.user_id,
                "username": getattr(self, "username", None),
            })

    async def receive_json(self, content, **kwargs):
        """
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
            await self.channel_layer.group_send(self.group_name, {
                "type": "broadcast.message",
                "event": "node_move",
                "nodeId": node_id,
                "x": x, "y": y,
                "clientId": client_id,
                "userId": self.user_id,
                "ts": int(time.time() * 1000),
            })

    async def broadcast_message(self, event):
        await self.send_json(event)

    # --- helpers ---

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
        return int(data.get("uid") or 0) or None

    async def _get_project(self, pid: int) -> Project:
        return Project.objects.get(pk=pid)

    async def _user_has_access(self, uid: int, pid: int) -> bool:
        if Project.objects.filter(id=pid, owner_id=uid).exists():
            return True
        return ProjectShare.objects.filter(project_id=pid, user_id=uid).exists()

    async def _get_username(self, uid: int) -> str | None:
        try:
            return User.objects.only("username").get(pk=uid).username
        except User.DoesNotExist:
            return None

    async def _presence_users(self, pid: int):
        ids = list(PRESENCE.get(pid, set()))
        if not ids:
            return []
        return list(User.objects.filter(id__in=ids).values("id", "username"))
