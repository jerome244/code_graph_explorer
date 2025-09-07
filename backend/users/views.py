from django.db.models import Q
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404

from rest_framework import generics, permissions, parsers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from .models import (
    Profile,
    Follow,
    Message,
    Block,
    # NEW: group chat
    MessageGroup,
    MessageGroupMembership,
    GroupMessage,
)
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    PublicUserSerializer,
    MeUpdateSerializer,
    MessageSerializer,
    # NEW: group chat
    MessageGroupSerializer,
    GroupMessageSerializer,
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
        user.followers_count = followers_count  # type: ignore
        user.following_count = following_count  # type: ignore
        ser = PublicUserSerializer(user, context={"request": request})
        data = ser.data
        data["followers_count"] = followers_count
        data["following_count"] = following_count
        # block + follow status relative to requester
        data["is_blocked_by_me"] = Block.objects.filter(blocker=request.user, blocked=user).exists()
        data["has_blocked_me"] = Block.objects.filter(blocker=user, blocked=request.user).exists()
        data["is_following"] = Follow.objects.filter(follower=request.user, target=user).exists()
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


# --- Blocks ---

class BlockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, username: str):
        target = get_object_or_404(User, username__iexact=username)
        if target == request.user:
            return Response({"detail": "You cannot block yourself."}, status=400)
        Block.objects.get_or_create(blocker=request.user, blocked=target)
        # optional: remove follow relations both ways
        Follow.objects.filter(follower=request.user, target=target).delete()
        Follow.objects.filter(follower=target, target=request.user).delete()
        return Response({"blocked": True}, status=201)

    def delete(self, request, username: str):
        target = get_object_or_404(User, username__iexact=username)
        Block.objects.filter(blocker=request.user, blocked=target).delete()
        return Response({"blocked": False}, status=200)

    def get(self, request, username: str):
        target = get_object_or_404(User, username__iexact=username)
        return Response({
            "is_blocked_by_me": Block.objects.filter(blocker=request.user, blocked=target).exists(),
            "has_blocked_me": Block.objects.filter(blocker=target, blocked=request.user).exists(),
        })


class BlocksListView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        qs = Block.objects.filter(blocker=request.user).select_related("blocked").order_by("-created_at")
        data = [
            {
                "user": PublicUserSerializer(b.blocked, context={"request": request}).data,
                "created_at": b.created_at.isoformat(),
            }
            for b in qs
        ]
        return Response(data)


# --- Messages (DM) ---

class MessageThreadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, username: str):
        other = get_object_or_404(User, username__iexact=username)

        # block check (either direction)
        if Block.objects.filter(blocker=request.user, blocked=other).exists() or \
           Block.objects.filter(blocker=other, blocked=request.user).exists():
            return Response({"detail": "You cannot view this conversation."}, status=403)

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

        # 🚫 block self-DM
        if recipient == request.user:
            return Response({"detail": "You cannot message yourself."}, status=400)

        # block check (either direction)
        if Block.objects.filter(blocker=request.user, blocked=recipient).exists() or \
           Block.objects.filter(blocker=recipient, blocked=request.user).exists():
            return Response({"detail": "Messaging is not allowed because one of you has blocked the other."}, status=403)

        msg = Message.objects.create(sender=request.user, recipient=recipient, body=body)
        ser = MessageSerializer(msg, context={"request": request})
        return Response(ser.data, status=201)


# --- Conversations (DM + Groups) ---

class ConversationsView(APIView):
    """
    Unified conversations feed:
      - DM items:   { type:'dm',    user: PublicUser, last_message:{...}, unread_count:int }
      - Group items:{ type:'group', group:{id,title,participants:[...]}, last_message:{...}, unread_count:int }
    Sorted by last activity (last_message.created_at desc). Group unread_count is 0 unless you add read-tracking.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        limit = int(request.GET.get("limit", "50"))

        # ===== DMs =====
        blocked_ids = set(Block.objects.filter(blocker=request.user).values_list("blocked_id", flat=True))
        blocked_me_ids = set(Block.objects.filter(blocked=request.user).values_list("blocker_id", flat=True))

        dm_qs = (
            Message.objects
            .filter(Q(sender=request.user) | Q(recipient=request.user))
            .select_related("sender", "recipient")
            .order_by("-created_at")[:1000]
        )

        # Unread counts keyed by other user id
        dm_unread = {}
        for m in dm_qs:
            if m.recipient_id == request.user.id and not m.is_read:
                dm_unread[m.sender_id] = dm_unread.get(m.sender_id, 0) + 1

        dm_items = []
        dm_seen = set()
        for m in dm_qs:
            other = m.recipient if m.sender_id == request.user.id else m.sender
            if other.id in dm_seen:
                continue
            if other.id in blocked_ids or other.id in blocked_me_ids:
                continue
            dm_seen.add(other.id)
            dm_items.append({
                "type": "dm",
                "user": PublicUserSerializer(other, context={"request": request}).data,
                "last_message": {
                    "id": m.id,
                    "body": m.body,
                    "created_at": m.created_at.isoformat(),
                    "from_me": (m.sender_id == request.user.id),
                },
                "unread_count": dm_unread.get(other.id, 0),
            })

        # ===== Groups =====
        # Requires the group models from earlier: MessageGroup, MessageGroupMembership, GroupMessage
        groups = (
            MessageGroup.objects
            .filter(participants=request.user)
            .prefetch_related("participants")
            .only("id", "title")
        )

        # Gather latest message per group (in one pass)
        latest_msgs = (
            GroupMessage.objects
            .filter(group__in=groups)
            .select_related("group", "sender")
            .order_by("-created_at")[:2000]
        )
        group_last = {}
        for gm in latest_msgs:
            gid = gm.group_id
            if gid not in group_last:
                group_last[gid] = gm
            # stop once we captured a latest for many groups
            if len(group_last) >= groups.count():
                break

        group_items = []
        for g in groups:
            participants_ser = PublicUserSerializer(list(g.participants.all()), many=True, context={"request": request}).data
            lm = group_last.get(g.id)
            last_payload = None
            if lm:
                last_payload = {
                    "id": lm.id,
                    "body": lm.body,
                    "created_at": lm.created_at.isoformat(),
                    "from_me": (lm.sender_id == request.user.id),
                    "sender": PublicUserSerializer(lm.sender, context={"request": request}).data,
                }
            group_items.append({
                "type": "group",
                "group": { "id": g.id, "title": g.title or "", "participants": participants_ser },
                "last_message": last_payload,
                "unread_count": 0,  # add real read-tracking later if desired
            })

        # ===== Merge + sort by last activity =====
        def last_ts(item):
            lm = item.get("last_message") or {}
            return lm.get("created_at") or ""

        merged = dm_items + group_items
        merged.sort(key=last_ts, reverse=True)

        # Apply limit
        if limit and limit > 0:
            merged = merged[:limit]

        return Response(merged)


# --- Delete a message (sender only) ---

class MessageDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk: int):
        msg = get_object_or_404(Message, pk=pk)
        if msg.sender_id != request.user.id:
            return Response({"detail": "You can only delete your own messages."}, status=status.HTTP_403_FORBIDDEN)
        msg.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- NEW: Group chat ---

class CreateGroupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        usernames = request.data.get("usernames") or []
        title = (request.data.get("title") or "").strip()

        # normalize and ensure requester is included
        norm = []
        for u in usernames:
            if not u:
                continue
            u = str(u).strip().lstrip("@")
            if u:
                norm.append(u)
        if request.user.username not in norm:
            norm.append(request.user.username)

        users = list(User.objects.filter(username__in=norm))
        uniq = {u.username for u in users}
        if len(uniq) < 2:
            return Response({"detail": "Need at least two participants."}, status=400)

        group = MessageGroup.objects.create(title=title, created_by=request.user)
        for u in users:
            MessageGroupMembership.objects.get_or_create(group=group, user=u)

        data = MessageGroupSerializer(group, context={"request": request}).data
        return Response(data, status=status.HTTP_201_CREATED)


class GroupDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        group = get_object_or_404(MessageGroup, pk=pk)
        # Ensure the requester is a participant
        if not group.participants.filter(pk=request.user.pk).exists():
            return Response({"detail": "Not a participant."}, status=403)

        page_size = int(request.query_params.get("page_size") or 200)
        msgs = group.messages.select_related("sender").order_by("-created_at")[:page_size]
        data = MessageGroupSerializer(group, context={"request": request}).data
        data["messages"] = GroupMessageSerializer(msgs, many=True, context={"request": request}).data
        return Response(data, status=200)


class GroupSendView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        group_id = request.data.get("group_id")
        body = (request.data.get("body") or "").strip()
        if not group_id or not body:
            return Response({"detail": "group_id and body are required."}, status=400)

        group = get_object_or_404(MessageGroup, pk=group_id)
        if not group.participants.filter(pk=request.user.pk).exists():
            return Response({"detail": "Not a participant."}, status=403)

        # Optional: pairwise block enforcement
        other_ids = list(group.participants.exclude(pk=request.user.pk).values_list("id", flat=True))
        if Block.objects.filter(blocker=request.user, blocked_id__in=other_ids).exists() or \
           Block.objects.filter(blocker_id__in=other_ids, blocked=request.user).exists():
            return Response({"detail": "Messaging not allowed due to blocking."}, status=403)

        msg = GroupMessage.objects.create(group=group, sender=request.user, body=body)
        return Response(GroupMessageSerializer(msg, context={"request": request}).data, status=201)

class GroupMessageDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk: int):
        msg = get_object_or_404(GroupMessage, pk=pk)
        if msg.sender_id != request.user.id:
            return Response({"detail": "You can only delete your own messages."}, status=403)
        msg.delete()
        return Response(status=204)
