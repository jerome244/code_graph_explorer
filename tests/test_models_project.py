# tests/test_models_project.py

import pytest
from core.models import Project
from .factories import ProjectFactory, UserFactory

pytestmark = pytest.mark.django_db

def test_slug_autocreates_from_name():
    # Prevent unsaved FK by clearing owner (field is nullable in your model)
    p = ProjectFactory.build(name="My Demo", owner=None)
    assert not p.slug
    p.save()
    assert p.slug == "my-demo"


def test_slug_unique_suffix_when_name_duplicates():
    owner = UserFactory()
    p1 = Project(name="Acme", owner=owner)
    p1.save()
    p2 = Project(name="Acme", owner=owner)
    p2.save()
    assert p1.slug == "acme"
    assert p2.slug == "acme-2"

def test_str_returns_name():
    p = ProjectFactory(name="Shiny Project")
    assert str(p) == "Shiny Project"
