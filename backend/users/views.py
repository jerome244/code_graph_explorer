from django.contrib.auth.models import User
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from .serializers import RegisterSerializer

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        s = RegisterSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"ok": True}, status=status.HTTP_201_CREATED)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)

class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        u: User = request.user
        return Response({"id": u.id, "username": u.username, "email": u.email})
