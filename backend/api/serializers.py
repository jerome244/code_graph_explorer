from rest_framework import serializers
from .models import World, Block

class WorldSerializer(serializers.ModelSerializer):
    class Meta:
        model = World
        fields = ("id", "name")

class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = ("id", "world", "x", "y", "z", "material")
