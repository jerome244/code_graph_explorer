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
    files = ProjectFileSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Project
        fields = ("id", "name", "positions", "files")
        read_only_fields = ("id",)

    def create(self, validated_data):
        user = self.context["request"].user
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
        fields = ("id", "name", "positions", "updated_at", "files")
