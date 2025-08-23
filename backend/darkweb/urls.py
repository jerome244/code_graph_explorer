from django.urls import path
from .views import CrawlView, SearchView


urlpatterns = [
path("crawl", CrawlView.as_view(), name="darkweb-crawl"),
path("search", SearchView.as_view(), name="darkweb-search"),
]
