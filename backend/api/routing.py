from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path("ws/game/<int:world>/", consumers.GameConsumer.as_asgi()),
    path("ws/projects/<int:project_id>/", consumers.ProjectConsumer.as_asgi()),
    path("ws/projects/shared/<str:share_token>/", consumers.ProjectConsumer.as_asgi()),
]
