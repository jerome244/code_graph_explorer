from django.db import models
from django.contrib.auth.models import User

class Project(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=200)
    data = models.JSONField()  # stores { tree, nodes, edges }
    file_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} (owner={self.owner.username})"


class ProjectShare(models.Model):
    ROLE_VIEWER = "viewer"
    ROLE_EDITOR = "editor"
    ROLE_CHOICES = [
        (ROLE_VIEWER, "Viewer"),
        (ROLE_EDITOR, "Editor"),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="shares")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="project_shares")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_VIEWER)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("project", "user")

    def __str__(self):
        return f"{self.user.username} → {self.project.name} ({self.role})"
