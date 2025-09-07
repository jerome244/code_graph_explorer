from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework import serializers
from .models import Profile, Message, Follow, \
    MessageGroup, GroupMessage  # NEW

def absolute_media_url(request, path: str | None) -> str | None:
    if not path:
        return None
    if not request:
        return path
    try:
        return request.build_absolute_uri(path)
    except Exception:
        return path


class PublicUserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    followers_count = serializers.IntegerField(read_only=True)
    following_count = serializers.IntegerField(read_only=True)
    is_following = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()
    joined = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "avatar_url",
            "bio",
            "joined",
            "followers_count",
            "following_count",
            "is_following",
        )

    def get_bio(self, obj: User):
        profile = getattr(obj, "profile", None)
        return getattr(profile, "bio", "") if profile else ""

    def get_joined(self, obj: User):
        return obj.date_joined.isoformat() if getattr(obj, "date_joined", None) else None

    def get_is_following(self, obj: User) -> bool:
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or request.user.is_anonymous:
            return False
        return Follow.objects.filter(follower=request.user, target=obj).exists()

    def get_avatar_url(self, obj: User):
        avatar = getattr(getattr(obj, "profile", None), "avatar", None)
        if avatar:
            request = self.context.get("request")
            return absolute_media_url(request, avatar.url)
        return None


class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "bio", "avatar_url")

    def get_avatar_url(self, obj: User):
        avatar = getattr(getattr(obj, "profile", None), "avatar", None)
        if avatar:
            request = self.context.get("request")
            return absolute_media_url(request, avatar.url)
        return None

    def get_bio(self, obj: User):
        profile = getattr(obj, "profile", None)
        return getattr(profile, "bio", "") if profile else ""


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ("username", "email", "password")

    def validate_password(self, value):
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def create(self, validated_data):
        pwd = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(pwd)
        user.save()
        Profile.objects.get_or_create(user=user)
        return user


class MeUpdateSerializer(serializers.ModelSerializer):
    bio = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ("username", "email", "bio")

    def update(self, instance: User, validated_data):
        bio = validated_data.pop("bio", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if bio is not None:
            profile, _ = Profile.objects.get_or_create(user=instance)
            profile.bio = bio
            profile.save()
        return instance


class MessageSerializer(serializers.ModelSerializer):
    sender = PublicUserSerializer(read_only=True, context={"request": None})
    recipient = PublicUserSerializer(read_only=True, context={"request": None})

    class Meta:
        model = Message
        fields = ("id", "sender", "recipient", "body", "created_at", "is_read")

    def to_representation(self, instance):
        # ensure nested serializers see request for avatar urls, etc.
        request = self.context.get("request")
        self.fields["sender"].context["request"] = request
        self.fields["recipient"].context["request"] = request
        return super().to_representation(instance)


# --- NEW: Group chat serializers ---

class GroupMessageSerializer(serializers.ModelSerializer):
    sender = PublicUserSerializer(read_only=True, context={"request": None})

    class Meta:
        model = GroupMessage
        fields = ("id", "sender", "body", "created_at")

    def to_representation(self, instance):
        request = self.context.get("request")
        self.fields["sender"].context["request"] = request
        return super().to_representation(instance)


class MessageGroupSerializer(serializers.ModelSerializer):
    participants = PublicUserSerializer(many=True, read_only=True, context={"request": None})
    messages = GroupMessageSerializer(many=True, read_only=True, context={"request": None})

    class Meta:
        model = MessageGroup
        fields = ("id", "title", "participants", "messages")

    def to_representation(self, instance):
        request = self.context.get("request")
        self.fields["participants"].context["request"] = request
        self.fields["messages"].context["request"] = request
        return super().to_representation(instance)
