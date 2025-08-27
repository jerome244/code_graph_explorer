from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import World, Block, Project, ProjectCollaborator

User = get_user_model()

class WorldSerializer(serializers.ModelSerializer):
    class Meta:
        model = World
        fields = ("id", "name")

class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = ("id", "world", "x", "y", "z", "material")

class ProjectCollaboratorSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = ProjectCollaborator
        fields = ("user_id", "email", "can_edit", "created_at")

class ProjectSerializer(serializers.ModelSerializer):
    # computed flags for the caller
    is_owner = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ("id", "name", "data", "created_at", "updated_at", "is_owner", "can_edit")

    def get_is_owner(self, obj):
        req = self.context.get("request")
        return bool(req and req.user.is_authenticated and obj.owner_id == req.user.id)

    def get_can_edit(self, obj):
        req = self.context.get("request")
        if not (req and req.user.is_authenticated):
            return False
        if obj.owner_id == req.user.id:
            return True
        link = obj.collab_links.filter(user_id=req.user.id).first()
        return bool(link and link.can_edit)
