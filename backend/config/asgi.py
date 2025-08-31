import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.asgi import get_asgi_application
django_asgi = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from realtime.auth import JWTAuthMiddleware

# Import each app's websocket_urlpatterns and combine them
from realtime.routing import websocket_urlpatterns as realtime_ws
from game.routing import websocket_urlpatterns as game_ws

combined_ws = [*realtime_ws, *game_ws]

application = ProtocolTypeRouter({
    "http": django_asgi,
    "websocket": JWTAuthMiddleware(
        URLRouter(combined_ws)
    ),
})
