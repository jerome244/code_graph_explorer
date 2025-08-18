# core/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from .models import Project, ProjectAnalysis
from .serializers import (
    ProjectSerializer,
    ProjectAnalysisSerializer,         # kept for future use if you want to return uploads
    ProjectAnalysisResultSerializer,
)
from .services.analyzer import analyze_zip


class RoleBasedProjectPermission(permissions.BasePermission):
    """
    - Authenticated users can read.
    - Superusers: full access.
    - Users in "manager" group: full access to all projects.
    - Others: may create; may modify only their own objects (owner == request.user).
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.groups.filter(name="manager").exists():
            return True
        return getattr(obj, "owner_id", None) == request.user.id


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.select_related("owner").order_by("-created_at")
    serializer_class = ProjectSerializer
    permission_classes = [RoleBasedProjectPermission]
    lookup_field = "slug"

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ProjectUploadAnalyzeView(APIView):
    permission_classes = [permissions.IsAuthenticated, RoleBasedProjectPermission]

    def post(self, request, slug: str):
        project = get_object_or_404(Project, slug=slug)
        # object-level check (owner/manager/superuser)
        self.check_object_permissions(request, project)

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "Missing 'file' (zip)."}, status=400)
        if not file.name.lower().endswith(".zip"):
            return Response({"error": "File must be a .zip"}, status=400)

        content = file.read()
        result = analyze_zip(content)
        file.seek(0)
        analysis = ProjectAnalysis.objects.create(
            project=project,
            name=f"Analysis {project.name}",
            zip_file=file,
            summary=result.get("summary", {}),
            graph={
                "nodes": result["nodes"],
                "edges": result["edges"],
                "tree_by_file": result["tree_by_file"],
            },
        )
        return Response(
            ProjectAnalysisResultSerializer(analysis).data,
            status=status.HTTP_201_CREATED,
        )


class ProjectLatestAnalysisView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, slug: str):
        project = get_object_or_404(Project, slug=slug)
        analysis = project.analyses.order_by("-created_at").first()
        if not analysis:
            return Response({"error": "No analyses yet."}, status=404)
        return Response(ProjectAnalysisResultSerializer(analysis).data)
