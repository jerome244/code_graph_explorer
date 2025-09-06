from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Profile

class PublicUserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "avatar_url")

    def get_avatar_url(self, obj):
        avatar = getattr(getattr(obj, "profile", None), "avatar", None)
        if avatar:
            request = self.context.get("request")
            url = avatar.url
            return request.build_absolute_uri(url) if request else url
        return None

class UserSerializer(serializers.ModelSerializer):
    bio = serializers.CharField(source="profile.bio", allow_blank=True, required=False)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "bio", "avatar_url")

    def get_avatar_url(self, obj):
        avatar = getattr(getattr(obj, "profile", None), "avatar", None)
        if avatar:
            request = self.context.get("request")
            url = avatar.url
            return request.build_absolute_uri(url) if request else url
        return None

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("username", "email", "password")

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )
        return user

class MeUpdateSerializer(serializers.ModelSerializer):
    bio = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ("username", "email", "bio")

    def update(self, instance, validated_data):
        bio = validated_data.pop("bio", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if bio is not None:
            profile, _ = Profile.objects.get_or_create(user=instance)
            profile.bio = bio
            profile.save()
        return instance
