// app/landing/sections/CTA.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function CTA() {
return (
<section className="mx-auto max-w-4xl py-16">
<div className="rounded-3xl border border-indigo-500/20 bg-indigo-500/10 p-8 text-center">
<motion.h2
initial={{ opacity: 0, y: 8 }}
whileInView={{ opacity: 1, y: 0 }}
viewport={{ once: true }}
transition={{ duration: 0.5 }}
className="text-2xl font-semibold text-indigo-100"
>
Ready to explore your code like never before?
</motion.h2>
<p className="mt-3 text-sm text-indigo-200/90">
Sign up and import a repo. We’ll build the graph for you.
</p>
<div className="mt-6">
<Link href="/signup" className="inline-block rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-600">
Create free account
</Link>
</div>
</div>
</section>
);
}