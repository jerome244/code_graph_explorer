// app/landing/sections/Hero.tsx
"use client";
import { motion } from "framer-motion";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative mx-auto grid min-h-[78vh] place-items-center py-20">
      <div className="max-w-3xl text-center">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight"
          style={{
            textShadow: "0 0 24px rgba(99,102,241,0.20)",
          }}
        >
          Visualize your codebase like a{" "}
          <span className="bg-gradient-to-tr from-indigo-300 via-sky-200 to-cyan-200 bg-clip-text text-transparent">
            galaxy
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-5 text-balance text-base leading-7 text-slate-300"
        >
          Parse repositories and explore interactive graphs. Search, filter, and refactor with confidence.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-8 flex items-center justify-center gap-3"
        >
          <Link href="/signup" className="btn-primary">Get started free</Link>
          <Link href="/demo" className="btn-ghost">Watch demo</Link>
        </motion.div>
      </div>
    </section>
  );
}
