from django.contrib import admin

from .models import Project, ProjectAnalysis


class BaseModelAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_at")
    list_filter = ("created_at",)
    search_fields = ("name",)
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)


@admin.register(Project)
class ProjectAdmin(BaseModelAdmin):
    list_display = ("id", "name", "owner", "slug", "created_at")
    search_fields = ("name", "owner__username", "owner__email", "slug")
    prepopulated_fields = {
        "slug": ("name",)
    }  # admin UI hint; save() still guarantees uniqueness

    def save_model(self, request, obj, form, change):
        if not obj.owner:
            obj.owner = request.user
        super().save_model(request, obj, form, change)


@admin.register(ProjectAnalysis)
class ProjectAnalysisAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "name", "created_at")
    readonly_fields = ("created_at",)
    search_fields = ("name", "project__name", "project__slug")
    ordering = ("-created_at",)
    