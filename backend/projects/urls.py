from django.urls import path
from .views import (
    ProjectListCreateView,
    ProjectRetrieveUpdateDeleteView,
    ProjectFilesBulkUpsertView,
    ProjectSingleFileUpsertView,
)

urlpatterns = [
    path("", ProjectListCreateView.as_view(), name="project_list_create"),
    path("<int:pk>/", ProjectRetrieveUpdateDeleteView.as_view(), name="project_detail"),
    path("<int:pk>/files/bulk/", ProjectFilesBulkUpsertView.as_view(), name="project_files_bulk"),
    path("<int:pk>/file/", ProjectSingleFileUpsertView.as_view(), name="project_file_upsert"),
]
