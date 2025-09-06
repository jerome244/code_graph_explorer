# backend/osint/urls.py
from django.urls import path
from .views import scan

app_name = "osint"

urlpatterns = [
    path("scan/", scan, name="scan"),
]
