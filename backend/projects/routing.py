from django.urls import re_path
from .consumers import ProjectCollabConsumer

websocket_urlpatterns = [
    re_path(r"^ws/projects/(?P<project_id>\d+)/$", ProjectCollabConsumer.as_asgi()),
]
