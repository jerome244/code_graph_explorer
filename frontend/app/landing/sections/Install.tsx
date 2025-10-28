// app/landing/sections/Install.tsx
"use client";
import { useState } from "react";
import CodeBlock from "../components/CodeBlock";

const TABS = [
  { key: "npm",  label: "npm",  code: "npm i code-graph-explorer" },
  { key: "pnpm", label: "pnpm", code: "pnpm add code-graph-explorer" },
  { key: "yarn", label: "yarn", code: "yarn add code-graph-explorer" },
  { key: "bun",  label: "bun",  code: "bun add code-graph-explorer" },
];

export default function Install() {
  const [active, setActive] = useState("npm");
  const tab = TABS.find((t) => t.key === active)!;

  return (
    <section className="mx-auto max-w-5xl py-12">
      <h2 className="section-title text-slate-100">Install</h2>
      <p className="mt-2 text-sm text-slate-400">Choose your package manager and run the command:</p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="relative flex items-center gap-2 border-b border-slate-800 px-2 py-2">
          <div className="relative flex gap-1 rounded-xl bg-slate-800/60 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active === t.key ? "bg-slate-900 text-slate-100" : "text-slate-400 hover:bg-slate-900/40"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <CodeBlock code={tab.code} label={`${tab.label} install`} />
      </div>
    </section>
  );
}
