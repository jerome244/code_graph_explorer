from django.db import models

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
