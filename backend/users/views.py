from django.db.models import Q
from rest_framework import generics, permissions, parsers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth.models import User
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    PublicUserSerializer,
    MeUpdateSerializer,
)
from .models import Profile

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)

class MeView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser)

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def delete(self, request):
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class AvatarUploadView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (parsers.MultiPartParser, parsers.FormParser)

    def put(self, request):
        file = request.data.get("avatar")
        if not file:
            return Response({"detail": "No file provided."}, status=400)
        profile, _ = Profile.objects.get_or_create(user=request.user)
        profile.avatar = file
        profile.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)

class UserSearchView(generics.ListAPIView):
    """GET /api/auth/users/search/?q=ali → up to 20 users (excluding self)."""
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = PublicUserSerializer

    def get_queryset(self):
        q = self.request.query_params.get("q", "").strip()
        if not q:
            return User.objects.none()
        return (
            User.objects.filter(Q(username__icontains=q))
            .exclude(id=self.request.user.id)
            .order_by("username")[:20]
        )

