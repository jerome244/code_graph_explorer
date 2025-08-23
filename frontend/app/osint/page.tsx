"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// Graph viewer (Cytoscape)
const CytoscapeComponent = dynamic(() => import("react-cytoscapejs"), { ssr: false });

/* ===================== Types ===================== */
type DnsAnswer = { name: string; type: number; TTL?: number; data?: string };
type DnsBundle = {
  a?: DnsAnswer[];
  aaaa?: DnsAnswer[];
  mx?: DnsAnswer[];
  ns?: DnsAnswer[];
  txt?: DnsAnswer[];
  dmarc?: DnsAnswer[];
  errors?: string[];
  spf?: { present: boolean; record?: string } | null;
};

type Rdap = {
  handle?: string;
  ldhName?: string;
  status?: string[];
  events?: any[];
  nameservers?: { ldhName?: string }[];
  registrar?: string;
  error?: string;
};

type CtRow = { name: string };

type HttpInfo = {
  finalUrl: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  title?: string;
  techHints?: string[];
  error?: string;
};

type FaviconInfo = { base64Length?: number; mmh3?: number; urlTried?: string; error?: string };
type RobotsInfo = { url: string; status: number; text?: string; error?: string };
type IpInfo = { ip?: string; city?: string; region?: string; country?: string; country_name?: string; org?: string; asn?: string; error?: string };

type SubAgg = { count: number; rows: string[]; error?: string };
type HIBPBreach = {
  Name: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  PwnCount: number;
  DataClasses: string[];
  IsVerified: boolean;
};
type TLSReport = { status?: string; host?: string; endpoints?: any[]; error?: string };

// Cytoscape element types
type CyNode = { data: { id: string; label?: string; group?: string } };
type CyEdge = { data: { id: string; source: string; target: string } };

/* ===================== Styles ===================== */
const label: React.CSSProperties = { fontSize: 12, color: "#475569" };
const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" };
const small: React.CSSProperties = { fontSize: 12, color: "#64748b" };
const chip: React.CSSProperties = { background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 6px" };
const tag: React.CSSProperties = { background: "#eef2ff", border: "1px solid #e5e7eb", borderRadius: 999, padding: "2px 8px", fontSize: 12 };
const copyBtn: React.CSSProperties = { padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer", fontSize: 12 };
const Badge = ({ label }: { label: string }) => <span style={{ ...tag, background: "#ecfeff" }}>{label}</span>;

/* ===================== Component ===================== */
export default function OsintPage() {
  // Inputs
  const [domain, setDomain] = useState("example.com");
  const [url, setUrl] = useState("https://example.com");
  const [ip, setIp] = useState("1.1.1.1");
  const [email, setEmail] = useState("alice@example.com");

  // Results
  const [dns, setDns] = useState<DnsBundle | null>(null);
  const [rdap, setRdap] = useState<Rdap | null>(null);
  const [ct, setCt] = useState<CtRow[] | null>(null);
  const [subAgg, setSubAgg] = useState<SubAgg | null>(null);

  const [http, setHttp] = useState<HttpInfo | null>(null);
  const [secScore, setSecScore] = useState<{ score: number; outOf: number; notes: string[] } | null>(null);

  const [fav, setFav] = useState<FaviconInfo | null>(null);
  const [robots, setRobots] = useState<RobotsInfo | null>(null);
  const [ipinfo, setIpinfo] = useState<IpInfo | null>(null);

  const [breaches, setBreaches] = useState<HIBPBreach[] | null>(null);
  const [tls, setTls] = useState<TLSReport | null>(null);

  const [exif, setExif] = useState<Record<string, any> | null>(null);

  // LeakCheck (free alt to HIBP)
  const [leakcheck, setLeakcheck] = useState<{ found: boolean; raw: string } | { error: string } | null>(null);

  // Graph elements
  const [graphEls, setGraphEls] = useState<any[]>([]);

  // UI state
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const tzFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" });
    } catch {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
  }, []);

  /* ===================== Actions ===================== */
  async function runDomainProbe() {
    setBusy(true);
    setMsg("Scanning domain…");
    try {
      const [dnsRes, rdapRes, ctRes, subRes] = await Promise.all([
        fetch(`/api/osint/dns?domain=${encodeURIComponent(domain)}`).then((r) => r.json()),
        fetch(`/api/osint/rdap?domain=${encodeURIComponent(domain)}`).then((r) => r.json()),
        fetch(`/api/osint/ct?domain=${encodeURIComponent(domain)}`).then((r) => r.json()),
        fetch(`/api/osint/subdomains?domain=${encodeURIComponent(domain)}`).then((r) => r.json()),
      ]);
      setDns(dnsRes);
      setRdap(rdapRes);
      setCt(ctRes?.rows || []);
      setSubAgg(subRes);
      setGraphEls([]); // clear old graph
      setMsg("Done.");
    } catch (e: any) {
      setMsg(e.message || "Domain probe failed");
    } finally {
      setBusy(false);
    }
  }

  async function runUrlProbe() {
    setBusy(true);
    setMsg("Probing URL…");
    try {
      const [httpRes, favRes, robotsRes] = await Promise.all([
        fetch(`/api/osint/http?url=${encodeURIComponent(url)}`).then((r) => r.json()),
        fetch(`/api/osint/favicon-hash?url=${encodeURIComponent(url)}`).then((r) => r.json()),
        fetch(`/api/osint/robots?url=${encodeURIComponent(url)}`).then((r) => r.json()),
      ]);
      setHttp(httpRes);
      // add richer tech hints
      setHttp((prev) =>
        prev
          ? {
              ...prev,
              techHints: Array.from(new Set([...(prev.techHints || []), ...extraTechHints(prev.finalUrl, prev.headers || {})])),
            }
          : prev
      );
      setFav(favRes);
      setRobots(robotsRes);
      setSecScore(scoreSecurityHeaders(httpRes?.headers || {}));
      setMsg("Done.");
    } catch (e: any) {
      setMsg(e.message || "URL probe failed");
    } finally {
      setBusy(false);
    }
  }

  async function runIpProbe() {
    setBusy(true);
    setMsg("Looking up IP…");
    try {
      const data = await fetch(`/api/osint/ip?ip=${encodeURIComponent(ip)}`).then((r) => r.json());
      setIpinfo(data);
      setMsg("Done.");
    } catch (e: any) {
      setMsg(e.message || "IP probe failed");
    } finally {
      setBusy(false);
    }
  }

  async function runBreach() {
    setBusy(true);
    setMsg("Checking HIBP…");
    try {
      const data = await fetch(`/api/osint/hibp?email=${encodeURIComponent(email)}`).then((r) => r.json());
      setBreaches(data);
      setMsg(Array.isArray(data) ? `Found ${data.length} breach(es)` : "Done.");
    } catch (e: any) {
      setMsg(e.message || "Breach check failed");
    } finally {
      setBusy(false);
    }
  }

    // replace your runLeakCheck with this one
    async function runLeakCheck(q: string) {
    setBusy(true);
    setMsg("Calling LeakCheck (free)...");
    try {
        const qs = q.includes("@") ? `email=${encodeURIComponent(q)}` : `username=${encodeURIComponent(q)}`;
        const resp = await fetch(`/api/osint/leakcheck?${qs}`).then((r) => r.json());

        // Robust normalization across various LeakCheck shapes
        const found =
        resp?.found === true ||
        (resp?.success === true && Array.isArray(resp?.result) && resp.result.length > 0) ||
        (Array.isArray(resp) && resp.length > 0);

        setLeakcheck({ found, raw: JSON.stringify(resp) });
        setMsg(found ? "LeakCheck: possible hits" : "LeakCheck: none");
    } catch (e: any) {
        setLeakcheck({ error: e.message || "LeakCheck failed" });
        setMsg("LeakCheck error");
    } finally {
        setBusy(false);
    }
    }


  async function runTLS(startNew = false) {
    const host = safeHostFromUrl(url) || domain;
    if (!host) return;
    setBusy(true);
    setMsg(startNew ? "Starting SSL Labs scan…" : "Fetching SSL Labs cached report…");
    try {
      const q = new URLSearchParams({ host, startNew: startNew ? "on" : "off", fromCache: startNew ? "off" : "on" });
      const data = await fetch(`/api/osint/tls?${q.toString()}`, { cache: "no-store" }).then((r) => r.json());
      setTls(data);
      setMsg(`TLS status: ${data?.status || "?"}`);
    } catch (e: any) {
      setMsg(e.message || "TLS check failed");
    } finally {
      setBusy(false);
    }
  }

  // TLS polling while IN_PROGRESS
  useEffect(() => {
    if (!tls || !tls.status || tls.status === "READY" || tls.status === "ERROR") return;
    const t = window.setTimeout(() => runTLS(false), 5000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tls]);

  // EXIF (JPEG) — client-only; file never leaves the browser
  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    setExif(parseExif(buf));
  }

  /* ===================== Helpers ===================== */
  function copy(obj: any) {
    try {
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    } catch {}
  }

  function scoreSecurityHeaders(hdrs: Record<string, string>) {
    const h = (k: string) => hdrs?.[k] || hdrs?.[k.toLowerCase()] || hdrs?.[k.toUpperCase()];
    const notes: string[] = [];
    let score = 0,
      outOf = 6;

    if (h("strict-transport-security")) score++;
    else notes.push("Missing HSTS");
    const csp = h("content-security-policy");
    if (csp) score++;
    else notes.push("Missing Content-Security-Policy");
    const xfo = h("x-frame-options");
    if (xfo) score++;
    else notes.push("Missing X-Frame-Options");
    const xcto = h("x-content-type-options");
    if (xcto) score++;
    else notes.push("Missing X-Content-Type-Options");
    const refp = h("referrer-policy");
    if (refp) score++;
    else notes.push("Missing Referrer-Policy");
    const perm = h("permissions-policy") || h("feature-policy");
    if (perm) score++;
    else notes.push("Missing Permissions-Policy");

    if (csp && /\bunsafe-inline\b/i.test(csp)) notes.push("CSP allows 'unsafe-inline'");
    return { score, outOf, notes };
  }

  function headerRecommendations(hdrs: Record<string, string>) {
    const h = (k: string) => hdrs?.[k] || hdrs?.[k.toLowerCase()];
    const recs: { name: string; value: string; reason: string }[] = [];
    if (!h("strict-transport-security"))
      recs.push({
        name: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
        reason: "Force HTTPS",
      });
    if (!h("content-security-policy"))
      recs.push({
        name: "Content-Security-Policy",
        value: "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self';",
        reason: "Mitigate XSS/clickjacking",
      });
    if (!h("x-frame-options")) recs.push({ name: "X-Frame-Options", value: "DENY", reason: "Disallow framing" });
    if (!h("x-content-type-options"))
      recs.push({ name: "X-Content-Type-Options", value: "nosniff", reason: "Block MIME sniffing" });
    if (!h("referrer-policy"))
      recs.push({
        name: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
        reason: "Limit referer leakage",
      });
    if (!(h("permissions-policy") || h("feature-policy")))
      recs.push({
        name: "Permissions-Policy",
        value: "geolocation=(), microphone=(), camera=()",
        reason: "Disable sensitive APIs by default",
      });
    return recs;
  }

  function extraTechHints(finalUrl: string, headers: Record<string, string>) {
    const h = (k: string) => headers?.[k] || headers?.[k.toLowerCase()] || "";
    const out = new Set<string>();

    const server = h("server");
    if (/nginx/i.test(server)) out.add("nginx");
    if (/apache/i.test(server)) out.add("Apache");
    if (/cloudflare/i.test(server)) out.add("Cloudflare");

    const xpb = h("x-powered-by");
    if (/express/i.test(xpb)) out.add("Express");
    if (/php/i.test(xpb)) out.add("PHP");
    if (/asp\.net/i.test(xpb)) out.add("ASP.NET");

    const via = h("via");
    if (/varnish/i.test(via)) out.add("Varnish");

    if (/wp-content/i.test(finalUrl)) out.add("WordPress");
    if (/shopify/i.test(finalUrl)) out.add("Shopify");

    const cfRay = h("cf-ray");
    if (cfRay) out.add("Cloudflare");
    const akamai = h("x-akamai-transformed");
    if (akamai) out.add("Akamai");

    return Array.from(out);
  }

  function fmtDate(fmt: Intl.DateTimeFormat, s?: string) {
    if (!s) return "—";
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? fmt.format(d) : s;
  }

  // downloads
  function download(name: string, text: string, mime = "application/json") {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function exportAllJSON() {
    const payload = { domain, dns, rdap, ct, subAgg, http, fav, robots, ipinfo, breaches, tls, leakcheck };
    download(`osint-${domain}.json`, JSON.stringify(payload, null, 2));
  }
  function exportSubsCSV() {
    const rows = (subAgg?.rows || []).map((h, i) => `${i + 1},"${h.replace(/"/g, '""')}"`).join("\n");
    download(`subdomains-${domain}.csv`, "rank,host\n" + rows, "text/csv");
  }

  // Graph helpers
  async function dnsA(host: string) {
    try {
      const data = await fetch(`/api/osint/dns?domain=${encodeURIComponent(host)}`).then((r) => r.json());
      return (data?.a || []).map((r: any) => r.data).filter(Boolean);
    } catch {
      return [];
    }
  }
  async function buildGraphData(domain: string, subs: string[]) {
    const nodes: CyNode[] = [{ data: { id: domain, label: domain, group: "root" } }];
    const edges: CyEdge[] = [];
    const ipSet = new Set<string>();

    const top = subs.slice(0, 30); // keep it snappy
    for (const s of top) {
      nodes.push({ data: { id: s, label: s.replace(`.${domain}`, ""), group: "sub" } });
      edges.push({ data: { id: `e:${domain}->${s}`, source: domain, target: s } });
    }
    // simple concurrency limiting
    const chunk = 6;
    for (let i = 0; i < top.length; i += chunk) {
      const batch = top.slice(i, i + chunk);
      const results = await Promise.all(batch.map((h) => dnsA(h)));
      batch.forEach((h, idx) => {
        for (const ip of results[idx]) {
          if (!ipSet.has(ip)) {
            ipSet.add(ip);
            nodes.push({ data: { id: ip, label: ip, group: "ip" } });
          }
          edges.push({ data: { id: `e:${h}->${ip}`, source: h, target: ip } });
        }
      });
    }
    return { nodes, edges };
  }

  /* ===================== Render ===================== */
  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 12,
          borderBottom: "1px solid #e5e7eb",
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ textDecoration: "none", fontSize: 13 }}>
          ← Home
        </Link>
        <strong style={{ fontSize: 14 }}>OSINT Lab</strong>
        <span style={small}>
          Passive, read-only recon: DNS • Subdomains • RDAP • Headers • Favicon mmh3 • robots • IP • Breaches • TLS • EXIF
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={exportAllJSON} style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            Export JSON
          </button>
          <button onClick={exportSubsCSV} style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            Export Subdomains CSV
          </button>
        </div>
        <span style={{ fontSize: 12, color: busy ? "#ea580c" : "#64748b" }}>{busy ? "Working…" : msg}</span>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12, overflow: "auto" }}>
        {/* LEFT COLUMN */}
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {/* Domain input */}
          <div style={box}>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={label}>Domain</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                />
                <button
                  onClick={runDomainProbe}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" }}
                >
                  Run domain probe
                </button>
              </div>
              <div style={small}>DNS (A/AAAA/MX/NS/TXT, SPF/DMARC) • RDAP • CT subdomains • Aggregated subdomains</div>
            </div>
          </div>

          {/* DNS */}
          {dns && (
            <div style={box}>
              <strong>DNS</strong>
              <div style={{ display: "grid", gap: 8, fontSize: 13, marginTop: 8 }}>
                {dns.errors?.length ? <div style={{ color: "#b91c1c" }}>{dns.errors.join(" • ")}</div> : null}
                <Row title="A" data={dns.a} />
                <Row title="AAAA" data={dns.aaaa} />
                <Row title="NS" data={dns.ns} />
                <Row title="MX" data={dns.mx} transform={(r: DnsAnswer) => r.data} />
                <Row title="TXT" data={dns.txt} transform={(r: DnsAnswer) => r.data} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge label={`SPF: ${dns.spf?.present ? "present" : "missing"}`} />
                  {dns.spf?.record && <code style={chip}>{dns.spf.record}</code>}
                  <Badge label={`DMARC: ${dns.dmarc?.length ? "present" : "missing"}`} />
                </div>
                <div>
                  <button onClick={() => copy(dns)} style={copyBtn}>
                    Copy JSON
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RDAP */}
          {rdap && (
            <div style={box}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <strong>RDAP (whois-like)</strong>
                <button onClick={() => copy(rdap)} style={copyBtn}>
                  Copy JSON
                </button>
              </div>
              {rdap.error ? (
                <div style={{ color: "#b91c1c" }}>{rdap.error}</div>
              ) : (
                <div style={{ display: "grid", gap: 6, fontSize: 13, marginTop: 8 }}>
                  <div>
                    <b>Domain:</b> {rdap.ldhName}
                  </div>
                  <div>
                    <b>Handle:</b> {rdap.handle}
                  </div>
                  <div>
                    <b>Registrar:</b> {rdap.registrar || "—"}
                  </div>
                  <div>
                    <b>Status:</b> {(rdap.status || []).join(", ") || "—"}
                  </div>
                  <div>
                    <b>Nameservers:</b>{" "}
                    {(rdap.nameservers || []).map((n) => n.ldhName).filter(Boolean).join(", ") || "—"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CT */}
          {ct && (
            <div style={box}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <strong>Certificate Transparency — likely subdomains</strong>
                <button onClick={() => copy(ct)} style={copyBtn}>
                  Copy JSON
                </button>
              </div>
              {ct.length === 0 ? (
                <div style={small}>No entries (or rate-limited).</div>
              ) : (
                <div style={{ display: "grid", gap: 4, fontSize: 13, marginTop: 8 }}>
                  {ct.slice(0, 200).map((row, i) => (
                    <code key={`${row.name}:${i}`} style={chip}>
                      {row.name}
                    </code>
                  ))}
                  {ct.length > 200 && <div style={small}>(+{ct.length - 200} more)</div>}
                </div>
              )}
            </div>
          )}

          {/* Subdomain aggregator */}
          {subAgg && (
            <div style={box}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <strong>Subdomain aggregator ({subAgg.count})</strong>
                <button onClick={() => copy(subAgg)} style={copyBtn}>
                  Copy JSON
                </button>
              </div>
              {subAgg.error ? (
                <div style={{ color: "#b91c1c" }}>{subAgg.error}</div>
              ) : (
                <div style={{ display: "grid", gap: 4, fontSize: 13, maxHeight: 260, overflow: "auto", marginTop: 8 }}>
                  {subAgg.rows.map((h, i) => (
                    <code key={`${h}:${i}`} style={chip}>
                      {h}
                    </code>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Graph */}
          {(subAgg?.rows?.length || 0) > 0 && (
            <div style={box}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>Graph (domain ↔ subs ↔ IPs)</strong>
                <button
                  onClick={async () => {
                    setMsg("Building graph…");
                    const { nodes, edges } = await buildGraphData(domain, subAgg!.rows);
                    setGraphEls([...nodes, ...edges]);
                    setMsg("Done.");
                  }}
                  style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}
                >
                  Build graph
                </button>
              </div>
              {graphEls?.length ? (
                <div style={{ height: 360, marginTop: 8 }}>
                  <CytoscapeComponent
                    elements={graphEls as any}
                    style={{ width: "100%", height: "100%" }}
                    layout={{ name: "cose", animate: false }}
                    stylesheet={[
                      {
                        selector: "node[group = 'root']",
                        style: { "background-color": "#0ea5e9", label: "data(label)", color: "#111827", "font-size": 10 },
                      },
                      {
                        selector: "node[group = 'sub']",
                        style: { "background-color": "#a7f3d0", label: "data(label)", color: "#111827", "font-size": 9 },
                      },
                      {
                        selector: "node[group = 'ip']",
                        style: { "background-color": "#fde68a", label: "data(label)", color: "#111827", "font-size": 9 },
                      },
                      {
                        selector: "edge",
                        style: {
                          width: 1.2,
                          "line-color": "#cbd5e1",
                          "target-arrow-shape": "triangle",
                          "target-arrow-color": "#cbd5e1",
                          "curve-style": "bezier",
                        },
                      },
                    ]}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>Click “Build graph”.</div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {/* URL input */}
          <div style={box}>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={label}>URL</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                />
                <button
                  onClick={runUrlProbe}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" }}
                >
                  Run URL probe
                </button>
              </div>
              <div style={small}>HTTP status/headers/tech hints • robots.txt • favicon mmh3 • Security score • TLS</div>
            </div>
          </div>

          {/* HTTP */}
          {http && (
            <div style={box}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <strong>HTTP headers & tech hints</strong>
                <button onClick={() => copy(http)} style={copyBtn}>
                  Copy JSON
                </button>
              </div>
              {http.error ? (
                <div style={{ color: "#b91c1c" }}>{http.error}</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13 }}>
                    <b>Status:</b> {http.status} · <b>Final URL:</b> {http.finalUrl}
                    {http.title ? (
                      <>
                        {" "}
                        · <b>Title:</b> {http.title}
                      </>
                    ) : null}
                  </div>
                  {http.techHints?.length ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {http.techHints.map((t, i) => (
                        <span key={`${t}:${i}`} style={tag}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div
                    style={{
                      fontSize: 12,
                      background: "#f8fafc",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: 8,
                      overflow: "auto",
                    }}
                  >
                    {Object.entries(http.headers).map(([k, v]) => (
                      <div key={k}>
                        <b>{k}</b>: <span style={{ color: "#334155" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Security score */}
          {secScore && (
            <div style={box}>
              <strong>Security headers score</strong>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                Score: <b>{secScore.score}/{secScore.outOf}</b>
                {secScore.notes.length ? (
                  <ul style={{ margin: "6px 0 0 18px" }}>
                    {secScore.notes.map((n, i) => (
                      <li key={`${n}:${i}`} style={{ color: "#b45309" }}>
                        {n}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: "#16a34a" }}>Looks good.</div>
                )}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {http && (
            <div style={box}>
              <strong>Hardening recommendations</strong>
              {(() => {
                const recs = headerRecommendations(http.headers || {});
                return recs.length ? (
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    {recs.map((r) => (
                      <div key={r.name} style={{ marginBottom: 8 }}>
                        <div>
                          <b>{r.name}</b>: <code>{r.value}</code>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{r.reason}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#16a34a", marginTop: 6 }}>Nice—no obvious missing headers.</div>
                );
              })()}
            </div>
          )}

          {/* Favicon mmh3 */}
          {fav && (
            <div style={box}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <strong>Favicon mmh3</strong>
                <button onClick={() => copy(fav)} style={copyBtn}>
                  Copy JSON
                </button>
              </div>
              {fav.error ? (
                <div style={{ color: "#b91c1c" }}>{fav.error}</div>
              ) : (
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  <div>
                    <b>Hash:</b> {fav.mmh3}
                  </div>
                  <div>
                    <b>Base64 size:</b> {fav.base64Length}
                  </div>
                  <div>
                    <b>URL:</b> {fav.urlTried}
                  </div>
                  <div style={small}>Search this hash on Shodan/Fofa/Censys to find similar hosts.</div>
                </div>
              )}
            </div>
          )}

          {/* robots.txt */}
          {robots && (
            <div style={box}>
              <strong>robots.txt</strong>
              <div
                style={{
                  fontSize: 12,
                  color: "#334155",
                  whiteSpace: "pre-wrap",
                  maxHeight: 240,
                  overflow: "auto",
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 8,
                  marginTop: 6,
                }}
              >
                {robots.error ? robots.error : robots.text || "(empty)"}
              </div>
            </div>
          )}

          {/* IP */}
          <div style={box}>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={label}>IP address</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="1.2.3.4"
                  style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                />
                <button
                  onClick={runIpProbe}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" }}
                >
                  Run IP probe
                </button>
              </div>
              {ipinfo && (
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  {ipinfo.error ? (
                    <div style={{ color: "#b91c1c" }}>{ipinfo.error}</div>
                  ) : (
                    <div style={{ display: "grid", gap: 4 }}>
                      <div>
                        <b>IP:</b> {ipinfo.ip}
                      </div>
                      <div>
                        <b>Org/ASN:</b> {ipinfo.org || "—"} {ipinfo.asn ? `(${ipinfo.asn})` : ""}
                      </div>
                      <div>
                        <b>Geo:</b>{" "}
                        {[ipinfo.city, ipinfo.region, ipinfo.country_name || ipinfo.country].filter(Boolean).join(", ") || "—"}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Breach (HIBP + LeakCheck) */}
          <div style={box}>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={label}>Email / Username (breach lookups)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com or username"
                  style={{ flex: 1, minWidth: 240, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                />
                <button
                  onClick={runBreach}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" }}
                >
                  Check (HIBP)
                </button>
                <button
                  onClick={() => runLeakCheck(email)}
                  style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" }}
                >
                  LeakCheck (free)
                </button>
              </div>

              {/* HIBP result */}
              {Array.isArray(breaches) ? (
                breaches.length === 0 ? (
                  <div style={small}>No breaches reported (HIBP).</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {breaches.map((b, i) => (
                      <div key={`${b.Name}:${i}`} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontWeight: 600 }}>
                          {b.Name} <span style={{ color: "#64748b" }}>({b.Domain})</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#475569" }}>
                          Breach: {b.BreachDate} • Added: {b.AddedDate} • Records: {b.PwnCount}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                          {(b.DataClasses || []).slice(0, 8).map((d, j) => (
                            <span key={`${d}:${j}`} style={tag}>
                              {d}
                            </span>
                          ))}
                          {(b.DataClasses || []).length > 8 && (
                            <span style={small}>+{(b.DataClasses || []).length - 8} more</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : breaches && (breaches as any).error ? (
                <div style={{ color: "#b91c1c" }}>{(breaches as any).error}</div>
              ) : null}

              {/* LeakCheck result */}
              {leakcheck && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {"error" in leakcheck ? (
                    <div style={{ color: "#b91c1c" }}>LeakCheck error: {leakcheck.error}</div>
                  ) : (
                    <>
                      <b>LeakCheck:</b> {leakcheck.found ? "Possible hits" : "No hit"} ·{" "}
                      <span style={{ color: "#64748b" }}>Raw:</span>{" "}
                      <code style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 6px" }}>
                        {leakcheck.raw}
                      </code>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* TLS */}
          <div style={box}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <strong>TLS (SSL Labs)</strong>
              <button
                onClick={() => runTLS(false)}
                style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              >
                Fetch (cached)
              </button>
              <button
                onClick={() => runTLS(true)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              >
                Start new
              </button>
            </div>
            {tls && (
              <div style={{ fontSize: 13, marginTop: 6 }}>
                {tls.error ? (
                  <div style={{ color: "#b91c1c" }}>{tls.error}</div>
                ) : (
                  <>
                    <div>Status: <b>{tls.status}</b></div>
                    {(tls.endpoints || []).slice(0, 4).map((ep: any, i: number) => (
                      <div key={`ep:${i}`} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginTop: 6 }}>
                        <div>
                          <b>IP:</b> {ep.ipAddress} • <b>Grade:</b> {ep.grade || ep.statusMessage || "?"}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          Server Name: {ep.serverName || "—"} • PFS: {String(ep.details?.pfs || ep.supportsRc4)}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            <div style={small}>“Start new” can take a few minutes; the panel auto-polls every 5s until READY.</div>
          </div>

          {/* EXIF */}
          <div style={box}>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={label}>Image metadata (client-side EXIF for JPEG)</label>
              <input type="file" accept="image/jpeg" onChange={onImage} />
              {exif && (
                <div
                  style={{
                    fontSize: 13,
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 8,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {Object.entries(exif).map(([k, v]) => (
                    <div key={k}>
                      <b>{k}</b>: {String(v)}
                    </div>
                  ))}
                </div>
              )}
              <div style={small}>Extracts: DateTimeOriginal, Make, Model, Exposure, FNumber, ISO, GPS (lat/lon).</div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ ...box, background: "#f8fafc" }}>
            <strong>Notes</strong>
            <ul style={{ margin: "8px 0 0 18px", fontSize: 12, color: "#475569" }}>
              <li>Read-only OSINT only (no intrusion, no auth bypass).</li>
              <li>Public endpoints can rate-limit; run gently.</li>
              <li>Always ensure you’re authorized to analyze a target.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );

  /* ===================== Small helpers & parsers ===================== */
  function Row({
    title,
    data,
    transform,
  }: {
    title: string;
    data?: DnsAnswer[];
    transform?: (r: DnsAnswer) => any;
  }) {
    if (!data || data.length === 0) return null;
    return (
      <div>
        <div style={{ fontWeight: 600, margin: "6px 0 4px" }}>{title}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {data.map((r, i) => (
            <code key={`${title}:${i}`} style={chip}>
              {String(transform ? transform(r) : r.data || "").slice(0, 200)}
            </code>
          ))}
        </div>
      </div>
    );
  }
}

/* ===== Minimal EXIF (JPEG APP1) parser — runs in browser only ===== */
function parseExif(buf: ArrayBuffer) {
  const dv = new DataView(buf);
  let p = 0;
  const u16 = (o: number, be = true) => (be ? dv.getUint16(o, false) : dv.getUint16(o, true));
  const u32 = (o: number, be = true) => (be ? dv.getUint32(o, false) : dv.getUint32(o, true));

  // JPEG SOI
  if (dv.getUint16(0) !== 0xffd8) return { error: "Not a JPEG" };
  p = 2;
  while (p + 4 < dv.byteLength) {
    const marker = dv.getUint16(p);
    p += 2;
    const len = dv.getUint16(p);
    p += 2;
    if (marker === 0xffe1) {
      // APP1
      if (dv.getUint32(p) !== 0x45786966 /* "Exif" */) return { error: "No EXIF" };
      const tiff = p + 6;
      const le = dv.getUint16(tiff) === 0x4949; // "II"
      const be = !le;
      const off0 = tiff + u32(tiff + 4, be);
      const out: any = {};

      const readIFD = (off: number, isGPS = false) => {
        const n = u16(off, be);
        let q = off + 2;
        for (let i = 0; i < n; i++) {
          const tag = u16(q, be);
          const type = u16(q + 2, be);
          const count = u32(q + 4, be);
          const valOff = q + 8;
          const valuePtr = count * typeSize(type) > 4 ? tiff + u32(valOff, be) : valOff;
          const val = readValue(type, count, valuePtr, be);
          if (!isGPS) {
            if (tag === 0x010f) out.Make = val;
            if (tag === 0x0110) out.Model = val;
            if (tag === 0x0132) out.DateTime = val;
            if (tag === 0x9003) out.DateTimeOriginal = val;
            if (tag === 0x8827) out.ISO = asNumber(val);
            if (tag === 0x829a) out.ExposureTime = rationalToString(val);
            if (tag === 0x829d) out.FNumber = rationalToString(val);
            if (tag === 0x8825) {
              // GPS IFD
              const gpsOff = tiff + u32(valuePtr, be);
              readIFD(gpsOff, true);
            }
          } else {
            if (tag === 0x0001) out.GPSLatRef = val; // N/S
            if (tag === 0x0002) out.GPSLat = dmsToDeg(val);
            if (tag === 0x0003) out.GPSLonRef = val; // E/W
            if (tag === 0x0004) out.GPSLon = dmsToDeg(val);
          }
          q += 12;
        }
      };

      readIFD(off0, false);
      if (typeof (out as any).GPSLat === "number" && typeof (out as any).GPSLon === "number") {
        const lat = (out as any).GPSLat * ((out as any).GPSLatRef === "S" ? -1 : 1);
        const lon = (out as any).GPSLon * ((out as any).GPSLonRef === "W" ? -1 : 1);
        out.GPS = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      }
      return out;
    } else {
      p += len - 2;
    }
  }
  return { info: "No EXIF segment" };

  function typeSize(t: number) {
    return ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 } as any)[t] || 1;
  }
  function readValue(t: number, c: number, ptr: number, be: boolean): any {
    if (t === 2) {
      const bytes = new Uint8Array(dv.buffer, ptr, c);
      return new TextDecoder("ascii").decode(bytes).replace(/\0+$/, "");
    }
    if (t === 3) {
      if (c === 1) return dv.getUint16(ptr, !be);
      const a: number[] = [];
      for (let i = 0; i < c; i++) a.push(dv.getUint16(ptr + i * 2, !be));
      return a;
    }
    if (t === 4) {
      if (c === 1) return dv.getUint32(ptr, !be);
      const a: number[] = [];
      for (let i = 0; i < c; i++) a.push(dv.getUint32(ptr + i * 4, !be));
      return a;
    }
    if (t === 5) {
      const a: any[] = [];
      for (let i = 0; i < c; i++) {
        const n = dv.getUint32(ptr + i * 8, !be);
        const d = dv.getUint32(ptr + i * 8 + 4, !be);
        a.push([n, d]);
      }
      return a.length === 1 ? a[0] : a;
    }
    if (t === 7) {
      const a = new Uint8Array(dv.buffer, ptr, c);
      return Array.from(a);
    }
    if (t === 10) {
      const a: any[] = [];
      for (let i = 0; i < c; i++) {
        const n = dv.getInt32(ptr + i * 8, !be);
        const d = dv.getInt32(ptr + i * 8 + 4, !be);
        a.push([n, d]);
      }
      return a.length === 1 ? a[0] : a;
    }
    if (t === 1) {
      if (c === 1) return dv.getUint8(ptr);
      const a: number[] = [];
      for (let i = 0; i < c; i++) a.push(dv.getUint8(ptr + i));
      return a;
    }
    return null;
  }
  function asNumber(v: any) {
    return Array.isArray(v) ? v[0] : v;
  }
  function rationalToString(v: any) {
    const r = Array.isArray(v[0]) ? v[0] : v;
    if (!r) return "";
    const [n, d] = r;
    return d ? (n / d).toFixed(4) : String(n);
  }
  function dmsToDeg(v: any) {
    const vals = Array.isArray(v[0]) ? v.map((r: any) => r[0] / r[1]) : v;
    const [a, b, c] = vals;
    return a + b / 60 + c / 3600;
  }
}

function safeHostFromUrl(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}
