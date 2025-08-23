import re

RX = {
    "email": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    "ip":    re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    "btc":   re.compile(r"\b(?:bc1[0-9a-z]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b"),
    "xmr":   re.compile(r"\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b"),
    "pgp":   re.compile(r"-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]+?-----END PGP PUBLIC KEY BLOCK-----"),
    "url":   re.compile(r"https?://[^\s)>\"]+"),
    "domain":re.compile(r"\b(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}\b", re.I),
}

def extract_iocs(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {k: [] for k in RX.keys()}
    if not text:
        return out
    for kind, rx in RX.items():
        vals = rx.findall(text)
        # normalize a bit
        if kind in {"email", "domain"}:
            vals = [v.lower() for v in vals]
        # de-dup preserve order
        seen = set()
        uniq = []
        for v in vals:
            if v not in seen:
                uniq.append(v); seen.add(v)
        out[kind] = uniq
    return out
