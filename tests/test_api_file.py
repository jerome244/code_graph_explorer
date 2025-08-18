import os
import io
import zipfile
import pytest
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile

from tests.factories import ProjectFactory

def make_zip_bytes(files: dict[str, str]) -> bytes:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as z:
        for p, content in files.items():
            z.writestr(p, content)
    return bio.getvalue()

@pytest.mark.django_db
def test_file_returns_plain_text(jwt_client, user):
    project = ProjectFactory(owner=user, name="ReadMe")
    zbytes = make_zip_bytes({
        "a.py": "def foo():\n    bar()\n",
        "sub/inner.txt": "hello\nworld\n",
    })
    # create analysis via upload endpoint you already have
    resp = jwt_client.post(
        reverse("project-upload", kwargs={"slug": project.slug}),
        {"file": SimpleUploadedFile("code.zip", zbytes, content_type="application/zip")},
        format="multipart",
    )
    assert resp.status_code in (200, 201)

    # fetch file full
    url = reverse("project-file", kwargs={"slug": project.slug}) + "?path=a.py"
    r = jwt_client.get(url)
    assert r.status_code == 200
    assert r["Content-Type"].startswith("text/plain")
    assert "def foo()" in r.content.decode()

@pytest.mark.django_db
def test_file_line_slicing(jwt_client, user):
    project = ProjectFactory(owner=user, name="Slice")
    zbytes = make_zip_bytes({"a.py": "L1\nL2\nL3\n"})
    resp = jwt_client.post(
        reverse("project-upload", kwargs={"slug": project.slug}),
        {"file": SimpleUploadedFile("code.zip", zbytes, content_type="application/zip")},
        format="multipart",
    )
    assert resp.status_code in (200, 201)

    # lines 2..3 inclusive
    url = reverse("project-file", kwargs={"slug": project.slug}) + "?path=a.py&start=2&end=3"
    r = jwt_client.get(url)
    assert r.status_code == 200
    assert r.content.decode() == "L2\nL3\n"

@pytest.mark.django_db
def test_file_missing_or_invalid(jwt_client, user):
    project = ProjectFactory(owner=user, name="Invalid")
    # no analysis yet
    url = reverse("project-file", kwargs={"slug": project.slug}) + "?path=a.py"
    r = jwt_client.get(url)
    assert r.status_code == 404

    # after creating analysis, request invalid path
    zbytes = make_zip_bytes({"b.py": "pass\n"})
    resp = jwt_client.post(
        reverse("project-upload", kwargs={"slug": project.slug}),
        {"file": SimpleUploadedFile("code.zip", zbytes, content_type="application/zip")},
        format="multipart",
    )
    assert resp.status_code in (200, 201)

    bad = reverse("project-file", kwargs={"slug": project.slug}) + "?path=../../secret.txt"
    r2 = jwt_client.get(bad)
    assert r2.status_code == 400

    not_found = reverse("project-file", kwargs={"slug": project.slug}) + "?path=a.py"
    r3 = jwt_client.get(not_found)
    assert r3.status_code == 404
