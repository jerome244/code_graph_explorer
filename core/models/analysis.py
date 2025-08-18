from django.db import models
from django.conf import settings
from .base import BaseModel
from .project import Project

class ProjectAnalysis(BaseModel):
    SOURCE_UPLOAD = "upload"
    SOURCE_GITHUB = "github"
    SOURCE_CHOICES = [
        (SOURCE_UPLOAD, "Upload"),
        (SOURCE_GITHUB, "GitHub"),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="analyses")
    # keep the file for traceability; optional so we can store metadata-only later if you want
    zip_file = models.FileField(upload_to="uploads/%Y/%m/%d/", blank=True, null=True)

    # NEW
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_UPLOAD)
    source_meta = models.JSONField(default=dict, blank=True)

    summary = models.JSONField(default=dict, blank=True)
    graph = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at", "id")
