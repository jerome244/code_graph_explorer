from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/world/(?P<world>\d+)/$", consumers.GameConsumer.as_asgi()),
    re_path(r"^ws/projects/(?P<project_id>\d+)/$", consumers.ProjectConsumer.as_asgi()),
    re_path(r"^ws/projects/shared/(?P<share_token>[^/]+)/$", consumers.ProjectConsumer.as_asgi()),
]
