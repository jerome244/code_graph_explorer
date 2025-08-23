from django.db import models

class Page(models.Model):
    url = models.URLField(max_length=2000, unique=True)
    domain = models.CharField(max_length=255, db_index=True)
    title = models.CharField(max_length=500, blank=True, default="")
    text = models.TextField(blank=True, default="")
    fetched_at = models.DateTimeField(auto_now=True)
    sha256 = models.CharField(max_length=64, db_index=True)

    class Meta:
        ordering = ["-fetched_at"]

    def __str__(self):
        return self.title or self.url