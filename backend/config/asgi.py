# backend/config/asgi.py
import os
import django
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

# 1) Configure Django first
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

# 2) Build the HTTP app (this also ensures settings are loaded)
django_asgi_app = get_asgi_application()

# 3) NOW import anything that touches Django models/settings
import api.routing  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        URLRouter(api.routing.websocket_urlpatterns)
    ),
})
