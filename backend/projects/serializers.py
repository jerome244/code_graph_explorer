from rest_framework import serializers
from .models import Project, ProjectFile

class ProjectFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectFile
        fields = ("path", "content")

class ProjectListItemSerializer(serializers.ModelSerializer):
    file_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Project
        fields = ("id", "name", "updated_at", "file_count")

class ProjectCreateSerializer(serializers.ModelSerializer):
    files = ProjectFileSerializer(many=True, required=False)

    class Meta:
        model = Project
        fields = ("id", "name", "files")

    def create(self, validated_data):
        # accept user from either save(user=...) or from request context (both supported)
        user = validated_data.pop("user", None) or self.context["request"].user
        files = validated_data.pop("files", [])
        proj = Project.objects.create(user=user, **validated_data)
        if files:
            ProjectFile.objects.bulk_create([
                ProjectFile(project=proj, path=f["path"], content=f.get("content", ""))
                for f in files
            ])
        return proj

class ProjectDetailSerializer(serializers.ModelSerializer):
    files = ProjectFileSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = ("id", "name", "updated_at", "files")
