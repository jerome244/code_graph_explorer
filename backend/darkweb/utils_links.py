# darkweb/utils_links.py
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

def internal_links(html: str, base_url: str, max_links=50):
    base_host = urlparse(base_url).netloc
    out = []
    soup = BeautifulSoup(html, "lxml")
    for a in soup.find_all("a", href=True):
        u = urljoin(base_url, a["href"])
        if urlparse(u).netloc == base_host:
            out.append(u.split("#")[0])
        if len(out) >= max_links:
            break
    # de-dup preserve order
    seen, uniq = set(), []
    for u in out:
        if u not in seen: uniq.append(u); seen.add(u)
    return uniq
