// app/_components/home/HeroLanding.tsx
"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

// 右端の飾り3D（内部で absolute / 背面）
const HeroAstronaut = dynamic(() => import("../three/HeroAstronaut"), { ssr: false });

export default function HeroLanding() {
  // デバッグ印（本ファイルが読まれているか確定）
  if (typeof window !== "undefined") console.log("[HeroLanding] mounted v3");

  return (
    <main className="relative min-h-[80vh] overflow-hidden">
      {/* 背景 */}
      <div className="absolute inset-0 -z-20" aria-hidden>
        <Image
          src="/images/galaxy.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
        <div className="absolute inset-0 bg-black/45" />
      </div>

      {/* 右端の飾り3D（背面固定） */}
      <HeroAstronaut />

      {/* === センター配置（旧 .title / .cta などは使わず全てユーティリティで制御） === */}
      <section
        id="hero-center"
        className="relative z-10 mx-auto min-h-[80vh] max-w-7xl px-6 grid place-items-center text-center"
      >
        <div className="w-full max-w-3xl mx-auto">
          {/* 上の小見出し */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-3 text-white/80"
          >
            Welcome to
          </motion.p>

          {/* メインタイトル（常に中央） */}
          <motion.h1
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
            className="font-bold leading-tight tracking-tight text-white"
            aria-label="Code Graph Explorer"
          >
            {["Code", "Graph", "Explorer"].map((word) => (
              <motion.span
                key={word}
                variants={{
                  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
                  show: { opacity: 1, y: 0, filter: "blur(0px)" },
                }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="block text-4xl md:text-6xl"
              >
                {word}
              </motion.span>
            ))}
          </motion.h1>

          {/* サブコピー */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-4 text-white/85 max-w-prose mx-auto"
          >
            Visualize complex repositories as clear, interactive maps.
          </motion.p>

          {/* CTA（中央） */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 font-semibold text-white bg-indigo-600/90 hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 transition"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 font-semibold text-white/90 ring-1 ring-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition"
            >
              Create Account
            </Link>
          </motion.div>
        </div>
      </section>
    </main>
  );
}


