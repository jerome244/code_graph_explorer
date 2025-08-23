from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import RetrieveAPIView
from django.db import models
from django.db.models import Count, Prefetch
from django.utils import timezone
from django.db import DataError, IntegrityError
from rest_framework.exceptions import ValidationError

from .models import Page, Entity, Mention, Alert
from .serializers import PageSerializer, EntitySerializer, AlertSerializer
from .utils import fetch_via_tor, extract_text_and_title, hash_text, domain_from_url
from .ioc import extract_iocs
from .alerts import run_alert

class CrawlView(APIView):
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

            # --- IOC extraction & linking ---
            iocs = extract_iocs(text)
            for kind, values in iocs.items():
                for v in values:
                    ent, _ = Entity.objects.get_or_create(kind=kind, value=v)
                    # update last_seen automatically on save(); ensure Mention exists
                    Mention.objects.get_or_create(page=page, entity=ent)

            return Response(PageSerializer(page).data, status=201)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

class SearchView(APIView):
    """
    GET /api/darkweb/search?q=term&limit=20
    Optional filters:
      - entity_kind=email&entity_value=value
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        entity_kind = (request.query_params.get("entity_kind") or "").strip().lower()
        entity_value = (request.query_params.get("entity_value") or "").strip()

        try:
            limit = int(request.query_params.get("limit", "20"))
        except ValueError:
            limit = 20
        limit = max(1, min(limit, 50))

        qs = Page.objects.all()
        if q:
            qs = qs.filter(
                models.Q(title__icontains=q) |
                models.Q(text__icontains=q) |
                models.Q(domain__icontains=q) |
                models.Q(url__icontains=q)
            )

        if entity_kind and entity_value:
            qs = qs.filter(
                mentions__entity__kind=entity_kind,
                mentions__entity__value__iexact=entity_value
            )

        qs = qs.order_by("-fetched_at")[:limit]

        # prefetch mentions → entities to build chips
        qs = qs.prefetch_related(
            Prefetch(
                "mentions",
                queryset=Mention.objects.select_related("entity")
            )
        )

        data = []
        for p in qs:
            chips = {"email": [], "ip": [], "btc": [], "xmr": []}
            # take up to 3 per kind for display
            for m in p.mentions.all():
                k = m.entity.kind
                if k in chips and len(chips[k]) < 3:
                    chips[k].append(m.entity.value)

            data.append({
                "id": p.id,
                "url": p.url,
                "domain": p.domain,
                "title": p.title or p.domain,
                "snippet": (p.text or "")[:300],
                "fetched_at": p.fetched_at,
                "entities": chips,
            })
        return Response(data, status=200)

class PageDetailView(RetrieveAPIView):
    """GET /api/darkweb/pages/<id> → full text"""
    authentication_classes = []
    permission_classes = []
    queryset = Page.objects.all()
    serializer_class = PageSerializer

class EntitiesView(APIView):
    """
    GET /api/darkweb/entities?kind=email&prefix=alice&limit=50
    Returns distinct entities with number of pages mentioning them.
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        kind = (request.query_params.get("kind") or "").lower()
        prefix = (request.query_params.get("prefix") or "")
        try:
            limit = int(request.query_params.get("limit", "50"))
        except ValueError:
            limit = 50
        limit = max(1, min(limit, 200))

        qs = Entity.objects.all()
        if kind:
            qs = qs.filter(kind=kind)
        if prefix:
            qs = qs.filter(value__istartswith=prefix)

        qs = qs.annotate(pages=Count("mentions__page", distinct=True)).order_by("-pages", "value")[:limit]
        data = EntitySerializer(qs, many=True).data
        return Response(data, status=200)

class AlertsView(APIView):
    """
    GET /api/darkweb/alerts           → list alerts
    POST /api/darkweb/alerts          → create alert
      body: { name?, q?, entity_kind?, entity_value?, domain_contains?,
              frequency: "15m"|"hourly"|"daily",
              notify_email?, notify_webhook?, since? }
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        alerts = Alert.objects.order_by("-created_at")
        return Response(AlertSerializer(alerts, many=True).data)

    def post(self, request):
        data = request.data or {}
        data.setdefault("since", timezone.now())  # let DRF handle datetime object
        try:
            ser = AlertSerializer(data=data)
            ser.is_valid(raise_exception=True)
            a = ser.save(is_active=True)
            return Response(AlertSerializer(a).data, status=201)
        except ValidationError as ve:
            return Response(ve.detail, status=400)
        except (DataError, IntegrityError) as e:
            return Response({"error": "Invalid data", "detail": str(e)}, status=400)
        
class AlertToggleView(APIView):
    """POST /api/darkweb/alerts/<id>/toggle {is_active:true|false}"""
    authentication_classes = []
    permission_classes = []

    def post(self, request, pk):
        try:
            a = Alert.objects.get(pk=pk)
        except Alert.DoesNotExist:
            return Response({"error":"not found"}, status=404)
        a.is_active = bool((request.data or {}).get("is_active", True))
        a.save(update_fields=["is_active"])
        return Response({"ok": True, "is_active": a.is_active})

class AlertTestView(APIView):
    """POST /api/darkweb/alerts/<id>/test → run once immediately and return match count (no side-effects)."""
    authentication_classes = []
    permission_classes = []

    def post(self, request, pk):
        try:
            a = Alert.objects.get(pk=pk)
        except Alert.DoesNotExist:
            return Response({"error":"not found"}, status=404)
        # Dry-run: build queryset and count, don't update last_notified_at
        from .alerts import _build_queryset
        qs = _build_queryset(a)
        count = qs.count()
        sample = [
            {"id": p.id, "title": p.title, "url": p.url, "domain": p.domain, "fetched_at": p.fetched_at}
            for p in qs[:10]
        ]
        return Response({"count": count, "sample": sample})

# darkweb/views.py
class SourcesView(APIView):
    authentication_classes = []
    permission_classes = []
    def get(self, request):
        from .serializers import SourceSerializer
        return Response(SourceSerializer(Source.objects.order_by("-created_at"), many=True).data)

    def post(self, request):
        from .serializers import SourceSerializer
        data = request.data or {}
        if "domain" not in data:
            data["domain"] = domain_from_url(data.get("url","") or "")
        ser = SourceSerializer(data=data)
        if ser.is_valid():
            s = ser.save(is_active=True)
            return Response(SourceSerializer(s).data, status=201)
        return Response(ser.errors, status=400)
