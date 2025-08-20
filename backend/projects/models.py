from django.db import models
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()

class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    graph = models.JSONField()  # your parsed graph/state
    source_language = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        unique_together = ("user", "name")  # optional

    def __str__(self):
        return f"{self.name} ({self.user})"


class ProjectShare(models.Model):
    ROLE_VIEW = "view"
    ROLE_EDIT = "edit"
    ROLE_CHOICES = [(ROLE_VIEW, "View"), (ROLE_EDIT, "Edit")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="shares")
    shared_with = models.ForeignKey(User, on_delete=models.CASCADE, related_name="project_shares")
    role = models.CharField(max_length=8, choices=ROLE_CHOICES, default=ROLE_VIEW)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "shared_with"], name="uniq_project_shared_with")
        ]

    def __str__(self):
        return f"{self.project.name} → {self.shared_with} ({self.role})"
