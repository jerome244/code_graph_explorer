// app/landing/components/CodeBlock.tsx
"use client";
import { useState } from "react";

type CodeBlockProps = { code: string; label?: string; className?: string; };

export default function CodeBlock({ code, label, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950/50 ${className ?? ""}`}>
      {label && (
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
          <span>{label}</span>
          <button onClick={onCopy} className="rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-[13.5px] leading-7 text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}
