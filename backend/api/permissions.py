from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsOwnerOrCollaboratorCanEdit(BasePermission):
    """
    Read: owner, collaborators, and anyone via share token route (handled elsewhere).
    Write: owner or collaborator with can_edit.
    Delete: owner only (enforced in view).
    """
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            # authenticated reads go through queryset filtering; this is fine
            return obj.owner_id == request.user.id or \
                   obj.collab_links.filter(user_id=request.user.id).exists()
        # PATCH/PUT
        if obj.owner_id == request.user.id:
            return True
        link = obj.collab_links.filter(user_id=request.user.id, can_edit=True).first()
        return bool(link)
