from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Project(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    # Owner of the project (keep nullable for existing rows; you can enforce later)
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="projects",
        null=True,
        blank=True,
    )

    def __str__(self) -> str:
        return f"{self.name} (#{self.pk})"


class File(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="files")
    path = models.CharField(max_length=1024)
    language = models.CharField(max_length=20)  # c, h, py, js, css, html
    size = models.IntegerField(default=0)
    sha1 = models.CharField(max_length=40, blank=True, default="")

    class Meta:
        unique_together = ("project", "path")
        indexes = [
            models.Index(fields=["project", "path"]),
        ]

    def __str__(self) -> str:
        return self.path


class Node(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="nodes")
    file = models.ForeignKey(File, on_delete=models.CASCADE, related_name="node")
    label = models.CharField(max_length=255)
    # future: class/function/module
    kind = models.CharField(max_length=50, default="file")

    class Meta:
        unique_together = ("project", "file")
        indexes = [
            models.Index(fields=["project", "file"]),
        ]

    def __str__(self) -> str:
        return self.label


class Edge(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="edges")
    source = models.ForeignKey(Node, on_delete=models.CASCADE, related_name="out_edges")
    target = models.ForeignKey(Node, on_delete=models.CASCADE, related_name="in_edges")
    # imports, includes, links, uses
    relation = models.CharField(max_length=50)

    class Meta:
        indexes = [
            models.Index(fields=["project", "source", "target"]),
        ]
        # Optional to prevent dup edges:
        # unique_together = ("project", "source", "target", "relation")

    def __str__(self) -> str:
        return f"{self.source_id} -> {self.target_id} ({self.relation})"
