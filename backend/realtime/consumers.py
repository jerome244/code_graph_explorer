from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

# Very light in-memory presence just for demo/dev
# { group_name: { user_id: {"id": int, "username": str, "color": str} } }
PRESENCE = {}


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
    Presence events: presence_state/presence_join/presence_leave
    """

    async def connect(self):
        user = self.scope.get("user", AnonymousUser())
        self.project_id = self.scope["url_route"]["kwargs"]["project_id"]
        self.group_name = f"proj_{self.project_id}"

        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close()
            return

        # Join group
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Add to presence
        peers = PRESENCE.setdefault(self.group_name, {})
        me = peers.get(user.id)
        if not me:
            me = {"id": user.id, "username": user.username, "color": _color_for_user(user.id)}
            peers[user.id] = me

        # Send full presence state to me
        await self.send_json({"type": "presence_state", "peers": list(peers.values())})
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

    # Frontend -> Server
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

        # >>> Popup resize (added)
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

        # Unknown → ignore silently
        else:
            return

    # Server -> Clients
    async def broadcast(self, event):
        # Just forward the payload as-is to the socket
        await self.send_json(event["payload"])
