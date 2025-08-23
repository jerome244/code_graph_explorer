from rest_framework import serializers
from .models import Page, Alert

class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ["id","url","domain","title","text","fetched_at","sha256"]

class AlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alert
        fields = [
            "id","name","q","entity_kind","entity_value","domain_contains",
            "frequency","is_active","notify_email","notify_webhook",
            "since","last_run_at","last_notified_at","created_at","updated_at",
        ]

# darkweb/serializers.py
from .models import Page, Alert, Source
class SourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = ["id","url","domain","depth","frequency","is_active","last_crawled_at","created_at"]
