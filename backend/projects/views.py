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
        # allow read-only if shared
        if self.request.method in ("GET", "HEAD", "OPTIONS") and project.shared_with.filter(
            id=user.id
        ).exists():
            return project
        # otherwise forbid
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Not allowed.")

    def perform_update(self, serializer):
        # only owner can update
        if self.get_object().user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the owner can update.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the owner can delete.")
        instance.delete()


class ProjectFilesBulkUpsertView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk, user=request.user)  # owner-only write
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
        project = get_object_or_404(Project, pk=pk, user=request.user)  # owner-only write
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
        "mode": "replace" | "add" | "remove"   # default: replace
      }
    Only owner can share.
    """
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk, user=request.user)  # must own
        usernames = request.data.get("usernames", [])
        mode = (request.data.get("mode") or "replace").lower()

        if not isinstance(usernames, list):
            return Response({"detail": "usernames must be a list"}, status=status.HTTP_400_BAD_REQUEST)

        # fetch users by username, ignore self
        users = list(
            User.objects.filter(username__in=usernames).exclude(id=request.user.id)
        )
        found_usernames = {u.username for u in users}
        missing = sorted(set(usernames) - found_usernames)
        if missing and mode in ("replace", "add"):
            # You can choose to ignore missing instead; here we surface it.
            return Response(
                {"detail": "Some usernames not found", "missing": missing},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if mode == "replace":
            project.shared_with.set(users)
        elif mode == "add":
            project.shared_with.add(*users)
        elif mode == "remove":
            project.shared_with.remove(*users)
        else:
            return Response({"detail": "invalid mode"}, status=status.HTTP_400_BAD_REQUEST)

        project.save()
        return Response(
            {
                "id": project.id,
                "shared_with": [{"id": u.id, "username": u.username} for u in project.shared_with.all()],
            }
        )


class SharedWithMeListView(generics.ListAPIView):
    """
    GET /api/projects/shared-with-me/
    Projects others own but have shared with me.
    """
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ProjectListItemSerializer

    def get_queryset(self):
        return (
            Project.objects.filter(shared_with=self.request.user)
            .annotate(file_count=Count("files"), shared_with_count=Count("shared_with"))
            .order_by("-updated_at")
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx
