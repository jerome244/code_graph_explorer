from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # Game example
    re_path(r"^ws/world/(?P<world>\d+)/$", consumers.GameConsumer.as_asgi()),
    # Projects (JWT)
    re_path(r"^ws/projects/(?P<project_id>\d+)/$", consumers.ProjectConsumer.as_asgi()),
    # Projects (share link)
    re_path(r"^ws/projects/shared/(?P<share_token>[\w\-]+)/$", consumers.ProjectConsumer.as_asgi()),
]
