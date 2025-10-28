from django.db import models
from django.contrib.auth.models import User

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    bio = models.TextField(blank=True, default="")
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)

    def __str__(self):
        return f"Profile<{self.user.username}>"

# Auto-create profile
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=User)
def create_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)


class Follow(models.Model):
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name="following")
    target = models.ForeignKey(User, on_delete=models.CASCADE, related_name="followers")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("follower", "target")
        indexes = [models.Index(fields=["follower", "target"])]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.follower.username} -> {self.target.username}"


class Message(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_messages")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["sender", "recipient", "created_at"]),
            models.Index(fields=["recipient", "is_read"]),
        ]
        ordering = ["created_at"]

    def __str__(self):
        return f"Msg<{self.id}> {self.sender_id}->{self.recipient_id}"


class Block(models.Model):
    blocker = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocks_initiated")
    blocked = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocks_received")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("blocker", "blocked")
        indexes = [models.Index(fields=["blocker", "blocked"])]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.blocker.username} ⛔ {self.blocked.username}"


class MessageGroup(models.Model):
    title = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="created_message_groups")
    participants = models.ManyToManyField(User, through="MessageGroupMembership", related_name="message_groups")

    def __str__(self):
        return self.title or f"Group #{self.pk}"


class MessageGroupMembership(models.Model):
    group = models.ForeignKey(MessageGroup, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("group", "user")
        indexes = [models.Index(fields=["group", "user"])]


class GroupMessage(models.Model):
    group = models.ForeignKey(MessageGroup, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="group_messages_sent")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["group", "-created_at"])]

    def __str__(self):
        return f"GMsg<{self.id}> g:{self.group_id} from:{self.sender_id}"
