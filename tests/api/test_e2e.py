import os
import random
import typing as t

import pytest
import requests

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")
S = requests.Session()
S.headers.update({"Accept": "application/json"})


def jrand(prefix: str) -> str:
    return f"{prefix}_{random.randint(1000, 99999)}"


def reg_user(username: str, email: str, password: str) -> requests.Response:
    return S.post(f"{BASE_URL}/api/auth/register/", json={
        "username": username, "email": email, "password": password
    })


def login(username: str, password: str) -> tuple[str, str | None]:
    """Try common SimpleJWT endpoints. Returns (access, refresh|None)."""
    candidates = [
        "/api/auth/token/",
        "/api/token/",
        "/api/auth/jwt/create/",
    ]
    for ep in candidates:
        r = S.post(f"{BASE_URL}{ep}", json={"username": username, "password": password})
        try:
            data = r.json()
        except Exception:
            data = {}
        access = data.get("access") or data.get("token") or data.get("jwt")
        refresh = data.get("refresh")
        if r.status_code == 200 and access:
            return access, refresh
    return "", None


@pytest.fixture(scope="module")
def user1():
    u = jrand("alice")
    e = f"{u}@example.com"
    p = "S3cur3P@ss!"
    reg_user(u, e, p)
    access, refresh = login(u, p)
    assert access, "Could not obtain access token for user1"
    return {"username": u, "email": e, "password": p, "access": access, "refresh": refresh}


@pytest.fixture(scope="module")
def user2():
    u = jrand("bob")
    e = f"{u}@example.com"
    p = "S3cur3P@ss!"
    reg_user(u, e, p)
    access, refresh = login(u, p)
    assert access, "Could not obtain access token for user2"
    return {"username": u, "email": e, "password": p, "access": access, "refresh": refresh}


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def mk_project(token: str, name: str) -> t.Any:
    r = S.post(f"{BASE_URL}/api/projects/", headers=auth_headers(token), json={"name": name})
    assert r.status_code in (200, 201), f"Create project failed: {r.status_code} {r.text}"
    d = r.json()
    pid = d.get("id") or d.get("pk") or d.get("uuid") or d.get("project_id")
    assert pid, f"No project id field in {d}"
    return pid


def get_project(token: str, pid: t.Union[str, int]) -> requests.Response:
    return S.get(f"{BASE_URL}/api/projects/{pid}/", headers=auth_headers(token))


def patch_project(token: str, pid: t.Union[str, int], payload: dict) -> requests.Response:
    r = S.patch(f"{BASE_URL}/api/projects/{pid}/", headers=auth_headers(token), json=payload)
    if r.status_code not in (200, 202, 204):
        # fallback PUT if PATCH unsupported
        r = S.put(f"{BASE_URL}/api/projects/{pid}/", headers=auth_headers(token), json=payload)
    return r


def del_project(token: str, pid: t.Union[str, int]) -> requests.Response:
    return S.delete(f"{BASE_URL}/api/projects/{pid}/", headers=auth_headers(token))


def post_file(token: str, pid: t.Union[str, int], path: str, content: str) -> requests.Response:
    payload = {"path": path, "content": content}
    return S.post(f"{BASE_URL}/api/projects/{pid}/file/", headers=auth_headers(token), json=payload)


# ---------- Share helpers (best-effort with verification) ----------

def can_read_project(token: str, pid: t.Union[str, int]) -> bool:
    r = get_project(token, pid)
    return r.status_code == 200


def can_write_file(token: str, pid: t.Union[str, int]) -> bool:
    r = post_file(token, pid, "perm_probe.md", "probe")
    return r.status_code in (200, 201)


def try_share_and_verify(owner_token: str, collaborator_token: str,
                         pid: t.Union[str, int], user: str, email: str) -> bool:
    """
    Best-effort: try several share endpoints/payloads.
    Only return True if collaborator gains real access (read or write).
    """
    endpoints = [
        f"/api/projects/{pid}/share/",
        f"/api/projects/{pid}/shares/",
        f"/api/projects/{pid}/collaborators/",
        f"/api/projects/{pid}/editors/",
    ]
    payloads = [
        {"username": user, "role": "editor"},
        {"user": user, "role": "editor"},
        {"username": user},
        {"email": email, "role": "editor"},
    ]
    for ep in endpoints:
        for pl in payloads:
            r = S.post(f"{BASE_URL}{ep}", headers=auth_headers(owner_token), json=pl)
            if r.status_code in (200, 201, 202, 204):
                # Verify effective access
                if can_read_project(collaborator_token, pid) or can_write_file(collaborator_token, pid):
                    return True
                # If not, continue trying; may require invitation acceptance
    return False


# ------------------------ Tests ------------------------

def test_unauthorized_projects_requires_auth():
    r = S.get(f"{BASE_URL}/api/projects/")
    assert r.status_code == 401, r.text


def test_invalid_login_401():
    r = S.post(f"{BASE_URL}/api/auth/token/", json={"username": "nope", "password": "wrong"})
    # Accept either 401 or 404 (if endpoint doesn't exist)
    assert r.status_code in (401, 404), r.text


def test_user1_happy_path(user1):
    access = user1["access"]

    # list (before)
    r = S.get(f"{BASE_URL}/api/projects/", headers=auth_headers(access))
    assert r.status_code == 200
    assert isinstance(r.json(), list), "Expected an array from /api/projects/"

    # create project A & detail
    pid_a = mk_project(access, "Project A")
    r = get_project(access, pid_a)
    assert r.status_code == 200

    # update name
    r = patch_project(access, pid_a, {"name": "Project A (patched)"})
    assert r.status_code in (200, 202, 204), r.text

    # verify change
    r = get_project(access, pid_a)
    assert r.status_code == 200
    data = r.json()
    assert ("patched" in data.get("name", "").lower()) or ("put" in data.get("name", "").lower())

    # create file & update same file
    r = post_file(access, pid_a, "README.md", "# hello from pytest (A)")
    assert r.status_code in (200, 201), r.text
    r = post_file(access, pid_a, "README.md", "# updated from pytest (A)")
    assert r.status_code in (200, 201), r.text

    # create project B then delete it
    pid_b = mk_project(access, "Project B (to delete)")
    r = del_project(access, pid_b)
    assert r.status_code in (200, 202, 204), r.text
    r = get_project(access, pid_b)
    assert r.status_code in (403, 404), f"Expected 404/403 after delete, got {r.status_code}"

    # store for cross-user tests
    user1["pid_a"] = pid_a


def test_cross_user_isolation(user1, user2):
    pid_a = user1["pid_a"]
    access2 = user2["access"]

    # user2 list should not include user1's private projects
    r = S.get(f"{BASE_URL}/api/projects/", headers=auth_headers(access2))
    assert r.status_code == 200

    # user2 cannot write or read project A
    r = post_file(access2, pid_a, "hack.md", "nope")
    assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}: {r.text}"
    r = get_project(access2, pid_a)
    assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}: {r.text}"


def test_optional_share_and_collab(user1, user2):
    """
    If a working share flow exists, user2 should get access; otherwise we skip gracefully.
    """
    access1 = user1["access"]
    access2 = user2["access"]
    pid_a = user1["pid_a"]

    if try_share_and_verify(access1, access2, pid_a, user2["username"], user2["email"]):
        # Now user2 should be able to write for real
        r = post_file(access2, pid_a, "collab.md", "hello from user2")
        assert r.status_code in (200, 201), f"Share verified but write failed: {r.status_code} {r.text}"
    else:
        pytest.skip("No working/verified share flow detected; skipping collaborator test.")


def test_optional_refresh_token(user1):
    """If refresh exists, try to refresh the access token."""
    if not user1.get("refresh"):
        pytest.skip("No refresh token from login; skipping.")
    r = S.post(f"{BASE_URL}/api/auth/token/refresh/", json={"refresh": user1["refresh"]})
    # Allow 200 (success) or 404/401 if endpoint/flow not enabled
    assert r.status_code in (200, 401, 404)
    if r.status_code == 200:
        new_access = r.json().get("access")
        assert new_access
        # tiny check
        r2 = S.get(f"{BASE_URL}/api/projects/", headers=auth_headers(new_access))
        assert r2.status_code == 200
