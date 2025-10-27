// app/landing/components/CommandPalette.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const LINKS = [
  { label: "Get Started", href: "/docs" },
  { label: "API Reference", href: "/docs/api" },
  { label: "Examples", href: "/examples" },
  { label: "Changelog", href: "/changelog" },
  { label: "GitHub", href: "https://github.com/" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const metaK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      if (metaK) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return LINKS;
    return LINKS.filter((l) => l.label.toLowerCase().includes(term));
  }, [q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-4 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-xl">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search docs, examples… (Esc to close)"
          className="w-full rounded-t-2xl border-b border-slate-700 bg-transparent px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500"
        />
        <ul className="max-h-80 overflow-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">No results</li>
          )}
          {results.map((r) => (
            <li key={r.href}>
              <Link
                href={r.href}
                className="block rounded-xl px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
                onClick={() => setOpen(false)}
              >
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-700 px-4 py-2 text-xs text-slate-500">
          <span>Press Esc to close</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  );
}
