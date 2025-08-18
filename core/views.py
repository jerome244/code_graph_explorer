# core/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.core.files.base import ContentFile
from .services.github_import import parse_repo_input, fetch_github_zip

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


class ProjectImportGithubView(APIView):
    permission_classes = [permissions.IsAuthenticated, RoleBasedProjectPermission]

    def post(self, request, slug: str):
        project = get_object_or_404(Project, slug=slug)
        self.check_object_permissions(request, project)

        repo_input = (request.data.get("repo") or request.data.get("url") or "").strip()
        if not repo_input:
            return Response({"error": "Provide 'repo' (owner/name) or 'url'."}, status=400)
        ref = (request.data.get("ref") or "").strip() or None

        # prefer server-side token; allow explicit token for private repos if you want
        token = getattr(settings, "GITHUB_TOKEN", None) or (request.data.get("token") or None)

        try:
            owner, repo = parse_repo_input(repo_input)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        try:
            zip_bytes, meta = fetch_github_zip(owner, repo, ref=ref, token=token)
        except RuntimeError as e:
            return Response({"error": str(e)}, status=502)

        # analyze
        from .services.analyzer import analyze_zip
        result = analyze_zip(zip_bytes)

        # persist (save the archive so the analysis is reproducible)
        cf = ContentFile(zip_bytes)
        filename = f"{owner}-{repo}-{meta.get('sha') or (ref or 'head')}.zip"
        analysis = ProjectAnalysis.objects.create(
            project=project,
            name=f"GitHub {owner}/{repo} ({ref or meta.get('sha') or 'HEAD'})",
            zip_file=None,  # fill after save() so path exists
            source=ProjectAnalysis.SOURCE_GITHUB,
            source_meta=meta,
            summary=result.get("summary", {}),
            graph={
                "nodes": result["nodes"],
                "edges": result["edges"],
                "tree_by_file": result["tree_by_file"],
            },
        )
        analysis.zip_file.save(filename, cf, save=True)
        return Response(ProjectAnalysisResultSerializer(analysis).data, status=201)

# core/views.py
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
import zipfile
from io import BytesIO
import json
import re

from .models import Project  # and Analysis exported via core.models/__init__.py


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def project_file(request, slug: str):
    """
    Returns plain text of a file from the latest Analysis ZIP.
    Query params:
      - path (required): file path inside the ZIP (must exist in tree_by_file)
      - start (optional, 1-based): line start
      - end (optional, 1-based, inclusive): line end
    """
    path = request.GET.get("path")
    if not path:
        return JsonResponse({"detail": "Missing 'path'."}, status=400)

    # basic path sanity
    if path.startswith("/") or ".." in path.split("/"):
        return JsonResponse({"detail": "Invalid path."}, status=400)

    start = request.GET.get("start")
    end = request.GET.get("end")

    try:
        start_i = int(start) if start else None
        end_i = int(end) if end else None
        if start_i is not None and start_i < 1:
            return JsonResponse({"detail": "'start' must be >= 1."}, status=400)
        if start_i is not None and end_i is not None and end_i < start_i:
            return JsonResponse({"detail": "'end' must be >= start."}, status=400)
    except ValueError:
        return JsonResponse({"detail": "'start'/'end' must be integers."}, status=400)

    # Restrict to owner; adjust if you support roles/team access
    project = get_object_or_404(Project, slug=slug, owner=request.user)

    # latest analysis
    analysis = project.analyses.order_by("-created_at").first()
    if not analysis or not analysis.zip_file:
        return JsonResponse({"detail": "No analysis/zip for project."}, status=404)

    # Check that requested file is in the graph's tree_by_file
    graph = analysis.graph or {}
    tree_by_file = graph.get("tree_by_file") or {}
    if path not in tree_by_file:
        return JsonResponse({"detail": "File not found in analysis."}, status=404)

    # open the ZIP and read the file content
    try:
        # ensure file pointer at start
        analysis.zip_file.open("rb")
        data = analysis.zip_file.read()
        with zipfile.ZipFile(BytesIO(data)) as zf:
            with zf.open(path, "r") as f:
                raw = f.read()
    except KeyError:
        return JsonResponse({"detail": "Path not present in zip."}, status=404)
    except zipfile.BadZipFile:
        return JsonResponse({"detail": "Corrupted zip."}, status=500)

    # decode to utf-8 (fallback)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    # line slicing (1-based, inclusive)
    if start_i is not None or end_i is not None:
        lines = text.splitlines(keepends=True)
        s = (start_i or 1) - 1
        e = end_i if end_i is not None else len(lines)
        text = "".join(lines[s:e])

    return HttpResponse(text, content_type="text/plain; charset=utf-8")
