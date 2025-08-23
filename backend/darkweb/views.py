from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import RetrieveAPIView
from django.db import models

from .models import Page
from .serializers import PageSerializer
from .utils import fetch_via_tor, extract_text_and_title, hash_text, domain_from_url

class CrawlView(APIView):
    """
    POST /api/darkweb/crawl
    -> fetch via Tor, extract full text, upsert Page, return full record
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        url = (request.data or {}).get("url")
        if not url:
            return Response({"error": "Missing url"}, status=400)
        try:
            html = fetch_via_tor(url, timeout=30)
            title, text = extract_text_and_title(html)
            if not text:
                return Response({"error": "No text extracted"}, status=502)

            dom = domain_from_url(url)
            sha = hash_text(text)
            page, _ = Page.objects.update_or_create(
                url=url,
                defaults={"domain": dom, "title": title, "text": text, "sha256": sha},
            )
            return Response(PageSerializer(page).data, status=201)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

class SearchView(APIView):
    """
    GET /api/darkweb/search?q=term&limit=20
    -> returns a small payload with a short snippet
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response([], status=200)

        try:
            limit = int(request.query_params.get("limit", "20"))
        except ValueError:
            limit = 20
        limit = max(1, min(limit, 50))

        qs = (
            Page.objects
            .filter(
                models.Q(title__icontains=q) |
                models.Q(text__icontains=q) |
                models.Q(domain__icontains=q) |
                models.Q(url__icontains=q)
            )
            .order_by("-fetched_at")[:limit]
        )

        data = [
            {
                "id": p.id,
                "url": p.url,
                "domain": p.domain,
                "title": p.title or p.domain,
                "snippet": (p.text or "")[:300],
                "fetched_at": p.fetched_at,
            }
            for p in qs
        ]
        return Response(data, status=200)

class PageDetailView(RetrieveAPIView):
    """
    GET /api/darkweb/pages/<id>
    -> returns the full Page (including full text)
    """
    authentication_classes = []
    permission_classes = []
    queryset = Page.objects.all()
    serializer_class = PageSerializer
