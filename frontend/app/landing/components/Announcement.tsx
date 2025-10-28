// app/landing/components/Announcement.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

export default function Announcement() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <div className="relative z-40 w-full border-b border-slate-800/60 bg-slate-900/40 px-4 py-2 text-sm text-slate-200 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <p className="text-center">
          ✨ New: Graph diff view & inline metrics.{" "}
          <Link href="/changelog" className="underline underline-offset-4 hover:text-white">
            Read the changelog
          </Link>
        </p>
        <button
          aria-label="Close announcement"
          className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          onClick={() => setHidden(true)}
        >
          Close
        </button>
      </div>
    </div>
  );
}
