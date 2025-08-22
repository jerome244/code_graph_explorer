# projects/consumers.py
import json
import math
import re
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.cache import cache
from django.contrib.auth.models import AnonymousUser

ALLOWED_TYPES = {"PING", "SNAPSHOT", "UPDATE_FILE", "HIDE_NODE", "MOVE_NODE"}
GROUP_NAME_RE = re.compile(r"^[A-Za-z0-9_\-:.]{1,128}$")
MAX_MESSAGE_BYTES = 64 * 1024          # hard cap for most ops
MAX_SNAPSHOT_BYTES = 1_000_000         # ~1MB snapshot guard
RATE_LIMIT_BUCKET = 120                # msgs per window
RATE_LIMIT_WINDOW_SEC = 10

def _finite(n):  # simple NaN/inf guard
    try:
        return isinstance(n, (int, float)) and math.isfinite(n)
    except Exception:
        return False

class ProjectConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        pid = self.scope["url_route"]["kwargs"]["project_id"]
        if not GROUP_NAME_RE.match(str(pid)):
            await self.close()
            return

        # Optional: gate non-demo rooms behind login/ACL
        user = self.scope.get("user")
        if str(pid) != "demo":
            if not user or isinstance(user, AnonymousUser):
                await self.close()
                return
            # Example: require ownership or share; replace with your checks
            if not await self._user_can_access(pid, user_id=getattr(user, "id", None)):
                await self.close()
                return

        self.project_id = str(pid)
        self.group = f"project_{self.project_id}"

        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        # (optional) announce presence to others, clients may ignore
        await self.channel_layer.group_send(
            self.group,
            {"type": "broadcast", "sender": self.channel_name,
             "event": {"type": "USER_JOINED"}}
        )

    async def disconnect(self, code):
        try:
            await self.channel_layer.group_discard(self.group, self.channel_name)
        finally:
            # (optional) presence announce
            if hasattr(self, "group"):
                await self.channel_layer.group_send(
                    self.group,
                    {"type": "broadcast", "sender": self.channel_name,
                     "event": {"type": "USER_LEFT"}}
                )

    async def receive_json(self, event):
        # --- rate limit ------------------------------------------------------
        if not self._allow_message():
            # soft-fail: drop silently; or send an error if you prefer
            return

        t = event.get("type")
        if t == "PING":
            await self.send_json({"type": "PONG"})
            return

        # --- type allowlist --------------------------------------------------
        if t not in ALLOWED_TYPES:
            return

        # --- size limits -----------------------------------------------------
        approx_bytes = len(json.dumps(event, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
        if t == "SNAPSHOT" and approx_bytes > MAX_SNAPSHOT_BYTES:
            await self.send_json({"type": "ERROR", "error": "SNAPSHOT_TOO_LARGE"})
            return
        if t != "SNAPSHOT" and approx_bytes > MAX_MESSAGE_BYTES:
            return

        # --- shape validation (lightweight) ---------------------------------
        if t == "MOVE_NODE":
            pos = (event.get("position") or {})
            if not _finite(pos.get("x")) or not _finite(pos.get("y")) or not event.get("id"):
                return
        elif t == "HIDE_NODE":
            if not event.get("id") or not isinstance(event.get("hidden"), bool):
                return
        elif t == "UPDATE_FILE":
            if not event.get("path") or "content" not in event:
                return
        # SNAPSHOT is size-guarded; validate more if you persist it server-side

        # fan-out to everyone; include sender so we can skip echo server-side
        await self.channel_layer.group_send(
            self.group,
            {"type": "broadcast", "sender": self.channel_name, "event": event}
        )

    async def broadcast(self, message):
        # avoid echoing to the sender; your client also filters by clientId
        if message.get("sender") == self.channel_name:
            return
        await self.send_json(message["event"])

    # -------------------- helpers --------------------

    def _allow_message(self) -> bool:
        """Simple sliding window rate limit per connection."""
        key = f"wsrate:{self.channel_name}"
        try:
            # INCR with expiry semantics
            count = cache.incr(key)
        except ValueError:
            cache.set(key, 1, RATE_LIMIT_WINDOW_SEC)
            count = 1
        if count == 1:
            cache.expire(key, RATE_LIMIT_WINDOW_SEC)
        return count <= RATE_LIMIT_BUCKET

    @database_sync_to_async
    def _user_can_access(self, project_id: str, user_id: int | None) -> bool:
        """
        Replace with your real ACL (Project/Share models, etc.).
        Returning True keeps the example self-contained.
        """
        return True
