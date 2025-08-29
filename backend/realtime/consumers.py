from typing import Dict, Any
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from projects.models import Project

# ephemeral presence store: group -> { user_id: {username, color} }
PRESENCE: Dict[str, Dict[int, Dict[str, Any]]] = {}

def group_name(project_id: int) -> str:
    return f"project_{project_id}"

COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#06b6d4",
    "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#84cc16"
]

@database_sync_to_async
def user_role(user, project_id: int) -> str:
    if not user or getattr(user, "is_authenticated", False) is False:
        return "none"
    try:
        p = Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        return "none"
    if p.user_id == user.id:
        return "owner"
    if p.editors.filter(id=user.id).exists():
        return "editor"
    if p.shared_with.filter(id=user.id).exists():
        return "viewer"
    return "none"

class ProjectConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.project_id = int(self.scope["url_route"]["kwargs"]["project_id"])
        self.group = group_name(self.project_id)

        # authz
        role = await user_role(self.scope.get("user"), self.project_id)
        if role == "none":
            await self.close(code=4403)
            return

        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        # add to presence
        u = self.scope.get("user")
        PRESENCE.setdefault(self.group, {})
        # Pick a stable color per user
        color = COLORS[u.id % len(COLORS)]
        PRESENCE[self.group][u.id] = {"id": u.id, "username": u.get_username(), "color": color}

        # send full presence to the new client
        await self.send_json({"type": "presence_state", "peers": list(PRESENCE[self.group].values())})
        # notify others of join
        await self.channel_layer.group_send(self.group, {
            "type": "presence.join",
            "peer": PRESENCE[self.group][u.id],
        })

    async def disconnect(self, code):
        try:
            await self.channel_layer.group_discard(self.group, self.channel_name)
        except Exception:
            pass
        u = self.scope.get("user")
        if u and getattr(u, "is_authenticated", False):
            peers = PRESENCE.get(self.group, {})
            if u.id in peers:
                peers.pop(u.id, None)
                await self.channel_layer.group_send(self.group, {
                    "type": "presence.leave",
                    "peer": {"id": u.id},
                })

    async def receive_json(self, content: dict, **kwargs):
        typ = content.get("type")
        u = self.scope.get("user")
        if typ == "cursor":
            # { type, x, y, docX?, docY? }
            await self.channel_layer.group_send(self.group, {
                "type": "cursor.update",
                "peer_id": getattr(u, "id", None),
                "data": {k: content.get(k) for k in ("x","y","docX","docY")},
            })
        elif typ == "node_move":
            # { type, path, x, y, transient?: bool }
            payload = {"path": content.get("path"), "x": content.get("x"), "y": content.get("y"), "by": getattr(u, "id", None)}
            await self.channel_layer.group_send(self.group, {"type": "node.move", "data": payload})
        elif typ == "ping":
            await self.send_json({"type": "pong"})
        else:
            # ignore unknown
            pass

    # Handlers for group messages
    async def presence_join(self, event):
        await self.send_json({"type": "presence_join", "peer": event.get("peer")})

    async def presence_leave(self, event):
        await self.send_json({"type": "presence_leave", "peer": event.get("peer")})

    async def cursor_update(self, event):
        await self.send_json({
            "type": "cursor",
            "peer_id": event.get("peer_id"),
            "data": event.get("data"),
        })

    async def node_move(self, event):
        await self.send_json({
            "type": "node_move",
            "data": event.get("data"),
        })
