from django.db import models


class BaseModel(models.Model):
    """
    Reusable abstract base:
      - id: BigAutoField PK
      - name: human-readable label
      - created_at: creation timestamp
    """

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        ordering = ("-created_at", "id")
        get_latest_by = "created_at"
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self) -> str:
        return self.name
