'use client';

import React, { useMemo, useState } from 'react';

// ------------- utils: scoring + styles -------------
type Finding = { level: 'low' | 'medium' | 'high'; text: string };
type Analysis<T> = { ok: boolean; findings: Finding[]; details: T };

const colors: Record<Finding['level'], string> = {
  low: '#2563eb',
  medium: '#f59e0b',
  high: '#ef4444',
};

const Card: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
    <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
    {children}
  </div>
);

const Badge: React.FC<{ level: Finding['level']; children: React.ReactNode }> = ({ level, children }) => (
  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, background: colors[level] + '22', color: colors[level], border: '1px solid ' + colors[level] + '55' }}>
    {children}
  </span>
);

function severity(findings: Finding[]) {
  if (findings.some(f => f.level === 'high')) return <Badge level="high">High risk</Badge>;
  if (findings.some(f => f.level === 'medium')) return <Badge level="medium">Medium risk</Badge>;
  return <Badge level="low">Low risk</Badge>;
}

// ------------- URL analysis helpers -------------
const suspiciousTlds = new Set([
  'zip', 'mov', 'click', 'link', 'work', 'loan', 'rest', 'top', 'xyz', 'country', 'kim', 'biz', 'info', 'online', 'gq', 'cf', 'ml', 'ga', 'tk', 'ru'
]);
const shorteners = new Set(['bit.ly','tinyurl.com','t.co','ow.ly','goo.gl','is.gd','buff.ly','cutt.ly','rebrand.ly','sh.st','bit.do','lnkd.in','rb.gy']);
const susKeywords = ['login','sign-in','signin','verify','secure','account','update','billing','password','bank','invoice','unlock','suspend','urgent'];

const multipartTLDs = new Set(['co.uk','com.au','co.jp','com.br','co.in','com.cn','com.sg','co.za','com.tr','com.mx']);

function isIPv4(host: string) {
  const m = host.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (!m) return false;
  return host.split('.').every(oct => Number(oct) >= 0 && Number(oct) <= 255);
}
function isIPv6(host: string) {
  return host.includes(':'); // simple check (URL parser normalizes IPv6 to [::1] brackets in host)
}

function lastLabel(host: string, n: number) {
  const parts = host.split('.').filter(Boolean);
  return parts.slice(-n).join('.');
}

function getETldPlusOne(hostname: string) {
  const host = hostname.toLowerCase();
  const two = lastLabel(host, 2);
  const three = lastLabel(host, 3);
  if (multipartTLDs.has(three)) return lastLabel(host, 4); // e.g., a.b.co.uk -> b.co.uk (approx)
  if (multipartTLDs.has(two)) return lastLabel(host, 3);
  return two;
}

function defang(url: string) {
  return url.replace(/^http/gi, 'hxxp').replaceAll('.', '(.)');
}

function hasNonAscii(s: string) {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return true;
  return false;
}

// ---- Punycode decode (RFC 3492) for single labels starting "xn--"
function decodePunycodeLabel(input: string): string {
  const base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128, delimiter = '-';
  if (!input.startsWith('xn--')) return input;
  const src = input.slice(4).toLowerCase();
  let n = initialN, i = 0, bias = initialBias, output: number[] = [];
  const pos = src.lastIndexOf(delimiter);
  if (pos > -1) {
    for (let j = 0; j < pos; j++) output.push(src.charCodeAt(j));
  }
  let idx = pos > -1 ? pos + 1 : 0;
  const decodeDigit = (cp: number) => (cp - 48 < 10) ? cp - 22 : (cp - 65 < 26) ? cp - 65 : (cp - 97 < 26) ? cp - 97 : base;
  const adapt = (delta: number, numPoints: number, firstTime: boolean) => {
    delta = firstTime ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > (((base - tmin) * tmax) >> 1)) { delta = Math.floor(delta / (base - tmin)); k += base; }
    return k + Math.floor(((base - tmin + 1) * delta) / (delta + skew));
  };
  while (idx < src.length) {
    let oldi = i, w = 1, k = base;
    for (;; k += base) {
      if (idx >= src.length) return input; // invalid -> return original
      const digit = decodeDigit(src.charCodeAt(idx++));
      if (digit >= base) return input;
      i += digit * w;
      const t = k <= bias ? tmin : (k >= bias + tmax ? tmax : k - bias);
      if (digit < t) break;
      w *= (base - t);
    }
    const outLen = output.length + 1;
    bias = adapt(i - oldi, outLen, oldi === 0);
    n += Math.floor(i / outLen);
    i %= outLen;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

function decodeIDN(hostname: string) {
  return hostname.split('.').map(lbl => lbl.startsWith('xn--') ? decodePunycodeLabel(lbl) : lbl).join('.');
}

type UrlDetails = {
  input: string;
  normalized?: string;
  hostname?: string;
  decodedHost?: string;
  etldPlusOne?: string;
  tld?: string;
  path?: string;
  query?: string;
  port?: string;
  nested?: Array<{ key: string; value: string }>;
  defanged?: string;
};

function analyzeURL(raw: string): Analysis<UrlDetails> {
  const findings: Finding[] = [];
  let details: UrlDetails = { input: raw };

  let s = raw.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = 'http://' + s; // help users paste bare domains
  let url: URL | null = null;
  try { url = new URL(s); } catch {
    findings.push({ level: 'high', text: 'Not a valid URL.' });
    return { ok: false, findings, details };
  }

  details.normalized = url.href;
  details.hostname = url.hostname.replace(/^\[(.*)\]$/, '$1'); // strip IPv6 brackets for display
  details.decodedHost = decodeIDN(details.hostname);
  details.tld = details.hostname.split('.').pop() || '';
  details.etldPlusOne = getETldPlusOne(details.hostname);
  details.path = url.pathname;
  details.query = url.search;
  details.port = url.port;
  details.defanged = defang(url.href);

  // IDN / punycode / confusables
  if (details.hostname !== details.decodedHost) {
    findings.push({ level: 'high', text: `Internationalized domain (punycode) detected → "${details.decodedHost}". Verify carefully (homograph risk).` });
  } else if (hasNonAscii(details.hostname)) {
    findings.push({ level: 'medium', text: 'Hostname contains non-ASCII characters. Verify it’s the brand you expect.' });
  }

  // IP host
  if (isIPv4(details.hostname) || isIPv6(details.hostname)) {
    findings.push({ level: 'high', text: 'URL uses an IP address instead of a domain name.' });
  }

  // Suspicious TLD
  if (suspiciousTlds.has((details.tld || '').toLowerCase())) {
    findings.push({ level: 'medium', text: `Suspicious/abused TLD: .${details.tld}.` });
  }

  // Uncommon port
  if (url.port && !['80','443','8080'].includes(url.port)) {
    findings.push({ level: 'medium', text: `Uncommon port ${url.port} in URL.` });
  }

  // '@' tricks
  if (url.username || url.password || url.href.includes('@')) {
    findings.push({ level: 'high', text: 'URL includes "@" (userinfo) — can hide true destination before the @.' });
  }

  // Too many subdomains
  const hostParts = details.hostname.split('.').filter(Boolean);
  if (hostParts.length >= 4) {
    findings.push({ level: 'medium', text: 'Many subdomains — possible impersonation (e.g., brand.secure.login.example.com).' });
  }

  // Shorteners
  if (shorteners.has(details.hostname.toLowerCase())) {
    findings.push({ level: 'medium', text: 'Link shortener — destination hidden until expanded.' });
  }

  // Suspicious keywords in host/path
  const hay = (details.hostname + '/' + (details.path || '')).toLowerCase();
  if (susKeywords.some(k => hay.includes(k))) {
    findings.push({ level: 'medium', text: 'Suspicious keywords in host/path (login, verify, billing, etc.).' });
  }

  // Risky file types at end of path
  const lastSeg = (url.pathname || '').split('/').filter(Boolean).pop() || '';
  const riskyExt = ['exe','scr','bat','cmd','vbs','js','jar','msi','apk','com','pif','cpl','docm','xlsm','pptm','lnk','zip','cab'];
  const ext = lastSeg.split('.').pop()?.toLowerCase();
  if (ext && riskyExt.includes(ext)) {
    findings.push({ level: 'high', text: `Path ends with a risky file type: .${ext}.` });
  }

  // Nested redirect params (don’t fetch; just surface)
  const nested: Array<{ key: string; value: string }> = [];
  const redirKeys = ['url','u','redirect','redir','destination','dest','next','target','r','return','returnUrl','to','link'];
  for (const [k, v] of url.searchParams.entries()) {
    if (redirKeys.includes(k.toLowerCase())) {
      try {
        const inner = decodeURIComponent(v);
        if (inner.startsWith('http')) nested.push({ key: k, value: inner });
      } catch { /* ignore */ }
    }
  }
  details.nested = nested;
  if (nested.length) {
    findings.push({ level: 'medium', text: 'Embedded redirect parameter found — link may bounce to a different site.' });
  }

  const ok = findings.every(f => f.level === 'low') || findings.length === 0;
  return { ok, findings, details };
}

// ------------- Email analysis helpers -------------
type EmailDetails = {
  from?: string; replyTo?: string; returnPath?: string;
  auth?: { spf?: string; dkim?: string; dmarc?: string };
  receivedHops: number;
  attachments: string[];
  urgentPhrases: string[];
  domainMismatch?: boolean;
};

const urgentWords = ['urgent','immediately','verify','suspend','unlock','limited time','action required','confirm','gift card','wire transfer','crypto','bitcoin','invoice attached'];
const badAttachExt = ['exe','scr','bat','cmd','vbs','js','jar','msi','apk','com','pif','cpl','docm','xlsm','pptm','lnk','cab','zip','rar','ace'];

function headerValue(text: string, name: string) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im');
  const m = text.match(re);
  if (!m) return undefined;
  return m[1].trim();
}

function parseEmail(raw: string): Analysis<EmailDetails> {
  const findings: Finding[] = [];
  const [rawHeaders, rawBody] = raw.split(/\r?\n\r?\n/, 2);
  const headers = rawHeaders || raw; // if headers unknown, treat whole input as headers+body

  const from = headerValue(headers, 'From');
  const replyTo = headerValue(headers, 'Reply-To') || headerValue(headers, 'ReplyTo');
  const returnPath = headerValue(headers, 'Return-Path') || headerValue(headers, 'ReturnPath');

  const authRes = headerValue(headers, 'Authentication-Results');
  const spf = authRes?.match(/spf=(pass|fail|softfail|neutral|none)/i)?.[1]?.toLowerCase();
  const dkim = authRes?.match(/dkim=(pass|fail|none)/i)?.[1]?.toLowerCase();
  const dmarc = authRes?.match(/dmarc=(pass|fail|none)/i)?.[1]?.toLowerCase();

  const receivedHops = (headers.match(/^Received:/gim) || []).length;

  // Attachments: look for filename= or names in body
  const attachNames = Array.from(raw.matchAll(/filename\*?=(?:"([^"]+)"|([^;\r\n]+))/gi)).map(m => (m[1] || m[2] || '').trim());
  // Also pick obvious names in body like MyInvoice.docm
  for (const m of rawBody?.matchAll(/\b[\w .-]+\.(\w{2,6})\b/g) || []) {
    const name = m[0];
    if (!attachNames.includes(name)) attachNames.push(name);
  }

  const urgentFound = urgentWords.filter(w => new RegExp(`\\b${w.replace(' ', '\\s+')}\\b`, 'i').test(raw));

  // Domain mismatch: From vs Reply-To / Return-Path
  function domain(addr?: string) {
    if (!addr) return undefined;
    const m = addr.match(/<([^>]+)>/);
    const email = (m ? m[1] : addr).trim();
    const at = email.lastIndexOf('@');
    if (at === -1) return undefined;
    return email.slice(at + 1).toLowerCase();
  }
  const dFrom = domain(from);
  const dReply = domain(replyTo);
  const dReturn = domain(returnPath);
  let domainMismatch = false;
  if (dFrom && (dReply && dReply !== dFrom)) domainMismatch = true;
  if (dFrom && (dReturn && dReturn !== dFrom)) domainMismatch = true;

  // Findings
  if (spf && spf !== 'pass') findings.push({ level: 'medium', text: `SPF result: ${spf}.` });
  if (dkim && dkim !== 'pass') findings.push({ level: 'medium', text: `DKIM result: ${dkim}.` });
  if (dmarc && dmarc !== 'pass') findings.push({ level: 'medium', text: `DMARC result: ${dmarc}.` });

  if (domainMismatch) findings.push({ level: 'high', text: 'From vs Reply-To/Return-Path domain mismatch.' });

  if (urgentFound.length) findings.push({ level: 'medium', text: `Suspicious language: ${urgentFound.join(', ')}.` });

  // Attachment risk
  const risky = attachNames.filter(n => {
    const ext = n.split('.').pop()?.toLowerCase() || '';
    return badAttachExt.includes(ext);
  });
  if (risky.length) findings.push({ level: 'high', text: `Risky attachment type(s): ${risky.join(', ')}` });

  // Few Received hops can be normal, but if zero, headers are incomplete
  if (receivedHops === 0) findings.push({ level: 'low', text: 'No Received headers found (raw headers may be missing).' });

  const ok = findings.every(f => f.level !== 'high');
  const details: EmailDetails = {
    from, replyTo, returnPath,
    auth: { spf, dkim, dmarc },
    receivedHops,
    attachments: attachNames,
    urgentPhrases: urgentFound,
    domainMismatch,
  };
  return { ok, findings, details };
}

// ------------- React page -------------
export default function PhishingAnalyzerPage() {
  const [tab, setTab] = useState<'url' | 'email'>('url');

  // URL
  const [urlInput, setUrlInput] = useState('');
  const urlResult = useMemo(() => urlInput ? analyzeURL(urlInput) : null, [urlInput]);

  // Email
  const [emailInput, setEmailInput] = useState('');
  const emailResult = useMemo(() => emailInput ? parseEmail(emailInput) : null, [emailInput]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Phishing URL & Email Analyzer</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Paste a suspicious <b>link</b> or <b>email (headers/body)</b>. This tool runs local checks only (no network calls).
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setTab('url')} style={tabBtn(tab === 'url')}>URL Analyzer</button>
        <button onClick={() => setTab('email')} style={tabBtn(tab === 'email')}>Email Analyzer</button>
      </div>

      {tab === 'url' && (
        <Card title="URL Analyzer">
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste a URL (e.g., http://xn--pple-43d.com/login?redirect=...)"
              style={input}
            />

            {urlResult && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {severity(urlResult.findings)}
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    (local heuristics; always verify sender/context)
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <Row name="Normalized">{urlResult.details.normalized}</Row>
                  <Row name="Host (decoded)">
                    {(urlResult.details.hostname || '') + (urlResult.details.decodedHost && urlResult.details.decodedHost !== urlResult.details.hostname ? ` → ${urlResult.details.decodedHost}` : '')}
                  </Row>
                  <Row name="Base domain">{urlResult.details.etldPlusOne}</Row>
                  <Row name="TLD">{urlResult.details.tld}</Row>
                  <Row name="Port">{urlResult.details.port || '(default)'}</Row>
                  <Row name="Path">{urlResult.details.path}</Row>
                  <Row name="Query">{urlResult.details.query}</Row>
                  {urlResult.details.nested && urlResult.details.nested.length > 0 && (
                    <Row name="Embedded redirect(s)">
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {urlResult.details.nested.map((n, i) => <li key={i}><code>{n.key}</code> → {n.value}</li>)}
                      </ul>
                    </Row>
                  )}
                  <Row name="Defanged for sharing"><code>{urlResult.details.defanged}</code></Row>
                </div>

                {urlResult.findings.length > 0 && (
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    <div style={{ fontWeight: 600 }}>Findings</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {urlResult.findings.map((f, i) => (
                        <li key={i} style={{ color: colors[f.level] }}>{f.text}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                  Tip: hover over links before clicking; check the <b>base domain</b> carefully; when in doubt, navigate to the site manually.
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {tab === 'email' && (
        <Card title="Email Analyzer">
          <div style={{ display: 'grid', gap: 12 }}>
            <textarea
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder={`Paste raw email headers + body here.

Example headers:
From: "Support" <support@example.com>
Reply-To: help@examp1e.com
Return-Path: bounce@mailer.example.net
Authentication-Results: spf=pass dkim=fail dmarc=none
Received: from ...
Received: from ...

(Then the email body below)`}
              style={{ ...input, height: 220, resize: 'vertical' }}
            />

            {emailResult && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {severity(emailResult.findings)}
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    (heuristics only; when unsure, ask your security team)
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <Row name="From">{emailResult.details.from}</Row>
                  <Row name="Reply-To">{emailResult.details.replyTo || '(none)'}</Row>
                  <Row name="Return-Path">{emailResult.details.returnPath || '(none)'}</Row>
                  <Row name="SPF/DKIM/DMARC">
                    {[
                      emailResult.details.auth?.spf ? `SPF: ${emailResult.details.auth?.spf}` : 'SPF: n/a',
                      emailResult.details.auth?.dkim ? `DKIM: ${emailResult.details.auth?.dkim}` : 'DKIM: n/a',
                      emailResult.details.auth?.dmarc ? `DMARC: ${emailResult.details.auth?.dmarc}` : 'DMARC: n/a',
                    ].join('  |  ')}
                  </Row>
                  <Row name="Received hops">{emailResult.details.receivedHops}</Row>
                  <Row name="Attachments">
                    {emailResult.details.attachments.length ? emailResult.details.attachments.join(', ') : '(none found)'}
                  </Row>
                </div>

                {emailResult.findings.length > 0 && (
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    <div style={{ fontWeight: 600 }}>Findings</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {emailResult.findings.map((f, i) => (
                        <li key={i} style={{ color: colors[f.level] }}>{f.text}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                  Guidance: check that the <b>From</b> domain matches the site you expect, beware of <b>urgent asks</b>, and avoid opening <b>risky attachments</b>.
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ------------- small UI helpers -------------
const Row: React.FC<{ name: string; children?: React.ReactNode }> = ({ name, children }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
    <div style={{ width: 160, fontSize: 12, color: '#6b7280' }}>{name}</div>
    <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{children || '—'}</div>
  </div>
);

const input: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '10px 12px',
  width: '100%',
  font: 'inherit',
};

function tabBtn(active: boolean): React.CSSProperties {
  return {
    border: '1px solid ' + (active ? '#2563eb' : '#e5e7eb'),
    background: active ? '#2563eb11' : '#fff',
    color: active ? '#1e40af' : '#111827',
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
  };
}
