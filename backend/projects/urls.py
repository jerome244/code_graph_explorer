from django.urls import path
from .views import (
    ProjectListCreateView,
    ProjectRetrieveUpdateDeleteView,
    ProjectFilesBulkUpsertView,
    ProjectSingleFileUpsertView,
    ShareProjectView,
    SharedWithMeListView,
)

urlpatterns = [
    path("", ProjectListCreateView.as_view(), name="project_list_create"),
    path("shared-with-me/", SharedWithMeListView.as_view(), name="projects_shared_with_me"),
    path("<int:pk>/", ProjectRetrieveUpdateDeleteView.as_view(), name="project_detail"),
    path("<int:pk>/files/bulk/", ProjectFilesBulkUpsertView.as_view(), name="project_files_bulk"),
    path("<int:pk>/file/", ProjectSingleFileUpsertView.as_view(), name="project_file_upsert"),
    path("<int:pk>/share/", ShareProjectView.as_view(), name="project_share"),
]
