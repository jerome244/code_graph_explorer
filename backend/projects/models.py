from django.conf import settings
from django.db import models

class Project(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=200)
    # { [filePath]: {x: number, y: number} }
    positions = models.JSONField(blank=True, default=dict)  # <— NEW
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["-updated_at"]


class ProjectFile(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="files")
    path = models.CharField(max_length=512)  # e.g. src/index.js
    content = models.TextField(blank=True, default="")

    class Meta:
        unique_together = ("project", "path")
        indexes = [models.Index(fields=["project", "path"])]
        ordering = ["path"]

    def __str__(self):
        return f"{self.project_id}:{self.path}"
