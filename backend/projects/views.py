from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.db.models import Count
from django.shortcuts import get_object_or_404
from .models import Project, ProjectFile
from .serializers import (
    ProjectListItemSerializer,
    ProjectCreateSerializer,
    ProjectDetailSerializer,
    ProjectFileSerializer,
)

class ProjectListCreateView(generics.ListCreateAPIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return (Project.objects.filter(user=self.request.user)
                .annotate(file_count=Count("files")))

    def get_serializer_class(self):
        return ProjectCreateSerializer if self.request.method == "POST" else ProjectListItemSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class ProjectRetrieveUpdateDeleteView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ProjectDetailSerializer

    def get_queryset(self):
        return Project.objects.filter(user=self.request.user)

# Bulk upsert files: { files: [{path, content}, ...] }
class ProjectFilesBulkUpsertView(generics.GenericAPIView):
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ProjectFileSerializer

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk, user=request.user)
        files = request.data.get("files", [])
        upserts = []
        for f in files:
            pf, _ = ProjectFile.objects.get_or_create(project=project, path=f["path"])
            pf.content = f.get("content", "")
            upserts.append(pf)
        if upserts:
            ProjectFile.objects.bulk_update(upserts, ["content"])
        return Response({"saved": len(upserts)})

# Single-file upsert: { path, content }
class ProjectSingleFileUpsertView(generics.GenericAPIView):
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ProjectFileSerializer

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk, user=request.user)
        path = request.data.get("path")
        content = request.data.get("content", "")
        if not path:
            return Response({"detail": "path required"}, status=status.HTTP_400_BAD_REQUEST)
        pf, _ = ProjectFile.objects.get_or_create(project=project, path=path)
        pf.content = content
        pf.save(update_fields=["content"])
        return Response({"saved": True})
