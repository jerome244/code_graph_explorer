from django.db import IntegrityError
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Project
from .serializers import ProjectSerializer
from .permissions import IsOwner

class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Project.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # update-or-create by (user, name)
        obj, created = Project.objects.update_or_create(
            user=request.user,
            name=data["name"],
            defaults=data,
        )
        out = self.get_serializer(obj).data
        return Response(out, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
