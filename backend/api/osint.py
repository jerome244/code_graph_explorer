from django.http import JsonResponse
from django.views.decorators.http import require_GET
import ipaddress, socket, re, time
import requests
import tldextract
from urllib.parse import urlparse

# --- Simple SSRF guard helpers ---
PRIVATE_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

def _is_private_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return any(ip in net for net in PRIVATE_NETS)
    except Exception:
        return True

def _resolve_host_ips(host: str):
    ips = set()
    try:
        for fam, _, _, _, sa in socket.getaddrinfo(host, None):
            if fam == socket.AF_INET:
                ips.add(sa[0])
            elif fam == socket.AF_INET6:
                ips.add(sa[0])
    except Exception:
        pass
    return sorted(ips)

def _block_if_private(host: str):
    # Disallow obvious internal names
    low = host.lower()
    if low in ("localhost",) or low.endswith(".local"):
        return True
    # Resolve and block private IPs
    ips = _resolve_host_ips(host)
    if not ips:
        return False  # allow and let request fail naturally
    return any(_is_private_ip(ip) for ip in ips)

UA = {
    "User-Agent": "code_graph_explorer-osint/0.1 (+https://localhost)"
}

def _coerce_url(target: str) -> str | None:
    target = target.strip()
    if not target:
        return None
    # prepend scheme if missing
    if "://" not in target:
        target = "http://" + target
    parsed = urlparse(target)
    if parsed.scheme not in ("http", "https"):
        return None
    if not parsed.hostname:
        return None
    return target

def _extract_title(html: str) -> str | None:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    title = re.sub(r"\s+", " ", m.group(1)).strip()
    return title[:200] if title else None

@require_GET
def osint_scan(request):
    """
    GET /api/osint/scan?target=<url-or-domain>
    Returns: { ok, url, hostname, ips[], http{status,redirects,server,content_type,title}, robots, sitemap }
    """
    raw = request.GET.get("target", "") or ""
    url = _coerce_url(raw)
    if not url:
        return JsonResponse({"ok": False, "error": "Provide a valid http/https URL or domain."}, status=400)

    parsed = urlparse(url)
    host = parsed.hostname or ""
    if _block_if_private(host):
        return JsonResponse({"ok": False, "error": "Target resolves to a private/loopback address (blocked)."}, status=400)

    result = {
        "ok": True,
        "url": url,
        "hostname": host,
        "domain": tldextract.extract(host).registered_domain,
        "ips": _resolve_host_ips(host),
        "http": {},
        "robots": {"present": False, "status": None, "size": None, "sitemaps": []},
        "sitemap": {"present": False, "status": None},
        "timing_ms": {},
    }

    # HTTP fetch with redirects, small timeout
    t0 = time.time()
    try:
        r = requests.get(url, headers=UA, timeout=8, allow_redirects=True)
        result["http"] = {
            "status": r.status_code,
            "redirects": [h.headers.get("Location") for h in r.history if h.is_redirect],
            "server": r.headers.get("Server"),
            "content_type": r.headers.get("Content-Type"),
        }
        if "text/html" in (r.headers.get("Content-Type") or "") and isinstance(r.text, str):
            result["http"]["title"] = _extract_title(r.text)
    except Exception as e:
        result["http"] = {"error": str(e)[:200]}
    result["timing_ms"]["fetch"] = int((time.time() - t0) * 1000)

    # robots.txt
    robots_url = f"{parsed.scheme}://{host}/robots.txt"
    t1 = time.time()
    try:
        rr = requests.get(robots_url, headers=UA, timeout=5, allow_redirects=True)
        result["robots"]["status"] = rr.status_code
        if rr.status_code == 200:
            result["robots"]["present"] = True
            result["robots"]["size"] = len(rr.content)
            # Extract Sitemap: lines
            maps = []
            for line in rr.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    maps.append(line.split(":", 1)[1].strip())
            result["robots"]["sitemaps"] = maps[:10]
    except Exception:
        pass
    result["timing_ms"]["robots"] = int((time.time() - t1) * 1000)

    # sitemap.xml quick check if not in robots
    if not result["robots"]["sitemaps"]:
        sm_url = f"{parsed.scheme}://{host}/sitemap.xml"
        try:
            sm = requests.head(sm_url, headers=UA, timeout=5, allow_redirects=True)
            result["sitemap"]["status"] = sm.status_code
            result["sitemap"]["present"] = sm.status_code == 200
        except Exception:
            pass

    return JsonResponse(result)
