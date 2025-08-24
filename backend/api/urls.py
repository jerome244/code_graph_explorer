# backend/api/urls.py
from django.urls import re_path
from .views import chunk, entities

urlpatterns = [
    re_path(r"^chunk/?$", chunk),        # /api/chunk or /api/chunk/
    re_path(r"^entities/?$", entities),  # /api/entities or /api/entities/
]
