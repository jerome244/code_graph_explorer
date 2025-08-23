# darkweb/management/commands/run_sources.py
from datetime import datetime, timedelta, timezone
from django.core.management.base import BaseCommand
from django.db import transaction
from darkweb.models import Source, Page
from darkweb.utils import fetch_via_tor, extract_text_and_title, hash_text, domain_from_url
from darkweb.utils_links import internal_links
import time

def due(src: Source) -> bool:
    if not src.last_crawled_at: return True
    dt = datetime.now(timezone.utc) - src.last_crawled_at
    return (src.frequency == "15m" and dt >= timedelta(minutes=15)) or \
           (src.frequency == "hourly" and dt >= timedelta(hours=1)) or \
           (src.frequency == "daily" and dt >= timedelta(days=1))

class Command(BaseCommand):
    help = "Recrawl onion sources (via Tor), discover internal links, upsert Pages."

    def handle(self, *args, **opts):
        now = datetime.now(timezone.utc)
        sources = [s for s in Source.objects.filter(is_active=True) if due(s)]
        created = 0
        for s in sources:
            try:
                html = fetch_via_tor(s.url, timeout=45)
                title, text = extract_text_and_title(html)
                if text:
                    sha = hash_text(text)
                    dom = domain_from_url(s.url)
                    with transaction.atomic():
                        Page.objects.update_or_create(
                            url=s.url,
                            defaults={"domain": dom, "title": title, "text": text, "sha256": sha},
                        )
                        created += 1
                # follow internal links (depth=1)
                if s.depth >= 1:
                    for u in internal_links(html, s.url, max_links=40):
                        try:
                            html2 = fetch_via_tor(u, timeout=30)
                            t2, x2 = extract_text_and_title(html2)
                            if not x2: continue
                            sha2 = hash_text(x2)
                            dom2 = domain_from_url(u)
                            Page.objects.update_or_create(
                                url=u,
                                defaults={"domain": dom2, "title": t2, "text": x2, "sha256": sha2},
                            )
                            created += 1
                            time.sleep(1.0)  # be gentle over Tor
                        except Exception:
                            continue
                s.last_crawled_at = now
                s.save(update_fields=["last_crawled_at"])
                time.sleep(2.0)  # spacing per source
            except Exception:
                continue
        self.stdout.write(self.style.SUCCESS(f"Sources processed: {len(sources)}, pages upserted: {created}"))
