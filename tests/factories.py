import factory
from factory.django import DjangoModelFactory
from django.contrib.auth import get_user_model
from core.models import Project

User = get_user_model()

class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda o: f"{o.username}@example.com")
    display_name = factory.Faker("name")

    @factory.post_generation
    def password(obj, create, extracted, **kwargs):
        pwd = extracted or "pass1234"
        obj.set_password(pwd)
        if create:
            obj.save()

class ProjectFactory(DjangoModelFactory):
    class Meta:
        model = Project

    name = factory.Sequence(lambda n: f"Project {n}")
    description = factory.Faker("sentence")
    owner = factory.SubFactory(UserFactory)
