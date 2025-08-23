from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from django.conf import settings
from .models import Page
from .serializers import PageSerializer
from .utils import fetch_via_tor, extract_text_and_title, hash_text, domain_from_url


def _socks_from_settings():
    return getattr(settings, "TOR_SOCKS_PROXY", "socks5h://127.0.0.1:9050")


class CrawlView(APIView):
    """
    POST { "url": "http://example.onion/" }
    Crawls a single page via Tor (text-only), stores/updates it, returns the record.
    """
    def post(self, request):
        url = request.data.get("url")
        if not url or not url.startswith("http"):
            return Response({"detail":"Provide a valid http(s) URL."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            html = fetch_via_tor(url, _socks_from_settings())
            title, text = extract_text_and_title(html)
            if not text.strip():
                return Response({"detail":"Fetched but found no extractable text."}, status=status.HTTP_204_NO_CONTENT)
            sha = hash_text(html)
            obj, _ = Page.objects.update_or_create(
                url=url,
                defaults={
                    "domain": domain_from_url(url),
                    "title": title,
                    "text": text,
                    "sha256": sha,
                },
            )
            return Response(PageSerializer(obj).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class SearchView(APIView):
    """
    GET /api/darkweb/search?q=term
    Full-text-ish search (title/text LIKE) limited to 50 results.
    """
    def get(self, request):
        q = request.GET.get("q","").strip()
        qs = Page.objects.all()
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(text__icontains=q) | Q(url__icontains=q))
        qs = qs.order_by("-fetched_at")[:50]
        return Response(PageSerializer(qs, many=True).data, status=status.HTTP_200_OK)
