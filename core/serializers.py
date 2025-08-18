from rest_framework import serializers

from .models import ProjectAnalysis, Project


class ProjectSerializer(serializers.ModelSerializer):
    owner_username = serializers.ReadOnlyField(source="owner.username")

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "owner",
            "owner_username",
            "created_at",
        ]
        read_only_fields = ["created_at", "owner", "slug"]

class ProjectAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectAnalysis
        fields = ["id", "name", "project", "zip_file", "summary", "graph", "created_at"]
        read_only_fields = ["summary", "graph", "created_at", "project"]

class ProjectAnalysisResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectAnalysis
        fields = ["id", "name", "summary", "graph", "created_at"]
        