from django.urls import path
from .views import CrawlView, SearchView, PageDetailView, EntitiesView
from .views import AlertsView, AlertToggleView, AlertTestView
from .views import SourcesView

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
    path("alerts", AlertsView.as_view(), name="darkweb-alerts"),
    path("alerts/", AlertsView.as_view()),
    path("alerts/<int:pk>/toggle", AlertToggleView.as_view()),
    path("alerts/<int:pk>/test", AlertTestView.as_view()),
    path("sources", SourcesView.as_view()),
    path("sources/", SourcesView.as_view()),
]
