from django.conf import settings
from django.db import models
from django.utils.text import slugify

from .base import BaseModel


def unique_slugify(instance, value, slug_field_name="slug", max_length=220):
    """
    Generate a unique slug for `instance` from `value`.
    """
    slug_base = slugify(value)[:max_length].strip("-") or "item"
    slug = slug_base
    ModelClass = instance.__class__
    n = 2
    while ModelClass.objects.filter(**{slug_field_name: slug}).exists():
        suffix = f"-{n}"
        slug = slug_base[: (max_length - len(suffix))] + suffix
        n += 1
    return slug


class Project(BaseModel):
    description = models.TextField(blank=True, default="")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="projects",
        null=True,
        blank=True,
    )
    slug = models.SlugField(max_length=220, unique=True, blank=True)

    def save(self, *args, **kwargs):
        # Only set slug on creation or if it's empty
        if not self.slug and self.name:
            self.slug = unique_slugify(self, self.name)
        super().save(*args, **kwargs)
