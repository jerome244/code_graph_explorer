'use client';
import { useState } from 'react';


type Page = {
id: number;
url: string;
domain: string;
title: string;
text: string;
fetched_at: string;
sha256: string;
};


export default function DarkWebSearch() {
const [q, setQ] = useState('');
const [results, setResults] = useState<Page[]>([]);
const [loading, setLoading] = useState(false);
const [url, setUrl] = useState('');


async function doSearch() {
setLoading(true);
const r = await fetch(`/api/osint/onion?q=${encodeURIComponent(q)}`);
const data = await r.json();
setResults(Array.isArray(data) ? data : []);
setLoading(false);
}


async function doCrawl() {
if (!url) return;
setLoading(true);
const r = await fetch(`/api/osint/onion`, {
method: 'POST',
headers: { 'content-type': 'application/json' },
body: JSON.stringify({ url }),
});
await r.json().catch(()=>{});
setLoading(false);
await doSearch();
}


return (
<div className="space-y-4 p-4 border rounded-2xl">
<h2 className="text-xl font-semibold">Dark Web (text-only via Tor)</h2>
<div className="flex gap-2">
<input
className="flex-1 border rounded px-3 py-2"
placeholder="Search saved pages (keyword)…"
value={q}
onChange={e=>setQ(e.target.value)}
/>
<button onClick={doSearch} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" disabled={loading}>Search</button>
</div>


<div className="flex gap-2">
<input
className="flex-1 border rounded px-3 py-2"
placeholder="Crawl a single http://…onion/ URL"
value={url}
onChange={e=>setUrl(e.target.value)}
/>
<button onClick={doCrawl} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" disabled={loading}>Crawl</button>
</div>


<div className="space-y-3">
{results.map(p => (
<div key={p.id} className="border rounded p-3">
<div className="text-sm text-gray-500">{p.domain}</div>
<div className="font-medium break-all">{p.title || p.url}</div>
<div className="text-xs line-clamp-3 whitespace-pre-wrap">{(p.text || '').slice(0, 400)}{p.text && p.text.length>400?'…':''}</div>
<div className="text-xs text-gray-500 mt-1">{new Date(p.fetched_at).toLocaleString()}</div>
</div>
))}
{(!results || results.length===0) && <div className="text-sm text-gray-500">No results yet.</div>}
</div>
</div>
)
}
