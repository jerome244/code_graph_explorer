from django.urls import path
from .views import (
    RegisterView,
    MeView,
    UserSearchView,
    AvatarUploadView,
    PublicUserView,
    FollowView,
    MessageThreadView,
    MessageSendView,
    ConversationsView,
    MessageDeleteView,
    BlockView,
    BlocksListView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),
    path("me/avatar/", AvatarUploadView.as_view(), name="me_avatar"),
    path("users/search/", UserSearchView.as_view(), name="user_search"),
    path("users/<str:username>/", PublicUserView.as_view(), name="user_public"),
    path("users/<str:username}/follow/", FollowView.as_view(), name="user_follow"),

    # messages — specific first
    path("messages/send/", MessageSendView.as_view(), name="messages_send"),
    path("messages/conversations/", ConversationsView.as_view(), name="messages_conversations"),
    path("messages/<int:pk>/", MessageDeleteView.as_view(), name="messages_delete"),
    path("messages/thread/<str:username>/", MessageThreadView.as_view(), name="messages_thread"),

    # blocks
    path("blocks/", BlocksListView.as_view(), name="blocks_list"),
    path("blocks/<str:username>/", BlockView.as_view(), name="block_toggle"),
]
