// app/landing/sections/Features.tsx
"use client";

import { motion } from "framer-motion";

const items = [
{
title: "Graph-first UI",
desc: "Cytoscape-based visual explorer with smooth pan/zoom and selection.",
},
{
title: "Inline insights",
desc: "Function index, references, and metrics available at a glance.",
},
{
title: "Blazing search",
desc: "Filter nodes by name, type, size, or custom tags instantly.",
},
];

export default function Features() {
return (
<section className="mx-auto max-w-5xl py-8">
<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
{items.map((f, i) => (
<motion.div
key={f.title}
initial={{ opacity: 0, y: 10 }}
whileInView={{ opacity: 1, y: 0 }}
viewport={{ once: true }}
transition={{ duration: 0.5, delay: i * 0.05 }}
className="rounded-2xl border border-slate-800/70 bg-slate-900/30 p-5 shadow-sm"
>
<h3 className="text-lg font-semibold text-slate-100">{f.title}</h3>
<p className="mt-2 text-sm leading-6 text-slate-400">{f.desc}</p>
</motion.div>
))}
</div>
</section>
);
}