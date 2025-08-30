from django.urls import path
from .views import RegisterView, MeView, UserSearchView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),
    path("users/search/", UserSearchView.as_view(), name="user_search"),
]
