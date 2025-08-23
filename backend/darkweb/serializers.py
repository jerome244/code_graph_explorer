from rest_framework import serializers
from .models import Page, Entity, Alert, Source

class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ["id", "url", "domain", "title", "text", "fetched_at", "sha256"]

class EntitySerializer(serializers.ModelSerializer):
    # `pages` is annotated in EntitiesView; keep it optional
    pages = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Entity
        fields = ["id", "kind", "value", "last_seen", "pages"]

class AlertSerializer(serializers.ModelSerializer):
    notify_webhook = serializers.URLField(required=False, allow_blank=True, max_length=1000)
    notify_email   = serializers.EmailField(required=False, allow_blank=True, max_length=320)

    class Meta:
        model = Alert
        fields = [
            "id", "name", "q", "entity_kind", "entity_value", "domain_contains",
            "frequency", "is_active",
            "notify_email", "notify_webhook",
            "since", "last_run_at", "last_notified_at",
            "created_at", "updated_at",
        ]

class SourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = ["id", "url", "domain", "depth", "frequency", "is_active", "last_crawled_at", "created_at"]
