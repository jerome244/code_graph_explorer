from datetime import datetime, timezone
from typing import List
import json
import requests
from django.db import models
from django.core.mail import send_mail
from django.conf import settings

from .models import Page, Alert

def _build_queryset(alert: Alert):
    qs = Page.objects.all()
    # text/domain/url filters
    if alert.q:
        qs = qs.filter(
            models.Q(title__icontains=alert.q) |
            models.Q(text__icontains=alert.q) |
            models.Q(domain__icontains=alert.q) |
            models.Q(url__icontains=alert.q)
        )
    if alert.domain_contains:
        qs = qs.filter(domain__icontains=alert.domain_contains)
    # entity filter via reverse relation Mention → Entity (if you added that earlier)
    if alert.entity_kind and alert.entity_value:
        qs = qs.filter(
            mentions__entity__kind=alert.entity_kind,
            mentions__entity__value__iexact=alert.entity_value
        )
    # only newer than:
    if alert.last_notified_at:
        qs = qs.filter(fetched_at__gt=alert.last_notified_at)
    elif alert.since:
        qs = qs.filter(fetched_at__gt=alert.since)
    return qs.order_by("-fetched_at")

def _send_email(alert: Alert, pages: List[Page]):
    if not alert.notify_email:
        return
    subj = f"[OSINT] {len(pages)} new match(es) for '{alert.q or alert.entity_value or '*'}'"
    lines = []
    for p in pages[:20]:
        lines.append(f"- {p.title or p.domain} • {p.url} • {p.fetched_at:%Y-%m-%d %H:%M}")
    body = "\n".join(lines) or "No details."
    try:
        send_mail(
            subject=subj,
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "osint@localhost"),
            recipient_list=[alert.notify_email],
            fail_silently=True,
        )
    except Exception:
        pass

def _send_webhook(alert: Alert, pages: List[Page]):
    if not alert.notify_webhook:
        return
    payload = {
        "alert": {
            "id": alert.id,
            "name": alert.name,
            "q": alert.q,
            "entity_kind": alert.entity_kind,
            "entity_value": alert.entity_value,
            "domain_contains": alert.domain_contains,
        },
        "matches": [
            {
                "id": p.id,
                "url": p.url,
                "domain": p.domain,
                "title": p.title,
                "fetched_at": p.fetched_at.isoformat(),
                "sha256": p.sha256,
            }
            for p in pages[:100]
        ],
        "count": len(pages),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        requests.post(alert.notify_webhook, data=json.dumps(payload), headers={"content-type": "application/json"}, timeout=10)
    except Exception:
        pass

def run_alert(alert: Alert) -> int:
    """Returns number of matches notified."""
    if not alert.is_active:
        return 0
    qs = _build_queryset(alert)
    pages = list(qs[:200])
    if not pages:
        return 0
    _send_email(alert, pages)
    _send_webhook(alert, pages)
    alert.last_notified_at = datetime.now(timezone.utc)
    alert.last_run_at = alert.last_notified_at
    alert.save(update_fields=["last_notified_at","last_run_at"])
    return len(pages)
