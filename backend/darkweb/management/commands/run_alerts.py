from datetime import datetime, timezone, timedelta
from django.core.management.base import BaseCommand
from darkweb.models import Alert
from darkweb.alerts import run_alert

def _due(alert: Alert) -> bool:
    now = datetime.now(timezone.utc)
    if not alert.last_run_at:
        return True
    dt = now - alert.last_run_at
    if alert.frequency == "15m":
        return dt >= timedelta(minutes=15)
    if alert.frequency == "hourly":
        return dt >= timedelta(hours=1)
    if alert.frequency == "daily":
        return dt >= timedelta(days=1)
    return False

class Command(BaseCommand):
    help = "Run due OSINT alerts (email/webhook)."

    def handle(self, *args, **opts):
        due = [a for a in Alert.objects.filter(is_active=True) if _due(a)]
        total = 0
        for a in due:
            total += run_alert(a)
        self.stdout.write(self.style.SUCCESS(f"Processed {len(due)} alerts; sent for {total} matches."))
