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
        )

    def get_is_owner(self, obj):
        req = self.context.get("request")
        return bool(req and req.user.is_authenticated and obj.user_id == req.user.id)


class ProjectCreateSerializer(serializers.ModelSerializer):
    files = ProjectFileSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Project
        fields = ("id", "name", "positions", "files")

    def create(self, validated_data):
        files = validated_data.pop("files", [])
        # 'user' is already in validated_data via serializer.save(user=...)
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

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "positions",
            "updated_at",
            "files",
            "owner",
            "shared_with",
        )
