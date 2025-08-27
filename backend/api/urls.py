from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import chunk, entities, register_user, whoami, ProjectViewSet, project_by_token, user_search
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import osint as osint_views

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")

urlpatterns = [
    path("auth/register", register_user),
    path("auth/login", TokenObtainPairView.as_view()),
    path("auth/refresh", TokenRefreshView.as_view()),
    path("auth/me", whoami),

    # ↓ add this alias so the frontend’s /api/whoami doesn’t 404
    path("whoami", whoami),

    path("chunk", chunk),
    path("entities", entities),
    path("osint/scan", osint_views.osint_scan),
    path("projects/shared/<str:token>/", project_by_token),
    path("", include(router.urls)),
    path("users/search", user_search),
]

