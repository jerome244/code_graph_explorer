import hashlib
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup, UnicodeDammit
import trafilatura

try:
    # Prefer the value you set in settings.py (e.g., socks5h://127.0.0.1:9150)
    from django.conf import settings  # type: ignore
    SETTINGS_TOR = getattr(settings, "TOR_SOCKS_PROXY", None)
except Exception:
    SETTINGS_TOR = None

DEFAULT_SOCKS = "socks5h://127.0.0.1:9150"  # sane default if settings/env not present


def fetch_via_tor(url: str, socks_url: str | None = None, timeout: int = 30) -> str:
    """
    Fetch an .onion (or clearnet) URL through Tor SOCKS proxy and return decoded HTML (unicode).
    - Uses socks5h so DNS is resolved through Tor.
    - Uses UnicodeDammit to fix mojibake like "CIAâs".
    """
    socks = socks_url or SETTINGS_TOR or DEFAULT_SOCKS

    s = requests.Session()
    s.proxies = {"http": socks, "https": socks}
    s.headers.update({
        "User-Agent": "osint-darkweb-starter/0.1 (+text-only crawler)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en;q=0.9",
    })

    r = s.get(url, timeout=timeout, allow_redirects=True)
    r.raise_for_status()

    # Robust decoding (fixes CIAâs → CIA’s)
    html = UnicodeDammit(r.content, is_html=True).unicode_markup or r.text
    return html


def extract_text_and_title(html: str) -> tuple[str, str]:
    """
    Returns (title, extracted_text).
    Uses trafilatura for readable text; falls back to soup.get_text if needed.
    """
    # Trafilatura can return None; add robust fallback
    extracted = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
        # favor_recall=True  # uncomment if you want more aggressive extraction
    ) or ""

    soup = BeautifulSoup(html, "lxml")
    title = (soup.title.string.strip() if soup.title and soup.title.string else "")[:300]

    # If trafilatura gave nothing, fall back to plain text
    if not extracted:
        extracted = soup.get_text("\n")

    return title, extracted


def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "ignore")).hexdigest()


def domain_from_url(url: str) -> str:
    return urlparse(url).netloc
