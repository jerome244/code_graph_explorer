# backend/api/urls.py
from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from .views import hello, WorldViewSet, BlockViewSet, chunk

# Accept both with and without trailing slashes to avoid dev redirect loops
class SlashyRouter(DefaultRouter):
    trailing_slash = '/?'

router = SlashyRouter()
router.register(r"worlds", WorldViewSet, basename="world")
router.register(r"blocks", BlockViewSet, basename="block")

urlpatterns = [
    path("hello/", hello),
    re_path(r"^chunk/?$", chunk),  # /api/chunk and /api/chunk/
    path("", include(router.urls)),
]
