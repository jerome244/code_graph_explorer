from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Project, ProjectFile
from .serializers import (
    ProjectListItemSerializer,
    ProjectCreateSerializer,
    ProjectDetailSerializer,
    ProjectFileSerializer,
)

User = get_user_model()


def owned_or_shared_qs(user):
    return Project.objects.filter(Q(user=user) | Q(shared_with=user)).distinct()


class ProjectListCreateView(generics.ListCreateAPIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return (
            owned_or_shared_qs(self.request.user)
            .annotate(file_count=Count("files"), shared_with_count=Count("shared_with"))
            .order_by("-updated_at")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ProjectCreateSerializer
        return ProjectListItemSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ProjectRetrieveUpdateDeleteView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ProjectDetailSerializer

    def get_object(self):
        project = get_object_or_404(Project, pk=self.kwargs["pk"])
        user = self.request.user
        if project.user_id == user.id:
            return project
        # editors can access object (for update)
        if project.editors.filter(id=user.id).exists():
            return project
        # viewers can read-only
        if self.request.method in ("GET", "HEAD", "OPTIONS") and project.shared_with.filter(
            id=user.id
        ).exists():
            return project
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Not allowed.")

    def perform_update(self, serializer):
        proj = self.get_object()
        user = self.request.user
        if not (proj.user_id == user.id or proj.editors.filter(id=user.id).exists()):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only owner or editors can update.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the owner can delete.")
        instance.delete()


class ProjectFilesBulkUpsertView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, pk):
        # owner or editor; return 404 to non-collaborators to avoid leaking
        qs = Project.objects.filter(Q(user=request.user) | Q(editors=request.user))
        project = get_object_or_404(qs, pk=pk)

        files = request.data.get("files", [])
        if not isinstance(files, list):
            return Response({"detail": "files must be a list"}, status=status.HTTP_400_BAD_REQUEST)
        upserts = []
        for f in files:
            path = f.get("path")
            if not path:
                continue
            pf, _ = ProjectFile.objects.get_or_create(project=project, path=path)
            pf.content = f.get("content", "")
            upserts.append(pf)
        if upserts:
            ProjectFile.objects.bulk_update(upserts, ["content"])
        return Response({"saved": True})


class ProjectSingleFileUpsertView(generics.GenericAPIView):
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ProjectFileSerializer

    def post(self, request, pk):
        qs = Project.objects.filter(Q(user=request.user) | Q(editors=request.user))
        project = get_object_or_404(qs, pk=pk)

        path = request.data.get("path")
        content = request.data.get("content", "")
        if not path:
            return Response({"detail": "path required"}, status=status.HTTP_400_BAD_REQUEST)
        pf, _ = ProjectFile.objects.get_or_create(project=project, path=path)
        pf.content = content
        pf.save(update_fields=["content"])
        return Response({"saved": True})


class ShareProjectView(APIView):
    """
    POST /api/projects/<id>/share/
    Body:
      {
        "usernames": ["alice", "bob"],
        "mode": "replace" | "add" | "remove",   # default: replace
        "role": "viewer" | "editor"             # default: viewer
      }
    Only owner can change sharing.
    """
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk, user=request.user)  # must own
        usernames = request.data.get("usernames", [])
        mode = (request.data.get("mode") or "replace").lower()
        role = (request.data.get("role") or "viewer").lower()

        if not isinstance(usernames, list):
            return Response({"detail": "usernames must be a list"}, status=status.HTTP_400_BAD_REQUEST)
        if role not in ("viewer", "editor"):
            return Response({"detail": "invalid role"}, status=status.HTTP_400_BAD_REQUEST)

        users = list(User.objects.filter(username__in=usernames).exclude(id=request.user.id))
        found = {u.username for u in users}
        missing = sorted(set(usernames) - found)
        if missing and mode in ("replace", "add"):
            return Response(
                {"detail": "Some usernames not found", "missing": missing},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if mode == "replace":
            if role == "viewer":
                project.shared_with.set(users)
                # ensure editors are still viewers
                project.shared_with.add(*project.editors.all())
            else:  # editor
                project.editors.set(users)
                # editors must also be viewers
                project.shared_with.add(*users)
        elif mode == "add":
            if role == "viewer":
                project.shared_with.add(*users)
            else:
                project.editors.add(*users)
                project.shared_with.add(*users)
        elif mode == "remove":
            if role == "viewer":
                project.shared_with.remove(*users)
                # dropping view also drops editor
                project.editors.remove(*users)
            else:
                project.editors.remove(*users)
        else:
            return Response({"detail": "invalid mode"}, status=status.HTTP_400_BAD_REQUEST)

        project.save()
        return Response(
            {
                "id": project.id,
                "shared_with": [{"id": u.id, "username": u.username} for u in project.shared_with.all()],
                "editors": [{"id": u.id, "username": u.username} for u in project.editors.all()],
            }
        )


class SharedWithMeListView(generics.ListAPIView):
    """
    GET /api/projects/shared-with-me/
    Projects others own but have shared with me (viewer or editor).
    """
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ProjectListItemSerializer

    def get_queryset(self):
        # editors are also added to shared_with above, so this is enough
        return (
            Project.objects.filter(shared_with=self.request.user)
            .annotate(file_count=Count("files"), shared_with_count=Count("shared_with"))
            .order_by("-updated_at")
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx
