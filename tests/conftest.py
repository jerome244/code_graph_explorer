import pytest
from django.contrib.auth.models import Group
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model

User = get_user_model()

@pytest.fixture(autouse=True)
def _bootstrap_groups(db):
    # minimal groups used by RoleBasedProjectPermission
    Group.objects.get_or_create(name="manager")
    Group.objects.get_or_create(name="member")

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="alice", email="alice@example.com", password="pass1234"
    )

@pytest.fixture
def member_user(db):
    u = User.objects.create_user(
        username="member", email="member@example.com", password="pass1234"
    )
    g = Group.objects.get(name="member")
    u.groups.add(g)
    return u

@pytest.fixture
def manager_user(db):
    u = User.objects.create_user(
        username="manager", email="manager@example.com", password="pass1234"
    )
    g = Group.objects.get(name="manager")
    u.groups.add(g)
    return u

def _jwt_for(user):
    # simplejwt: get an access token for this user
    return str(RefreshToken.for_user(user).access_token)

@pytest.fixture
def jwt_client(api_client, user):
    token = _jwt_for(user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client

@pytest.fixture
def jwt_client_for_member(api_client, member_user):
    token = _jwt_for(member_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client

@pytest.fixture
def jwt_client_for_manager(api_client, manager_user):
    token = _jwt_for(manager_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client

# --- append to tests/conftest.py ---
import io, zipfile
import pytest

@pytest.fixture(autouse=True)
def media_tmp(tmp_path, settings):
    # use a temp media directory so uploaded ZIPs don't pollute your repo
    settings.MEDIA_ROOT = tmp_path / "media"
    settings.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

@pytest.fixture
def zip_factory():
    def _build(files: dict[str, str]) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for path, content in files.items():
                z.writestr(path, content)
        return buf.getvalue()
    return _build
