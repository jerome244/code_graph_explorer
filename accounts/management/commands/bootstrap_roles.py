from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from core.models import Project

class Command(BaseCommand):
    help = "Create default groups (manager, member) and assign model permissions."

    def handle(self, *args, **options):
        # Groups
        manager, _ = Group.objects.get_or_create(name="manager")
        member, _ = Group.objects.get_or_create(name="member")

        # Project model permissions
        ct = ContentType.objects.get_for_model(Project)
        perms = Permission.objects.filter(content_type=ct)

        # Managers get all model-level perms
        manager.permissions.set(perms)

        # Members get view & add at model level (object-level restricts edits)
        view_perm = Permission.objects.get(codename="view_project", content_type=ct)
        add_perm = Permission.objects.get(codename="add_project", content_type=ct)
        member.permissions.set([view_perm, add_perm])

        self.stdout.write(self.style.SUCCESS("Roles bootstrapped: manager, member"))
