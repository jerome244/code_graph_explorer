from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import chunk, entities
from . import osint as osint_views  # NEW

router = DefaultRouter()
# (you may have other viewsets registered here)

urlpatterns = [
    path("chunk", chunk),
    path("entities", entities),
    path("osint/scan", osint_views.osint_scan),  # NEW
]
