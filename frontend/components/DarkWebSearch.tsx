"use client";

import { useMemo, useState } from "react";

type Page = {
  url: string;
  title?: string;
  text?: string;
  fetched_at?: string;
  domain?: string;
};

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" };
const small: React.CSSProperties = { fontSize: 12, color: "#64748b" };
const label: React.CSSProperties = { fontSize: 12, color: "#475569" };
const chip: React.CSSProperties = { background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 6px" };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 240, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" };
const btn: React.CSSProperties = { padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function DarkWebSearch() {
  const [onionUrl, setOnionUrl] = useState("http://exampleonion.onion/");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [lastCrawl, setLastCrawl] = useState<Page | null>(null);
  const [results, setResults] = useState<Page[] | null>(null);

  const tzFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" });
    } catch {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
  }, []);

  async function crawl() {
    setBusy(true);
    setMsg("Crawling via Tor…");
    setLastCrawl(null);
    try {
      const r = await fetch(`${API_BASE}/api/darkweb/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: onionUrl }),
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data: Page = await r.json();
      setLastCrawl(data);
      setMsg("Done.");
    } catch (e: any) {
      setMsg(e.message || "Crawl failed");
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    setBusy(true);
    setMsg("Searching index…");
    setResults(null);
    try {
      const r = await fetch(`${API_BASE}/api/darkweb/search?q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      const arr: Page[] = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
      setResults(arr);
      setMsg(`Found ${arr.length} result(s).`);
    } catch (e: any) {
      setMsg(e.message || "Search failed");
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    try {
      navigator.clipboard.writeText(text);
    } catch {}
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <strong>Dark Web (text-only via Tor)</strong>
        <span style={{ ...small, color: busy ? "#ea580c" : "#64748b" }}>{busy ? "Working…" : msg}</span>
      </div>

      {/* Crawl */}
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <label style={label}>Onion URL</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={onionUrl}
            onChange={(e) => setOnionUrl(e.target.value)}
            placeholder="http://… .onion/"
            style={inputStyle}
          />
          <button onClick={crawl} style={btn}>Crawl</button>
        </div>
        <div style={small}>Fetched through Django using your Tor proxy (SOCKS).</div>

        {lastCrawl && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
            <div style={{ fontWeight: 600 }}>
              {lastCrawl.title || "(no title)"}{" "}
              <span style={{ color: "#64748b" }}>• {lastCrawl.url}</span>
            </div>
            <div style={{ ...small, marginTop: 4 }}>
              Crawled: {lastCrawl.fetched_at ? tzFmt.format(new Date(lastCrawl.fetched_at)) : "—"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#334155", maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap" }}>
              {(lastCrawl.text || "").slice(0, 2000) || "(empty)"}{(lastCrawl.text || "").length > 2000 ? "…" : ""}
            </div>
            <div style={{ marginTop: 6 }}>
              <button onClick={() => copy(lastCrawl.text || "")} style={{ ...btn, padding: "4px 8px" }}>
                Copy text
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <label style={label}>Search indexed pages</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="keyword, phrase, domain…"
            style={inputStyle}
          />
          <button onClick={search} style={btn}>Search</button>
        </div>

        {Array.isArray(results) && (
          results.length === 0 ? (
            <div style={small}>No results.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
              {results.slice(0, 20).map((p, i) => (
                <div key={`${p.url}:${i}`} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    {p.title || "(no title)"}{" "}
                    <span style={{ color: "#64748b" }}>• {p.url}</span>
                  </div>
                  <div style={{ ...small, marginTop: 4 }}>
                    {p.domain ? <span style={chip}>{p.domain}</span> : null}{" "}
                    {p.fetched_at ? ` · ${tzFmt.format(new Date(p.fetched_at))}` : ""}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#334155", maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap" }}>
                    {(p.text || "").slice(0, 800) || "(empty)"}{(p.text || "").length > 800 ? "…" : ""}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                    <button onClick={() => copy(p.url)} style={{ ...btn, padding: "4px 8px" }}>Copy URL</button>
                    <button onClick={() => copy(p.text || "")} style={{ ...btn, padding: "4px 8px" }}>Copy excerpt</button>
                  </div>
                </div>
              ))}
              {results.length > 20 && <div style={small}>+{results.length - 20} more (refine your query)</div>}
            </div>
          )
        )}
      </div>

      <div style={{ marginTop: 8, ...small }}>
        Note: Onion links won’t open in a normal browser—use Tor Browser if you need to view them.
      </div>
    </div>
  );
}
