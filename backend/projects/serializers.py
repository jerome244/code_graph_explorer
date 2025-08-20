from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from .models import Project, ProjectShare

User = get_user_model()

def _truthy(v):
    return str(v).lower() in {"1", "true", "yes", "y"}

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id","name","description","graph","source_language","created_at","updated_at"]
        read_only_fields = ["id","created_at","updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        if self.instance is None and request and request.user.is_authenticated:
            overwrite = _truthy(request.query_params.get("overwrite", ""))
            name = attrs.get("name")
            if name and not overwrite and Project.objects.filter(user=request.user, name=name).exists():
                raise serializers.ValidationError({"name": "A project with this name already exists."})
        return super().validate(attrs)

    def create(self, validated_data):
        try:
            return Project.objects.create(user=self.context["request"].user, **validated_data)
        except IntegrityError:
            raise serializers.ValidationError({"name": "A project with this name already exists."})


class ProjectShareSerializer(serializers.ModelSerializer):
    # create by email; expose who it's shared with
    email = serializers.EmailField(write_only=True, required=False)
    shared_with_id = serializers.IntegerField(source="shared_with.id", read_only=True)
    shared_with_email = serializers.EmailField(source="shared_with.email", read_only=True)
    shared_with_username = serializers.CharField(source="shared_with.username", read_only=True)

    class Meta:
        model = ProjectShare
        fields = [
            "id", "role", "created_at", "updated_at",
            "shared_with_id", "shared_with_email", "shared_with_username",
            "email",
        ]
        read_only_fields = ["id","created_at","updated_at","shared_with_id","shared_with_email","shared_with_username"]

    def create(self, validated_data):
        request = self.context["request"]
        project = self.context["project"]
        email = self.initial_data.get("email")
        if not email:
            raise serializers.ValidationError({"email": "Email is required."})
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError({"email": "No user with this email."})
        if user == request.user:
            raise serializers.ValidationError({"email": "You cannot share with yourself."})
        role = validated_data.get("role", ProjectShare.ROLE_VIEW)
        share, _ = ProjectShare.objects.update_or_create(
            project=project, shared_with=user, defaults={"role": role}
        )
        return share

    def update(self, instance, validated_data):
        role = validated_data.get("role")
        if role:
            instance.role = role
            instance.save()
        return instance
