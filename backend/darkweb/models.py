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

class Alert(models.Model):
    FREQ_CHOICES = (
        ("15m", "Every 15 minutes"),
        ("hourly", "Hourly"),
        ("daily", "Daily"),
    )
    name = models.CharField(max_length=200, blank=True, default="")
    q = models.CharField(max_length=500, blank=True, default="")
    entity_kind = models.CharField(max_length=16, blank=True, default="")   # email/ip/btc/xmr/...
    entity_value = models.CharField(max_length=500, blank=True, default="")
    domain_contains = models.CharField(max_length=255, blank=True, default="")

    frequency = models.CharField(max_length=10, choices=FREQ_CHOICES, default="hourly")
    is_active = models.BooleanField(default=True)

    notify_email   = models.EmailField(blank=True, default="", max_length=320)
    notify_webhook = models.URLField(blank=True, default="", max_length=1000)  # was 200

    last_run_at = models.DateTimeField(blank=True, null=True)
    last_notified_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Optional: only alert on pages newer than this (set on create)
    since = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        tgt = self.notify_email or self.notify_webhook or "(no target)"
        return f"[{self.frequency}] {self.q or self.entity_value or '*'} → {tgt}"

# darkweb/models.py
class Source(models.Model):
    url = models.URLField(max_length=2000, unique=True)
    domain = models.CharField(max_length=255, db_index=True)
    depth = models.IntegerField(default=1)           # 0 = only this page, 1 = follow internal links from it
    frequency = models.CharField(max_length=10, default="hourly")  # "15m"|"hourly"|"daily"
    is_active = models.BooleanField(default=True)
    last_crawled_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self): return f"{self.domain} ({self.url})"
    