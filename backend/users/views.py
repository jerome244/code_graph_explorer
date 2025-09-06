from django.db.models import Q
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404

from rest_framework import generics, permissions, parsers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from .models import Profile, Follow, Message
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    PublicUserSerializer,
    MeUpdateSerializer,
    MessageSerializer,
)

# --- Auth / Profile ---

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        ser = MeUpdateSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def delete(self, request):
        # Simple account delete
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AvatarUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def put(self, request):
        file = request.data.get("file") or request.data.get("avatar")
        if not file:
            return Response({"detail": "No file uploaded."}, status=400)
        profile, _ = Profile.objects.get_or_create(user=request.user)
        profile.avatar = file
        profile.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)


class UserSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        q = (request.GET.get("q") or "").strip()
        if not q:
            return Response([], status=200)
        qs = User.objects.filter(Q(username__icontains=q))[:20]
        data = PublicUserSerializer(qs, many=True, context={"request": request}).data
        return Response(data)


# --- Public user + Follow ---

class PublicUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, username: str):
        user = get_object_or_404(User, username__iexact=username)
        followers_count = Follow.objects.filter(target=user).count()
        following_count = Follow.objects.filter(follower=user).count()
        # annotate counts via attributes available during serialization
        user.followers_count = followers_count  # type: ignore
        user.following_count = following_count  # type: ignore
        ser = PublicUserSerializer(user, context={"request": request})
        data = ser.data
        data["followers_count"] = followers_count
        data["following_count"] = following_count
        return Response(data)


class FollowView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, username: str):
        target = get_object_or_404(User, username__iexact=username)
        if target == request.user:
            return Response({"detail": "You cannot follow yourself."}, status=400)
        _, created = Follow.objects.get_or_create(follower=request.user, target=target)
        return Response({"following": True}, status=201 if created else 200)

    def delete(self, request, username: str):
        target = get_object_or_404(User, username__iexact=username)
        Follow.objects.filter(follower=request.user, target=target).delete()
        return Response({"following": False}, status=200)


# --- Messages (DM) ---

class MessageThreadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, username: str):
        other = get_object_or_404(User, username__iexact=username)
        qs = Message.objects.filter(
            Q(sender=request.user, recipient=other)
            | Q(sender=other, recipient=request.user)
        ).order_by("created_at")

        paginator = PageNumberPagination()
        paginator.page_size = int(request.GET.get("page_size", 50))
        page = paginator.paginate_queryset(qs, request)
        ser = MessageSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(ser.data)


class MessageSendView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        to_username = request.data.get("to")
        body = (request.data.get("body") or "").strip()
        if not to_username or not body:
            return Response({"detail": "Missing 'to' or 'body'."}, status=400)
        recipient = get_object_or_404(User, username__iexact=to_username)
        msg = Message.objects.create(sender=request.user, recipient=recipient, body=body)
        ser = MessageSerializer(msg, context={"request": request})
        return Response(ser.data, status=201)
