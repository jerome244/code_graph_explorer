import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.asgi import get_asgi_application
django_asgi = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from realtime.routing import websocket_urlpatterns
from realtime.auth import JWTAuthMiddleware

application = ProtocolTypeRouter({
    "http": django_asgi,
    "websocket": JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
})
