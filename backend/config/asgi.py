# config/asgi.py
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.asgi import get_asgi_application
django_asgi = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator, OriginValidator

from realtime.routing import websocket_urlpatterns as realtime_ws  # graph page
from game.routing import websocket_urlpatterns as game_ws          # minecraft page
from realtime.auth import JWTAuthMiddleware


class PathScopedJWT:
    def __init__(self, app, protect_prefixes=("/ws/projects/",)):
        self.app = app
        self.protect_prefixes = tuple(protect_prefixes)
        self._protected_app = JWTAuthMiddleware(app)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            path = scope.get("path", "")
            if any(path.startswith(prefix) for prefix in self.protect_prefixes):
                return await self._protected_app(scope, receive, send)
        return await self.app(scope, receive, send)


combined_ws = URLRouter(realtime_ws + game_ws)
ws_app = PathScopedJWT(combined_ws, protect_prefixes=("/ws/projects/",))

# Default: permissive (works like your current)
validator = AllowedHostsOriginValidator

# Flip to strict origin checks by setting STRICT_WS_ORIGINS=1 and PUBLIC_ORIGIN=https://app.example.com
if os.getenv("STRICT_WS_ORIGINS", "0") == "1":
    ORIGINS = {
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",      # if you sometimes use Next dev server
    }
    pub = os.getenv("PUBLIC_ORIGIN")  # e.g. https://app.example.com
    if pub:
        ORIGINS.add(pub)
    # Note: OriginValidator needs exact origins (no wildcards). For trycloudflare, put the exact URL.
    ws_validator = OriginValidator
    ws_app = ws_validator(ws_app, list(ORIGINS))
else:
    ws_app = validator(ws_app)

application = ProtocolTypeRouter({
    "http": django_asgi,
    "websocket": ws_app,
})
