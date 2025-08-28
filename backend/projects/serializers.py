from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Project, ProjectShare
from users.serializers import UserSerializer

class ProjectShareSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ProjectShare
        fields = ("user", "role", "added_at")

class ProjectSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    is_owner = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ("id", "name", "data", "file_count", "created_at", "updated_at", "owner", "is_owner", "role")
        read_only_fields = ("id", "created_at", "updated_at", "owner", "is_owner", "role")

    def get_is_owner(self, obj):
        req = self.context.get("request")
        if not req or not req.user.is_authenticated:
            return False
        return obj.owner_id == req.user.id

    def get_role(self, obj):
        req = self.context.get("request")
        if not req or not req.user.is_authenticated:
            return None
        if obj.owner_id == req.user.id:
            return "owner"
        # check prefetched share for this request user (if available)
        share_list = getattr(obj, "request_user_shares", None)
        share = share_list[0] if share_list else None
        if share and share.user_id == req.user.id:
            return share.role
        # fallback query
        qs = obj.shares.filter(user_id=req.user.id).only("role")
        if qs.exists():
            return qs.first().role
        return None

    def create(self, validated_data):
        # attach owner from request
        req = self.context.get("request")
        validated_data["owner"] = req.user
        return super().create(validated_data)
