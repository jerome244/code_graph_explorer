from rest_framework.permissions import BasePermission, SAFE_METHODS
from .models import ProjectShare

class IsOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.user_id == getattr(request.user, "id", None)

class IsOwnerOrShared(BasePermission):
    """
    Owners: full access.
    Shared users: GET allowed; write only if role == 'edit'.
    """
    def has_object_permission(self, request, view, obj):
        # owner
        if getattr(request.user, "is_authenticated", False) and obj.user_id == request.user.id:
            return True
        if not request.user.is_authenticated:
            return False
        # shared
        qs = ProjectShare.objects.filter(project=obj, shared_with=request.user)
        if request.method in SAFE_METHODS:
            return qs.exists()
        return qs.filter(role="edit").exists()
