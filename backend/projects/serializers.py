from rest_framework import serializers
from django.db import IntegrityError
from .models import Project

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id","name","description","graph","source_language","created_at","updated_at"]
        read_only_fields = ["id","created_at","updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        if self.instance is None and request and request.user.is_authenticated:
            name = attrs.get("name")
            if name and Project.objects.filter(user=request.user, name=name).exists():
                raise serializers.ValidationError({"name": "A project with this name already exists."})
        return super().validate(attrs)

    def create(self, validated_data):
        try:
            return Project.objects.create(user=self.context["request"].user, **validated_data)
        except IntegrityError:
            raise serializers.ValidationError({"name": "A project with this name already exists."})
