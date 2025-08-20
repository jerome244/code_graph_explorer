from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action

from .models import Project, ProjectShare
from .serializers import ProjectSerializer, ProjectShareSerializer
from .permissions import IsOwnerOrShared  # <-- use this permission

def _truthy(v):
    return str(v).lower() in {"1", "true", "yes", "y"}

class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrShared]

    # Owned OR shared projects
    def get_queryset(self):
        u = self.request.user
        return Project.objects.filter(Q(user=u) | Q(shares__shared_with=u)).distinct()

    # Create: idempotent by default (overwrite if same name), or strict if you pass ?overwrite=0
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        overwrite = _truthy(request.query_params.get("overwrite", "1"))  # default overwrite on
        if overwrite:
            obj, created = Project.objects.update_or_create(
                user=request.user,
                name=data["name"],
                defaults=data,
            )
            out = self.get_serializer(obj).data
            return Response(out, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

        # strict create (will 400 on duplicate if your serializer enforces it)
        obj = serializer.save()
        out = self.get_serializer(obj).data
        return Response(out, status=status.HTTP_201_CREATED)

    # -------- Sharing API --------
    # GET list of shares (anyone with access can view); POST add/update share (owner only)
    @action(detail=True, methods=["get", "post"], url_path="shares")
    def shares(self, request, pk=None):
        project = self.get_object()
        if request.method == "GET":
            shares = project.shares.all()
            return Response(ProjectShareSerializer(shares, many=True).data)

        # POST new/update share -> owner only
        if project.user_id != request.user.id:
            return Response({"detail": "Only the owner can share this project."}, status=403)
        ser = ProjectShareSerializer(data=request.data, context={"request": request, "project": project})
        ser.is_valid(raise_exception=True)
        share = ser.save()
        return Response(ProjectShareSerializer(share).data, status=201)

    # PATCH role or DELETE a specific share (owner only)
    @action(detail=True, methods=["patch", "delete"], url_path=r"shares/(?P<share_id>[^/.]+)")
    def share_detail(self, request, pk=None, share_id=None):
        project = self.get_object()
        if project.user_id != request.user.id:
            return Response({"detail": "Only the owner can manage shares."}, status=403)
        try:
            share = ProjectShare.objects.get(id=share_id, project=project)
        except ProjectShare.DoesNotExist:
            return Response({"detail": "Share not found."}, status=404)
        if request.method == "PATCH":
            ser = ProjectShareSerializer(
                share, data=request.data, partial=True,
                context={"request": request, "project": project}
            )
            ser.is_valid(raise_exception=True)
            ser.save()
            return Response(ProjectShareSerializer(share).data)
        share.delete()
        return Response(status=204)
