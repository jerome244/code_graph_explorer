from django.contrib.auth.models import AbstractUser
from django.db import models

class Roles(models.TextChoices):
    USER = "USER", "User"
    ADMIN = "ADMIN", "Admin"

class User(AbstractUser):
    role = models.CharField(
        max_length=10,
        choices=Roles.choices,
        default=Roles.USER,
    )

    def is_admin(self) -> bool:
        # Either explicit role or Django's staff/superuser
        return self.role == Roles.ADMIN or self.is_staff or self.is_superuser