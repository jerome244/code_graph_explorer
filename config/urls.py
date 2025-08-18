# config/urls.py
from django.contrib import admin
from django.urls import path, include
import config.admin  # run admin branding

from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

from core.views import (
    ProjectViewSet,
    ProjectUploadAnalyzeView,
    ProjectLatestAnalysisView,
)

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")

urlpatterns = [
    path("admin/", admin.site.urls),

    # API (DRF router)
    path("api/", include(router.urls)),

    # JWT
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/token/verify/", TokenVerifyView.as_view(), name="token_verify"),

    # Analyzer endpoints
    path("api/projects/<slug:slug>/upload/", ProjectUploadAnalyzeView.as_view(), name="project-upload"),
    path("api/projects/<slug:slug>/analysis/latest/", ProjectLatestAnalysisView.as_view(), name="project-analysis-latest"),
]

# Media (dev only)
from django.conf import settings
from django.conf.urls.static import static
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
