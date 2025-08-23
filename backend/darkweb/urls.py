# darkweb/urls.py
from django.urls import path
from .views import CrawlView, SearchView

urlpatterns = [
    path("crawl",  CrawlView.as_view(),  name="darkweb-crawl"),
    path("search", SearchView.as_view(), name="darkweb-search"),
    # (optional: also accept trailing slashes)
    path("crawl/",  CrawlView.as_view()),
    path("search/", SearchView.as_view()),
]
