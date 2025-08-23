"use client";

import { useEffect, useMemo, useState } from "react";

// Result row (from /search)
type SearchResult = {
  id: number;
  url: string;
  title?: string;
  domain?: string;
  snippet?: string;
  fetched_at?: string;
  entities?: { email?: string[]; ip?: string[]; btc?: string[]; xmr?: string[] };
};

// Full page (from /pages/:id)
type PageDetail = {
  id: number;
  url: string;
  title?: string;
  text?: string;
  fetched_at?: string;
  domain?: string;
  sha256?: string;
};

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" };
const small: React.CSSProperties = { fontSize: 12, color: "#64748b" };
const label: React.CSSProperties = { fontSize: 12, color: "#475569" };
const chip: React.CSSProperties = { background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 6px" };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 240, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" };
const btn: React.CSSProperties = { padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" };
const miniBtn: React.CSSProperties = { padding: "2px 6px", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontSize: 12 };

// ---- helpers with timeout + clearer errors ----
async function getJSON(url: string, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} – ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(to);
  }
}

async function postJSON(url: string, body: any, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} – ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(to);
  }
}

export default function DarkWebSearch() {
  const [onionUrl, setOnionUrl] = useState(
    "http://ciadotgov4sjwlzihbbgxnqg3xiyrg7so2r2o3lt5wz5ypk4sxyjstad.onion/"
  );
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [lastCrawl, setLastCrawl] = useState<PageDetail | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<PageDetail | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  // Alert UI state
  const [alertName, setAlertName] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [alertWebhook, setAlertWebhook] = useState("");
  const [alertFreq, setAlertFreq] = useState<"15m" | "hourly" | "daily">("hourly");

  useEffect(() => {
    if (typeof window !== "undefined") console.log("Using Next rewrite proxy → /api/*");
  }, []);

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
      const data: PageDetail = await postJSON(`/api/darkweb/crawl`, { url: onionUrl });
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
      const data = await getJSON(`/api/darkweb/search?q=${encodeURIComponent(q)}`);
      const arr: SearchResult[] = Array.isArray(data) ? data : [];
      setResults(arr);
      setMsg(`Found ${arr.length} result(s).`);
    } catch (e: any) {
      setMsg(e.message || "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function searchByEntity(kind: string, value: string) {
    setBusy(true);
    setMsg(`Filtering by ${kind}…`);
    setResults(null);
    try {
      const data = await getJSON(
        `/api/darkweb/search?entity_kind=${encodeURIComponent(kind)}&entity_value=${encodeURIComponent(value)}`
      );
      const arr: SearchResult[] = Array.isArray(data) ? data : [];
      setResults(arr);
      setQ(value);
      setMsg(`Found ${arr.length} result(s).`);
    } catch (e: any) {
      setMsg(e.message || "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function createAlert(kind?: string, value?: string) {
    setBusy(true);
    setMsg("Creating alert…");
    try {
      if (!alertEmail && !alertWebhook) {
        throw new Error("Provide an email or a webhook URL for notifications.");
      }
      const body: any = {
        name: alertName || `Alert: ${q || value || kind || "*"}`,
        q: q || "",
        entity_kind: kind || "",
        entity_value: value || "",
        domain_contains: "",
        frequency: alertFreq,
        notify_email: alertEmail || "",
        notify_webhook: alertWebhook || "",
      };
      await postJSON(`/api/darkweb/alerts`, body);
      setMsg("Alert created.");
    } catch (e: any) {
      setMsg(e.message || "Failed to create alert");
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(id: number) {
    setExpandedId(id);
    setExpandedDoc(null);
    setLoadingDoc(true);
    try {
      const data: PageDetail = await getJSON(`/api/darkweb/pages/${id}`);
      setExpandedDoc(data);
    } catch (e: any) {
      setExpandedDoc(null);
    } finally {
      setLoadingDoc(false);
    }
  }

  function copy(text: string) {
    try { navigator.clipboard.writeText(text); } catch {}
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
            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => copy(lastCrawl.text || "")} style={{ ...btn, padding: "4px 8px" }}>
                Copy text
              </button>
              {typeof (lastCrawl as any).id === "number" && (
                <button onClick={() => openDoc((lastCrawl as any).id)} style={{ ...btn, padding: "4px 8px" }}>
                  Read more
                </button>
              )}
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

        {/* Save alert for this search */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input value={alertName} onChange={e=>setAlertName(e.target.value)} placeholder="Alert name (optional)" style={{ ...inputStyle, minWidth: 180 }} />
          <input value={alertEmail} onChange={e=>setAlertEmail(e.target.value)} placeholder="Notify email (optional)" style={{ ...inputStyle, minWidth: 200 }} />
          <input value={alertWebhook} onChange={e=>setAlertWebhook(e.target.value)} placeholder="Notify webhook URL (optional)" style={{ ...inputStyle, minWidth: 260 }} />
          <select value={alertFreq} onChange={e=>setAlertFreq(e.target.value as any)} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
            <option value="15m">Every 15 min</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
          </select>
          <button onClick={()=>createAlert()} style={btn}>Save alert for this search</button>
        </div>

        {Array.isArray(results) &&
          (results.length === 0 ? (
            <div style={small}>No results.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
              {results.slice(0, 20).map((p) => (
                <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    {p.title || "(no title)"} <span style={{ color: "#64748b" }}>• {p.url}</span>
                  </div>
                  <div style={{ ...small, marginTop: 4 }}>
                    {p.domain ? <span style={chip}>{p.domain}</span> : null}{" "}
                    {p.fetched_at ? ` · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(p.fetched_at))}` : ""}
                  </div>

                  {/* entity chips + quick alert bells */}
                  {p.entities && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {(p.entities.email || []).map((v, i) => (
                        <div key={`e:${v}:${i}`} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button onClick={() => searchByEntity("email", v)} style={{ ...chip, cursor: "pointer" }}>
                            📧 {v}
                          </button>
                          <button title="Create alert for this email" onClick={() => createAlert("email", v)} style={miniBtn}>🔔</button>
                        </div>
                      ))}
                      {(p.entities.ip || []).map((v, i) => (
                        <div key={`ip:${v}:${i}`} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button onClick={() => searchByEntity("ip", v)} style={{ ...chip, cursor: "pointer" }}>
                            🧭 {v}
                          </button>
                          <button title="Create alert for this IP" onClick={() => createAlert("ip", v)} style={miniBtn}>🔔</button>
                        </div>
                      ))}
                      {(p.entities.btc || []).map((v, i) => (
                        <div key={`btc:${v}:${i}`} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button onClick={() => searchByEntity("btc", v)} style={{ ...chip, cursor: "pointer" }}>
                            ₿ {v.slice(0, 10)}…
                          </button>
                          <button title="Create alert for this BTC address" onClick={() => createAlert("btc", v)} style={miniBtn}>🔔</button>
                        </div>
                      ))}
                      {(p.entities.xmr || []).map((v, i) => (
                        <div key={`xmr:${v}:${i}`} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button onClick={() => searchByEntity("xmr", v)} style={{ ...chip, cursor: "pointer" }}>
                            ɱ {v.slice(0, 10)}…
                          </button>
                          <button title="Create alert for this XMR address" onClick={() => createAlert("xmr", v)} style={miniBtn}>🔔</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 6, fontSize: 13, color: "#334155", maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap" }}>
                    {(p.snippet || "").slice(0, 800) || "(empty)"}{(p.snippet || "").length > 800 ? "…" : ""}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => copy(p.url)} style={{ ...btn, padding: "4px 8px" }}>Copy URL</button>
                    <button onClick={() => copy(p.snippet || "")} style={{ ...btn, padding: "4px 8px" }}>Copy snippet</button>
                    <button onClick={() => openDoc(p.id)} style={{ ...btn, padding: "4px 8px" }}>Read more</button>
                  </div>
                </div>
              ))}
              {results.length > 20 && <div style={small}>+{results.length - 20} more (refine your query)</div>}
            </div>
          ))}
      </div>

      {/* Read more modal */}
      {expandedId !== null && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={() => { setExpandedId(null); setExpandedDoc(null); }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: "80vh", overflow: "auto", background: "white", borderRadius: 12, padding: 16 }}>
            {loadingDoc ? (
              <div>Loading…</div>
            ) : expandedDoc ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 18 }}>
                  {expandedDoc.title || expandedDoc.url}
                </div>
                <div style={{ ...small, marginTop: 4 }}>
                  {expandedDoc.domain ? <span style={chip}>{expandedDoc.domain}</span> : null}
                  {expandedDoc.fetched_at ? ` · ${tzFmt.format(new Date(expandedDoc.fetched_at))}` : ""}
                  {expandedDoc.sha256 ? ` · sha256:${expandedDoc.sha256.slice(0, 12)}…` : ""}
                </div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 13, color: "#334155" }}>
                  {expandedDoc.text || "(empty)"}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a href={expandedDoc.url} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none" }}>Open onion link (Tor)</a>
                  <button onClick={() => copy(expandedDoc.text || "")} style={{ ...btn, padding: "4px 8px" }}>Copy full text</button>
                </div>
              </>
            ) : (
              <div>Couldn’t load this page.</div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 8, ...small }}>
        Note: Onion links won’t open in a normal browser—use Tor Browser if you need to view them.
      </div>
    </div>
  );
}
