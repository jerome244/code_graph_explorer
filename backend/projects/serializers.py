from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Project, ProjectFile

User = get_user_model()


class MinimalUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username")


class ProjectFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectFile
        fields = ("path", "content")


class ProjectListItemSerializer(serializers.ModelSerializer):
    file_count = serializers.IntegerField(read_only=True)
    owner_username = serializers.CharField(source="user.username", read_only=True)
    is_owner = serializers.SerializerMethodField()
    shared_with_count = serializers.IntegerField(read_only=True)
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "updated_at",
            "file_count",
            "owner_username",
            "is_owner",
            "shared_with_count",
            "my_role",
        )

    def get_is_owner(self, obj):
        req = self.context.get("request")
        return bool(req and req.user.is_authenticated and obj.user_id == req.user.id)

    def get_my_role(self, obj):
        req = self.context.get("request")
        u = getattr(req, "user", None)
        if not u or not getattr(u, "is_authenticated", False):
            return "none"
        if obj.user_id == u.id:
            return "owner"
        if obj.editors.filter(id=u.id).exists():
            return "editor"
        if obj.shared_with.filter(id=u.id).exists():
            return "viewer"
        return "none"


class ProjectCreateSerializer(serializers.ModelSerializer):
    files = ProjectFileSerializer(many=True, write_only=True, required=False)
    shapes = serializers.JSONField(required=False)  # NEW: accept shapes on create

    class Meta:
        model = Project
        fields = ("id", "name", "positions", "shapes", "files")

    def create(self, validated_data):
        files = validated_data.pop("files", [])
        # Ensure defaults if omitted
        validated_data.setdefault("positions", {})
        validated_data.setdefault("shapes", [])
        proj = Project.objects.create(**validated_data)
        if files:
            ProjectFile.objects.bulk_create(
                [
                    ProjectFile(project=proj, path=f["path"], content=f.get("content", ""))
                    for f in files
                ]
            )
        return proj


class ProjectDetailSerializer(serializers.ModelSerializer):
    files = ProjectFileSerializer(many=True, read_only=True)
    owner = MinimalUserSerializer(source="user", read_only=True)
    shared_with = MinimalUserSerializer(many=True, read_only=True)
    editors = MinimalUserSerializer(many=True, read_only=True)
    my_role = serializers.SerializerMethodField()
    shapes = serializers.JSONField(required=False)  # NEW: expose shapes on read/update

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "positions",
            "shapes",      # NEW
            "updated_at",
            "files",
            "owner",
            "shared_with",
            "editors",
            "my_role",
        )

    def get_my_role(self, obj):
        req = self.context.get("request")
        u = getattr(req, "user", None)
        if not u or not getattr(u, "is_authenticated", False):
            return "none"
        if obj.user_id == u.id:
            return "owner"
        if obj.editors.filter(id=u.id).exists():
            return "editor"
        if obj.shared_with.filter(id=u.id).exists():
            return "viewer"
        return "none"
