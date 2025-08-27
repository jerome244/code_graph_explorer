from django.db import models
from django.conf import settings

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
    data = models.JSONField()  # { files: ParsedFile[], options: {...} }
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("owner", "name")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.owner} / {self.name}"
    