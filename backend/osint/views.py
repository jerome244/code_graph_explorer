# backend/osint/views.py
import re, socket, ssl, json, hashlib
from typing import Dict, Any, List, Optional
import requests

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

IPV4_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")
IPV6_RE = re.compile(r"^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$", re.IGNORECASE)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SITES = [
    ("GitHub", "https://github.com/{u}"),
    ("Reddit", "https://www.reddit.com/user/{u}"),
    ("X (Twitter)", "https://x.com/{u}"),
    ("Instagram", "https://www.instagram.com/{u}/"),
]

def looks_like_ip(q: str) -> bool:
    return bool(IPV4_RE.match(q) or IPV6_RE.match(q))

def looks_like_email(q: str) -> bool:
    return bool(EMAIL_RE.match(q))

def domain_from_email(email: str) -> str:
    return email.split("@", 1)[1].lower()

def uniq(seq):
    seen = set()
    out = []
    for x in seq:
        if x not in seen:
            out.append(x)
            seen.add(x)
    return out

def resolve_domain(domain: str) -> Dict[str, Any]:
    ips: List[str] = []
    try:
        infos = socket.getaddrinfo(domain, None)
        for fam, _, _, _, sockaddr in infos:
            ip = sockaddr[0] if isinstance(sockaddr, tuple) else None
            if ip:
                ips.append(ip)
    except Exception:
        pass
    ips = uniq(ips)

    reverse_dns: Dict[str, Optional[str]] = {}
    for ip in ips:
        try:
            hn, _, _ = socket.gethostbyaddr(ip)
            reverse_dns[ip] = hn
        except Exception:
            reverse_dns[ip] = None

    http_checks = []
    for scheme in ("https", "http"):
        url = f"{scheme}://{domain}"
        try:
            r = requests.head(url, timeout=6, allow_redirects=True)
            http_checks.append({
                "url": url,
                "ok": r.ok,
                "status": r.status_code,
                "server": r.headers.get("server"),
                "content_type": r.headers.get("content-type"),
                "location": r.headers.get("location"),
            })
        except Exception:
            http_checks.append({"url": url, "ok": False})

    tls_info: Optional[Dict[str, Any]] = None
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((domain, 443), timeout=6) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
                # Normalize subject/issuer as dicts
                def name_list_to_dict(nl):
                    d = {}
                    for tup in nl:
                        for k, v in tup:
                            d[k] = v
                    return d
                tls_info = {
                    "subject": name_list_to_dict(cert.get("subject", [])),
                    "issuer": name_list_to_dict(cert.get("issuer", [])),
                    "not_before": cert.get("notBefore"),
                    "not_after": cert.get("notAfter"),
                }
    except Exception:
        tls_info = None

    return {
        "ips": ips,
        "reverse_dns": reverse_dns,
        "http": http_checks,
        "tls": tls_info,
    }

def reverse_ptr(ip: str) -> Dict[str, Any]:
    try:
        hn, _, _ = socket.gethostbyaddr(ip)
        return {"ptr": hn}
    except Exception:
        return {"ptr": None}

def gravatar(email: str) -> Dict[str, Any]:
    h = hashlib.md5(email.strip().lower().encode("utf-8")).hexdigest()
    url = f"https://www.gravatar.com/avatar/{h}"
    exists: Optional[bool] = None
    try:
        r = requests.get(url + "?d=404", timeout=6)
        exists = (r.status_code == 200)
    except Exception:
        exists = None
    return {
        "domain": domain_from_email(email),
        "gravatar_url": url,
        "gravatar_exists": exists,
    }

def username_checks(u: str) -> Dict[str, Any]:
    checks = []
    for site, pattern in SITES:
        url = pattern.format(u=u)
        ok: Optional[bool] = None
        status: Optional[int] = None
        try:
            r = requests.head(url, timeout=6, allow_redirects=True)
            status = r.status_code
            if status == 200:
                ok = True
            elif status in (404, 410):
                ok = False
            else:
                ok = None
        except Exception:
            ok = None
        checks.append({"site": site, "url": url, "exists": ok, "status": status})
    return {"checks": checks}

class BurstThrottle(AnonRateThrottle):
    rate = "60/hour"  # adjust as you like

@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([BurstThrottle])
def scan(request):
    q = (request.data.get("query") or "").strip()
    if not q:
        return Response({"error": "Missing 'query'."}, status=400)

    result: Dict[str, Any] = {"query": q, "type": "unknown"}

    if looks_like_ip(q):
        result["type"] = "ip"
        result["ip"] = reverse_ptr(q)
        return Response(result)

    if looks_like_email(q):
        result["type"] = "email"
        result["email"] = gravatar(q)
        # also run on the email's domain for convenience
        result["domain"] = resolve_domain(result["email"]["domain"])
        return Response(result)

    if "." in q:  # rough domain guess
        result["type"] = "domain"
        result["domain"] = resolve_domain(q)
        return Response(result)

    # fallback: treat as username
    result["type"] = "username"
    result["username"] = username_checks(q)
    return Response(result)
