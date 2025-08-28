from django.db.models import Q, Prefetch
from django.contrib.auth.models import User
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Project, ProjectShare
from .serializers import ProjectSerializer, ProjectShareSerializer

class ProjectListCreateView(generics.ListCreateAPIView):
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Prefetch only the current user's share for role resolution
        share_qs = ProjectShare.objects.filter(user=user)
        return (
            Project.objects
            .filter(Q(owner=user) | Q(shares__user=user))
            .prefetch_related(Prefetch("shares", queryset=share_qs, to_attr="request_user_shares"))
            .distinct()
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

class ProjectDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        share_qs = ProjectShare.objects.filter(user=user)
        return (
            Project.objects
            .filter(Q(owner=user) | Q(shares__user=user))
            .prefetch_related(Prefetch("shares", queryset=share_qs, to_attr="request_user_shares"))
            .distinct()
        )

    def destroy(self, request, *args, **kwargs):
        proj = self.get_object()
        if proj.owner_id != request.user.id:
            return Response({"detail": "Only the owner can delete this project."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

class ProjectShareListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        try:
            proj = Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if proj.owner_id != request.user.id:
            return Response({"detail": "Only the owner can view shares."}, status=status.HTTP_403_FORBIDDEN)
        shares = ProjectShare.objects.filter(project=proj).select_related("user").order_by("user__username")
        data = ProjectShareSerializer(shares, many=True).data
        return Response(data)

    def post(self, request, pk: int):
        try:
            proj = Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if proj.owner_id != request.user.id:
            return Response({"detail": "Only the owner can modify shares."}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data or {}
        role = payload.get("role", ProjectShare.ROLE_VIEWER)
        if role not in dict(ProjectShare.ROLE_CHOICES):
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)

        user = None
        if "user_id" in payload:
            user = User.objects.filter(id=payload["user_id"]).first()
        elif "username" in payload:
            user = User.objects.filter(username=payload["username"]).first()
        if not user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if user.id == proj.owner_id:
            return Response({"detail": "Owner already has full access."}, status=status.HTTP_400_BAD_REQUEST)

        share, created = ProjectShare.objects.update_or_create(
            project=proj, user=user, defaults={"role": role}
        )
        return Response(
            {"user": {"id": user.id, "username": user.username}, "role": share.role, "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

class ProjectShareDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk: int, user_id: int):
        try:
            proj = Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if proj.owner_id != request.user.id:
            return Response({"detail": "Only the owner can modify shares."}, status=status.HTTP_403_FORBIDDEN)

        role = request.data.get("role")
        if role not in dict(ProjectShare.ROLE_CHOICES):
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            share = ProjectShare.objects.get(project=proj, user_id=user_id)
        except ProjectShare.DoesNotExist:
            return Response({"detail": "Share not found."}, status=status.HTTP_404_NOT_FOUND)

        share.role = role
        share.save(update_fields=["role"])
        return Response({"user_id": user_id, "role": share.role})

    def delete(self, request, pk: int, user_id: int):
        try:
            proj = Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if proj.owner_id != request.user.id:
            return Response({"detail": "Only the owner can modify shares."}, status=status.HTTP_403_FORBIDDEN)

        deleted, _ = ProjectShare.objects.filter(project=proj, user_id=user_id).delete()
        if not deleted:
            return Response({"detail": "Share not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
