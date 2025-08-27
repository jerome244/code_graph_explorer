import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import AuthMenu from "@/components/AuthMenu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["100","200","300","400","500","600","700","800","900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["100","200","300","400","500","600","700","800","900"],
});

export const metadata: Metadata = {
  title: "Code Graph Explorer",
  description: "Upload a project ZIP and visualize its structure as a graph.",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>◆</span>
              <span>Code Graph Explorer</span>
            </Link>
            <nav className="nav">
              <Link href="/">Home</Link>
              <Link href="/graph">Graph Explorer</Link>
            </nav>
            <AuthMenu />
          </div>
        </header>

        <main className="container main">{children}</main>

        <footer className="site-footer">
          <div className="container footer-inner">
            <p>Built with Django · Next.js · Cytoscape</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
