// frontend/app/osint/page.tsx
"use client";

import React, { useState } from "react";

type OsintResponse = {
  type: "domain" | "ip" | "email" | "username" | "unknown";
  query: string;
  domain?: {
    ips: string[];
    reverse_dns: Record<string, string | null>;
    http?: {
      url: string;
      ok: boolean;
      status?: number;
      server?: string | null;
      location?: string | null;
      content_type?: string | null;
    }[];
    tls?: {
      subject?: Record<string, string>;
      issuer?: Record<string, string>;
      not_before?: string | null;
      not_after?: string | null;
    } | null;
    // existing page renders optional fields like dns, ip_geo, subdomains via (data.domain as any)
  };
  ip?: {
    ptr?: string | null;
  };
  email?: {
    domain: string;
    gravatar_url: string;
    gravatar_exists: boolean | null;
  };
  username?: {
    checks: { site: string; url: string; exists: boolean | null; status?: number | null }[];
  };
  error?: string;
};

type DarkResult = {
  url: string;
  url_hash: string;
  ok: boolean;
  title: string;
  snippet: string;
  error?: string;
};

type DarkWebResponse = {
  count: number;
  results: DarkResult[];
  type: OsintResponse["type"] | "auto";
  query: string;
  source: string;
  disclaimer: string;
};

export default function OsintPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OsintResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // NEW: dark web toggle + state
  const [includeDark, setIncludeDark] = useState(false);
  const [darkLoading, setDarkLoading] = useState(false);
  const [dark, setDark] = useState<DarkWebResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setData(null);
    setDark(null);
    const q = query.trim();
    if (!q) {
      setErr("Please enter a domain, IP, email, or username.");
      return;
    }
    setLoading(true);
    try {
      // Clear-web scan (your existing endpoint, unchanged)
      const r = await fetch("/api/osint/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      const json = (await r.json()) as OsintResponse;
      if (!r.ok) {
        setErr(json?.error || `Request failed (${r.status}).`);
        return;
      }
      setData(json);

      // Optional dark-web lookup (GET) using detected type from clear-web pass
      if (includeDark) {
        setDarkLoading(true);
        try {
          const t = json?.type ?? "unknown";
          const resp = await fetch(
            `/api/osint/darkweb/?q=${encodeURIComponent(q)}&type=${encodeURIComponent(t)}`,
            { cache: "no-store" }
          );
          const dj = (await resp.json()) as DarkWebResponse;
          if (resp.ok) {
            setDark(dj);
          } else {
            setDark({
              count: 0,
              results: [],
              type: t,
              query: q,
              source: "ahmia",
              disclaimer: dj?.disclaimer || "Dark-web lookup failed.",
            });
          }
        } catch (e) {
          setDark({
            count: 0,
            results: [],
            type: json?.type ?? "unknown",
            query: q,
            source: "ahmia",
            disclaimer: "Dark-web lookup failed.",
          });
        } finally {
          setDarkLoading(false);
        }
      }
    } catch (e: any) {
      setErr(e?.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>OSINT</h1>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>
        Enter a <strong>domain</strong>, <strong>IP</strong>, <strong>email</strong>, or <strong>username</strong>.
        We’ll resolve DNS, try HTTP/TLS, and do a few lightweight checks.
      </p>

      <form
        onSubmit={onSubmit}
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ex: example.com, 1.1.1.1, alice@example.com, octocat"
          style={{
            flex: 1,
            minWidth: 260,
            padding: "12px 14px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            fontSize: 16,
          }}
        />
        <label
          title="Query onion directories and fetch small HTML previews via Tor (text-only, capped)."
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={includeDark}
            onChange={(e) => setIncludeDark(e.target.checked)}
          />
          Include dark web
        </label>
        <button
          disabled={loading}
          type="submit"
          style={{
            padding: "12px 16px",
            background: "#111827",
            color: "white",
            borderRadius: 8,
            fontWeight: 700,
            border: "none",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Scanning…" : "Scan"}
        </button>
      </form>

      {err && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {err}
        </div>
      )}

      {data && <Results data={data} />}

      {/* Dark-web results section with "Show more" */}
      {includeDark && (
        <div style={{ marginTop: 16 }}>
          <Card title="Dark-web results">
            {darkLoading && <div>Querying Ahmia & fetching onion previews via Tor…</div>}
            {!darkLoading && dark && dark.count === 0 && (
              <div>No onion hits found.</div>
            )}
            {!darkLoading && dark && dark.results.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
                {dark.results.map((r, idx) => (
                  <DarkWebItem key={idx} url={r.url} title={r.title} snippet={r.snippet} />
                ))}
              </ul>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
              Previews are small HTML excerpts fetched via Tor. Images/scripts are never fetched.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function DarkWebItem({ url, title, snippet }: { url: string; title: string; snippet: string }) {
  const [loading, setLoading] = React.useState(false);
  const [full, setFull] = React.useState<{ title: string; html: string; text: string; source: string } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

async function loadFull() {
  setLoading(true); setErr(null);
  try {
    const r = await fetch(`/api/osint/darkweb/content?u=${encodeURIComponent(url)}`, { cache: "no-store" });
    const ct = r.headers.get("content-type") || "";
    const payload = ct.includes("application/json") ? await r.json() : { ok: false, error: await r.text() };

    if (!r.ok || !payload?.ok) {
      throw new Error(payload?.error || `HTTP ${r.status}`);
    }
    setFull(payload);
  } catch (e: any) {
    setErr(e?.message || "Failed to fetch content");
  } finally {
    setLoading(false);
  }
}


  return (
    <li
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        background: "#fafafa",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {title || "(no title)"}
      </div>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          wordBreak: "break-all",
          opacity: 0.85,
        }}
      >
        {url}
      </div>
      <p style={{ marginTop: 8 }}>{snippet}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={loadFull} disabled={loading} className="px-3 py-1 rounded-lg border">
          {loading ? "Loading…" : "Show more"}
        </button>
        <a href={url} className="px-3 py-1 rounded-lg border" target="_blank" rel="noreferrer">Open (Tor)</a>
      </div>
      {err && <div style={{ color: "#991b1b", marginTop: 6 }}>{err}</div>}
      {full && (
        <div className="prose prose-invert" style={{ marginTop: 12, maxHeight: "60vh", overflow: "auto" }}>
          {/* Already sanitized server-side (no scripts/styles/iframes/img). */}
          <div dangerouslySetInnerHTML={{ __html: full.html }} />
        </div>
      )}
    </li>
  );
}

function KeyVal({ k, v }: { k: string; v: any }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 14 }}>
      <div style={{ width: 160, color: "#6b7280" }}>{k}</div>
      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        {typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}
      </div>
    </div>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function Results({ data }: { data: OsintResponse }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card title="Overview">
        <div style={{ display: "grid", gap: 8 }}>
          <KeyVal k="Query" v={data.query} />
          <KeyVal k="Type" v={data.type} />
        </div>
      </Card>

      {data.domain && (
        <Card title="Domain">
          <div style={{ display: "grid", gap: 8 }}>
            <KeyVal k="IPs" v={data.domain.ips} />
            <KeyVal k="Reverse DNS" v={data.domain.reverse_dns} />
            {(data.domain as any).ip_geo && <KeyVal k="IP Geo" v={(data.domain as any).ip_geo} />}
            {(data.domain as any).dns && (
              <>
                <KeyVal k="MX" v={(data.domain as any).dns.mx} />
                <KeyVal k="NS" v={(data.domain as any).dns.ns} />
                <KeyVal k="TXT" v={(data.domain as any).dns.txt} />
                <KeyVal k="SPF" v={(data.domain as any).dns.spf} />
                <KeyVal k="DMARC" v={(data.domain as any).dns.dmarc} />
              </>
            )}
            {data.domain.tls && <KeyVal k="TLS" v={data.domain.tls} />}
            {data.domain.http?.length ? (
              <div>
                <div style={{ color: "#6b7280", marginBottom: 6 }}>HTTP checks</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {data.domain.http.map((h, i) => (
                    <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                      <KeyVal k="URL" v={h.url} />
                      <KeyVal k="OK" v={h.ok} />
                      <KeyVal k="Status" v={h.status} />
                      <KeyVal k="Server" v={h.server} />
                      <KeyVal k="Content-Type" v={h.content_type} />
                      {h.location && <KeyVal k="Location" v={h.location} />}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {Array.isArray((data.domain as any).subdomains) && (data.domain as any).subdomains.length > 0 && (
              <div>
                <div style={{ color: "#6b7280", marginBottom: 6 }}>Subdomains (CT)</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {(data.domain as any).subdomains.map((s: string, idx: number) => (
                    <div key={idx} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{s}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {data.ip && (
        <Card title="IP">
          <KeyVal k="PTR" v={data.ip.ptr} />
        </Card>
      )}

      {data.email && (
        <Card title="Email">
          <KeyVal k="Domain" v={data.email.domain} />
          <KeyVal k="Gravatar URL" v={data.email.gravatar_url} />
          <KeyVal k="Gravatar exists" v={data.email.gravatar_exists} />
          {data.email.gravatar_exists ? (
            <img
              src={`${data.email.gravatar_url}?s=120`}
              alt="Gravatar"
              width={120}
              height={120}
              style={{ borderRadius: 8, marginTop: 8 }}
            />
          ) : null}
        </Card>
      )}

      {data.username && (
        <Card title="Username checks">
          <div style={{ display: "grid", gap: 8 }}>
            {data.username.checks.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <a href={c.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                  {c.site}
                </a>
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {c.exists === null ? "unknown" : c.exists ? "exists" : "not found"}
                  {typeof c.status === "number" ? ` (${c.status})` : ""}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.error && (
        <Card title="Server message">
          <div style={{ color: "#991b1b" }}>{data.error}</div>
        </Card>
      )}
    </div>
  );
}
