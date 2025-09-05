from django.urls import path
from .views import RegisterView, MeView, UserSearchView, AvatarUploadView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),               # GET, PATCH, DELETE
    path("me/avatar/", AvatarUploadView.as_view(), name="me_avatar"),  # PUT multipart
    path("users/search/", UserSearchView.as_view(), name="user_search"),
]
