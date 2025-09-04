# /home/user/holberton/code_graph_explorer/backend/config/asgi.py
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# IMPORTANT: initialize Django BEFORE importing anything that touches models/apps
from django.core.asgi import get_asgi_application
django_asgi = get_asgi_application()  # this calls django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter

# If you have a JWT middleware and it's strict, comment it out until sockets connect
# from realtime.auth import JWTAuthMiddleware

# Import websocket routes only AFTER get_asgi_application()
from realtime.routing import websocket_urlpatterns as realtime_ws
from game.routing import websocket_urlpatterns as game_ws

# For first tests, allow anonymous WS for the game route. You can re-add auth later.
application = ProtocolTypeRouter({
    "http": django_asgi,
    # If you want realtime to stay under JWT but game to be open:
    # "websocket": JWTAuthMiddleware(URLRouter(realtime_ws))  # strict
    #                + URLRouter(game_ws),                    # open
    "websocket": URLRouter(realtime_ws + game_ws),
})
