import pytest
import os

from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile

from .factories import ProjectFactory, UserFactory

pytestmark = pytest.mark.django_db

def make_zip_file(name: str, payload: bytes) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, payload, content_type="application/zip")

def test_upload_and_fetch_latest_analysis(jwt_client, user, zip_factory):
    # project owned by the same user behind jwt_client
    project = ProjectFactory(owner=user, name="ZipProj")  # slug will auto-generate

    # tiny mixed-language zip
    zbytes = zip_factory({
        "a.py": "def foo():\n  pass\n",
        "b.js": "function hello(){ console.log('hi') }\nhello()\n",
        "index.html": "<div id='hero' class='card'></div>",
        "styles.css": "#hero{ } .card{ }",
    })

    url_upload = reverse("project-upload", kwargs={"slug": project.slug})
    resp = jwt_client.post(url_upload, {"file": make_zip_file("code.zip", zbytes)}, format="multipart")
    assert resp.status_code == 201, resp.content
    data = resp.json()
    assert data["summary"]["files"] >= 4
    assert "graph" in data and "tree_by_file" in data["graph"]

    # latest analysis endpoint
    url_latest = reverse("project-analysis-latest", kwargs={"slug": project.slug})
    r2 = jwt_client.get(url_latest)
    assert r2.status_code == 200
    assert r2.json()["summary"]["files"] >= 4

def test_upload_rejects_non_zip(jwt_client, user):
    project = ProjectFactory(owner=user, name="BadZip")
    url = reverse("project-upload", kwargs={"slug": project.slug})
    txt = SimpleUploadedFile("readme.txt", b"hello", content_type="text/plain")
    resp = jwt_client.post(url, {"file": txt}, format="multipart")
    assert resp.status_code == 400

def test_member_cannot_upload_to_others_project(jwt_client_for_member, zip_factory):
    other_owner = UserFactory()
    project = ProjectFactory(owner=other_owner, name="Foreign")
    zbytes = zip_factory({"main.py": "def a(): pass"})
    url = reverse("project-upload", kwargs={"slug": project.slug})
    resp = jwt_client_for_member.post(url, {"file": make_zip_file("p.zip", zbytes)}, format="multipart")
    assert resp.status_code in (403, 404)  # denied or hidden

def test_latest_analysis_404_when_none(jwt_client, user):
    project = ProjectFactory(owner=user, name="Empty")
    url = reverse("project-analysis-latest", kwargs={"slug": project.slug})
    resp = jwt_client.get(url)
    assert resp.status_code == 404

def test_upload_persists_zip_bytes(jwt_client, user, zip_factory, settings):
    project = ProjectFactory(owner=user, name="ZipPersist")
    zbytes = zip_factory({"a.py": "def x(): pass"})
    resp = jwt_client.post(
        reverse("project-upload", kwargs={"slug": project.slug}),
        {"file": SimpleUploadedFile("code.zip", zbytes, content_type="application/zip")},
        format="multipart",
    )
    assert resp.status_code == 201
    # fetch the object and ensure file exists and has bytes
    analysis = project.analyses.latest("created_at")
    path = analysis.zip_file.path
    assert os.path.exists(path) and os.path.getsize(path) > 0
