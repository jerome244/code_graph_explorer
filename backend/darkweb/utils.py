import hashlib
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
import trafilatura

DEFAULT_SOCKS = "socks5h://127.0.0.1:9050"

def fetch_via_tor(url: str, socks_url: str | None = None, timeout: int = 90) -> str:
    socks = socks_url or DEFAULT_SOCKS
    s = requests.Session()
    s.proxies = {"http": socks, "https": socks}
    s.headers.update({"User-Agent": "osint-darkweb-starter/0.1"})
    r = s.get(url, timeout=timeout)
    r.raise_for_status()
    return r.text

def extract_text_and_title(html: str) -> tuple[str, str]:
    extracted = trafilatura.extract(html, include_comments=False, include_tables=False) or ""
    soup = BeautifulSoup(html, "lxml")
    title = (soup.title.string.strip() if soup.title and soup.title.string else "")[:300]
    return title, extracted

def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8","ignore")).hexdigest()

def domain_from_url(url: str) -> str:
    return urlparse(url).netloc