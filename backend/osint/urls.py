# backend/osint/urls.py
from django.urls import path
from .views import scan, darkweb_search, darkweb_content

app_name = "osint"

urlpatterns = [
    path("scan", scan, name="scan"),           # matches /api/osint/scan
    path("scan/", scan),
    path("darkweb", darkweb_search, name="darkweb_search"),  # matches /api/osint/darkweb
    path("darkweb/", darkweb_search),
    path("darkweb/content", darkweb_content),       # <-- new
    path("darkweb/content/", darkweb_content), 
]
