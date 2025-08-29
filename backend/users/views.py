from django.db.models import Q
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth.models import User
from .serializers import RegisterSerializer, UserSerializer, PublicUserSerializer


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)


class MeView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserSearchView(generics.ListAPIView):
    """
    GET /api/auth/users/search/?q=ali
    Returns up to 20 users with usernames matching 'q' (case-insensitive).
    """
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
