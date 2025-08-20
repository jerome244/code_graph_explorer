# backend/projects/serializers.py
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db.models import Q
from rest_framework import serializers

from .models import Project, ProjectShare

User = get_user_model()

def _truthy(v) -> bool:
    return str(v).lower() in {"1", "true", "yes", "y"}

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "name", "description", "graph", "source_language", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    # Only block duplicate names when NOT overwriting
    def validate(self, attrs):
        request = self.context.get("request")
        if self.instance is None and request and request.user.is_authenticated:
            overwrite = _truthy(request.query_params.get("overwrite", ""))
            name = attrs.get("name")
            if name and not overwrite and Project.objects.filter(user=request.user, name=name).exists():
                raise serializers.ValidationError({"name": "A project with this name already exists."})
        return attrs

    def create(self, validated_data):
        try:
            return Project.objects.create(user=self.context["request"].user, **validated_data)
        except IntegrityError:
            # DB-level unique_together guard
            raise serializers.ValidationError({"name": "A project with this name already exists."})


class ProjectShareSerializer(serializers.ModelSerializer):
    """
    Accept either email, username, or identifier (email or @username).
    """
    email = serializers.EmailField(write_only=True, required=False)
    username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    identifier = serializers.CharField(write_only=True, required=False, allow_blank=True)

    shared_with_id = serializers.IntegerField(source="shared_with.id", read_only=True)
    shared_with_email = serializers.EmailField(source="shared_with.email", read_only=True)
    shared_with_username = serializers.CharField(source="shared_with.username", read_only=True)

    class Meta:
        model = ProjectShare
        fields = [
            "id", "role", "created_at", "updated_at",
            "shared_with_id", "shared_with_email", "shared_with_username",
            "email", "username", "identifier",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "shared_with_id", "shared_with_email", "shared_with_username"]

    def create(self, validated_data):
        request = self.context["request"]
        project = self.context["project"]

        email = (self.initial_data.get("email") or "").strip()
        username = (self.initial_data.get("username") or "").strip()
        ident = (self.initial_data.get("identifier") or "").strip()

        # support @username
        if username.startswith("@"): username = username[1:]
        if ident.startswith("@"): ident = ident[1:]

        # Build lookup by precedence: email > username > identifier
        q = Q()
        if email:
            q = Q(email__iexact=email)
        elif username:
            q = Q(username__iexact=username)
        elif ident:
            if "@" in ident and "." in ident.split("@")[-1]:
                q = Q(email__iexact=ident)
            else:
                q = Q(username__iexact=ident)
        else:
            raise serializers.ValidationError({"identifier": "Provide an email or username."})

        try:
            user = User.objects.get(q)
        except User.DoesNotExist:
            raise serializers.ValidationError({"identifier": "No user found with that email/username."})

        if user == request.user:
            raise serializers.ValidationError({"identifier": "You cannot share with yourself."})

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
