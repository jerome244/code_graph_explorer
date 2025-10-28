// app/landing/components/Navbar.tsx
"use client";

import Link from "next/link";

export default function Navbar() {
return (
<header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-black/40">
<nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
<Link href="/" className="flex items-center gap-2">
<span className="inline-block size-6 rounded-lg bg-gradient-to-tr from-indigo-400 to-cyan-300" />
<span className="text-sm font-semibold tracking-wide text-slate-200">Code Graph Explorer</span>
</Link>
<div className="flex items-center gap-3">
<Link href="/login" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
Log in
</Link>
<Link href="/signup" className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600">
Get started
</Link>
</div>
</nav>
</header>
);
}