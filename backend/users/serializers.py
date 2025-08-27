from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    # Email is optional
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ("username", "email", "password")

    def validate_username(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Username is required.")
        return value.strip()

    def create(self, validated_data):
        username = validated_data.get("username").strip()
        email = (validated_data.get("email") or "").strip()
        password = validated_data["password"]
        return User.objects.create_user(username=username, email=email, password=password)
