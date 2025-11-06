from django.urls import re_path
from .consumers import GameConsumer

websocket_urlpatterns = [
    # ws://<host>/ws/game/<session_id>/?token=<JWT>
    re_path(r"^ws/game/(?P<session_id>[-\w]+)/$", GameConsumer.as_asgi()),
]
