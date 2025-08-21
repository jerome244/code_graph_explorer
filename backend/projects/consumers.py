# projects/consumers.py
from channels.generic.websocket import AsyncJsonWebsocketConsumer

class ProjectConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.project_id = self.scope["url_route"]["kwargs"]["project_id"]
        self.group = f"project_{self.project_id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, event):
        # Example events: UPDATE_FILE, HIDE_NODE, SNAPSHOT, PING
        t = event.get("type")
        if t == "PING":
            await self.send_json({"type": "PONG"})
            return
        # fan-out to everyone in the room (including sender—your client filters own messages)
        await self.channel_layer.group_send(self.group, {"type": "broadcast", "event": event})

    async def broadcast(self, message):
        await self.send_json(message["event"])
