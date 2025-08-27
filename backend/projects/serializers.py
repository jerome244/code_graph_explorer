from rest_framework import serializers
from .models import Project

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ("id", "name", "data", "file_count", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def create(self, validated_data):
        # attach owner from request
        req = self.context.get("request")
        validated_data["owner"] = req.user
        return super().create(validated_data)
