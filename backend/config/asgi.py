import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# 1) Bootstrap Django *before* importing anything that touches apps/models
from django.core.asgi import get_asgi_application
django_asgi = get_asgi_application()  # runs django.setup()

# 2) Channels routing
from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import re_path
from channels.security.websocket import AllowedHostsOriginValidator

# 3) Your apps' URL patterns
from realtime.routing import websocket_urlpatterns as realtime_ws  # graph page
from game.routing import websocket_urlpatterns as game_ws          # minecraft page

# 4) JWT middleware used by the graph websocket
from realtime.auth import JWTAuthMiddleware


class PathScopedJWT:
    """
    Wrap the combined WebSocket router, but only enforce JWT on selected path prefixes.
    Everything else (e.g., /ws/game/...) remains open to guests.
    """
    def __init__(self, app, protect_prefixes=("/ws/projects/",)):
        self.app = app
        self.protect_prefixes = tuple(protect_prefixes)
        # Create one protected app instance so we don't reconstruct per-connection
        self._protected_app = JWTAuthMiddleware(app)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            path = scope.get("path", "")
            if any(path.startswith(prefix) for prefix in self.protect_prefixes):
                # Enforce JWT for these paths (graph)
                return await self._protected_app(scope, receive, send)
        # Open/guest for all other WS paths (minecraft)
        return await self.app(scope, receive, send)


# 5) Combine both apps' URL patterns (unchanged paths inside each app)
combined_ws = URLRouter(realtime_ws + game_ws)

application = ProtocolTypeRouter({
    "http": django_asgi,
    # Optional but good: restrict WS origins to ALLOWED_HOSTS
    "websocket": AllowedHostsOriginValidator(
        PathScopedJWT(combined_ws, protect_prefixes=("/ws/projects/",))  # adjust prefix if needed
    ),
})
