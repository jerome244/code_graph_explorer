# config/urls.py
from django.contrib import admin
from django.urls import path, include
import config.admin  # run admin branding
from core.views import ProjectImportGithubView
from core import views

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


]

# Media (dev only)
from django.conf import settings
from django.conf.urls.static import static
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
