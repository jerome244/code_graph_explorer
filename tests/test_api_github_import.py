import io, zipfile
import types
import pytest
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from .factories import ProjectFactory

pytestmark = pytest.mark.django_db

def make_zip_bytes(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for p, c in files.items():
            z.writestr(p, c)
    return buf.getvalue()

class DummyResp:
    def __init__(self, content: bytes, headers: dict):
        self._content = content
        self.headers = headers
        self.status_code = 200
        self._chunks = [content]
    def iter_content(self, chunk_size=8192):
        yield from self._chunks

def test_github_import_creates_analysis(monkeypatch, jwt_client, user):
    project = ProjectFactory(owner=user, name="GH")
    zbytes = make_zip_bytes({
        "a.py": "def foo():\n    bar()\n",
        "b.py": "def bar():\n    pass\n",
        "index.html": '<div id="hero" class="card"></div>',
        "style.css": "#hero{ } .card{ }",
    })

    def fake_get(url, headers=None, stream=True, timeout=30):
        headers_out = {"Content-Disposition": 'attachment; filename="owner-repo-abcdef1.zip"', "Content-Length": str(len(zbytes))}
        return DummyResp(zbytes, headers_out)

    import core.services.github_import as gh
    monkeypatch.setattr(gh.requests, "get", fake_get)

    url = reverse("project-import-github", kwargs={"slug": project.slug})
    resp = jwt_client.post(url, {"repo": "owner/repo", "ref": "main"}, format="json")
    assert resp.status_code == 201, resp.content

    data = resp.json()
    assert data["summary"]["files"] >= 4
    assert "graph" in data
