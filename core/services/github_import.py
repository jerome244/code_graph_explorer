import re
import requests

def parse_repo_input(repo_or_url: str) -> tuple[str, str]:
    """
    Accepts 'owner/name' or a GitHub URL (with optional .git, tree/<ref>, etc.)
    Returns (owner, name).
    """
    s = repo_or_url.strip()
    m = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/#\.]+)", s, re.I)
    if m:
        return m.group("owner"), m.group("repo")
    if "/" in s and len(s.split("/")) == 2:
        owner, repo = s.split("/")
        return owner.strip(), repo.strip()
    raise ValueError("Invalid GitHub repository identifier. Use 'owner/repo' or full URL.")

def fetch_github_zip(owner: str, repo: str, ref: str | None = None, token: str | None = None, timeout=30):
    """
    Downloads a zipball archive via GitHub API. Works for public repos; private requires token.
    Returns (bytes, meta: dict).
    """
    ref_part = ref or ""
    url = f"https://api.github.com/repos/{owner}/{repo}/zipball/{ref_part}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "holberton-demoday-app",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    r = requests.get(url, headers=headers, stream=True, timeout=timeout)
    if r.status_code >= 400:
        raise RuntimeError(f"GitHub download failed: {r.status_code} {r.text[:200]}")

    content = b"".join(r.iter_content(chunk_size=1024 * 128))
    # best-effort SHA from Content-Disposition: filename=owner-repo-<sha>.zip
    disp = r.headers.get("Content-Disposition", "")
    sha = None
    m = re.search(r"-([0-9a-f]{7,40})\.zip", disp, re.I)
    if m:
        sha = m.group(1)

    meta = {
        "owner": owner, "repo": repo, "ref": ref, "sha": sha,
        "etag": r.headers.get("ETag"),
        "content_length": int(r.headers.get("Content-Length") or 0),
        "source_url": url,
    }
    return content, meta
