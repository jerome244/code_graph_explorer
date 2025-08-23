# Dark Web add-on (beginner-friendly, text-only)


This adds a simple, **safe** dark-web dimension to your OSINT app:


- Fetch a single `.onion` page **via Tor SOCKS** (text-only; no files/images).
- Store pages in your Django DB.
- Search saved pages from your Next.js UI.


> **Safety:** Only crawl legal, reputable sites. Keep it slow. Avoid downloading attachments or images.


---


## 1) Backend (Django)


1. Copy `backend/darkweb` folder into your repo's `backend/`.
2. Add to `INSTALLED_APPS` in `backend/config/settings.py`:
```python
INSTALLED_APPS += ["darkweb"]
# Optional: set Tor proxy
TOR_SOCKS_PROXY = "socks5h://127.0.0.1:9050"
