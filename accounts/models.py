from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    # Make email unique for nicer lookups & potential email login later
    email = models.EmailField("email address", unique=True)
    display_name = models.CharField(max_length=150, blank=True)
    email_verified = models.BooleanField(default=False)

    REQUIRED_FIELDS = ["email"]

    def __str__(self):
        return self.display_name or self.get_full_name() or self.username

    @property
    def name(self):
        # aligns with BaseModel "name" semantics for convenience
        return self.display_name or self.get_full_name() or self.username

    @property
    def created_at(self):
        # mirror BaseModel.created_at
        return self.date_joined
