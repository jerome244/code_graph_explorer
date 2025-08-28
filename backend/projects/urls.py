from django.urls import path
from .views import (
    ProjectListCreateView,
    ProjectDetailView,
    ProjectShareListCreateView,
    ProjectShareDetailView,
    ProjectWSTicketView,   # if you added the WS ticket view
)

urlpatterns = [
    path("", ProjectListCreateView.as_view(), name="project-list-create"),
    path("<int:pk>/", ProjectDetailView.as_view(), name="project-detail"),
    path("<int:pk>/share/", ProjectShareListCreateView.as_view(), name="project-share-list-create"),
    path("<int:pk>/share/<int:user_id>/", ProjectShareDetailView.as_view(), name="project-share-detail"),
    path("<int:pk>/ws-ticket/", ProjectWSTicketView.as_view(), name="project-ws-ticket"),
]
