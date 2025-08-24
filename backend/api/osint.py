from django.http import JsonResponse
from django.views.decorators.http import require_GET

import ipaddress
import socket
import re
import time
import os
import string
from urllib.parse import urlparse, urlunparse, urljoin

import requests
from requests.exceptions import RequestException
import tldextract

# Optional DNS
try:
    import dns.resolver
    HAVE_DNSPY = True
except Exception:
    HAVE_DNSPY = False

# HTML helpers
try:
    from bs4 import BeautifulSoup
    HAVE_BS4 = True
except Exception:
    HAVE_BS4 = False

try:
    import bleach
    HAVE_BLEACH = True
except Exception:
    HAVE_BLEACH = False


# ---------------------- Config ----------------------

# Tor proxy (SOCKS over hostname). For Tor Browser use 9150:
#   export TOR_SOCKS=socks5h://127.0.0.1:9150
TOR_PROXY = os.environ.get("TOR_SOCKS", "socks5h://127.0.0.1:9050")

UA = {"User-Agent": "code_graph_explorer-osint/0.5 (+local)"}

MAX_PREVIEW_BYTES = int(os.environ.get("OSINT_PREVIEW_KB", "64")) * 1024
MAX_FULL_BYTES    = int(os.environ.get("OSINT_FULL_KB",    "512")) * 1024

# Private networks to block (SSRF guard for clearnet)
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

PRINTABLE = set(string.printable) | {"\n", "\r", "\t"}


# ---------------------- Helpers ----------------------

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
    low = (host or "").lower()
    if low in ("localhost",) or low.endswith(".local"):
        return True
    ips = _resolve_host_ips(host)
    if not ips:
        return False
    return any(_is_private_ip(ip) for ip in ips)

def _is_onion(host: str) -> bool:
    return (host or "").lower().endswith(".onion")

def _coerce_url(target: str) -> str | None:
    target = (target or "").strip()
    if not target:
        return None
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

def _make_session(use_tor: bool) -> requests.Session:
    s = requests.Session()
    s.headers.update(UA)
    if use_tor:
        s.proxies = {"http": TOR_PROXY, "https": TOR_PROXY}
    return s

def _dns_records(host: str, timeout=4.0):
    if not HAVE_DNSPY:
        return {"available": False}
    out = {"available": True, "A": [], "AAAA": [], "NS": [], "MX": [], "TXT": []}
    resolver = dns.resolver.Resolver()
    resolver.lifetime = timeout
    resolver.timeout = timeout
    for rtype in ("A", "AAAA", "NS", "MX", "TXT"):
        try:
            ans = resolver.resolve(host, rtype)
            vals = []
            for rr in ans:
                if rtype == "MX":
                    vals.append(str(rr.exchange).rstrip(".") + " " + str(rr.preference))
                elif rtype == "TXT":
                    try:
                        vals.append("".join(rr.strings))
                    except Exception:
                        vals.append(rr.to_text().strip('"'))
                else:
                    vals.append(rr.to_text().rstrip("."))
            out[rtype] = vals[:10]
        except Exception:
            pass
    return out

def _read_text(resp: requests.Response, limit_bytes: int):
    """Stream up to limit_bytes of *text*. Returns (text, truncated_bool). Always closes resp."""
    collected = []
    total = 0
    try:
        for chunk in resp.iter_content(chunk_size=4096, decode_unicode=True):
            if not chunk:
                continue
            if isinstance(chunk, bytes):
                chunk = chunk.decode(resp.encoding or "utf-8", errors="replace")
            remaining = limit_bytes - total
            if remaining <= 0:
                break
            if len(chunk) > remaining:
                collected.append(chunk[:remaining])
                total += remaining
                break
            collected.append(chunk)
            total += len(chunk)
            if total >= limit_bytes:
                break
    finally:
        resp.close()
    return "".join(collected), (total >= limit_bytes)

def _to_visible_text(html: str) -> str:
    if HAVE_BS4:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript", "iframe", "object", "embed", "form"]):
            tag.extract()
        text = soup.get_text("\n")
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
    # fallback: crude
    no_tags = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    no_tags = re.sub(r"<style[\s\S]*?</style>", "", no_tags, flags=re.I)
    no_tags = re.sub(r"<[^>]+>", "", no_tags)
    no_tags = re.sub(r"\s+\n", "\n", no_tags)
    no_tags = re.sub(r"\n{3,}", "\n\n", no_tags)
    return no_tags.strip()

def is_mostly_text(s: str, min_ratio: float = 0.6) -> bool:
    # Loosen for onion / odd encodings
    min_ratio = 0.3
    if not s:
        return False
    good = sum((ch in PRINTABLE) for ch in s)
    return (good / max(1, len(s))) >= min_ratio

def _sanitize_html_fragment(html: str, base_url: str) -> str:
    """
    Returns a safe HTML fragment:
      - removes scripts/iframes/forms
      - **keeps <noscript> text** (converted to <div>)
      - converts relative links to absolute
      - rewrites <img> to clickable links [image]
      - runs bleach allowlist for final safety (if available)
    """
    if not HAVE_BS4:
        # Last-resort: strip all tags to plain text pre
        txt = _to_visible_text(html)
        return f"<pre>{bleach.clean(txt) if HAVE_BLEACH else txt}</pre>"

    soup = BeautifulSoup(html, "html.parser")

    # Drop dangerous tags entirely (but keep noscript content)
    for t in soup(["script", "style", "iframe", "object", "embed", "form"]):
        t.decompose()

    # Convert <noscript> to harmless <div> with its text
    for ns in soup.find_all("noscript"):
        repl = soup.new_tag("div")
        repl.string = ns.get_text(" ", strip=True)
        ns.replace_with(repl)

    # Absolute-ize <a> links
    for a in soup.find_all("a", href=True):
        a["href"] = urljoin(base_url, a.get("href"))
        a["rel"] = "nofollow noopener"
        a["target"] = "_blank"

    # Replace <img> with link
    for img in soup.find_all("img", src=True):
        href = urljoin(base_url, img.get("src"))
        link = soup.new_tag("a", href=href, rel="nofollow noopener", target="_blank")
        link.string = "[image]"
        img.replace_with(link)

    # Minimal allowlist
    if HAVE_BLEACH:
        allowed_tags = [
            "a","p","div","span","ul","ol","li","strong","em","b","i","u",
            "blockquote","code","pre","br","hr","h1","h2","h3","h4","h5","h6","table","thead","tbody","tr","td","th"
        ]
        allowed_attrs = {
            "*": ["title"],
            "a": ["href","rel","target"],
            "td": ["colspan","rowspan"],
            "th": ["colspan","rowspan"],
            "div": ["class"],
            "span": ["class"],
        }
        cleaned = bleach.clean(str(soup), tags=allowed_tags, attributes=allowed_attrs, strip=True)
        return cleaned
    else:
        # No bleach: safer to return visible text
        return f"<pre>{_to_visible_text(str(soup))}</pre>"


# ---------------------- View ----------------------

@require_GET
def osint_scan(request):
    """
    GET /api/osint/scan?target=<url|domain>&use_tor=0|1&content=preview|full|html
      - require use_tor=1 for .onion
      - clearnet SSRF guard to block private/loopback
      - content modes:
          preview : ~64KB text (http.body_preview)
          full    : ~512KB text (http.body_text)
          html    : ~512KB **sanitized HTML** (http.body_html) + text fallback
    """
    raw = request.GET.get("target", "") or ""
    url = _coerce_url(raw)
    if not url:
        return JsonResponse({"ok": False, "error": "Provide a valid http/https URL or domain."}, status=400)

    content_mode = (request.GET.get("content") or "preview").lower()
    if content_mode in ("1", "true", "yes"):
        content_mode = "preview"
    if content_mode not in ("preview", "full", "html"):
        content_mode = "preview"

    use_tor = str(request.GET.get("use_tor", "0")).lower() in ("1", "true", "yes")

    parsed = urlparse(url)
    host = parsed.hostname or ""
    onion = _is_onion(host)
    base_url = f"{parsed.scheme}://{host}/"

    if onion and not use_tor:
        return JsonResponse({"ok": False, "error": "This is a .onion address. Set use_tor=1 to scan via Tor."}, status=400)

    if not onion and _block_if_private(host):
        return JsonResponse({"ok": False, "error": "Target resolves to a private/loopback address (blocked)."}, status=400)

    result = {
        "ok": True,
        "via_tor": bool(use_tor),
        "url": url,
        "hostname": host,
        "domain": tldextract.extract(host).registered_domain if not onion else host,
        "ips": [] if onion else _resolve_host_ips(host),
        "http": {},
        "robots": {"present": False, "status": None, "size": None, "sitemaps": []},
        "sitemap": {"present": False, "status": None},
        "dns": {} if onion else _dns_records(host),
        "timing_ms": {},
    }

    sess = _make_session(use_tor)

    # ---- Fetch with onion HTTPS→HTTP fallback ----
    t0 = time.time()
    r = None
    used_url = url
    try:
        r = sess.get(url, timeout=16, allow_redirects=True, stream=True)
    except RequestException as e:
        msg = str(e)
        if onion and parsed.scheme == "https":
            # Retry with http://
            try:
                alt = urlunparse(("http", parsed.netloc, parsed.path or "/", parsed.params, parsed.query, parsed.fragment))
                r = sess.get(alt, timeout=16, allow_redirects=True, stream=True)
                used_url = alt
                result["note"] = "HTTPS on .onion failed; fell back to HTTP."
            except Exception as e2:
                fail = str(e2)
                if use_tor and "SOCKS" in fail.upper():
                    fail += f" (Tor may not be running at {TOR_PROXY})"
                result["http"] = {"error": fail[:300]}
                result["timing_ms"]["fetch"] = int((time.time() - t0) * 1000)
                # Done — cannot proceed without a body
                resp = JsonResponse(result)
                resp["X-Content-Type-Options"] = "nosniff"
                resp["Content-Security-Policy"] = "default-src 'none'; img-src data:; style-src 'self' 'unsafe-inline';"
                return resp
        else:
            if use_tor and "SOCKS" in msg.upper():
                msg += f" (Tor may not be running at {TOR_PROXY})"
            result["http"] = {"error": msg[:300]}
            result["timing_ms"]["fetch"] = int((time.time() - t0) * 1000)
            resp = JsonResponse(result)
            resp["X-Content-Type-Options"] = "nosniff"
            resp["Content-Security-Policy"] = "default-src 'none'; img-src data:; style-src 'self' 'unsafe-inline';"
            return resp

    # We have a response
    ct = r.headers.get("Content-Type", "") or ""
    ctl = ct.lower()
    result["http"] = {
        "status": r.status_code,
        "redirects": [h.headers.get("Location") for h in r.history if getattr(h, "is_redirect", False)],
        "server": r.headers.get("Server"),
        "content_type": ct,
    }
    result["url_effective"] = used_url

    # bytes cap based on mode
    limit = MAX_PREVIEW_BYTES if content_mode == "preview" else MAX_FULL_BYTES

    body_snippet, truncated = _read_text(r, limit)

    # Title if HTML-ish
    if "text/html" in ctl or "<html" in body_snippet[:2048].lower():
        result["http"]["title"] = _extract_title(body_snippet)

    # ---- Content modes ----
    if content_mode in ("preview", "full"):
        # Text-only view
        if "text/html" in ctl or "<html" in body_snippet[:2048].lower():
            visible = _to_visible_text(body_snippet)
            if visible and is_mostly_text(visible):
                key = "body_preview" if content_mode == "preview" else "body_text"
                result["http"][key] = visible
                result["http"]["truncated"] = bool(truncated)
        else:
            if body_snippet and is_mostly_text(body_snippet):
                key = "body_preview" if content_mode == "preview" else "body_text"
                result["http"][key] = body_snippet
                result["http"]["truncated"] = bool(truncated)

    elif content_mode == "html":
        # Sanitized HTML fragment + plain-text fallback
        frag = _sanitize_html_fragment(body_snippet, base_url)
        result["http"]["body_html"] = frag
        result["http"]["truncated"] = bool(truncated)
        txt = _to_visible_text(body_snippet)
        if txt and txt.strip():
            result["http"]["body_text"] = txt

    result["timing_ms"]["fetch"] = int((time.time() - t0) * 1000)

    # robots.txt (best-effort)
    robots_url = f"{urlparse(used_url).scheme}://{host}/robots.txt"
    t1 = time.time()
    try:
        rr = sess.get(robots_url, timeout=8, allow_redirects=True)
        result["robots"]["status"] = rr.status_code
        if rr.status_code == 200:
            result["robots"]["present"] = True
            result["robots"]["size"] = len(rr.content)
            maps = []
            for line in rr.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    maps.append(line.split(":", 1)[1].strip())
            result["robots"]["sitemaps"] = maps[:10]
    except Exception:
        pass
    result["timing_ms"]["robots"] = int((time.time() - t1) * 1000)

    # sitemap quick check if needed
    if not result["robots"]["sitemaps"]:
        sm_url = f"{urlparse(used_url).scheme}://{host}/sitemap.xml"
        try:
            sm = sess.head(sm_url, timeout=6, allow_redirects=True)
            result["sitemap"]["status"] = sm.status_code
            result["sitemap"]["present"] = sm.status_code == 200
        except Exception:
            pass

    resp = JsonResponse(result)
    # Tight CSP for any HTML fragment you might render
    resp["X-Content-Type-Options"] = "nosniff"
    resp["Content-Security-Policy"] = "default-src 'none'; img-src data:; style-src 'self' 'unsafe-inline';"
    return resp
