from django.db import models
from django.conf import settings
import secrets

class World(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self): return self.name

class Block(models.Model):
    MATERIALS = [
        ("air", "Air"),
        ("grass", "Grass"),
        ("dirt", "Dirt"),
        ("stone", "Stone"),
        ("water", "Water"),
        ("sand", "Sand"),
        ("wood", "Wood"),
    ]
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="blocks")
    x = models.IntegerField()
    y = models.IntegerField()
    z = models.IntegerField()
    material = models.CharField(max_length=16, choices=MATERIALS, default="air")

    class Meta:
        unique_together = ("world", "x", "y", "z")
        indexes = [models.Index(fields=["world", "z", "y", "x"])]

    def __str__(self): return f"{self.world} ({self.x},{self.y},{self.z}) {self.material}"

class Project(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField(max_length=200)
    data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # NEW: optional read-only share link
    share_token = models.CharField(max_length=48, unique=True, null=True, blank=True)

    # Authoritative graph layout persisted server-side
    node_positions = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("owner", "name")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.owner} / {self.name}"

    def ensure_share_token(self):
        if not self.share_token:
            # 32-ish chars URL-safe
            self.share_token = secrets.token_urlsafe(32)
            self.save(update_fields=["share_token"])

class ProjectCollaborator(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="collab_links")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shared_projects")
    can_edit = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("project", "user")
        ordering = ["-created_at"]
           