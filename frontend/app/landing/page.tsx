// app/landing/page.tsx
import type { Metadata } from "next";

import Announcement from "./components/Announcement";
import Navbar from "./components/Navbar";
import CommandPalette from "./components/CommandPalette";
import BackgroundDecor from "./components/BackgroundDecor";
import Footer from "./components/Footer";

import Hero from "./sections/Hero";
import Install from "./sections/Install";
import Features from "./sections/Features";
import Testimonials from "./sections/Testimonials";
import FAQ from "./sections/FAQ";
import CTA from "./sections/CTA";
import Team from "./sections/Team";

export const metadata: Metadata = {
  title: "Code Graph Explorer – Landing",
  description: "Visualize codebases with interactive graphs and instant insights.",
};

export default function Page() {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-hidden text-slate-100 bg-landing">
      {/* 背景装飾 */}
      <BackgroundDecor />

      {/* chrome */}
      <Announcement />
      <Navbar />
      <CommandPalette />

      {/* メイン（Team を除外） */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 space-y-16">
        <Hero />
        <Install />
        <Features />
        <Testimonials />
        <FAQ />
        <CTA />
      </div>

      {/* いちばん下に Team を配置 */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-16">
        <Team />
      </div>

      <div className="relative z-10">
        <Footer />
      </div>
    </main>
  );
}
