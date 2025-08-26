from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import chunk, entities
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import register_user, whoami
from . import osint as osint_views  # NEW

router = DefaultRouter()

urlpatterns = [
    path("auth/register", register_user),
    path("auth/login", TokenObtainPairView.as_view()),
    path("auth/refresh", TokenRefreshView.as_view()),
    path("auth/me", whoami),

    path("chunk", chunk),
    path("entities", entities),
    path("osint/scan", osint_views.osint_scan),  # NEW
]
