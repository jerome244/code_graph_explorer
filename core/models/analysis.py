from django.db import models
from django.conf import settings
from .base import BaseModel
from .project import Project

class ProjectAnalysis(BaseModel):
    """
    Stores one analysis generated from an uploaded ZIP.
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="analyses")
    zip_file = models.FileField(upload_to="uploads/%Y/%m/%d/")
    summary = models.JSONField(default=dict, blank=True)  # counts, stats
    graph = models.JSONField(default=dict, blank=True)    # {nodes:[], edges:[], tree_by_file:{}}

    class Meta:
        ordering = ("-created_at", "id")
