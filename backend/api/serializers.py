from rest_framework import serializers
from .models import World, Block, Project  # ← add Project

class WorldSerializer(serializers.ModelSerializer):
    class Meta:
        model = World
        fields = ("id", "name")

class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = ("id", "world", "x", "y", "z", "material")

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ("id", "name", "data", "created_at", "updated_at")
