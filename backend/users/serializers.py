from django.contrib.auth.models import User
from rest_framework import serializers

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name")

class RegisterSerializer(serializers.ModelSerializer):
    # Optional + allow empty string
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("username", "email", "password")
        extra_kwargs = {
            "email": {"required": False, "allow_blank": True},
        }

    def create(self, validated_data):
        # If email is "", drop it so create_user stores None
        if validated_data.get("email", "") == "":
            validated_data.pop("email")
        return User.objects.create_user(**validated_data)
