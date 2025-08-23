from datetime import datetime, timezone
from typing import List
import json
import logging
import requests
from django.db import models
from django.core.mail import send_mail
from django.conf import settings

from .models import Page, Alert

logger = logging.getLogger(__name__)

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
    except Exception as e:
        logger.exception("Email send failed for alert %s: %s", alert.id, e)

def _fmt_when(dt):
    try:
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(dt)

def _send_webhook(alert: Alert, pages: List[Page]):
    """
    Sends a chat-friendly message to Discord or Slack if those endpoints are detected.
    Falls back to structured JSON for custom receivers.
    """
    url = (alert.notify_webhook or "").strip()
    if not url:
        return

    # Human-friendly summary (first 10 for chat UX)
    header = f"OSINT alert — {len(pages)} new match(es) for “{alert.q or alert.entity_value or '*'}”"
    # Common summary lines for chat platforms
    chat_lines = []
    for p in pages[:10]:
        title = p.title or p.domain or p.url
        when = _fmt_when(p.fetched_at)
        # Discord supports Markdown links; Slack uses <url|text> (we'll format below)
        chat_lines.append((title, p.url, p.domain, when))

    try:
        # Discord webhook
        if "discord.com/api/webhooks/" in url:
            lines = [f"**{header}**"]
            for title, link, domain, when in chat_lines:
                lines.append(f"• [{title}]({link}) — `{domain}` {when}")
            content = "\n".join(lines)
            if len(content) > 1900:
                content = content[:1900] + "\n…"

            payload = {
                "content": content,  # prepend "@here " if you want to ping
                "allowed_mentions": {"parse": []},  # prevent accidental @everyone
            }
            r = requests.post(url, json=payload, timeout=10)
            if r.status_code not in (200, 201, 202, 204):
                logger.error("Discord webhook HTTP %s: %s", r.status_code, r.text[:300])
            return

        # Slack incoming webhook
        if "hooks.slack.com" in url:
            lines = [f":rotating_light: {header}"]
            for title, link, domain, when in chat_lines:
                lines.append(f"• <{link}|{title}> — `{domain}` {when}")
            text = "\n".join(lines)
            r = requests.post(url, json={"text": text}, timeout=10)
            if r.status_code not in (200, 201, 202):
                logger.error("Slack webhook HTTP %s: %s", r.status_code, r.text[:300])
            return

        # Fallback: structured JSON for custom receivers
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
        r = requests.post(url, json=payload, timeout=10)
        if r.status_code not in (200, 201, 202, 204):
            logger.error("Custom webhook HTTP %s: %s", r.status_code, r.text[:300])

    except Exception as e:
        logger.exception("Webhook send failed for alert %s: %s", alert.id, e)

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
    alert.save(update_fields=["last_notified_at", "last_run_at"])
    return len(pages)
