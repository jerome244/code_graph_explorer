import pytest
from django.urls import reverse
from .factories import ProjectFactory, UserFactory

pytestmark = pytest.mark.django_db

def test_create_project_sets_owner_and_slug(jwt_client):
    url = reverse("project-list")  # /api/projects/
    resp = jwt_client.post(url, {"name": "Demo", "description": "hello"}, format="json")
    assert resp.status_code == 201, resp.content
    data = resp.json()
    assert data["owner"]            # owner id present
    assert data["slug"] == "demo"

def test_get_project_by_slug(jwt_client):
    # create via factory so slug is generated
    project = ProjectFactory(name="Look Me Up", owner=UserFactory())
    url = reverse("project-detail", kwargs={"slug": project.slug})
    resp = jwt_client.get(url)
    assert resp.status_code == 200
    assert resp.json()["slug"] == project.slug

def test_member_cannot_modify_others_project(jwt_client_for_member):
    other_owner = UserFactory()
    project = ProjectFactory(name="Locked", owner=other_owner)
    url = reverse("project-detail", kwargs={"slug": project.slug})
    resp = jwt_client_for_member.patch(url, {"description": "hacked"}, format="json")
    assert resp.status_code in (403, 404)  # permission denied (403) or hidden (404)
    # sanity: GET should still be allowed
    resp_get = jwt_client_for_member.get(url)
    assert resp_get.status_code == 200

def test_manager_can_modify_any_project(jwt_client_for_manager):
    project = ProjectFactory(name="Managed", owner=UserFactory())
    url = reverse("project-detail", kwargs={"slug": project.slug})
    resp = jwt_client_for_manager.patch(url, {"description": "updated by manager"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["description"] == "updated by manager"
