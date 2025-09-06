# backend/osint/views.py
import os
import re
import socket
import ssl
import json
import hashlib
import urllib.parse
from typing import Dict, Any, List, Optional, Tuple
import requests
import dns.resolver
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

# --- Patterns & constants ---
IPV4_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")
IPV6_RE = re.compile(r"^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$", re.IGNORECASE)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ONION_HOST_RE = re.compile(r"(?i)\b([a-z2-7]{16}|[a-z2-7]{56})\.onion\b")

SITES = [
    ("GitHub", "https://github.com/{u}"),
    ("Reddit", "https://www.reddit.com/user/{u}"),
    ("X (Twitter)", "https://x.com/{u}"),
    ("Instagram", "https://www.instagram.com/{u}/"),
]

DNS_TIMEOUT = 4.0
HTTP_TIMEOUT = 6.0

# --- Dark-web env ---
TOR_SOCKS_URL = os.getenv("TOR_SOCKS_URL", "socks5h://127.0.0.1:9050")
DARKWEB_FETCH_TIMEOUT = float(os.getenv("DARKWEB_FETCH_TIMEOUT", "20"))
DARKWEB_MAX_BYTES = int(os.getenv("DARKWEB_MAX_BYTES", "150000"))
DARKWEB_DEBUG = os.getenv("DARKWEB_DEBUG", "0").lower() in ("1", "true", "yes")

SAFE_UA = "Mozilla/5.0 (compatible; CodeGraphExplorer-OSINT/1.0)"
TB_UA = "Mozilla/5.0 (Windows NT 10.0; rv=115.0) Gecko/20100101 Firefox/115.0"
SAFE_ACCEPT = "text/html,application/xhtml+xml"
SAFE_ALANG = "en-US,en;q=0.8"


# at top with other constants
DARKWEB_ARTICLE_BYTES = int(os.getenv("DARKWEB_ARTICLE_BYTES", "2000000"))
DARKWEB_ARTICLE_TEXT_LIMIT = int(os.getenv("DARKWEB_ARTICLE_TEXT_LIMIT", "200000"))

def _safe_html_article(raw: bytes) -> Dict[str, str]:
    from bs4 import BeautifulSoup
    try:
        text = raw.decode("utf-8", errors="ignore")
    except Exception:
        text = raw.decode("latin-1", errors="ignore")
    soup = BeautifulSoup(text, "html.parser")
    for tag in soup(["script", "style", "iframe", "object", "embed"]):
        tag.decompose()
    for img in soup.find_all("img"):
        img.decompose()
    title = ""
    if soup.title:
        title = soup.title.get_text(strip=True)[:200]
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(" ", strip=True)[:200]
    text_content = " ".join(soup.get_text(" ").split())[:DARKWEB_ARTICLE_TEXT_LIMIT]
    return {"title": title, "html": str(soup)[:500000], "text": text_content}

def _fetch_full(url: str, ua: str, cap: int) -> Tuple[Dict[str, Any], Optional[BeautifulSoup], bytes]:
    try:
        with _tor_session(ua=ua) as s:
            r = s.get(url, timeout=DARKWEB_FETCH_TIMEOUT, allow_redirects=True)
            raw = r.content[:cap]
            try:
                soup = BeautifulSoup(raw.decode("utf-8","ignore") or raw.decode("latin-1","ignore"), "html.parser")
            except Exception:
                soup = None
            info = {"ok": bool(raw and len(raw) > 256), "url": str(getattr(r, "url", url))}
            return info, soup, raw
    except Exception as e:
        return {"ok": False, "error": str(e), "url": url}, None, b""

@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle])
def darkweb_content(request):
    u = (request.GET.get("u") or "").strip()
    if not u or ".onion" not in u:
        return Response({"ok": False, "error": "missing or invalid onion URL"}, status=400)

    info, soup, raw = _fetch_full(u, ua=SAFE_UA, cap=DARKWEB_ARTICLE_BYTES)
    if not info.get("ok") and soup:
        nxt = _find_meta_refresh_target(soup, base_url=info.get("url") or u)
        if nxt:
            info2, soup2, raw2 = _fetch_full(nxt, ua=SAFE_UA, cap=DARKWEB_ARTICLE_BYTES)
            if info2.get("ok"):
                info, soup, raw = info2, soup2, raw2

    if not info.get("ok"):
        info3, soup3, raw3 = _fetch_full(u, ua=TB_UA, cap=DARKWEB_ARTICLE_BYTES)
        if info3.get("ok"):
            info, soup, raw = info3, soup3, raw3
        elif soup3:
            nxt = _find_meta_refresh_target(soup3, base_url=info3.get("url") or u)
            if nxt:
                info4, soup4, raw4 = _fetch_full(nxt, ua=TB_UA, cap=DARKWEB_ARTICLE_BYTES)
                if info4.get("ok"):
                    info, soup, raw = info4, soup4, raw4

    if not info.get("ok"):
        return Response(info, status=502)

    article = _safe_html_article(raw)
    return Response({
        "ok": True,
        "source": info.get("url") or u,
        "title": article["title"],
        "text": article["text"],
        "html": article["html"],
        "bytes": len(raw),
        "disclaimer": "Fetched via Tor; scripts/styles/images/iframes stripped."
    }, status=200)


# --- Small utils ---
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

# --- DNS helpers ---
def dns_query(domain: str, rtype: str) -> List[str]:
    try:
        resolver = dns.resolver.Resolver()
        resolver.lifetime = DNS_TIMEOUT
        resolver.timeout = DNS_TIMEOUT
        answers = resolver.resolve(domain, rtype)
        return [r.to_text().strip().rstrip(".") for r in answers]
    except Exception:
        return []

def parse_spf(txt_records: List[str]) -> Optional[str]:
    for t in txt_records:
        if t.lower().startswith("v=spf1"):
            return t
    return None

def get_dmarc(domain: str) -> Optional[str]:
    txt = dns_query(f"_dmarc.{domain}", "TXT")
    for t in txt:
        if t.lower().startswith("v=dmarc1"):
            return t
    return None

# --- CT helper ---
def crtsh_subdomains(domain: str, limit: int = 100) -> List[str]:
    url = f"https://crt.sh/?q=%25.{domain}&output=json"
    try:
        r = requests.get(url, timeout=HTTP_TIMEOUT)
        if r.status_code != 200:
            return []
        data = r.json()
        names = []
        for row in data[:300]:
            name_value = row.get("name_value", "")
            for n in name_value.split("\n"):
                n = n.strip().lower().rstrip(".")
                if n and (n.endswith(f".{domain}") or n == domain):
                    names.append(n)
        names = [n for n in uniq(names) if n != domain]
        return names[:limit]
    except Exception:
        return []

# --- GeoIP helper ---
def ip_geo(ip: str) -> Optional[Dict[str, Any]]:
    try:
        r = requests.get(
            f"http://ip-api.com/json/{ip}?fields=status,country,org,as,query",
            timeout=HTTP_TIMEOUT,
        )
        j = r.json()
        if j.get("status") == "success":
            return {"country": j.get("country"), "org": j.get("org"), "asn": j.get("as")}
    except Exception:
        pass
    return None

# --- Tor session & preview ---
def _tor_session(ua: str = SAFE_UA) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": ua,
        "Accept": SAFE_ACCEPT,
        "Accept-Language": SAFE_ALANG,
    })
    s.proxies = {"http": TOR_SOCKS_URL, "https": TOR_SOCKS_URL}
    s.max_redirects = 3
    return s

def _safe_html_preview(raw: bytes) -> Dict[str, str]:
    try:
        text = raw.decode("utf-8", errors="ignore")
    except Exception:
        text = raw.decode("latin-1", errors="ignore")

    soup = BeautifulSoup(text, "html.parser")

    # Strip only scripts/styles (keep <noscript>)
    for tag in soup(["script", "style"]):
        tag.decompose()

    # Title candidates
    title = ""
    if soup.title:
        title = soup.title.get_text(strip=True)
    if not title:
        ogt = soup.find("meta", attrs={"property": "og:title"}) or soup.find("meta", attrs={"name": "og:title"})
        if ogt and ogt.get("content"):
            title = ogt["content"].strip()

    # Snippet from visible text
    body = soup.body or soup
    snippet = " ".join(body.get_text(separator=" ").split())

    # Fallbacks
    if not snippet:
        nos = soup.find_all("noscript")
        if nos:
            snippet = " ".join(" ".join(n.get_text(" ", strip=True) for n in nos).split())
    if not snippet:
        desc = (soup.find("meta", attrs={"name": "description"})
                or soup.find("meta", attrs={"property": "og:description"}))
        if desc and desc.get("content"):
            snippet = desc["content"].strip()
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(" ", strip=True)

    return {"title": title[:200], "snippet": (snippet or "")[:500]}

def _find_meta_refresh_target(soup: BeautifulSoup, base_url: str) -> Optional[str]:
    """Parse <meta http-equiv='refresh' content='N;url=...'> and return absolute URL (same host only)."""
    m = soup.find("meta", attrs={"http-equiv": re.compile("^refresh$", re.I)})
    if not m:
        return None
    content = m.get("content") or ""
    # examples: "0;url=/home" or "5; URL = http://host/path"
    m2 = re.search(r"url\s*=\s*([^;]+)$", content, re.I)
    if not m2:
        return None
    target = m2.group(1).strip().strip("'\"")
    if not target:
        return None
    absu = urljoin(base_url, target)
    try:
        u0 = urlparse(base_url)
        u1 = urlparse(absu)
        # only follow if same host and http(s)
        if u0.hostname and u1.hostname and u0.hostname == u1.hostname and u1.scheme in ("http", "https"):
            return absu
    except Exception:
        pass
    return None

def _fetch_once(url: str, ua: str) -> Tuple[Dict[str, Any], Optional[BeautifulSoup], bytes]:
    """Single GET through Tor with given UA; returns info dict, soup, raw."""
    try:
        with _tor_session(ua=ua) as s:
            r = s.get(url, timeout=DARKWEB_FETCH_TIMEOUT, allow_redirects=True)
            ct = (r.headers.get("Content-Type") or "").lower()
            raw = r.content[:DARKWEB_MAX_BYTES]
            # Relax: only reject if CT is present and clearly non-HTML
            if ct and ("text/html" not in ct and "application/xhtml" not in ct and "text/plain" not in ct):
                info = {"ok": False, "error": f"Non-HTML content ({ct})", "url": url}
                if DARKWEB_DEBUG:
                    info.update({"status": r.status_code, "content_type": ct, "bytes": len(raw)})
                return info, None, raw
            # Build soup for meta-refresh detection
            try:
                soup = BeautifulSoup(raw.decode("utf-8", errors="ignore") or raw.decode("latin-1", errors="ignore"),
                                     "html.parser")
            except Exception:
                soup = BeautifulSoup("", "html.parser")
            preview = _safe_html_preview(raw)
            ok = bool(preview.get("title") or preview.get("snippet"))
            info = {"ok": ok, "url": r.url, **preview}
            if not ok:
                info["error"] = "Empty HTML/preview"
            if DARKWEB_DEBUG:
                info.update({"status": r.status_code, "content_type": ct or "", "bytes": len(raw)})
                # tiny safe sample (no binary spam)
                sample = (raw[:200].decode("utf-8", "ignore") or raw[:200].decode("latin-1", "ignore")).replace("\r", "")
                info["sample"] = sample
            return info, soup, raw
    except Exception as e:
        info = {"ok": False, "error": str(e), "url": url}
        return info, None, b""

def _tor_fetch_preview(url: str) -> Dict[str, Any]:
    """
    Fetch a small HTML-only preview through Tor with:
      1) normal UA
      2) if empty: follow one meta-refresh (same host)
      3) if still empty: retry with Tor-Browser-like UA
    """
    # Pass 1: normal UA
    info, soup, _ = _fetch_once(url, ua=SAFE_UA)
    if info.get("ok"):
        return info

    # Try one meta-refresh if we got a soup and same-host target
    if soup:
        nxt = _find_meta_refresh_target(soup, base_url=info.get("url") or url)
        if nxt:
            info2, _, _ = _fetch_once(nxt, ua=SAFE_UA)
            if info2.get("ok"):
                return info2

    # Pass 2: UA retry
    info3, soup3, _ = _fetch_once(url, ua=TB_UA)
    if info3.get("ok"):
        return info3

    # One more meta-refresh on UA retry
    if soup3:
        nxt = _find_meta_refresh_target(soup3, base_url=info3.get("url") or url)
        if nxt:
            info4, _, _ = _fetch_once(nxt, ua=TB_UA)
            if info4.get("ok"):
                return info4

    # Give up
    return info3 if info3 else info

# --- Ahmia discovery ---
_AHMIA_SEARCH = "https://ahmia.fi/search/?q={q}"

def _ahmia_search_onions(query: str, limit: int = 10) -> List[str]:
    try:
        url = _AHMIA_SEARCH.format(q=urllib.parse.quote_plus(query))
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if ".onion" in href:
                if href.startswith("//"):
                    href = "http:" + href
                if href.startswith("http"):
                    links.append(href)
        out, seen = [], set()
        for h in links:
            if ".onion" in h and h not in seen:
                seen.add(h)
                out.append(h)
                if len(out) >= limit:
                    break
        return out
    except Exception:
        return []

# --- Core OSINT ---
def resolve_domain(domain: str) -> Dict[str, Any]:
    if domain.endswith(".onion"):
        return {
            "ips": [],
            "reverse_dns": {},
            "http": [],
            "tls": None,
            "dns": {"mx": [], "ns": [], "txt": [], "spf": None, "dmarc": None},
            "subdomains": [],
            "ip_geo": {},
        }

    ips: List[str] = []
    try:
        infos = socket.getaddrinfo(domain, None)
        for _, _, _, _, sockaddr in infos:
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

    mx = dns_query(domain, "MX")
    ns = dns_query(domain, "NS")
    txt = dns_query(domain, "TXT")
    spf = parse_spf(txt)
    dmarc = get_dmarc(domain)

    http_checks = []
    for scheme in ("https", "http"):
        url = f"{scheme}://{domain}"
        try:
            r = requests.head(url, timeout=HTTP_TIMEOUT, allow_redirects=True)
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
        with socket.create_connection((domain, 443), timeout=HTTP_TIMEOUT) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
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

    subdomains = crtsh_subdomains(domain, limit=100)

    ip_geo_map: Dict[str, Any] = {}
    for ip in ips[:5]:
        ip_geo_map[ip] = ip_geo(ip)

    return {
        "ips": ips,
        "reverse_dns": reverse_dns,
        "http": http_checks,
        "tls": tls_info,
        "dns": {"mx": mx, "ns": ns, "txt": txt, "spf": spf, "dmarc": dmarc},
        "subdomains": subdomains,
        "ip_geo": ip_geo_map,
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
        r = requests.get(url + "?d=404", timeout=HTTP_TIMEOUT)
        exists = (r.status_code == 200)
    except Exception:
        exists = None
    return {"domain": domain_from_email(email), "gravatar_url": url, "gravatar_exists": exists}

def username_checks(u: str) -> Dict[str, Any]:
    checks = []
    for site, pattern in SITES:
        url = pattern.format(u=u)
        ok: Optional[bool] = None
        status: Optional[int] = None
        try:
            r = requests.head(url, timeout=HTTP_TIMEOUT, allow_redirects=True)
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

# --- DRF views ---
class BurstThrottle(AnonRateThrottle):
    rate = "60/hour"

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
        result["domain"] = resolve_domain(result["email"]["domain"])
        return Response(result)

    if "." in q:
        result["type"] = "domain"
        result["domain"] = resolve_domain(q)
        return Response(result)

    result["type"] = "username"
    result["username"] = username_checks(q)
    return Response(result)

# --- Dark-web ---
def _normalize_onion_urls(q: str) -> List[str]:
    q = q.strip()
    host = None
    m = _ONION_HOST_RE.search(q)
    if m:
        host = m.group(0)
    else:
        try:
            u = urlparse(q if "://" in q else f"http://{q}")
            if u.hostname and _ONION_HOST_RE.search(u.hostname):
                host = u.hostname
        except Exception:
            pass
    if not host:
        return []
    try:
        u = urlparse(q if "://" in q else f"http://{q}")
        path = u.path or "/"
        if u.query:
            path += f"?{u.query}"
    except Exception:
        path = "/"
    base = host.rstrip("/")
    urls = [f"http://{base}{path}", f"https://{base}{path}"]
    return list(dict.fromkeys(urls))

@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle])
def darkweb_search(request):
    q = (request.GET.get("q") or "").strip()
    t = (request.GET.get("type") or "").strip().lower()
    if not q:
        return Response({"error": "missing q"}, status=400)

    previews: List[Dict[str, Any]] = []
    src = "ahmia"
    onion_urls = _normalize_onion_urls(q)
    if onion_urls:
        for u in onion_urls:
            previews.append(_tor_fetch_preview(u))
        src = "direct"
    else:
        query = f"\"{q}\"" if t in ("email", "domain") else (f"\"{q}\"" if len(q) <= 32 else q[:32])
        for url in _ahmia_search_onions(query, limit=10):
            if ".onion" in url:
                previews.append(_tor_fetch_preview(url))

    ok_previews = [p for p in previews if p.get("ok")]
    if ok_previews:
        previews = ok_previews

    def _h(s: str) -> str:
        try:
            return hashlib.sha256((s or "").encode()).hexdigest()[:16]
        except Exception:
            return ""

    # Optionally trim debug fields for non-debug mode
    if not DARKWEB_DEBUG:
        for p in previews:
            for k in ("status", "content_type", "bytes", "sample"):
                if k in p:
                    p.pop(k, None)

    return Response({
        "query": q,
        "type": t or "auto",
        "count": len(previews),
        "results": [{
            "url": p.get("url"),
            "url_hash": _h(p.get("url")),
            "ok": p.get("ok", False),
            "title": p.get("title", ""),
            "snippet": p.get("snippet", ""),
            "error": p.get("error"),
            **({ "status": p.get("status"), "content_type": p.get("content_type"),
                 "bytes": p.get("bytes"), "sample": p.get("sample")} if DARKWEB_DEBUG else {})
        } for p in previews],
        "source": src,
        "disclaimer": "Previews are small HTML excerpts fetched via Tor. Images/scripts are never fetched.",
    })
