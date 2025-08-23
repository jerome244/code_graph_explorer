from django.db import models

class Page(models.Model):
    # ... your existing fields ...
    url = models.URLField(unique=True)
    domain = models.CharField(max_length=255, blank=True, null=True)
    title = models.TextField(blank=True, null=True)
    text = models.TextField(blank=True, null=True)
    fetched_at = models.DateTimeField(auto_now=True)
    sha256 = models.CharField(max_length=64, blank=True, null=True)
    # (optional) raw HTML storage:
    # html = models.TextField(blank=True, null=True)

class Entity(models.Model):
    KIND_CHOICES = (
        ("email", "email"),
        ("ip", "ip"),
        ("btc", "btc"),
        ("xmr", "xmr"),
        ("pgp", "pgp"),
        ("url", "url"),
        ("domain", "domain"),
        # add more as you like
    )
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, db_index=True)
    value = models.TextField(db_index=True)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("kind", "value")

class Mention(models.Model):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="mentions")
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name="mentions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["page"]),
            models.Index(fields=["entity"]),
        ]
        unique_together = ("page", "entity")
