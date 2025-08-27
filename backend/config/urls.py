from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from graph.views import ProjectViewSet, FileViewSet, NodeViewSet, EdgeViewSet

router = DefaultRouter()
router.register(r'projects', ProjectViewSet)
router.register(r'files', FileViewSet)
router.register(r'nodes', NodeViewSet)
router.register(r'edges', EdgeViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api/', include('users.urls')),  # auth routes (register/login/me)
]
