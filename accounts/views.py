from django.contrib.auth import get_user_model
from rest_framework import viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .serializers import UserReadSerializer, UserWriteSerializer
from .permissions import IsAdmin, IsSelfOrAdmin

User = get_user_model()

class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = TokenObtainPairSerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = UserReadSerializer

    def get_permissions(self):
        if self.action in ["create", "login", "register"]:
            return [AllowAny()]
        if self.action in ["list", "destroy", "set_role"]:
            return [IsAdmin()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action in ["create", "register", "update", "partial_update"]:
            return UserWriteSerializer
        return UserReadSerializer

    @action(detail=False, methods=["post"], permission_classes=[AllowAny])
    def register(self, request):
        serializer = UserWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserReadSerializer(user).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])  # /users/me
    def me(self, request):
        return Response(UserReadSerializer(request.user).data)

    @action(detail=True, methods=["post"])  # /users/{id}/set_role
    def set_role(self, request, pk=None):
        user = self.get_object()
        if not request.user.is_admin():
            return Response({"detail": "Admin only."}, status=403)
        role = request.data.get("role")
        if role not in ("USER", "ADMIN"):
            return Response({"detail": "Invalid role"}, status=400)
        user.role = role
        user.is_staff = role == "ADMIN" or user.is_staff
        user.save()
        return Response(UserReadSerializer(user).data)