// app/landing/sections/FAQ.tsx
"use client";

import { useState } from "react";

const QA = [
  { q: "Is there a free plan?", a: "Yes. You can import small repos and explore graphs for free." },
  { q: "Which languages are supported?", a: "JS/TS to start; Python/Go beta; more to come." },
  { q: "Self-hosted?", a: "Enterprise customers can deploy on-prem. Contact us." },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto max-w-3xl py-12">
      <h2 className="section-title text-slate-100">FAQ</h2>
      <div className="mt-5 space-y-2">
        {QA.map((item, idx) => {
          const isOpen = open === idx;
          return (
            <div
              key={item.q}
              className="rounded-2xl border border-slate-800 bg-slate-900/40"
            >
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left text-slate-200"
                onClick={() => setOpen(isOpen ? null : idx)}
                aria-expanded={isOpen}
              >
                <span className="text-sm">{item.q}</span>
                <span className="text-slate-500">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="border-t border-slate-800 px-4 py-3 text-sm text-slate-400">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
