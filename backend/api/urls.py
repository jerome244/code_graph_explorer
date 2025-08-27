from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import chunk, entities
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import register_user, whoami
from .views import ProjectViewSet  # ← add this import
from . import osint as osint_views

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")  # ← NEW

urlpatterns = [
    path("auth/register", register_user),
    path("auth/login", TokenObtainPairView.as_view()),
    path("auth/refresh", TokenRefreshView.as_view()),
    path("auth/me", whoami),

    path("chunk", chunk),
    path("entities", entities),
    path("osint/scan", osint_views.osint_scan),

    path("", include(router.urls)),  # ← make sure this line is present
]
