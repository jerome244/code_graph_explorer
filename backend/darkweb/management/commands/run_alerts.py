# darkweb/management/commands/run_alerts.py
from django.core.management.base import BaseCommand
from darkweb.models import Alert
from darkweb.alerts import run_alert

class Command(BaseCommand):
    help = "Run OSINT alerts (all active, or a specific one with --id)"

    def add_arguments(self, parser):
        parser.add_argument("--id", type=int, help="Run only this alert id")

    def handle(self, *args, **opts):
        ids = [opts["id"]] if opts.get("id") else list(Alert.objects.filter(is_active=True).values_list("id", flat=True))
        total = 0
        for aid in ids:
            try:
                a = Alert.objects.get(id=aid)
            except Alert.DoesNotExist:
                self.stderr.write(f"Alert {aid} not found")
                continue
            n = run_alert(a)
            total += n
            self.stdout.write(f"Alert {a.id} '{a.name}': sent {n}")
        self.stdout.write(self.style.SUCCESS(f"Done. Total sent: {total}"))
