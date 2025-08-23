from django.urls import path
from .views import CrawlView, SearchView, PageDetailView

urlpatterns = [
    path("crawl",  CrawlView.as_view(),  name="darkweb-crawl"),
    path("search", SearchView.as_view(), name="darkweb-search"),
    path("pages/<int:pk>", PageDetailView.as_view(), name="darkweb-page-detail"),
    # (optional trailing slashes)
    path("crawl/",  CrawlView.as_view()),
    path("search/", SearchView.as_view()),
    path("pages/<int:pk>/", PageDetailView.as_view()),
]
