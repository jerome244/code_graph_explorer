from django.db.models.signals import pre_save, post_delete
from django.dispatch import receiver
from .models import Profile

def _delete_file(f):
    try:
        storage, name = f.storage, f.name
        if name:
            storage.delete(name)
    except Exception:
        pass

@receiver(pre_save, sender=Profile)
def delete_old_avatar_on_change(sender, instance: Profile, **kwargs):
    if not instance.pk:
        return
    try:
        old = Profile.objects.get(pk=instance.pk)
    except Profile.DoesNotExist:
        return
    old_file = getattr(old, "avatar", None)
    new_file = getattr(instance, "avatar", None)
    if old_file and old_file.name and (not new_file or old_file.name != getattr(new_file, "name", None)):
        _delete_file(old_file)

@receiver(post_delete, sender=Profile)
def delete_avatar_file_on_delete(sender, instance: Profile, **kwargs):
    f = getattr(instance, "avatar", None)
    if f and f.name:
        _delete_file(f)
