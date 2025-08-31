from django.urls import re_path
from .consumers import GameConsumer

websocket_urlpatterns = [
    re_path(r"^ws/mc/(?P<room>[\w-]+)/?$", GameConsumer.as_asgi()),
]
