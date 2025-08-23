from django.core.management.base import BaseCommand, CommandError
from darkweb.utils import fetch_via_tor, extract_text_and_title, hash_text, domain_from_url
from darkweb.models import Page


class Command(BaseCommand):
    help = "Crawl a single onion URL via Tor and store text-only content."

    def add_arguments(self, parser):
        parser.add_argument("url", type=str, help="The http://...onion/ URL to fetch")


    def handle(self, *args, **opts):
        url = opts["url"]
        try:
            html = fetch_via_tor(url)
            title, text = extract_text_and_title(html)
            if not text.strip():
                self.stdout.write(self.style.WARNING("No extractable text."))
                return
            obj, _ = Page.objects.update_or_create(
                url=url,
                defaults={
                    "domain": domain_from_url(url),
                    "title": title,
                    "text": text,
                    "sha256": hash_text(html),
                },
            )
            self.stdout.write(self.style.SUCCESS(f"Saved: {obj.url} ({len(text)} chars)"))
        except Exception as e:
            raise CommandError(str(e))
