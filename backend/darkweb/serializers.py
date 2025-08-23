from rest_framework import serializers
from .models import Page, Entity, Mention

class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ["id","url","domain","title","text","fetched_at","sha256"]

class EntitySerializer(serializers.ModelSerializer):
    pages = serializers.IntegerField(read_only=True)  # annotated count
    class Meta:
        model = Entity
        fields = ["id","kind","value","first_seen","last_seen","pages"]
