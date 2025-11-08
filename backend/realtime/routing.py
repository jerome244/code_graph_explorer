from django.urls import re_path
from .consumers import ProjectConsumer
from .consumers_terminal import TerminalConsumer  # <-- add this import

websocket_urlpatterns = [
    re_path(r"^ws/projects/(?P<project_id>\d+)/$", ProjectConsumer.as_asgi()),
    re_path(r"^ws/projects/(?P<project_id>\d+)/terminal/$", TerminalConsumer.as_asgi()),  # <-- add this route
]
