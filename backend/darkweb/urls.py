from django.urls import path
from .views import CrawlView, SearchView, PageDetailView, EntitiesView

urlpatterns = [
    path("crawl",  CrawlView.as_view(),  name="darkweb-crawl"),
    path("search", SearchView.as_view(), name="darkweb-search"),
    path("pages/<int:pk>", PageDetailView.as_view(), name="darkweb-page-detail"),
    path("entities", EntitiesView.as_view(), name="darkweb-entities"),
    # optional trailing slashes:
    path("crawl/",  CrawlView.as_view()),
    path("search/", SearchView.as_view()),
    path("pages/<int:pk>/", PageDetailView.as_view()),
    path("entities/", EntitiesView.as_view()),
]
