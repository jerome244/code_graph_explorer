# config/asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator, OriginValidator
import projects.routing  # must define `websocket_urlpatterns`

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

# Restrict websocket origins (add your real domains)
WEBSOCKET_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://app.example.com",
]

websocket_app = AllowedHostsOriginValidator(
    OriginValidator(
        AuthMiddlewareStack(URLRouter(projects.routing.websocket_urlpatterns)),
        WEBSOCKET_ALLOWED_ORIGINS,
    )
)

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": websocket_app,
})
