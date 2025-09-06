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
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),  # GET, PATCH, DELETE
    path("me/avatar/", AvatarUploadView.as_view(), name="me_avatar"),  # PUT multipart
    path("users/search/", UserSearchView.as_view(), name="user_search"),

    # New
    path("users/<str:username>/", PublicUserView.as_view(), name="user_public"),
    path("users/<str:username>/follow/", FollowView.as_view(), name="user_follow"),
    path("messages/thread/<str:username>/", MessageThreadView.as_view(), name="messages_thread"),
    path("messages/send/", MessageSendView.as_view(), name="messages_send"),
]
